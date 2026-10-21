import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SCHEDULE_J_CATEGORIES, addMoney } from "@/lib/okTaxRules";

/**
 * Schedule J exemption breakdown table.
 * Shows all 24 Oklahoma exemption categories with amounts and contributing invoices.
 * Each category row expands to show the individual invoices.
 */
export default function ScheduleJTable({ exemptions, custName }) {
  const [openCode, setOpenCode] = useState(null);

  const totalExempt = SCHEDULE_J_CATEGORIES.reduce(
    (s, cat) => addMoney(s, exemptions[cat.code]?.amount || 0),
    0
  );

  const activeCategories = SCHEDULE_J_CATEGORIES.filter(
    (cat) => (exemptions[cat.code]?.amount || 0) > 0 || (exemptions[cat.code]?.invoices || []).length > 0
  );

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">Schedule J — Exemption Breakdown</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          All 24 Oklahoma exemption categories. Click a category with activity to see contributing invoices.
        </p>
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-white">
          <tr>
            <th className="text-left py-2 px-3 font-medium text-slate-600 w-16">Code</th>
            <th className="text-left py-2 px-3 font-medium text-slate-600">Exemption Category</th>
            <th className="text-right py-2 px-3 font-medium text-slate-600 w-32">Amount</th>
            <th className="text-right py-2 px-3 font-medium text-slate-600 w-20">Invoices</th>
          </tr>
        </thead>
        <tbody>
          {SCHEDULE_J_CATEGORIES.map((cat) => {
            const data = exemptions[cat.code] || { amount: 0, invoices: [] };
            const hasActivity = data.amount > 0 || data.invoices.length > 0;
            const isOpen = openCode === cat.code;
            return (
              <React.Fragment key={cat.code}>
                <tr
                  className={`border-b border-slate-100 ${hasActivity ? "cursor-pointer hover:bg-slate-50" : "opacity-50"}`}
                  onClick={() => hasActivity && setOpenCode(isOpen ? null : cat.code)}
                >
                  <td className="py-2 px-3 font-mono text-xs text-slate-500">{cat.code}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1">
                      {hasActivity && (isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />)}
                      <span className={hasActivity ? "text-slate-700" : "text-slate-400"}>{cat.label}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-slate-700">
                    {hasActivity ? `$${data.amount.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-500">
                    {hasActivity ? data.invoices.length : "—"}
                  </td>
                </tr>
                {isOpen && hasActivity && (
                  <tr className="bg-slate-50">
                    <td colSpan={4} className="px-6 py-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-1 font-medium text-slate-500">Invoice</th>
                            <th className="text-left py-1 font-medium text-slate-500">Customer</th>
                            <th className="text-left py-1 font-medium text-slate-500">Date</th>
                            <th className="text-right py-1 font-medium text-slate-500">Exempt Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.invoices.map((inv) => (
                            <tr key={inv.id} className="border-b border-slate-100">
                              <td className="py-1 font-medium text-slate-600">{inv.invoice_number}</td>
                              <td className="py-1 text-slate-500">{custName(inv.customer_id)}</td>
                              <td className="py-1 text-slate-400">{inv.issue_date || "—"}</td>
                              <td className="py-1 text-right text-slate-600">${(inv.exemptAmount || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-slate-300 bg-slate-100">
          <tr>
            <td className="py-2 px-3 font-bold text-slate-700" colSpan={2}>Total Exemptions</td>
            <td className="py-2 px-3 text-right font-bold text-slate-800">${totalExempt.toFixed(2)}</td>
            <td className="py-2 px-3 text-right text-slate-500">{activeCategories.reduce((s, c) => s + (exemptions[c.code]?.invoices || []).length, 0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}