import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, Plus, Users, Trash2, Search, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { toast } from "sonner";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";
import AddCreditModal from "@/components/credits/AddCreditModal";
import AddReferralModal from "@/components/credits/AddReferralModal";

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

const PCS_BREAKDOWN = [
  { result: "1st Place", credits: 100 },
  { result: "2nd Place", credits: 75 },
  { result: "3rd Place", credits: 50 },
  { result: "4th–5th", credits: 25 },
  { result: "B Feature Win", credits: 15 },
  { result: "Heat Race Win", credits: 10 },
  { result: "Top 10 Consistency (3+ in a row)", credits: 50 },
  { result: "Feature Start Bonus", credits: 10 },
];

export default function Credits() {
  const [addOpen, setAddOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const qc = useQueryClient();

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 500),
  });

  const { data: credits = [], isLoading } = useQuery({
    queryKey: ["allAccountCredits"],
    queryFn: () => base44.entities.AccountCredit.list("-created_date", 500),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AccountCredit.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["allAccountCredits"] }); toast.success("Credit removed"); },
  });

  const customerName = (id) => {
    const c = customers.find(c => c.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "Unknown";
  };

  const filtered = credits.filter(c => {
    if (filterCustomerId && c.customer_id !== filterCustomerId) return false;
    if (search) {
      const name = customerName(c.customer_id).toLowerCase();
      const q = search.toLowerCase();
      if (!name.includes(q) && !`${c.subtype || ""} ${c.description || ""} ${c.type}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalIssued = credits.filter(c => c.amount > 0).reduce((s, c) => s + c.amount, 0);
  const totalRedeemed = credits.filter(c => c.amount < 0).reduce((s, c) => s + Math.abs(c.amount), 0);

  const balances = {};
  credits.forEach(c => { balances[c.customer_id] = (balances[c.customer_id] || 0) + c.amount; });
  const customerBalances = Object.entries(balances)
    .map(([cid, bal]) => ({ customer_id: cid, balance: bal, name: customerName(cid) }))
    .filter(cb => cb.balance !== 0)
    .sort((a, b) => b.balance - a.balance);

  const filteredBalance = filterCustomerId ? balances[filterCustomerId] || 0 : totalIssued - totalRedeemed;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Award className="w-6 h-6 text-amber-500" /> Performance Credit System</h1>
          <p className="text-sm text-slate-500 mt-1">Track and manage driver account credits — 1 Credit = $1, redeemable toward builds.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setReferralOpen(true)}><Users className="w-4 h-4 mr-2" /> Add Referral</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-2" /> Add Credit</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-emerald-600" /></div>
              <div><p className="text-xs text-slate-500">Total Credits Issued</p><p className="text-xl font-bold text-slate-900">${totalIssued.toFixed(2)}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-red-600" /></div>
              <div><p className="text-xs text-slate-500">Total Redeemed</p><p className="text-xl font-bold text-slate-900">${totalRedeemed.toFixed(2)}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center"><Wallet className="w-5 h-5 text-violet-600" /></div>
              <div><p className="text-xs text-slate-500">Outstanding Balance</p><p className="text-xl font-bold text-slate-900">${(totalIssued - totalRedeemed).toFixed(2)}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowBreakdown(!showBreakdown)}>
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2"><Award className="w-4 h-4 text-amber-500" /> PCS Credit Breakdown</span>
            <span className="text-xs text-slate-400">{showBreakdown ? "Hide" : "Show"}</span>
          </CardTitle>
        </CardHeader>
        {showBreakdown && (
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PCS_BREAKDOWN.map(item => (
                <div key={item.result} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-xs text-slate-500">{item.result}</p>
                  <p className="text-lg font-bold text-amber-600">{item.credits} <span className="text-xs font-normal text-slate-400">credits</span></p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">Credits expire annually on December 31. 1 Credit = $1 in redeemable value (non-cash, non-transferable).</p>
          </CardContent>
        )}
      </Card>

      <div className="flex gap-3 mb-4 items-end flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="text-xs text-slate-500 mb-1 block">Filter by customer</label>
          <CustomerSearchSelect customers={customers} value={filterCustomerId} onValueChange={setFilterCustomerId} placeholder="All customers..." />
        </div>
        <div className="flex-1 min-w-[200px] max-w-xs relative">
          <label className="text-xs text-slate-500 mb-1 block">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input className="pl-9" placeholder="Search type, description..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {filterCustomerId && (
          <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-2 text-sm">
            <span className="text-violet-600 font-medium">Balance: </span>
            <span className="font-bold text-violet-700">${filteredBalance.toFixed(2)}</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Award className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No credits yet</p>
          <p className="text-sm mt-1">Click "Add Credit" to issue performance, referral, or manual credits.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Subtype / Description</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Expires</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{customerName(c.customer_id)}</td>
                  <td className="px-4 py-3"><Badge className={`${TYPE_STYLES[c.type] || TYPE_STYLES.other} border-0`}>{TYPE_LABELS[c.type] || c.type}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.subtype && <span className="font-medium text-slate-700">{c.subtype}</span>}
                    {c.description && <span className="text-slate-500 text-xs block">{c.description}</span>}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${c.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>{c.amount >= 0 ? "+" : "−"}${Math.abs(c.amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{c.date ? new Date(c.date).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{c.expires_on ? new Date(c.expires_on).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!filterCustomerId && customerBalances.length > 0 && (
        <Card className="border-0 shadow-sm mt-6">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Customer Balances</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {customerBalances.map(cb => (
                <div key={cb.customer_id} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-sm font-medium text-slate-800 truncate">{cb.name}</p>
                  <p className={`text-lg font-bold ${cb.balance >= 0 ? "text-violet-600" : "text-red-600"}`}>${cb.balance.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AddCreditModal open={addOpen} onClose={() => setAddOpen(false)} customers={customers} />
      <AddReferralModal open={referralOpen} onClose={() => setReferralOpen(false)} customers={customers} />
    </div>
  );
}