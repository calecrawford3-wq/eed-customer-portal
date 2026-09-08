import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Parses a spoken command via InvokeLLM and returns a structured action.
async function parseCommand(transcript, currentBuild, currentTasks, allBuilds) {
  const currentBuildInfo = currentBuild
    ? `Active build: EED ${currentBuild.eed_id || "?"}, serial ${currentBuild.engine_serial_number || "?"}. Its tasks: ${(currentTasks || []).map((t) => t.name).join(", ")}.`
    : "No build is currently selected.";

  const otherBuilds = allBuilds
    .filter((b) => b.id !== currentBuild?.id)
    .slice(0, 20)
    .map((b) => `EED ${b.eed_id || "?"} (serial ${b.engine_serial_number || "?"})`)
    .join("; ");

  const prompt = `You are a voice command parser for an engine build shop workflow system.
The mechanic said: "${transcript}"

Context:
${currentBuildInfo}
Other available builds: ${otherBuilds || "none"}

Determine the intent:
- "complete_step": the mechanic wants to mark a workflow task complete on the current build. Match the spoken task name to the closest actual task name.
- "switch_build": the mechanic wants to switch to a different build. Extract the identifier (EED ID or serial number).
- "status_query": the mechanic is asking where the build is at / what's done / what's left.
- "unknown": could not understand.

Return JSON with: action, step_name (the matched actual task name for complete_step), build_identifier (for switch_build), response_message (a short confirmation to speak back).`;

  const res = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["complete_step", "switch_build", "status_query", "unknown"] },
        step_name: { type: "string" },
        build_identifier: { type: "string" },
        response_message: { type: "string" },
      },
    },
  });

  // InvokeLLM with response_json_schema returns a dict directly
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

export default function VoiceControl({ currentBuild, currentTasks, allBuilds, onCompleteTask, onSwitchBuild, onStatusQuery }) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const recRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setTranscript(text);
      handleCommand(text);
    };
    rec.onerror = (e) => {
      setListening(false);
      setProcessing(false);
      if (e.error !== "no-speech" && e.error !== "aborted") {
        toast.error(`Voice error: ${e.error}`);
      }
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return () => { try { rec.abort(); } catch {} };
  }, [currentBuild, currentTasks, allBuilds]);

  const handleCommand = async (text) => {
    setProcessing(true);
    try {
      const result = await parseCommand(text, currentBuild, currentTasks, allBuilds);
      if (!result || !result.action) {
        speak("Sorry, I didn't catch that.");
        return;
      }
      switch (result.action) {
        case "complete_step": {
          const match = (currentTasks || []).find(
            (t) => t.name.toLowerCase() === (result.step_name || "").toLowerCase()
          ) || (currentTasks || []).find(
            (t) => t.name.toLowerCase().includes((result.step_name || "").toLowerCase())
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
          const ident = (result.build_identifier || "").toLowerCase().replace(/^eed\s*/i, "").trim();
          const target = allBuilds.find(
            (b) =>
              (b.eed_id || "").toLowerCase() === ident ||
              (b.engine_serial_number || "").toLowerCase() === ident ||
              (b.eed_id || "").toLowerCase().includes(ident)
          );
          if (target) {
            await onSwitchBuild(target);
            speak(result.response_message || `Switched to EED ${target.eed_id || target.engine_serial_number}.`);
          } else {
            speak("I couldn't find a build matching " + (result.build_identifier || "that") + ".");
          }
          break;
        }
        case "status_query": {
          const msg = onStatusQuery
            ? onStatusQuery()
            : result.response_message || "Status unknown.";
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
  };

  const toggle = () => {
    if (!recRef.current) return;
    if (listening) {
      recRef.current.stop();
      setListening(false);
      return;
    }
    setTranscript("");
    try {
      recRef.current.start();
      setListening(true);
    } catch (e) {
      toast.error("Could not start microphone");
    }
  };

  if (!supported) {
    return (
      <div className="text-xs text-slate-400 text-center px-3 py-2 bg-slate-100 rounded-lg">
        Voice control isn't supported on this browser. Try Chrome.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={toggle}
        disabled={processing}
        className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 disabled:opacity-50",
          listening ? "bg-red-500 animate-pulse" : "bg-[#e20404] hover:bg-[#c00303]",
          processing && "bg-slate-400"
        )}
      >
        {processing ? (
          <Loader2 className="w-7 h-7 text-white animate-spin" />
        ) : listening ? (
          <MicOff className="w-7 h-7 text-white" />
        ) : (
          <Mic className="w-7 h-7 text-white" />
        )}
      </button>
      <p className="text-xs font-medium text-slate-500">
        {processing ? "Processing..." : listening ? "Listening..." : "Tap to speak"}
      </p>
      {transcript && (
        <p className="text-sm text-slate-600 italic max-w-xs text-center">"{transcript}"</p>
      )}
    </div>
  );
}