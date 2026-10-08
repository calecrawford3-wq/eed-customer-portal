import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, FileText } from "lucide-react";

const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/**
 * OKTAP (Oklahoma Tax Commission) monthly sales tax log.
 * Shows, for each month of the selected year:
 *   - Total sales (gross, before tax)
 *   - Taxable sales
 *   - Tax-exempt sales
 *   - Tax collected
 * Designed to be printed and filed with OKTAP.
 */
export default function OktapReportDialog({ open, onOpenChange, year, monthlyTax, totals }) {
  const handlePrint = () => {
    window.print();
  };

  const grandTotalSales = monthlyTax.reduce((s, r) => s + (r.sales || 0), 0);
  const grandExempt = monthlyTax.reduce((s, r) => s + (r.exemptSales || 0), 0);
  const grandTaxable = grandTotalSales - grandExempt;
  const grandCollected = monthlyTax.reduce((s, r) => s + (r.collected || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#e20404]" />
            OKTAP Monthly Sales Tax Log — {year}
          </DialogTitle>
        </DialogHeader>

        <div className="oktap-report print:block">
          <div className="hidden print:block mb-4">
            <h1 className="text-xl font-bold">Elite Engine Development</h1>
            <p className="text-sm text-slate-600">Oklahoma Tax Commission (OKTAP) — Monthly Sales Tax Log</p>
            <p className="text-sm text-slate-600">Tax Year: {year}</p>
          </div>

          <p className="text-sm text-slate-500 mb-4 print:hidden">
            This log summarizes total sales, taxable sales, tax-exempt sales, and tax collected for each month.
            Print this and use the figures when filing your monthly Oklahoma sales tax return on OKTAP.
          </p>

          <table className="w-full text-sm border border-slate-200">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-2 px-3 font-semibold text-slate-700">Month</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-700">Total Sales</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-700">Taxable Sales</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-700">Tax-Exempt Sales</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-700">Tax Collected</th>
              </tr>
            </thead>
            <tbody>
              {monthlyTax.map((row, i) => {
                const taxable = (row.sales || 0) - (row.exemptSales || 0);
                const hasActivity = (row.sales || 0) > 0 || (row.collected || 0) > 0;
                return (
                  <tr key={i} className={`border-b border-slate-100 ${!hasActivity ? "text-slate-300" : ""}`}>
                    <td className="py-2 px-3 font-medium">{MONTHS_FULL[i]}</td>
                    <td className="py-2 px-3 text-right">${(row.sales || 0).toFixed(2)}</td>
                    <td className="py-2 px-3 text-right">${taxable.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-emerald-700">${(row.exemptSales || 0).toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-medium">${(row.collected || 0).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-100 border-t-2 border-slate-300">
              <tr>
                <td className="py-2 px-3 font-bold">Year Total</td>
                <td className="py-2 px-3 text-right font-bold">${grandTotalSales.toFixed(2)}</td>
                <td className="py-2 px-3 text-right font-bold">${grandTaxable.toFixed(2)}</td>
                <td className="py-2 px-3 text-right font-bold text-emerald-700">${grandExempt.toFixed(2)}</td>
                <td className="py-2 px-3 text-right font-bold">${grandCollected.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-4 text-xs text-slate-500 print:mt-6">
            <p><strong>Total Sales</strong> = goods only (parts); labor and machining charges are excluded.</p>
            <p><strong>Tax-Exempt Sales</strong> = goods sold to tax-exempt customers or invoices with no tax applied.</p>
            <p><strong>Taxable Sales</strong> = Total Sales minus Tax-Exempt Sales.</p>
            <p className="mt-2">Generated on {new Date().toLocaleDateString("en-US")} for filing year {year}.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> Print OKTAP Log</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}