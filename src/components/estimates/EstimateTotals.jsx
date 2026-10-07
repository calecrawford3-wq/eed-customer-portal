import React from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function EstimateTotals({ form, customer, setForm, updateTaxRate, updateDiscount, updateShipping, availableCreditBalance }) {
  return (
    <div className="flex justify-end mb-6">
      <div className="w-full sm:w-72 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-slate-600">Parts Subtotal</span><span>${(form.line_items || []).reduce((s, l) => s + (l.total || 0), 0).toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-slate-600">Labor Subtotal</span><span>${(form.labor_items || []).reduce((s, l) => s + (Number(l.price) || 0), 0).toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-slate-600">Machining Subtotal</span><span>${(form.machining_items || []).reduce((s, m) => s + (Number(m.price) || 0) * (Number(m.quantity) || 1), 0).toFixed(2)}</span></div>
        {(() => {
          const selAddons = (form.addons || []).filter(a => a.selection_state === 'preselected' || a.selection_state === 'customer_selected');
          if (selAddons.length === 0) return null;
          return <div className="flex justify-between text-amber-700"><span className="flex items-center gap-1">✦ Selected Addons ({selAddons.length})</span><span>${selAddons.reduce((s, a) => s + (Number(a.price) || 0), 0).toFixed(2)}</span></div>;
        })()}
        <div className="flex justify-between font-medium border-t border-slate-200 pt-2"><span className="text-slate-600">Subtotal</span><span>${Number(form.subtotal || 0).toFixed(2)}</span></div>
        {(() => {
          const revenue = Number(form.subtotal || 0) - Number(form.discount_amount || 0);
          const cost = (form.line_items || []).reduce((s, l) => s + (l.is_core_credit ? 0 : ((Number(l.unit_cost) || 0) + (Number(l.shipping_cost) || 0)) * (Number(l.quantity) || 0)), 0);
          const profit = revenue - cost;
          const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
          return (
            <div className="flex justify-between text-xs bg-slate-50 rounded px-2 py-1">
              <span className="text-slate-500">Est. Profit (Margin)</span>
              <span className={profit >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>${profit.toFixed(2)} ({margin.toFixed(1)}%)</span>
            </div>
          );
        })()}
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-600 flex items-center gap-1">Tax Rate (%) {customer?.tax_exempt && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">Exempt</Badge>}</span>
          <Input type="number" value={form.tax_rate} onChange={e => updateTaxRate(Number(e.target.value))} className="w-20 text-right h-7" min="0" step="0.1" />
        </div>
        {Number(form.tax_rate) > 0 && <div className="flex justify-between text-slate-500"><span>Tax ({form.tax_rate}% on parts)</span><span>${Number(form.tax_amount || 0).toFixed(2)}</span></div>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-600">Discount</span>
          <div className="flex items-center gap-2">
            <Select value={form.discount_type || "none"} onValueChange={v => updateDiscount("type", v)}>
              <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="amount">$ Amount</SelectItem>
                <SelectItem value="percentage">% Percent</SelectItem>
              </SelectContent>
            </Select>
            {form.discount_type && form.discount_type !== "none" && (
              <Input type="number" value={form.discount_value || 0} onChange={e => updateDiscount("value", Number(e.target.value))} className="w-20 text-right h-7" min="0" step="0.01" />
            )}
          </div>
        </div>
        {Number(form.discount_amount) > 0 && (
          <div className="flex justify-between text-emerald-600"><span>Discount Applied</span><span>-${Number(form.discount_amount || 0).toFixed(2)}</span></div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-600">Shipping</span>
          <div className="relative w-20">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
            <Input type="number" value={Number(form.shipping_cost) || 0} onChange={e => updateShipping(Number(e.target.value))} className="text-right h-7 pl-5" min="0" step="0.01" />
          </div>
        </div>
        <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2"><span>Total</span><span className="text-[#e20404]">${Number(form.total || 0).toFixed(2)}</span></div>
        {availableCreditBalance > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">Account Credit</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">(Avail: ${availableCreditBalance.toFixed(2)})</span>
              <Input type="number" value={Number(form.applied_credits) || 0} onChange={e => setForm({ ...form, applied_credits: Math.min(Math.max(0, Number(e.target.value) || 0), availableCreditBalance) })} className="w-20 text-right h-7" min="0" step="0.01" />
            </div>
          </div>
        )}
        <div className="flex justify-between text-emerald-600 font-medium"><span>Amount Paid</span><span>${Number(form.amount_paid || 0).toFixed(2)}</span></div>
        <div className="flex justify-between text-red-600 font-medium border-t border-slate-100 pt-2"><span>Amount Due</span><span>${Math.max(0, Number(form.total || 0) - Number(form.applied_credits || 0) - Number(form.amount_paid || 0)).toFixed(2)}</span></div>
        {form.deposit_required && (
          <div className="flex justify-between text-slate-600 text-sm border-t border-slate-100 pt-2">
            <span>Deposit Required</span>
            <span>${Number(form.deposit_amount || 0).toFixed(2)}</span>
          </div>
        )}
        {form.deposit_required && (
          <div className={`flex justify-between text-sm ${form.deposit_paid ? "text-emerald-600" : "text-amber-600"}`}>
            <span>Deposit Status</span>
            <span>{form.deposit_paid ? "✓ Received" : "Awaiting"}</span>
          </div>
        )}
      </div>
    </div>
  );
}