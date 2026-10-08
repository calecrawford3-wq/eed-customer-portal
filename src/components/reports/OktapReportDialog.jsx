import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Printer, FileText, ChevronLeft } from "lucide-react";
import { goodsSubtotal, laborTotal, machiningTotal, coreItemsTotal } from "@/lib/money";

const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/**
 * OKTAP (Oklahoma Tax Commission) monthly sales tax log.
 * Step 1: pick a month. Step 2: detailed breakdown of how every figure is
 * derived — per invoice, showing the invoice subtotal and each deduction
 * (labor, machining, cores) that produces the goods-only taxable base.
 */
export default function OktapReportDialog({ open, onOpenChange, year, monthlyTax, salesInvoices, customers }) {
  const [selectedMonth, setSelectedMonth] = useState(null);

  const custName = (id) => {
    const c = customers?.find(c => c.id === id);
    return c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.company_name || "—" : "—";
  };

  const isInvoiceTaxExempt = (inv) => {
    if (!inv) return false;
    const cust = customers?.find(c => c.id === inv.customer_id);
    if (cust?.tax_exempt) return true;
    return (!inv.tax_rate || inv.tax_rate === 0) && (!inv.tax_amount || inv.tax_amount === 0);
  };

  // Invoices for the selected month, sorted by issue date
  const monthInvoices = useMemo(() => {
    if (selectedMonth === null) return [];
    const monthKey = `${year}-${String(selectedMonth + 1).padStart(2, "0")}`;
    return (salesInvoices || [])
      .filter(inv => (inv.issue_date || "").slice(0, 7) === monthKey)
      .sort((a, b) => (a.issue_date || "").localeCompare(b.issue_date || ""));
  }, [selectedMonth, year, salesInvoices]);

  const monthRow = selectedMonth !== null ? monthlyTax[selectedMonth] : null;

  const breakdown = useMemo(() => {
    return monthInvoices.map(inv => {
      const labor = laborTotal(inv);
      const mach = machiningTotal(inv);
      const cores = coreItemsTotal(inv);
      const goods = goodsSubtotal(inv);
      const exempt = isInvoiceTaxExempt(inv);
      return { inv, labor, mach, cores, goods, exempt };
    });
  }, [monthInvoices, customers]);

  const totals = useMemo(() => {
    return breakdown.reduce((acc, r) => {
      acc.subtotal += r.inv.subtotal || 0;
      acc.labor += r.labor;
      acc.mach += r.mach;
      acc.cores += r.cores;
      acc.goods += r.goods;
      acc.tax += r.inv.tax_amount || 0;
      if (r.exempt) acc.exemptGoods += r.goods;
      else acc.taxableGoods += r.goods;
      return acc;
    }, { subtotal: 0, labor: 0, mach: 0, cores: 0, goods: 0, tax: 0, taxableGoods: 0, exemptGoods: 0 });
  }, [breakdown]);

  const handlePrint = () => window.print();

  const handleClose = () => {
    setSelectedMonth(null);
    onOpenChange(false);
  };

  const hasActivity = (i) => {
    const row = monthlyTax[i];
    return row && ((row.sales || 0) > 0 || (row.collected || 0) > 0);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#e20404]" />
            {selectedMonth !== null
              ? `OKTAP Sales Tax Detail — ${MONTHS_FULL[selectedMonth]} ${year}`
              : `OKTAP Monthly Sales Tax Log — ${year}`}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: Month picker */}
        {selectedMonth === null && (
          <div className="oktap-report">
            <p className="text-sm text-slate-500 mb-4">
              Select the month you want to generate an OKTAP sales tax report for. Only months with paid-invoice activity are selectable.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {MONTHS_FULL.map((m, i) => {
                const active = hasActivity(i);
                const row = monthlyTax[i];
                return (
                  <button
                    key={m}
                    disabled={!active}
                    onClick={() => setSelectedMonth(i)}
                    className={`text-left p-4 rounded-lg border transition-colors ${
                      active
                        ? "border-slate-200 hover:border-[#e20404] hover:bg-red-50 cursor-pointer"
                        : "border-slate-100 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-700">{m}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {active
                        ? `${(row.sales || 0).toLocaleString("en-US", { style: "currency", currency: "USD" })} goods · ${(row.collected || 0).toLocaleString("en-US", { style: "currency", currency: "USD" })} tax`
                        : "No activity"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: Detailed breakdown */}
        {selectedMonth !== null && (
          <div className="oktap-report print:block">
            {/* Print-only header */}
            <div className="hidden print:block mb-4">
              <h1 className="text-xl font-bold">Elite Engine Development</h1>
              <p className="text-sm text-slate-600">Oklahoma Tax Commission (OKTAP) — Monthly Sales Tax Detail</p>
              <p className="text-sm text-slate-600">{MONTHS_FULL[selectedMonth]} {year}</p>
            </div>

            {/* Back button (screen only) */}
            <button
              onClick={() => setSelectedMonth(null)}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#e20404] mb-4 print:hidden"
            >
              <ChevronLeft className="w-4 h-4" /> Choose a different month
            </button>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Total Goods Sold</p>
                <p className="text-lg font-bold text-slate-900">${totals.goods.toFixed(2)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Taxable Goods</p>
                <p className="text-lg font-bold text-blue-700">${totals.taxableGoods.toFixed(2)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Tax-Exempt Goods</p>
                <p className="text-lg font-bold text-emerald-700">${totals.exemptGoods.toFixed(2)}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Tax Collected</p>
                <p className="text-lg font-bold text-amber-700">${totals.tax.toFixed(2)}</p>
              </div>
            </div>

            {/* How it's calculated */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-700 mb-1">How these numbers are calculated</p>
              <p>Each paid invoice's <strong>Goods Subtotal</strong> = invoice subtotal − labor charges − machining charges − cores sold from inventory. Labor, machining, and cores are not taxable goods, so they are excluded from sales-tax reporting. <strong>Tax-Exempt</strong> invoices are those for a tax-exempt customer or with no tax rate applied. <strong>Tax Collected</strong> is the actual tax_amount recorded on each taxable invoice.</p>
            </div>

            {/* Per-invoice breakdown table */}
            {breakdown.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">No paid invoices for {MONTHS_FULL[selectedMonth]} {year}.</p>
            ) : (
              <table className="w-full text-xs border border-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">Invoice</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">Customer</th>
                    <th className="text-right py-2 px-1 font-semibold text-slate-700">Subtotal</th>
                    <th className="text-right py-2 px-1 font-semibold text-slate-400">− Labor</th>
                    <th className="text-right py-2 px-1 font-semibold text-slate-400">− Mach.</th>
                    <th className="text-right py-2 px-1 font-semibold text-slate-400">− Cores</th>
                    <th className="text-right py-2 px-2 font-semibold text-slate-700">= Goods</th>
                    <th className="text-right py-2 px-1 font-semibold text-slate-700">Tax Rate</th>
                    <th className="text-right py-2 px-1 font-semibold text-slate-700">Tax</th>
                    <th className="text-center py-2 px-2 font-semibold text-slate-700">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map(({ inv, labor, mach, cores, goods, exempt }) => (
                    <tr key={inv.id} className="border-b border-slate-100">
                      <td className="py-2 px-2 font-medium text-slate-700">{inv.invoice_number}</td>
                      <td className="py-2 px-2 text-slate-600">{custName(inv.customer_id)}</td>
                      <td className="py-2 px-1 text-right text-slate-500">${(inv.subtotal || 0).toFixed(2)}</td>
                      <td className="py-2 px-1 text-right text-slate-400">{labor > 0 ? `−${labor.toFixed(2)}` : "—"}</td>
                      <td className="py-2 px-1 text-right text-slate-400">{mach > 0 ? `−${mach.toFixed(2)}` : "—"}</td>
                      <td className="py-2 px-1 text-right text-slate-400">{cores > 0 ? `−${cores.toFixed(2)}` : "—"}</td>
                      <td className="py-2 px-2 text-right font-semibold text-slate-800">${goods.toFixed(2)}</td>
                      <td className="py-2 px-1 text-right text-slate-500">{inv.tax_rate ? `${(inv.tax_rate * 100).toFixed(2)}%` : "—"}</td>
                      <td className="py-2 px-1 text-right text-amber-700 font-medium">${(inv.tax_amount || 0).toFixed(2)}</td>
                      <td className="py-2 px-2 text-center">
                        <Badge className={`text-xs border-0 ${exempt ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                          {exempt ? "Exempt" : "Taxable"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                  <tr>
                    <td className="py-2 px-2 font-bold text-slate-700" colSpan={2}>Month Total ({breakdown.length} invoice{breakdown.length !== 1 ? "s" : ""})</td>
                    <td className="py-2 px-1 text-right font-bold text-slate-500">${totals.subtotal.toFixed(2)}</td>
                    <td className="py-2 px-1 text-right font-bold text-slate-400">−{totals.labor.toFixed(2)}</td>
                    <td className="py-2 px-1 text-right font-bold text-slate-400">−{totals.mach.toFixed(2)}</td>
                    <td className="py-2 px-1 text-right font-bold text-slate-400">−{totals.cores.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-bold text-slate-800">${totals.goods.toFixed(2)}</td>
                    <td className="py-2 px-1"></td>
                    <td className="py-2 px-1 text-right font-bold text-amber-700">${totals.tax.toFixed(2)}</td>
                    <td className="py-2 px-2 text-center text-xs text-slate-500">
                  </td>
                  </tr>
                </tfoot>
              </table>
            )}

            <div className="mt-4 text-xs text-slate-500">
              <p>Generated on {new Date().toLocaleDateString("en-US")} for {MONTHS_FULL[selectedMonth]} {year}.</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4 print:hidden">
          <Button variant="outline" onClick={handleClose}>Close</Button>
          {selectedMonth !== null && (
            <Button onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> Print Report</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}