import React, { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Save } from "lucide-react";

export default function SignaturePad({ onChange, label = "Sign Here", height = 180, saveLabel = "Save Signature" }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [ctx, setCtx] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.5;
    context.strokeStyle = "#1a1a1a";
    setCtx(context);
  }, [height]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stop = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setHasSigned(true);
  };

  const save = () => {
    if (!hasSigned) return;
    const dataUrl = exportCompressed();
    if (onChange) onChange(dataUrl);
  };

  // Downscale to a fixed-size canvas and export as JPEG to keep the
  // data URL small enough for entity field storage.
  const exportCompressed = () => {
    const source = canvasRef.current;
    const outW = 400;
    const outH = 140;
    const tmp = document.createElement("canvas");
    tmp.width = outW;
    tmp.height = outH;
    const tctx = tmp.getContext("2d");
    tctx.fillStyle = "#ffffff";
    tctx.fillRect(0, 0, outW, outH);
    tctx.drawImage(source, 0, 0, outW, outH);
    return tmp.toDataURL("image/jpeg", 0.7);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
    if (onChange) onChange(null);
  };

  return (
    <div>
      {label && <p className="text-sm font-medium text-slate-700 mb-2">{label}</p>}
      <div className="relative border-2 border-dashed border-slate-300 rounded-lg bg-white overflow-hidden" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none cursor-crosshair"
          style={{ height }}
          onMouseDown={start}
          onMouseMove={draw}
          onMouseUp={stop}
          onMouseLeave={stop}
          onTouchStart={start}
          onTouchMove={draw}
          onTouchEnd={stop}
        />
        {!hasSigned && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-slate-300 text-sm">Draw your signature above</span>
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-2">
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!hasSigned}>
          <Eraser className="w-3.5 h-3.5 mr-1" /> Clear
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={!hasSigned}>
          <Save className="w-3.5 h-3.5 mr-1" /> {saveLabel}
        </Button>
      </div>
    </div>
  );
}