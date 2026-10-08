import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { goodsSubtotal } from "@/lib/money";

const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/**
 * Per-month invoice drill-down for the Sales Tax report.
 * Makes every monthly sales total fully auditable by listing the exact invoices
 * (with subtotal, discount, and net) that contribute to each month's figure.
 *
 * "Sales" = goods-only subtotal (parts only; labor and machining charges excluded).
 * "Discount" = discount_amount applied to the invoice.
 * "Net Sales" = subtotal - discount_amount (the actual amount subject to tax / reportable after discounts).
 */
export default function SalesTaxMonthDrilldown({ monthlyTax, salesInvoices, customers, year }) {
  const [openMonth, setOpenMonth] = useState(null);

  // Group invoices by month key (YYYY-MM)
  const byMonth = {};
  salesInvoices.forEach(inv => {
    if (!inv.issue_date) return;
    const k = inv.issue_date.slice(0, 7); // YYYY-MM
    if (!byMonth[k]) byMonth[k] = [];
    byMonth[k].push(inv);
  });

  const custName = (id) => {
    const c = customers.find(c => c.id === id);
    return c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.company_name || "—" : "—";
  };

  const statusColor = (s) => {
    if (s === "paid") return "bg-emerald-100 text-emerald-700 border-0";
    if (s === "partial") return "bg-amber-100 text-amber-700 border-0";
    if (s === "sent") return "bg-blue-100 text-blue-700 border-0";
    if (s === "draft") return "bg-slate-100 text-slate-500 border-0";
    if (s === "overdue") return "bg-red-100 text-red-700 border-0";
    return "bg-slate-100 text-slate-600 border-0";
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">Monthly Sales Breakdown — {year}</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Click a month to see the exact invoices behind its sales total. "Sales" is the goods-only subtotal (parts only; labor and machining excluded). "Net" is goods subtotal minus any discount applied.
        </p>
      </div>

      {monthlyTax.map((row, i) => {
        const monthKey = `${year}-${String(i + 1).padStart(2, "0")}`;
        const monthInvoices = (byMonth[monthKey] || []).sort((a, b) =>
          (a.issue_date || "").localeCompare(b.issue_date || "")
        );
        const hasActivity = (row.sales || 0) > 0 || (row.collected || 0) > 0;
        if (!hasActivity && monthInvoices.length === 0) return null;

        const monthDiscount = monthInvoices.reduce((s, inv) => s + (inv.discount_amount || 0), 0);
        const monthNet = (row.sales || 0) - monthDiscount;
        const isOpen = openMonth === monthKey;

        return (
          <div key={monthKey} className="border-b border-slate-100 last:border-0">
            <button
              onClick={() => setOpenMonth(isOpen ? null : monthKey)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                <span className="text-sm font-medium text-slate-700">{MONTHS_FULL[i]}</span>
                <span className="text-xs text-slate-400">({monthInvoices.length} invoice{monthInvoices.length !== 1 ? "s" : ""})</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                {monthDiscount > 0 && (
                  <span className="text-xs text-slate-400">
                    Gross <span className="font-medium text-slate-600">${(row.sales || 0).toFixed(2)}</span>
                    {" \u2212 $"}<span className="font-medium text-red-500">{monthDiscount.toFixed(2)}</span> disc
                  </span>
                )}
                <span className="font-semibold text-slate-800">${monthNet.toFixed(2)}</span>
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-3 bg-white">
                {monthInvoices.length === 0 ? (
                  <p className="text-sm text-slate-400 py-3 pl-6">No invoices issued this month.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase">
                        <th className="text-left py-2 font-medium">Invoice</th>
                        <th className="text-left py-2 font-medium">Customer</th>
                        <th className="text-left py-2 font-medium">Issued</th>
                        <th className="text-left py-2 font-medium">Status</th>
                        <th className="text-right py-2 font-medium">Goods</th>
                        <th className="text-right py-2 font-medium">Discount</th>
                        <th className="text-right py-2 font-medium">Net</th>
                        <th className="text-right py-2 font-medium">Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthInvoices.map(inv => {
                        const goods = goodsSubtotal(inv);
                        const net = goods - (inv.discount_amount || 0);
                        return (
                          <tr key={inv.id} className="border-b border-slate-50">
                            <td className="py-2 font-medium text-slate-700">{inv.invoice_number}</td>
                            <td className="py-2 text-slate-600">{custName(inv.customer_id)}</td>
                            <td className="py-2 text-slate-500">{inv.issue_date || "—"}</td>
                            <td className="py-2"><Badge className={`text-xs ${statusColor(inv.status)}`}>{inv.status}</Badge></td>
                            <td className="py-2 text-right text-slate-600">${goods.toFixed(2)}</td>
                            <td className="py-2 text-right text-red-500">{(inv.discount_amount || 0) > 0 ? `\u2212$${(inv.discount_amount || 0).toFixed(2)}` : "—"}</td>
                            <td className="py-2 text-right font-medium text-slate-700">${net.toFixed(2)}</td>
                            <td className="py-2 text-right text-emerald-600">${(inv.tax_amount || 0).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t border-slate-200 bg-slate-50">
                      <tr>
                        <td className="py-2 font-bold text-slate-700" colSpan={4}>Month Total</td>
                        <td className="py-2 text-right font-bold text-slate-700">${(row.sales || 0).toFixed(2)}</td>
                        <td className="py-2 text-right font-bold text-red-500">{monthDiscount > 0 ? `\u2212$${monthDiscount.toFixed(2)}` : "—"}</td>
                        <td className="py-2 text-right font-bold text-slate-800">${monthNet.toFixed(2)}</td>
                        <td className="py-2 text-right font-bold text-emerald-600">${(row.collected || 0).toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}