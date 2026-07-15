import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function generateBarcodeSVG(value, opts = {}) {
  if (!value) return "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, String(value), {
      format: "CODE128",
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 14,
      margin: 4,
      ...opts,
    });
  } catch (e) {
    return "";
  }
  return svg.outerHTML;
}

export default function BarcodeLabel({ value, title, subtitle, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = value ? generateBarcodeSVG(value) : "";
    }
  }, [value]);
  return (
    <div className={`flex flex-col items-center ${className}`}>
      {title && (
        <div className="text-xs font-bold text-slate-800 truncate w-full text-center">{title}</div>
      )}
      <div ref={ref} className="barcode-render flex justify-center" />
      {subtitle && (
        <div className="text-[10px] text-slate-500 truncate w-full text-center">{subtitle}</div>
      )}
    </div>
  );
}