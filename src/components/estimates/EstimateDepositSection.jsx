import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DollarSign, Trash2 } from "lucide-react";

export default function EstimateDepositSection({ form, setForm, id, totalDeposit, depositMet, setPaymentModalOpen }) {
  return (
    <Card className="border-0 shadow-sm mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Deposit
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Require deposit</span>
            <Switch
              checked={form.deposit_required}
              onCheckedChange={v => setForm({...form, deposit_required: v})}
            />
          </div>
        </div>
      </CardHeader>
      {form.deposit_required && (
        <CardContent>
          <div className="flex items-end gap-4 flex-wrap">
            <div className="w-40">
              <Label>Deposit Type</Label>
              <Select
                value={form.deposit_type || "amount"}
                onValueChange={v => setForm({...form, deposit_type: v})}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">Fixed Amount</SelectItem>
                  <SelectItem value="percent">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              {form.deposit_type === "percent" ? (
                <>
                  <Label>Deposit %</Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      value={form.deposit_percent || 0}
                      onChange={e => setForm({...form, deposit_percent: Number(e.target.value)})}
                      min="0"
                      max="100"
                      step="1"
                      placeholder="0"
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">%</span>
                  </div>
                </>
              ) : (
                <>
                  <Label>Deposit Amount</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <Input
                      type="number"
                      value={form.deposit_amount}
                      onChange={e => setForm({...form, deposit_amount: Number(e.target.value)})}
                      className="pl-7"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex-1">
              <div className="text-sm text-slate-500 mb-1">Payments Received</div>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold ${depositMet ? "text-emerald-600" : "text-amber-600"}`}>
                  ${totalDeposit.toFixed(2)} / ${Number(form.deposit_amount || 0).toFixed(2)}
                </span>
                {depositMet
                  ? <Badge className="bg-emerald-100 text-emerald-700 border-0">Deposit Received</Badge>
                  : <Badge className="bg-amber-100 text-amber-700 border-0">Awaiting Deposit</Badge>
                }
              </div>
            </div>
            {id && (
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                onClick={() => setPaymentModalOpen(true)}
              >
                <DollarSign className="w-4 h-4 mr-1" /> Record Payment
              </Button>
            )}
          </div>

          {/* Payment Log */}
          {(form.payments || []).length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3 space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Payment History</p>
              {(form.payments || []).map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-slate-100 text-slate-600 border-0 capitalize text-xs">{p.method}</Badge>
                    {p.note && <span className="text-slate-500">{p.note}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-xs">{p.date}</span>
                    <span className="font-semibold text-emerald-700">${Number(p.amount).toFixed(2)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-600 px-2"
                      onClick={() => {
                        const updatedPayments = form.payments.filter((_, idx) => idx !== i);
                        const newTotal = updatedPayments.reduce((s, pay) => s + (pay.amount || 0), 0);
                        const newDepositPaid = newTotal >= Number(form.deposit_amount || 0);
                        setForm({ ...form, payments: updatedPayments, deposit_paid: newDepositPaid, amount_paid: newTotal });
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}