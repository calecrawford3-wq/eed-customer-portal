import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { HeartHandshake, Settings2, Copy, Search, Loader2, AlertTriangle, Wallet, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money";
import ApplicationQueueCard from "@/components/assistance/ApplicationQueueCard";
import FundSettingsDialog from "@/components/assistance/FundSettingsDialog";

const FILTERS = [
  ["all", "All"],
  ["open", "Needs review"],
  ["submitted", "New"],
  ["under_review", "Under review"],
  ["info_requested", "Info requested"],
  ["approved", "Approved"],
  ["funded", "Funded"],
  ["denied", "Denied"],
];

function Stat({ label, value, tone = "text-slate-900" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${tone}`}>{value}</p>
    </div>
  );
}

export default function EngineAssistance() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: bootstrap } = useQuery({
    queryKey: ["engine-assistance-bootstrap"],
    queryFn: async () => (await base44.functions.invoke("engineAssistanceAdmin", { action: "bootstrap" })).data,
  });

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["engine-assistance-applications"],
    queryFn: () => base44.entities.EngineAssistanceApplication.list("-created_date", 300),
  });

  const { data: offers = [] } = useQuery({
    queryKey: ["engine-assistance-offers"],
    queryFn: () => base44.entities.EngineAssistanceOffer.list("-created_date", 300),
  });

  const { data: ledger = [] } = useQuery({
    queryKey: ["engine-assistance-ledger"],
    queryFn: () => base44.entities.EngineAssistanceLedgerEntry.list("-occurred_at", 500),
  });

  const offerByApp = useMemo(() => {
    const map = {};
    offers.forEach((offer) => { if (offer.application_id) map[offer.application_id] = offer; });
    return map;
  }, [offers]);

  const counts = useMemo(() => ({
    needsReview: applications.filter((a) => ["submitted", "under_review"].includes(a.status)).length,
    info: applications.filter((a) => a.status === "info_requested").length,
    approved: applications.filter((a) => a.status === "approved").length,
    funded: applications.filter((a) => a.status === "funded").length,
  }), [applications]);

  const fund = useMemo(() => {
    let awarded = 0, paid = 0;
    ledger.forEach((entry) => {
      const amount = Number(entry.amount) || 0;
      if (entry.entry_type === "award") awarded += entry.direction === "debit" ? -amount : amount;
      if (entry.entry_type === "payment") paid += entry.direction === "debit" ? -amount : amount;
      if (entry.entry_type === "refund") paid -= amount;
      if (entry.entry_type === "adjustment") {
        if (entry.direction === "debit") awarded -= amount; else awarded += amount;
      }
    });
    return { awarded, paid };
  }, [ledger]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return applications.filter((app) => {
      if (filter === "open" && !["submitted", "under_review"].includes(app.status)) return false;
      if (!["all", "open"].includes(filter) && app.status !== filter) return false;
      if (!query) return true;
      return [app.application_number, app.first_name, app.last_name, app.email, app.engine_platform_text]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [applications, filter, search]);

  const applyUrl = bootstrap?.apply_url ? window.location.origin + bootstrap.apply_url : "";

  const copyLink = async () => {
    if (!applyUrl) return;
    try { await navigator.clipboard.writeText(applyUrl); toast.success("Application link copied"); }
    catch { toast.error("Copy failed — select the link manually"); }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2">
            <HeartHandshake className="h-7 w-7 text-[#e20404]" /> Engine Assistance
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            {bootstrap?.settings?.fund_name || "Affordable Engine Fund"} — applications, awards and the funding ledger.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyLink} disabled={!applyUrl}>
            <Copy className="h-4 w-4" /> Application link
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4" /> Settings
          </Button>
        </div>
      </div>

      {bootstrap && bootstrap.settings?.payments_enabled === false && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-none" />
          <p>{bootstrap.settings?.payments_disabled_reason || "Online payment is not configured. Offers can still be built and sent, but customers cannot pay online yet."}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Stat label="Needs review" value={counts.needsReview} tone={counts.needsReview ? "text-amber-700" : "text-slate-900"} />
        <Stat label="Info requested" value={counts.info} />
        <Stat label="Approved" value={counts.approved} tone="text-emerald-700" />
        <Stat label="Funded" value={counts.funded} tone="text-emerald-700" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Assistance awarded</p>
              <p className="text-xl font-bold text-slate-900 tabular-nums">{formatMoney(fund.awarded)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5" /> Customer payments received</p>
              <p className="text-xl font-bold text-emerald-700 tabular-nums">{formatMoney(fund.paid)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, application number or engine" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FILTERS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading applications…</div>
      ) : !visible.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <HeartHandshake className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-700 mt-2">
            {applications.length ? "No applications match this filter." : "No applications yet."}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Share the public application link so racers can apply online. Nothing here is public without that link.
          </p>
          {applyUrl && <Button size="sm" variant="outline" className="mt-3" onClick={copyLink}><Copy className="h-4 w-4" /> Copy application link</Button>}
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((application) => (
            <ApplicationQueueCard key={application.id} application={application} offer={offerByApp[application.id]} />
          ))}
        </div>
      )}

      <FundSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        bootstrap={bootstrap}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["engine-assistance-bootstrap"] });
          qc.invalidateQueries({ queryKey: ["engine-assistance-applications"] });
        }}
      />
    </div>
  );
}