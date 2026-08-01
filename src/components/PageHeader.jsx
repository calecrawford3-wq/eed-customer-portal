import React from "react";

export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  );
}