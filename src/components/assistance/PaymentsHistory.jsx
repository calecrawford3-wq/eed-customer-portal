import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import { formatMoney } from "@/lib/money";

const LABEL = { deposit: " · deposit", deposit_lender: " · deposit" };

// Payments already confirmed on this offer, collapsed to a single line.
export default function PaymentsHistory({ payments = [] }) {
  const [open, setOpen] = useState(false);
  if (!payments.length) return null;
  const total = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payments received</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900">
              {formatMoney(total)} · {payments.length} {payments.length === 1 ? "payment" : "payments"}
            </p>
          </div>
          <ChevronDown className={`h-4 w-4 flex-none text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="mt-3 divide-y divide-slate-100">
            {payments.map((payment, index) => (
              <div key={index} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 text-sm text-slate-600">
                  {String(payment.method || "").replace(/_/g, " ")}
                  {LABEL[payment.amount_option] || ""}
                  {payment.financed ? " · lender financed" : ""} · {payment.date}
                </span>
                <span className="flex-none text-sm font-semibold tabular-nums text-slate-900">{formatMoney(payment.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}