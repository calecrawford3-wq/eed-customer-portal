import React from "react";
import { ShieldCheck } from "lucide-react";

const LOGO = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/b68576bb2_EliteEDNoBG_edited.jpg";

export default function PublicAssistanceShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="text-white" style={{ backgroundColor: "#000000" }}>
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <img src={LOGO} alt="Elite Engine Development" className="h-8 max-w-40 object-contain" />
          <span className="text-xs text-slate-400 border-l border-slate-700 pl-3 hidden sm:block">AFFORDABLE ENGINE FUND</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <div className="mb-5">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600 mt-1.5">{subtitle}</p>}
        </div>
        {children}
      </main>
      <footer className="mx-auto max-w-3xl px-4 pb-10 pt-2">
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-none" />
          Elite Engine Development never asks for a Social Security number, bank account number or card number in this form. Links are private and contain no personal information.
        </p>
      </footer>
    </div>
  );
}