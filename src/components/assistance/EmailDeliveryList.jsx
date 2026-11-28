import React from "react";
import { Mail, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

const KIND_LABELS = {
  offer: "Offer email",
  application_approval: "Approval email",
  payment_confirmation: "Payment confirmation",
  acorn_status_update: "Financing status update",
};

const STATUS_STYLES = {
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  sending: "bg-amber-50 text-amber-700 border-amber-200",
  skipped: "bg-slate-100 text-slate-600 border-slate-200",
};

/**
 * Shows exactly what the mail provider reported for each customer email.
 * "Sent" only ever appears when the provider accepted the message.
 */
export default function EmailDeliveryList({ deliveries = [], busy, onAction }) {
  const list = deliveries
    .slice()
    .sort((a, b) => String(b.last_attempt_at || "").localeCompare(String(a.last_attempt_at || "")));
  if (!list.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1">
        <Mail className="h-3.5 w-3.5" /> Customer emails
      </p>
      <div className="divide-y divide-slate-100">
        {list.map((item) => (
          <div key={item.id} className="py-2 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-900">{KIND_LABELS[item.kind] || item.kind}</p>
                <p className="text-[11px] text-slate-500 break-all">
                  {item.to_email || "no address on file"}
                  {item.sent_at ? ` · sent ${format(new Date(item.sent_at), "MMM d, yyyy h:mm a")}` : item.last_attempt_at ? ` · last attempt ${format(new Date(item.last_attempt_at), "MMM d, yyyy h:mm a")}` : ""}
                  {Number(item.attempts) > 1 ? ` · ${item.attempts} attempts` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[item.status] || STATUS_STYLES.skipped}`}>
                  {item.status === "sent" ? "delivered" : item.status}
                </span>
                {item.status !== "sending" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction("retry_email", { delivery_id: item.id })}>
                    {busy === "retry_email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {item.status === "sent" ? "Resend" : "Retry"}
                  </Button>
                )}
              </div>
            </div>
            {item.status === "failed" && (
              <p className="text-[11px] text-red-700 flex items-start gap-1">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{item.error || "The mail provider did not confirm delivery."} The secure link is still valid and can be copied below.</span>
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}