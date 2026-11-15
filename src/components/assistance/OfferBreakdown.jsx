import React from "react";
import { formatMoney } from "@/lib/money";

function Row({ label, value, muted = false, strong = false }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? "border-t border-slate-200 pt-2.5 mt-1.5" : ""}`}>
      <span className={muted ? "text-slate-500 text-sm" : "text-slate-700 text-sm"}>{label}</span>
      <span className={`tabular-nums ${strong ? "text-lg font-bold text-slate-900" : muted ? "text-slate-500 text-sm" : "text-slate-900 font-medium"}`}>{value}</span>
    </div>
  );
}

export default function OfferBreakdown({ offer, showPayments = true }) {
  if (!offer) return null;
  const lineItems = offer.line_items || [];
  const laborItems = offer.labor_items || [];
  const machiningItems = offer.machining_items || [];
  const empty = !lineItems.length && !laborItems.length && !machiningItems.length;
  return (
    <div>
      {empty && <p className="text-sm text-slate-500">No items have been added to this offer yet.</p>}
      {lineItems.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Parts</h4>
          <div className="divide-y divide-slate-100">
            {lineItems.map((line, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 break-words">{line.item_name}</p>
                  <p className="text-xs text-slate-500">
                    {line.quantity} × {formatMoney(line.unit_price)}
                    {line.description ? ` · ${line.description}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(line.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {laborItems.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Labor</h4>
          <div className="divide-y divide-slate-100">
            {laborItems.map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 break-words">{item.item_name}</p>
                  {item.description && <p className="text-xs text-slate-500">{item.description}</p>}
                </div>
                <span className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(item.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {machiningItems.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Machining</h4>
          <div className="divide-y divide-slate-100">
            {machiningItems.map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 break-words">{item.item_name}</p>
                  <p className="text-xs text-slate-500">
                    {item.quantity || 1} × {formatMoney(item.price)}
                    {item.description ? ` · ${item.description}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney((Number(item.price) || 0) * (Number(item.quantity) || 1))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 sm:p-4">
        <Row label="Build subtotal" value={formatMoney(offer.subtotal)} />
        {Number(offer.assistance_amount) > 0 && (
          <Row
            label={offer.assistance_type === "percent" ? `Fund assistance (${offer.assistance_percent}%)` : "Fund assistance"}
            value={`− ${formatMoney(offer.assistance_amount)}`}
          />
        )}
        <Row label="Engine package total" value={formatMoney(offer.total)} strong />
        {showPayments && Number(offer.paid_amount) > 0 && <Row label="Paid" value={formatMoney(offer.paid_amount)} muted />}
        {showPayments && (
          <div className="flex items-baseline justify-between gap-3 border-t border-slate-300 mt-2 pt-2">
            <span className="text-sm font-semibold text-slate-700">{Number(offer.paid_amount) > 0 ? "Balance due" : "Amount due"}</span>
            <span className="text-xl font-extrabold text-[#e20404] tabular-nums">{formatMoney(offer.balance_due ?? offer.amount_due)}</span>
          </div>
        )}
      </div>
    </div>
  );
}