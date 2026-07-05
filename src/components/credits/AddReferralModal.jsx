import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";
import { toast } from "sonner";

const dec31ThisYear = () => `${new Date().getFullYear()}-12-31`;

export default function AddReferralModal({ open, onClose, customers }) {
  const [referredId, setReferredId] = useState("");
  const [referrerId, setReferrerId] = useState("");
  const [amount, setAmount] = useState(200);
  const qc = useQueryClient();

  const referred = customers.find(c => c.id === referredId);
  const referrer = customers.find(c => c.id === referrerId);

  const createMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      await base44.entities.AccountCredit.bulkCreate([
        {
          customer_id: referredId,
          amount: Number(amount),
          type: "referral",
          subtype: "Referral Bonus (Referred)",
          description: `Referral bonus — referred by ${referrer?.first_name || ""} ${referrer?.last_name || ""}`,
          source_reference: referrerId,
          date: today,
          expires_on: dec31ThisYear(),
          status: "active",
        },
        {
          customer_id: referrerId,
          amount: Number(amount),
          type: "referral",
          subtype: "Referral Bonus (Referrer)",
          description: `Referral bonus — referred ${referred?.first_name || ""} ${referred?.last_name || ""}`,
          source_reference: referredId,
          date: today,
          expires_on: dec31ThisYear(),
          status: "active",
        },
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["allAccountCredits"] });
      qc.invalidateQueries({ queryKey: ["accountCredits"] });
      toast.success(`$${amount} referral credit added to both customers`);
      setReferredId(""); setReferrerId(""); setAmount(200);
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!referredId || !referrerId) { toast.error("Select both customers"); return; }
    if (referredId === referrerId) { toast.error("Referrer and referred must be different"); return; }
    if (!amount || amount <= 0) { toast.error("Amount must be greater than 0"); return; }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Referral Credit</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-violet-700">
            Creates two ${amount} referral credits — one for the new customer and one for the person who referred them.
          </div>
          <div>
            <Label>New Customer (Referred) *</Label>
            <CustomerSearchSelect customers={customers} value={referredId} onValueChange={setReferredId} placeholder="Select referred customer..." />
          </div>
          <div>
            <Label>Referred By (Referrer) *</Label>
            <CustomerSearchSelect customers={customers} value={referrerId} onValueChange={setReferrerId} placeholder="Select referrer..." />
          </div>
          <div>
            <Label>Referral Amount ($ each)</Label>
            <Input type="number" step="0.01" value={amount} onChange={e => setAmount(Number(e.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Adding..." : "Add Referral Credits"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}