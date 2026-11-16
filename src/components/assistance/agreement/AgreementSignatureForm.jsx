import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, RotateCcw } from "lucide-react";

// A real, touch-friendly handwritten signature pad. Only the user's drawn
// strokes are submitted; a typed name alone cannot satisfy signing.
export default function AgreementSignatureForm({ onSubmit, busy, disabledReason = "" }) {
  const [name, setName] = useState("");
  const [esign, setEsign] = useState(false);
  const [accept, setAccept] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const svgRef = useRef(null);
  const activeRef = useRef(false);
  const pointsRef = useRef([]);
  const [livePoints, setLivePoints] = useState([]);

  const point = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return [Math.round((event.clientX - rect.left) * 600 / rect.width),
      Math.round((event.clientY - rect.top) * 180 / rect.height)];
  };
  const pathFor = (points) => points.length < 2 ? "" :
    "M " + points.map((p) => p.join(" ")).join(" L ");
  const begin = (event) => {
    if (disabledReason || busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = true;
    pointsRef.current = [point(event)];
    setLivePoints(pointsRef.current);
    setDrawing(true);
  };
  const move = (event) => {
    if (!activeRef.current) return;
    event.preventDefault();
    const p = point(event);
    if (pointsRef.current.length < 400 && (pointsRef.current.at(-1)[0] !== p[0] || pointsRef.current.at(-1)[1] !== p[1])) {
      pointsRef.current = [...pointsRef.current, p];
      setLivePoints(pointsRef.current);
    }
  };
  const end = () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (pointsRef.current.length > 1) setStrokes((prior) => [...prior, pointsRef.current].slice(0, 30));
    pointsRef.current = [];
    setLivePoints([]);
    setDrawing(false);
  };
  const valid = strokes.length > 0 && strokes.some((stroke) => stroke.length >= 3);
  const ready = name.trim().length >= 2 && valid && esign && accept && !disabledReason;
  const sign = () => {
    if (!ready || busy) return;
    const paths = strokes.map(pathFor).filter(Boolean);
    onSubmit({ name: name.trim(), signature_paths: paths, esign_consent: true, accept_terms: true });
  };

  return (
    <div className="space-y-3">
      {disabledReason && <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{disabledReason}</p>}
      <label className="block text-xs font-medium text-slate-700">
        Full legal name
        <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Enter your full legal name" disabled={!!disabledReason || busy} autoComplete="name" />
      </label>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-slate-800">Draw your signature with your finger or mouse</label>
          <Button type="button" variant="outline" size="sm" disabled={!!disabledReason || busy || (!strokes.length && !drawing)}
            onClick={() => { activeRef.current = false; pointsRef.current = []; setStrokes([]); setLivePoints([]); setDrawing(false); }}>
            <RotateCcw className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
        <svg ref={svgRef} viewBox="0 0 600 180" role="img" aria-label="Handwritten signature pad"
          className="w-full rounded-xl border-2 border-slate-300 bg-white"
          style={{ height: 170, touchAction: "none", cursor: "crosshair" }}
          onPointerDown={begin} onPointerMove={move} onPointerUp={end}
          onPointerCancel={end} onLostPointerCapture={end}>
          <path d="M 25 143 L 575 143" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="5 6" />
          {strokes.map((stroke, i) => <path key={i} d={pathFor(stroke)} fill="none" stroke="#111827" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />)}
          {drawing && <path d={pathFor(livePoints)} fill="none" stroke="#111827" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
        <p className="mt-1 text-[11px] text-slate-500">{valid ? "Signature captured. Clear to sign again." : "Your handwritten signature is required to continue."}</p>
      </div>
      <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
        <Checkbox checked={esign} onCheckedChange={(v) => setEsign(v === true)} className="mt-0.5" disabled={!!disabledReason || busy} />
        <span>I consent to sign electronically. My drawn signature, legal name, timestamp, agreement hash and browser information will be recorded as evidence of my acceptance.</span>
      </label>
      <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
        <Checkbox checked={accept} onCheckedChange={(v) => setAccept(v === true)} className="mt-0.5" disabled={!!disabledReason || busy} />
        <span>I have read and accept the Retail Installment Agreement, including its payment schedule, disclosures and terms.</span>
      </label>
      <Button className="h-12 w-full" disabled={!ready || !!busy} onClick={sign}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign and accept agreement
      </Button>
    </div>
  );
}
