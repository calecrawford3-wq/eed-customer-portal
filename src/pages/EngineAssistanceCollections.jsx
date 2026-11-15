import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw, Search, ShieldAlert, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money";
import StatusBadge from "@/components/assistance/StatusBadge";

const FILTERS = [
  ["open", "Needs attention"],
  ["all", "All cases"],
  ["current", "Current"],
  ["delinquent", "Past due"],
  ["notices_approved", "Notices approved"],
  ["referral_prepared", "Referral prepared"],
  ["referred", "Referred"],
  ["closed", "Closed"],
];

// Delinquency review queue for every Elite in-house installment agreement.
// Recomputing a case only records facts; nothing is sent or filed from here.
export default function EngineAssistanceCollections() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["engine-assistance-collections"],
    queryFn: async () => {
      const res = await base44.functions.invoke("engineAssistanceCollections", { action: "queue" });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
  });

  const cases = useMemo(() => data?.cases || [], [data]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cases.filter((item) => {
      if (filter === "open" && ["closed", "current"].includes(item.status)) return false;
      if (!["open", "all"].includes(filter) && item.status !== filter) return false;
      if (!query) return true;
      return [item.case_number, item.offer_number, item.customer_name, item.loan_id]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [cases, filter, search]);

  const totals = useMemo(() => {
    const open = cases.filter((item) => !["closed", "current"].includes(item.status));
    return {
      open: open.length,
      overdue: open.reduce((sum, item) => sum + (Number(item.overdue_amount) || 0), 0),
      balance: open.reduce((sum, item) => sum + (Number(item.verified_balance) || 0), 0),
    };
  }, [cases]);

  const refreshCase = async (loanId) => {
    setBusy(loanId);
    try {
      const res = await base44.functions.invoke("engineAssistanceCollections", { action: "refresh", data: { loan_id: loanId } });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("Delinquency recomputed");
      await refetch();
      qc.invalidateQueries({ queryKey: ["engine-assistance-collections"] });
    } catch (error) {
      toast.error(error?.message || "The case could not be refreshed");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/EngineAssistance" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-3.5 w-3.5" /> Engine Assistance
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl sm:text-3xl font-bold text-slate-900">
            <ShieldAlert className="h-7 w-7 text-[#e20404]" /> Collections review
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Past-due in-house agreements. Notices need manual approval, referral packages are prepared for a person to submit, and Elite never files to a credit bureau itself.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <Card><CardContent className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cases needing attention</p>
          <p className="text-xl font-bold tabular-nums text-slate-900">{totals.open}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Past-due amount</p>
          <p className="text-xl font-bold tabular-nums text-amber-700">{formatMoney(totals.overdue)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Verified balances</p>
          <p className="text-xl font-bold tabular-nums text-slate-900">{formatMoney(totals.balance)}</p>
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search case, offer or customer" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>{FILTERS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading cases…</div>
      ) : !visible.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">{cases.length ? "No cases match this filter." : "No in-house agreements to review."}</p>
          <p className="mt-1 text-xs text-slate-500">Recompute delinquency from an application to open a review case.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((item) => (
            <Card key={`${item.loan_id}-${item.id}`}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.status} />
                    {item.case_number && <span className="text-xs font-semibold text-slate-700">{item.case_number}</span>}
                    {item.offer_number && <span className="text-xs text-slate-500">Offer {item.offer_number}</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {Number(item.days_past_due) || 0} days past due · {Number(item.missed_installments) || 0} missed · overdue {formatMoney(item.overdue_amount || 0)} · balance {formatMoney(item.verified_balance || 0)}
                  </p>
                  {item.last_reviewed_at && (
                    <p className="text-[11px] text-slate-400">Reviewed {format(new Date(item.last_reviewed_at), "MMM d, yyyy h:mm a")} by {item.reviewed_by}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={busy === item.loan_id} onClick={() => refreshCase(item.loan_id)}>
                    {busy === item.loan_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Recompute
                  </Button>
                  {item.application_id && (
                    <Link to={`/EngineAssistance/${item.application_id}`}>
                      <Button size="sm" variant="ghost">Open case file</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}