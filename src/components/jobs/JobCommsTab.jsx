import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Mail, FileText, Phone } from "lucide-react";

export default function JobCommsTab({ job, customer }) {
  const phone = customer?.phone;
  const { data: messages = [] } = useQuery({
    queryKey: ["job-messages", phone],
    queryFn: () => base44.entities.Message.filter({ phone_number: phone || "none" }, "-sent_at", 20),
    enabled: !!phone,
  });
  const { data: emails = [] } = useQuery({
    queryKey: ["job-emails", customer?.email],
    queryFn: () => base44.entities.Email.filter({ to_address: customer?.email || "none" }, "-created_date", 20),
    enabled: !!customer?.email,
  });
  const { data: docs = [] } = useQuery({
    queryKey: ["job-docs", job.estimate_id, job.build_id],
    queryFn: () => base44.entities.LegalDocument.filter({ estimate_id: job.estimate_id || "none" }, "-created_date", 20),
    enabled: !!job.estimate_id,
  });

  const msgList = messages.items || messages || [];
  const emailList = emails.items || emails || [];
  const docList = docs.items || docs || [];

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Messages</CardTitle></CardHeader>
          <CardContent>
            {msgList.length === 0 ? <p className="text-sm text-slate-400 py-3">No messages linked to this customer.</p> : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {msgList.slice(0, 10).map(m => (
                  <div key={m.id} className="text-xs bg-slate-50 rounded p-2">
                    <span className="text-slate-400">{m.direction === "inbound" ? "←" : "→"} {new Date(m.sent_at || m.created_date).toLocaleString()}</span>
                    <p className="text-slate-700 truncate">{m.body}</p>
                  </div>
                ))}
              </div>
            )}
            <Link to="/Messaging" className="text-xs text-[#e20404] hover:underline mt-2 inline-block">Open Messages →</Link>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Mail className="w-4 h-4" /> Emails</CardTitle></CardHeader>
          <CardContent>
            {emailList.length === 0 ? <p className="text-sm text-slate-400 py-3">No emails linked to this customer.</p> : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {emailList.slice(0, 10).map(e => (
                  <div key={e.id} className="text-xs bg-slate-50 rounded p-2">
                    <span className="text-slate-400">{new Date(e.created_date).toLocaleString()}</span>
                    <p className="text-slate-700 truncate">{e.subject || "(no subject)"}</p>
                  </div>
                ))}
              </div>
            )}
            <Link to="/Emails" className="text-xs text-[#e20404] hover:underline mt-2 inline-block">Open Emails →</Link>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Legal Documents</CardTitle></CardHeader>
        <CardContent>
          {docList.length === 0 ? <p className="text-sm text-slate-400 py-3">No legal documents linked to this job.</p> : (
            <div className="space-y-2">
              {docList.map(d => (
                <div key={d.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-2">
                  <div><span className="text-sm font-medium capitalize">{(d.document_type || "").replace(/_/g, " ")}</span></div>
                  <Badge variant="outline" className="text-xs">{d.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {customer && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Phone className="w-4 h-4" /> Customer Contact</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><span className="text-slate-400">Phone:</span> {customer.phone || "—"}</p>
            <p><span className="text-slate-400">Email:</span> {customer.email || "—"}</p>
            <Link to={`/CustomerDetail?id=${customer.id}`} className="text-xs text-[#e20404] hover:underline">Open Customer →</Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}