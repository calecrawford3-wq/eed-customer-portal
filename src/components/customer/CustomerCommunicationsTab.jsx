import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Phone, PhoneCall, Search, Clock } from "lucide-react";
import { SATISFACTION_OPTIONS } from "@/lib/customerSuccess";

function relTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export default function CustomerCommunicationsTab({ customerId }) {
  const [search, setSearch] = useState("");
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["call-logs", customerId],
    queryFn: () => base44.entities.CallLog.filter({ customer_id: customerId }, "-started_at", 200),
    enabled: !!customerId,
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? logs.filter((l) => `${l.notes || ""} ${l.outcome || ""} ${l.call_status || ""} ${l.phone_number || ""}`.toLowerCase().includes(q))
    : logs;

  const totalSeconds = filtered.reduce((s, l) => s + (l.duration_seconds || 0), 0);
  const totalMin = Math.round(totalSeconds / 60);

  return (
    <div>
      <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder="Search call notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Badge className="bg-slate-100 text-slate-600 border-0">{filtered.length} call{filtered.length === 1 ? "" : "s"} · {totalMin}m total</Badge>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <PhoneCall className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No calls logged yet. Click a customer's phone number to start a logged call.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((l) => {
            const sat = SATISFACTION_OPTIONS.find((s) => s.value === l.satisfaction);
            const durMin = Math.floor((l.duration_seconds || 0) / 60);
            const durSec = (l.duration_seconds || 0) % 60;
            return (
              <Card key={l.id} className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${l.direction === "inbound" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"}`}>
                      <Phone className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="text-xs border-0 capitalize bg-slate-100 text-slate-700">{l.call_status?.replace("_", " ") || "—"}</Badge>
                        {l.outcome && l.outcome !== l.call_status && <span className="text-xs text-slate-500">{l.outcome}</span>}
                        {l.source === "customer_success" && <Badge className="text-xs border-0 bg-purple-100 text-purple-700">CS follow-up</Badge>}
                        {sat && <Badge className={`text-xs border-0 ${sat.color}`}>{sat.label}</Badge>}
                        <span className="text-xs text-slate-400 ml-auto flex items-center gap-1"><Clock className="w-3 h-3" />{durMin > 0 ? `${durMin}m ${durSec}s` : `${durSec}s`}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{l.phone_number} · {relTime(l.started_at || l.created_date)}</p>
                      {l.notes && <p className="text-sm text-slate-700 mt-1.5 whitespace-pre-wrap">{l.notes}</p>}
                      {l.followup_date && <p className="text-xs text-amber-600 mt-1">Follow-up scheduled: {l.followup_date}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}