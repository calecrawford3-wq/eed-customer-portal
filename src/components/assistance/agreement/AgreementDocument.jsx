import React from "react";
import { format } from "date-fns";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { parseOfferDate } from "@/lib/offerDate";
import { formatMoney } from "@/lib/money";

const dateText = (value) => {
  if (!value) return "—";
  const parsed = parseOfferDate(value);
  return parsed ? format(parsed, "MMM d, yyyy") : String(value);
};

function Figure({ label, value, strong = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`tabular-nums ${strong ? "text-base font-extrabold text-slate-900" : "text-sm font-semibold text-slate-800"}`}>{value}</p>
    </div>
  );
}

// Printable retail installment agreement. Renders only the stored snapshot and
// the wording sections captured when the agreement was issued, so the copy a
// customer prints is exactly what they signed.
export default function AgreementDocument({ agreement }) {
  const snapshot = agreement?.snapshot;
  if (!snapshot) return null;
  const figures = snapshot.figures || {};
  const goods = snapshot.goods || {};
  const seller = snapshot.seller || {};
  const purchaser = snapshot.purchaser || {};
  const schedule = snapshot.schedule || [];
  const contacts = snapshot.contacts || {};
  const draft = agreement.template_status !== "approved_counsel";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 print:border-0 print:p-0">
      <header className="border-b-2 border-[#e20404] pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{seller.dba || "Elite Engine Development"}</p>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">Retail Installment Agreement</h1>
        <p className="text-xs text-slate-600">
          {agreement.agreement_number} · Issued {dateText(agreement.issued_at || snapshot.issued_date)}
          {agreement.accepted_at ? ` · Signed ${dateText(agreement.accepted_at)}` : " · Not signed"}
        </p>
      </header>

      {draft && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <p><strong>DRAFT — NOT LEGALLY REVIEWED.</strong> This template has not been approved by qualified Oklahoma counsel.</p>
        </div>
      )}

      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Seller</p>
          <p className="text-sm font-semibold text-slate-900">{seller.legal_name} DBA {seller.dba}</p>
          {seller.address && <p className="text-xs text-slate-600">{seller.address}</p>}
          {seller.phone && <p className="text-xs text-slate-600">{seller.phone}</p>}
          {seller.email && <p className="text-xs text-slate-600 break-all">{seller.email}</p>}
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Purchaser</p>
          <p className="text-sm font-semibold text-slate-900">{purchaser.name || "—"}</p>
          {purchaser.email && <p className="text-xs text-slate-600 break-all">{purchaser.email}</p>}
          {purchaser.phone && <p className="text-xs text-slate-600">{purchaser.phone}</p>}
          {(purchaser.city || purchaser.state) && <p className="text-xs text-slate-600">{[purchaser.city, purchaser.state].filter(Boolean).join(", ")}</p>}
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Engine and goods financed</p>
        <p className="text-sm font-semibold text-slate-900">{goods.description || "Elite engine build"}</p>
        <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
          <p>Platform: <span className="font-medium text-slate-800">{goods.engine_platform || "—"}</span></p>
          <p>Serial: <span className="font-medium text-slate-800">{goods.engine_serial_number || "—"}</span></p>
          <p>Elite ID: <span className="font-medium text-slate-800">{goods.eed_id || "—"}</span></p>
          <p>Build: <span className="font-medium text-slate-800">{goods.build_number || "—"}</span></p>
        </div>
      </section>

      {!!(snapshot.itemization || []).length && (
        <section className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Itemization</p>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[320px] text-xs">
              <tbody>
                {snapshot.itemization.map((line, index) => (
                  <tr key={index} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 align-top">
                      <span className="font-medium text-slate-800">{line.label}</span>
                      {line.detail && <span className="block text-[11px] text-slate-500">{line.detail}</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-800 whitespace-nowrap">{formatMoney(line.amount)}</td>
                  </tr>
                ))}
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 text-slate-700">Cash purchase price</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap">{formatMoney(figures.purchase_price)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 text-emerald-700">Fund assistance discount</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold text-emerald-700 whitespace-nowrap">− {formatMoney(figures.assistance_discount)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-2 text-slate-700">Net purchase price</td>
                  <td className="py-1.5 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">{formatMoney(figures.net_purchase_price)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
        <Figure label="Down payment" value={formatMoney(figures.deposit_amount)} />
        <Figure label="Down payment received" value={formatMoney(figures.deposit_paid)} />
        <Figure label="Amount financed" value={formatMoney(figures.amount_financed)} />
        <Figure label="Fixed APR" value={`${figures.apr}%`} />
        <Figure label="Finance charge" value={formatMoney(figures.finance_charge)} />
        <Figure label="Total of payments" value={formatMoney(figures.total_of_payments)} />
        <Figure label="Monthly payment" value={formatMoney(figures.monthly_payment)} />
        <Figure label="Payments" value={`${figures.payment_count} monthly`} />
        <Figure label="Total sale price" value={formatMoney(figures.total_sale_price)} strong />
      </section>

      {!!schedule.length && (
        <section className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Payment schedule</p>
          <div className="mt-1 max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[300px] text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">Due</th>
                  <th className="px-2 py-1.5 text-right">Payment</th>
                  <th className="px-2 py-1.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row) => (
                  <tr key={row.number} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 text-slate-500">{row.number}</td>
                    <td className="px-2 py-1.5 text-slate-700">{dateText(row.due_date)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{formatMoney(row.amount)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{formatMoney(row.balance_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-4 space-y-3">
        {(agreement.sections || []).map((section) => (
          <div key={section.key}>
            <h2 className={`text-sm font-bold ${section.key === "draft_notice" ? "text-red-700" : "text-slate-900"}`}>{section.title}</h2>
            <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">{section.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-5 rounded-xl border border-slate-300 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Customer signature</p>
        {agreement.accepted_at ? (
          <div className="mt-1 space-y-0.5 text-xs text-slate-700">
            {Array.isArray(agreement.signature_paths) && agreement.signature_paths.length > 0 && (
              <svg viewBox="0 0 600 180" className="h-28 w-full max-w-sm rounded border border-slate-200 bg-white" aria-label="Customer handwritten signature">
                {agreement.signature_paths.map((path, index) => <path key={index} d={path} fill="none" stroke="#111827" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />)}
              </svg>
            )}
            <p className="text-base font-semibold text-slate-900">{agreement.signer_name}</p>
            {agreement.signature_hash && <p className="break-all text-[10px]">Signature hash: {agreement.signature_hash}</p>
            <p>Signed electronically {dateText(agreement.accepted_at)}.</p>
            <p className="break-all">Document hash: {agreement.content_hash}</p>
            <p>Template: {agreement.template_key} v{agreement.template_version} ({agreement.template_status === "approved_counsel" ? "approved by counsel" : "draft"}).</p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-600">Not signed yet. The customer signs on their offer page or on this agreement page.</p>
        )}
      </section>

      <footer className="mt-4 border-t border-slate-200 pt-2 text-[10px] leading-relaxed text-slate-500">
        <p className="flex items-start gap-1">
          <ShieldCheck className="mt-0.5 h-3 w-3 flex-none" />
          Questions about this agreement, payments, a hardship request or a billing dispute: {contacts.servicing_phone || "the number on your offer"} · {contacts.dispute_email || contacts.servicing_email || "the address on your offer"}.
        </p>
        {contacts.notice_address && <p>Written notices: {contacts.notice_address}</p>}
      </footer>
    </article>
  );
}