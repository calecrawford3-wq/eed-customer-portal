import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CreditCard, Banknote, FileText, CheckSquare } from "lucide-react";

const METHOD_CONFIG = {
  cash: { label: "Cash", icon: Banknote, color: "bg-emerald-100 text-emerald-700" },
  card: { label: "Card (In-Person)", icon: CreditCard, color: "bg-blue-100 text-blue-700" },
  check: { label: "Check", icon: FileText, color: "bg-amber-100 text-amber-700" },
  other: { label: "Other", icon: CheckSquare, color: "bg-slate-100 text-slate-700" },
};

export default function PaymentModal({ open, onClose, balanceDue, totalPaid, onRecord, title = "Record Payment" }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const handleRecord = () => {
    if (!amount || Number(amount) <= 0) return;
    onRecord({ amount: Number(amount), method, note, date });
    setAmount("");
    setMethod("cash");
    setNote("");
    setDate(new Date().toISOString().split("T")[0]);
    onClose();
  };

  const handlePayFull = () => setAmount(Number(balanceDue || 0).toFixed(2));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {balanceDue !== undefined && (
            <div className="bg-slate-50 rounded-lg p-3 flex justify-between text-sm">
              <span className="text-slate-500">Balance Due</span>
              <span className="font-bold text-[#e20404]">${Number(balanceDue || 0).toFixed(2)}</span>
            </div>
          )}

          {/* Payment Method */}
          <div>
            <Label>Payment Method</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {Object.entries(METHOD_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setMethod(key)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      method === key
                        ? "border-[#e20404] bg-red-50 text-[#e20404]"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Amount</Label>
              {balanceDue !== undefined && (
                <button onClick={handlePayFull} className="text-xs text-[#e20404] hover:underline">
                  Pay full balance
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <Input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-7"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {/* Note */}
          <div>
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g., Deposit for engine rebuild..."
              rows={2}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              onClick={handleRecord}
              disabled={!amount || Number(amount) <= 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Record Payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}