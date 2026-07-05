import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";
import { toast } from "sonner";

const PCS_PRESETS = [
  { subtype: "1st Place", amount: 100 },
  { subtype: "2nd Place", amount: 75 },
  { subtype: "3rd Place", amount: 50 },
  { subtype: "4th-5th Place", amount: 25 },
  { subtype: "B Feature Win", amount: 15 },
  { subtype: "Heat Race Win", amount: 10 },
  { subtype: "Top 10 Consistency (3+ in a row)", amount: 50 },
  { subtype: "Feature Start Bonus", amount: 10 },
];

const TYPES = [
  { value: "performance", label: "Performance (PCS)" },
  { value: "referral", label: "Referral" },
  { value: "manual", label: "Manual / Other" },
  { value: "other", label: "Other" },
];

const dec31ThisYear = () => `${new Date().getFullYear()}-12-31`;

export default function AddCreditModal({ open, onClose, customers }) {
  const [customerId, setCustomerId] = useState("");
  const [type, setType] = useState("performance");
  const [subtype, setSubtype] = useState("");
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [expiresOn, setExpiresOn] = useState(dec31ThisYear());
  const qc = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.AccountCredit.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allAccountCredits"] });
      qc.invalidateQueries({ queryKey: ["accountCredits"] });
      toast.success("Credit added");
      setCustomerId(""); setType("performance"); setSubtype(""); setAmount(0);
      setDescription(""); setDate(new Date().toISOString().split("T")[0]); setExpiresOn(dec31ThisYear());
      onClose();
    },
  });

  const handlePreset = (presetSubtype) => {
    const preset = PCS_PRESETS.find(p => p.subtype === presetSubtype);
    setSubtype(preset.subtype);
    setAmount(preset.amount);
  };

  const handleSubmit = () => {
    if (!customerId) { toast.error("Select a customer"); return; }
    if (!amount || amount <= 0) { toast.error("Amount must be greater than 0"); return; }
    createMutation.mutate({
      customer_id: customerId,
      amount: Number(amount),
      type,
      subtype: subtype || undefined,
      description: description || subtype || "",
      date,
      expires_on: type === "performance" ? expiresOn : undefined,
      status: "active",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Account Credit</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Customer *</Label>
            <CustomerSearchSelect customers={customers} value={customerId} onValueChange={setCustomerId} />
          </div>
          <div>
            <Label>Credit Type</Label>
            <Select value={type} onValueChange={v => { setType(v); setSubtype(""); setAmount(0); setExpiresOn(v === "performance" ? dec31ThisYear() : ""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {type === "performance" && (
            <div>
              <Label>Performance Result (PCS Preset)</Label>
              <Select value={subtype} onValueChange={handlePreset}>
                <SelectTrigger><SelectValue placeholder="Select a result..." /></SelectTrigger>
                <SelectContent>
                  {PCS_PRESETS.map(p => <SelectItem key={p.subtype} value={p.subtype}>{p.subtype} ({p.amount} credits)</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">Selecting a preset auto-fills the amount. 1 Credit = $1.</p>
            </div>
          )}
          <div>
            <Label>Amount ($) *</Label>
            <Input type="number" step="0.01" value={amount} onChange={e => setAmount(Number(e.target.value))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><Label>Expires On</Label><Input type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} disabled={type !== "performance"} /></div>
          </div>
          <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional notes..." /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Adding..." : "Add Credit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}