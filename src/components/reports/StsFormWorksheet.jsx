import React from "react";
import { STS_FORM_LINES, addMoney, subMoney, calcStateTax, OK_STATE_TAX_RATE } from "@/lib/okTaxRules";

/**
 * STS-20002-C Oklahoma Sales Tax Return worksheet.
 * Mirrors the official form line structure with auto-calculated values.
 * Manual adjustments (interest, penalty) are editable.
 */
export default function StsFormWorksheet({ calc, adjustments, onAdjustment }) {
  const line1 = calc.grossSales;
  const line2 = calc.inventoryConsumed || 0;
  const line3 = calc.totalExemptions;
  const line4 = calc.foodSales || 0;
  const line5 = addMoney(line1, line2, -line3, -line4);
  const line6 = calcStateTax(line5);
  const line7 = calc.cityCountyTax || 0;
  const line8 = addMoney(line6, line7);
  const line9 = adjustments.interest || 0;
  const line10 = adjustments.penalty || 0;
  const line11 = addMoney(line8, line9, line10);

  const values = {
    1: line1, 2: line2, 3: line3, 4: line4, 5: line5,
    6: line6, 7: line7, 8: line8, 9: line9, 10: line10, 11: line11,
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-[#e20404] text-white px-4 py-3">
        <h3 className="text-sm font-bold">Oklahoma Tax Commission — Form STS-20002-C</h3>
        <p className="text-xs text-red-100 mt-0.5">Monthly Sales Tax Return Worksheet — {calc.periodLabel}</p>
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="text-left py-2 px-3 font-medium text-slate-600 w-12">Line</th>
            <th className="text-left py-2 px-3 font-medium text-slate-600">Description</th>
            <th className="text-right py-2 px-3 font-medium text-slate-600 w-40">Amount</th>
          </tr>
        </thead>
        <tbody>
          {STS_FORM_LINES.map((fld) => {
            const isEditable = fld.line === 9 || fld.line === 10;
            const isComputed = [5, 6, 8, 11].includes(fld.line);
            return (
              <tr
                key={fld.line}
                className={`border-b border-slate-100 ${isComputed ? "bg-slate-50 font-semibold" : ""} ${fld.line === 11 ? "bg-red-50 font-bold" : ""}`}
              >
                <td className="py-2.5 px-3 text-slate-500 font-mono text-xs">{fld.line}.</td>
                <td className="py-2.5 px-3">
                  <div className="text-slate-700">{fld.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{fld.desc}</div>
                </td>
                <td className="py-2.5 px-3 text-right">
                  {isEditable ? (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={values[fld.line] || 0}
                      onChange={(e) => onAdjustment(fld.line === 9 ? "interest" : "penalty", Number(e.target.value) || 0)}
                      className="w-32 text-right px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:border-[#e20404]"
                    />
                  ) : (
                    <span className={isComputed ? "text-slate-800" : "text-slate-700"}>
                      ${Number(values[fld.line] || 0).toFixed(2)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
        <p>State rate: {(OK_STATE_TAX_RATE * 100).toFixed(1)}% · Net taxable sales (Line 5) = Line 1 + Line 2 − Line 3 − Line 4</p>
        <p className="mt-1">Interest and penalty are manual entries. All other lines are auto-calculated from invoice data.</p>
      </div>
    </div>
  );
}