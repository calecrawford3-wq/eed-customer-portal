import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { addMoney, OK_STATE_TAX_RATE } from "@/lib/okTaxRules";

/**
 * STS-20021 jurisdiction breakdown.
 * Shows state, county, and city tax calculations by jurisdiction.
 */
export default function JurisdictionBreakdown({ jurisdictionData, jurisdictions }) {
  const [openJuris, setOpenJuris] = useState(null);

  if (!jurisdictionData || jurisdictionData.length === 0) {
    return (
      <div className="border border-slate-200 rounded-lg p-6 text-center text-sm text-slate-400">
        No jurisdiction data. All taxable sales will use the Oklahoma state rate of {(OK_STATE_TAX_RATE * 100).toFixed(1)}%.
      </div>
    );
  }

  const totalStateTax = addMoney(...jurisdictionData.map((j) => j.stateTax));
  const totalCountyTax = addMoney(...jurisdictionData.map((j) => j.countyTax));
  const totalCityTax = addMoney(...jurisdictionData.map((j) => j.cityTax));

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">STS-20021 — Jurisdiction Breakdown</h3>
        <p className="text-xs text-slate-500 mt-0.5">State, county, and city sales tax by jurisdiction. Click a jurisdiction to see contributing invoices.</p>
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-white">
          <tr>
            <th className="text-left py-2 px-3 font-medium text-slate-600">Jurisdiction</th>
            <th className="text-left py-2 px-3 font-medium text-slate-600 w-20">Type</th>
            <th className="text-right py-2 px-3 font-medium text-slate-600 w-28">Taxable Sales</th>
            <th className="text-right py-2 px-3 font-medium text-slate-600 w-24">State Tax</th>
            <th className="text-right py-2 px-3 font-medium text-slate-600 w-24">County Tax</th>
            <th className="text-right py-2 px-3 font-medium text-slate-600 w-24">City Tax</th>
            <th className="text-right py-2 px-3 font-medium text-slate-600 w-24">Total Tax</th>
          </tr>
        </thead>
        <tbody>
          {jurisdictionData.map((j) => {
            const isOpen = openJuris === j.code;
            const total = addMoney(j.stateTax, j.countyTax, j.cityTax);
            return (
              <React.Fragment key={j.code}>
                <tr
                  className="border-b border-slate-100 cursor-pointer hover:bg-slate-50"
                  onClick={() => setOpenJuris(isOpen ? null : j.code)}
                >
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1">
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                      <span className="text-slate-700 font-medium">{j.name}</span>
                      <span className="text-xs text-slate-400 ml-1 font-mono">{j.code}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-slate-500 capitalize text-xs">{j.type}</td>
                  <td className="py-2 px-3 text-right text-slate-700">${j.taxableSales.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right text-slate-600">${j.stateTax.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right text-slate-600">${j.countyTax.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right text-slate-600">${j.cityTax.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right font-semibold text-slate-800">${total.toFixed(2)}</td>
                </tr>
                {isOpen && j.invoices && j.invoices.length > 0 && (
                  <tr className="bg-slate-50">
                    <td colSpan={7} className="px-6 py-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-1 font-medium text-slate-500">Invoice</th>
                            <th className="text-left py-1 font-medium text-slate-500">Customer</th>
                            <th className="text-right py-1 font-medium text-slate-500">Taxable</th>
                            <th className="text-right py-1 font-medium text-slate-500">Tax Collected</th>
                          </tr>
                        </thead>
                        <tbody>
                          {j.invoices.map((inv) => (
                            <tr key={inv.id} className="border-b border-slate-100">
                              <td className="py-1 font-medium text-slate-600">{inv.invoice_number}</td>
                              <td className="py-1 text-slate-500">{inv.customerName}</td>
                              <td className="py-1 text-right text-slate-600">${(inv.taxableAmount || 0).toFixed(2)}</td>
                              <td className="py-1 text-right text-slate-600">${(inv.taxCollected || 0).toFixed(2)}</td>
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
            <td className="py-2 px-3 font-bold text-slate-700" colSpan={2}>Totals</td>
            <td className="py-2 px-3 text-right font-bold text-slate-800">${addMoney(...jurisdictionData.map((j) => j.taxableSales)).toFixed(2)}</td>
            <td className="py-2 px-3 text-right font-bold text-slate-700">${totalStateTax.toFixed(2)}</td>
            <td className="py-2 px-3 text-right font-bold text-slate-700">${totalCountyTax.toFixed(2)}</td>
            <td className="py-2 px-3 text-right font-bold text-slate-700">${totalCityTax.toFixed(2)}</td>
            <td className="py-2 px-3 text-right font-bold text-[#e20404]">${addMoney(totalStateTax, totalCountyTax, totalCityTax).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}