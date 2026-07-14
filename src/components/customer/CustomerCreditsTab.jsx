import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Award, Plus, Trash2, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import AddCreditModal from "@/components/credits/AddCreditModal";

const TYPE_STYLES = {
  performance: "bg-amber-100 text-amber-700",
  referral: "bg-violet-100 text-violet-700",
  manual: "bg-slate-100 text-slate-600",
  redemption: "bg-red-100 text-red-700",
  other: "bg-slate-100 text-slate-600",
};

const TYPE_LABELS = {
  performance: "Performance",
  referral: "Referral",
  manual: "Manual",
  redemption: "Redemption",
  other: "Other",
};

export default function CustomerCreditsTab({ customer }) {
  const [addOpen, setAddOpen] = useState(false);
  const qc = useQueryClient();

  const { data: credits = [], isLoading } = useQuery({
    queryKey: ["customer-credits", customer.id],
    queryFn: () => base44.entities.AccountCredit.filter({ customer_id: customer.id }, "-created_date", 500),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AccountCredit.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-credits", customer.id] });
      qc.invalidateQueries({ queryKey: ["allAccountCredits"] });
      toast.success("Credit removed");
    },
  });

  const issued = credits.filter(c => c.amount > 0).reduce((s, c) => s + c.amount, 0);
  const redeemed = credits.filter(c => c.amount < 0).reduce((s, c) => s + Math.abs(c.amount), 0);
  const balance = issued - redeemed;

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-emerald-600" /></div>
              <div><p className="text-xs text-slate-500">Issued</p><p className="text-base font-bold text-slate-900">${issued.toFixed(2)}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center"><TrendingDown className="w-4 h-4 text-red-600" /></div>
              <div><p className="text-xs text-slate-500">Redeemed</p><p className="text-base font-bold text-slate-900">${redeemed.toFixed(2)}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center"><Wallet className="w-4 h-4 text-violet-600" /></div>
              <div><p className="text-xs text-slate-500">Balance</p><p className="text-base font-bold text-violet-600">${balance.toFixed(2)}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end mb-3">
        <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Credit
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : credits.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <Award className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No credits yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600">Type</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600">Subtype / Description</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600">Amount</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600">Date</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-600">Expires</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {credits.map(c => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2.5"><Badge className={`${TYPE_STYLES[c.type] || TYPE_STYLES.other} border-0`}>{TYPE_LABELS[c.type] || c.type}</Badge></td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {c.subtype && <span className="font-medium text-slate-700">{c.subtype}</span>}
                    {c.description && <span className="text-slate-500 text-xs block">{c.description}</span>}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-bold ${c.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>{c.amount >= 0 ? "+" : "−"}${Math.abs(c.amount).toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs">{c.date ? new Date(c.date).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs">{c.expires_on ? new Date(c.expires_on).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2.5">
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 h-7 px-1" onClick={() => deleteMutation.mutate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddCreditModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        customers={[customer]}
        presetCustomerId={customer.id}
      />
    </div>
  );
}