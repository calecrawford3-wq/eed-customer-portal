import React, { useState, useRef, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Mic, MicOff, Loader2, Ear, AudioLines, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Wake phrase — two words so it's hard to trigger by accident and won't be confused
// with the company name ("Elite Engine Development") or normal shop talk.
const WAKE_PHRASES = ["hey atlas", "atlas"];

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

function containsWakeWord(text) {
  const t = normalize(text);
  return /\bhey atlas\b/.test(t) || /\batlas\b/.test(t);
}

function stripWakeWord(text) {
  // Remove the wake phrase (and any leading filler) from the utterance, keep the command after it.
  return text
    .replace(/^(.*?)\b(hey atlas|atlas)\b[,.!?\s]*/i, "")
    .trim();
}

// Short ascending two-tone chime played when the wake word is heard.
let audioCtxRef = null;
function playTriggerChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtxRef) audioCtxRef = new AC();
    const ctx = audioCtxRef;
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    const notes = [
      { f: 660, t: 0.0, d: 0.09 },
      { f: 990, t: 0.1, d: 0.14 },
    ];
    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.f;
      gain.gain.setValueAtTime(0, now + n.t);
      gain.gain.linearRampToValueAtTime(0.18, now + n.t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.02);
    });
  } catch {
    // Audio not available — silent fallback.
  }
}

// Parses a spoken command via InvokeLLM and returns a structured action.
async function parseCommand(transcript, currentBuild, currentTasks, allBuilds, templates) {
  const currentBuildInfo = currentBuild
    ? `Active build: EED ${currentBuild.eed_id || "?"}, serial ${currentBuild.engine_serial_number || "?"}. Its tasks: ${(currentTasks || []).map((t) => t.name).join(", ")}.`
    : "No build is currently selected.";

  const otherBuilds = allBuilds
    .filter((b) => b.id !== currentBuild?.id)
    .slice(0, 20)
    .map((b) => {
      const name = b.customer_name || b._customer_name || "";
      return `EED ${b.eed_id || "?"} (serial ${b.engine_serial_number || "?"}${name ? `, customer ${name}` : ""})`;
    })
    .join("; ");

  const templateList = (templates || [])
    .map((t) => `${t.name} (${(t.items || []).length} tasks)`)
    .join("; ");

  const prompt = `You are a voice command parser for an engine build shop workflow system.
The mechanic said: "${transcript}"

Context:
${currentBuildInfo}
Other available builds: ${otherBuilds || "none"}
Available workflow templates: ${templateList || "none"}

Determine the intent:
- "complete_step": the mechanic wants to mark a workflow task complete on the current build. Match the spoken task name to the closest actual task name.
- "switch_build": the mechanic wants to switch to a different build. Extract the identifier — it may be an EED ID, a serial number, or a customer name.
- "assign_workflow": the mechanic wants to assign/apply a workflow template to the current build. Match the spoken template name to the closest actual template name.
- "status_query": the mechanic is asking where the build is at / what's done / what's left.
- "unknown": could not understand.

Return JSON with: action, step_name (the matched actual task name for complete_step), build_identifier (for switch_build), template_name (the matched actual template name for assign_workflow), response_message (a short confirmation to speak back).`;

  const res = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["complete_step", "switch_build", "assign_workflow", "status_query", "unknown"] },
        step_name: { type: "string" },
        build_identifier: { type: "string" },
        template_name: { type: "string" },
        response_message: { type: "string" },
      },
    },
  });

  return res;
}

function speak(text) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }
}

export default function VoiceControl({
  currentBuild,
  currentTasks,
  allBuilds,
  templates,
  onCompleteTask,
  onSwitchBuild,
  onAssignWorkflow,
  onStatusQuery,
}) {
  const [alwaysOn, setAlwaysOn] = useState(true);
  const [armed, setArmed] = useState(false); // wake word heard, waiting for / capturing command
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);

  const recRef = useRef(null);
  const alwaysOnRef = useRef(true);
  const armedRef = useRef(false);
  const speakingRef = useRef(false);
  const cmdBufferRef = useRef(""); // accumulates final chunks while armed
  const cmdTimerRef = useRef(null); // debounce timer before processing the command
  const recentSpeechRef = useRef([]); // rolling {text, t} of recent final transcripts for split wake-word detection
  const armedTimeoutRef = useRef(null); // disarms back to wake-word listening if no command arrives
  const restartTimerRef = useRef(null);
  const processCommandRef = useRef(null); // always-latest processCommand so the one-shot recognition callback never calls a stale closure

  // Keep refs in sync with state so the recognition callbacks always see fresh values.
  useEffect(() => { alwaysOnRef.current = alwaysOn; }, [alwaysOn]);
  useEffect(() => { armedRef.current = armed; }, [armed]);

  const startRecognition = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      if (rec.state !== "running") rec.start();
    } catch {
      // start() throws if already started — ignore.
    }
  }, []);

  const arm = useCallback(() => {
    setArmed(true);
    armedRef.current = true;
    if (armedTimeoutRef.current) clearTimeout(armedTimeoutRef.current);
    // If no command is spoken within 10s, drop back to wake-word listening.
    armedTimeoutRef.current = setTimeout(() => {
      setArmed(false);
      armedRef.current = false;
      cmdBufferRef.current = "";
      if (cmdTimerRef.current) { clearTimeout(cmdTimerRef.current); cmdTimerRef.current = null; }
      setTranscript("");
    }, 10000);
  }, []);

  const disarm = useCallback(() => {
    setArmed(false);
    armedRef.current = false;
    if (armedTimeoutRef.current) { clearTimeout(armedTimeoutRef.current); armedTimeoutRef.current = null; }
    if (cmdTimerRef.current) { clearTimeout(cmdTimerRef.current); cmdTimerRef.current = null; }
    cmdBufferRef.current = "";
  }, []);

  const stopRecognition = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try { rec.stop(); } catch {}
  }, []);

  const processCommand = useCallback(
    async (rawText) => {
      const text = stripWakeWord(rawText).trim();
      if (!text) {
        // Wake word with nothing after it — arm and wait for the next utterance.
        arm();
        setTranscript("Yes? Listening for your command…");
        return;
      }
      disarm();
      setProcessing(true);
      setTranscript(text);
      try {
        const result = await parseCommand(text, currentBuild, currentTasks, allBuilds, templates);
        if (!result || !result.action) {
          speak("Sorry, I didn't catch that.");
          return;
        }
        switch (result.action) {
          case "complete_step": {
            const match =
              (currentTasks || []).find(
                (t) => t.name.toLowerCase() === (result.step_name || "").toLowerCase()
              ) ||
              (currentTasks || []).find((t) =>
                t.name.toLowerCase().includes((result.step_name || "").toLowerCase())
              );
            if (match) {
              await onCompleteTask(match);
              speak(result.response_message || `Marked ${match.name} complete.`);
            } else {
              speak("I couldn't find that task on the current build.");
            }
            break;
          }
          case "switch_build": {
            const ident = (result.build_identifier || "")
              .toLowerCase()
              .replace(/^eed\s*/i, "")
              .trim();
            const target = allBuilds.find(
              (b) =>
                (b.eed_id || "").toLowerCase() === ident ||
                (b.engine_serial_number || "").toLowerCase() === ident ||
                (b.eed_id || "").toLowerCase().includes(ident) ||
                (b.customer_name || "").toLowerCase() === ident ||
                (b._customer_name || "").toLowerCase() === ident ||
                (b.customer_name || "").toLowerCase().includes(ident) ||
                (b._customer_name || "").toLowerCase().includes(ident)
            );
            if (target) {
              await onSwitchBuild(target);
              const label = target.customer_name || target._customer_name
                ? `${target.customer_name || target._customer_name}'s build (EED ${target.eed_id || target.engine_serial_number})`
                : `EED ${target.eed_id || target.engine_serial_number}`;
              speak(result.response_message || `Switched to ${label}.`);
            } else {
              speak("I couldn't find a build matching " + (result.build_identifier || "that") + ".");
            }
            break;
          }
          case "assign_workflow": {
            const tmpl = (templates || []).find(
              (t) => t.name.toLowerCase() === (result.template_name || "").toLowerCase()
            ) || (templates || []).find((t) =>
              t.name.toLowerCase().includes((result.template_name || "").toLowerCase())
            );
            if (!currentBuild) {
              speak("Select a build first, then I can assign a workflow to it.");
            } else if (tmpl) {
              await onAssignWorkflow(tmpl);
              speak(result.response_message || `Applied the ${tmpl.name} workflow to this build.`);
            } else {
              speak("I couldn't find a workflow template matching " + (result.template_name || "that") + ".");
            }
            break;
          }
          case "status_query": {
            const msg = onStatusQuery ? onStatusQuery() : result.response_message || "Status unknown.";
            speak(msg);
            break;
          }
          default:
            speak(result.response_message || "Sorry, I didn't understand that.");
        }
      } catch (e) {
        toast.error("Voice command failed: " + (e?.message || "Unknown error"));
      } finally {
        setProcessing(false);
        setTranscript("");
      }
    },
    [currentBuild, currentTasks, allBuilds, templates, onCompleteTask, onSwitchBuild, onAssignWorkflow, onStatusQuery]
  );

  // Keep a ref to the latest processCommand so the recognition callback (created once
  // on mount) always invokes the current version with fresh allBuilds/currentBuild.
  useEffect(() => {
    processCommandRef.current = processCommand;
  }, [processCommand]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e) => {
      // Accumulate the current utterance (interim + final from resultIndex onward).
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      const utterance = (final + " " + interim).trim();

      if (!armedRef.current) {
        // Passively listening for the wake word.
        // Push final chunks into a rolling ~6s history so a wake word split across
        // separate final results (e.g. "Hey" then "Atlas" on Samsung) still triggers.
        if (final && final.trim()) {
          const now = Date.now();
          recentSpeechRef.current.push({ text: final.trim(), t: now });
          recentSpeechRef.current = recentSpeechRef.current.filter(
            (s) => now - s.t < 6000
          );
        }
        const recentText = recentSpeechRef.current.map((s) => s.text).join(" ") + " " + utterance;
        if (containsWakeWord(utterance) || containsWakeWord(recentText)) {
          playTriggerChime();
          recentSpeechRef.current = [];
          if (cmdTimerRef.current) { clearTimeout(cmdTimerRef.current); cmdTimerRef.current = null; }
          cmdBufferRef.current = "";
          const after = stripWakeWord(utterance) || stripWakeWord(recentText);
          if (after) {
            // Command came in the same breath as the wake word.
            processCommandRef.current ? processCommandRef.current(after) : processCommand(after);
          } else {
            // Just the wake word — arm and wait for the command.
            arm();
            setTranscript("Yes? Listening…");
          }
        }
      } else {
        // Armed: accumulate final chunks into a buffer and debounce, so a multi-word
        // command that the recognizer splits across several final results (common on
        // tablets) isn't truncated. Process once the user pauses for ~900ms.
        if (final && final.trim().length > 0) {
          cmdBufferRef.current = (cmdBufferRef.current + " " + final.trim()).trim();
          setTranscript(cmdBufferRef.current);
          if (cmdTimerRef.current) clearTimeout(cmdTimerRef.current);
          cmdTimerRef.current = setTimeout(() => {
            const text = cmdBufferRef.current;
            cmdBufferRef.current = "";
            cmdTimerRef.current = null;
            if (text) (processCommandRef.current || processCommand)(text);
          }, 900);
        } else if (interim) {
          setTranscript((cmdBufferRef.current ? cmdBufferRef.current + " " : "") + interim);
        }
      }
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setAlwaysOn(false);
        alwaysOnRef.current = false;
        toast.error("Microphone access denied. Enable mic permissions to use voice control.");
      } else {
        toast.error(`Voice error: ${e.error}`);
      }
    };

    rec.onend = () => {
      // Browsers (especially Samsung) auto-stop after short silence; restart if
      // always-on is active and we're not speaking. Retry a few times in case the
      // recognizer is stuck in a transitional state.
      if (alwaysOnRef.current && !speakingRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        const tryStart = (attempt) => {
          const rec2 = recRef.current;
          if (!rec2 || !alwaysOnRef.current) return;
          try {
            if (rec2.state !== "running") {
              rec2.start();
            }
          } catch {
            if (attempt < 4) {
              restartTimerRef.current = setTimeout(() => tryStart(attempt + 1), 250);
            }
          }
        };
        restartTimerRef.current = setTimeout(() => tryStart(0), 150);
      }
    };

    recRef.current = rec;

    if (alwaysOnRef.current) startRecognition();

    return () => {
      alwaysOnRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (armedTimeoutRef.current) clearTimeout(armedTimeoutRef.current);
      if (cmdTimerRef.current) clearTimeout(cmdTimerRef.current);
      try { rec.abort(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start/stop recognition when always-on is toggled.
  useEffect(() => {
    if (!recRef.current) return;
    if (alwaysOn) {
      startRecognition();
    } else {
      stopRecognition();
      disarm();
      recentSpeechRef.current = [];
      setTranscript("");
    }
  }, [alwaysOn, startRecognition, stopRecognition]);

  if (!supported) {
    return (
      <div className="text-xs text-slate-400 text-center px-3 py-2 bg-slate-100 rounded-lg max-w-[220px]">
        Voice control isn't supported on this browser. Try Chrome.
      </div>
    );
  }

  const status = processing ? "processing" : armed ? "armed" : alwaysOn ? "listening" : "off";

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Always-on indicator + mic button */}
      <div className="relative">
        {alwaysOn && !processing && (
          <span
            className={cn(
              "absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white",
              armed ? "bg-red-500 animate-ping" : "bg-emerald-500"
            )}
          />
        )}
        <button
          onClick={() => setAlwaysOn((v) => !v)}
          disabled={processing}
          className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 disabled:opacity-50",
            status === "processing" && "bg-slate-400",
            status === "armed" && "bg-red-500 animate-pulse",
            status === "listening" && "bg-[#e20404] hover:bg-[#c00303]",
            status === "off" && "bg-slate-300 hover:bg-slate-400"
          )}
          title={alwaysOn ? "Voice assistant on — say \"Hey Atlas\" then your command" : "Tap to turn voice assistant on"}
        >
          {processing ? (
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          ) : armed ? (
            <Ear className="w-7 h-7 text-white" />
          ) : alwaysOn ? (
            <AudioLines className="w-7 h-7 text-white" />
          ) : (
            <MicOff className="w-7 h-7 text-white" />
          )}
        </button>
      </div>

      <div className="text-center">
        <p className="text-xs font-medium text-slate-600">
          {processing
            ? "Processing…"
            : armed
            ? "Listening for command…"
            : alwaysOn
            ? 'Say "Hey Atlas" then your command'
            : "Voice off — tap to enable"}
        </p>
        {transcript && (
          <p className="text-sm text-slate-500 italic max-w-[240px] mt-1">"{transcript}"</p>
        )}
      </div>
    </div>
  );
}