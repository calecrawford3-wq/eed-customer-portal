import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Clock, Ban, Loader2, FileText, Link2, Eye, Mail, MessageSquare } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";

const STATUS_CLS = {
  pending: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  canceled: "bg-slate-100 text-slate-400",
};

export default function AdditionalWorkCard({ aw, job, findings }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [showDecline, setShowDecline] = useState(false);
  const [note, setNote] = useState("");
  const [showSend, setShowSend] = useState(null); // "email" | "text" | null

  const customerId = aw.customer_id || job?.customer_id;
  const { data: customer } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const res = await base44.entities.Customer.filter({ id: customerId });
      return res?.[0] || null;
    },
    enabled: !!customerId && !!showSend,
  });

  const includedFindings = (findings || []).filter(f => (aw.finding_ids || []).includes(f.id));
  const approvalUrl = aw.public_access_token
    ? `${window.location.origin}/AdditionalWorkViewer/${aw.public_access_token}`
    : "";

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(approvalUrl); toast.success("Approval link copied — paste into an email or text to the customer"); }
    catch { toast.error("Copy failed"); }
  };

  const sendEmail = async () => {
    if (!customer?.email) { toast.error("Customer has no email on file"); return; }
    setBusy("email");
    try {
      const res = await base44.functions.invoke("sendAdditionalWorkApproval", {
        additional_work_id: aw.id,
        approval_url: approvalUrl,
        message: note || undefined,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      toast.success(`Approval email sent to ${customer.email}`);
      setShowSend(null); setNote("");
    } catch (e) { toast.error(e.message || "Failed to send email"); }
    setBusy(null);
  };

  const sendText = async () => {
    if (!customer?.phone) { toast.error("Customer has no phone on file"); return; }
    setBusy("text");
    try {
      const msg = `Hello ${customer.first_name || "there"}, we have additional findings for your engine that need approval: ${approvalUrl}`;
      const res = await base44.functions.invoke("sendVoipSms", { to: customer.phone, message: msg });
      if (res?.data?.error) throw new Error(res.data.error);
      toast.success(`Approval text sent to ${customer.phone}`);
      setShowSend(null); setNote("");
    } catch (e) { toast.error(e.message || "Failed to send text"); }
    setBusy(null);
  };

  const act = async (action) => {
    setBusy(action);
    try {
      const res = await base44.functions.invoke("processApprovedAdditionalWork", { additional_work_id: aw.id, action, customer_note: note });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(action === "approve" ? "Approved & applied to invoice" : action === "decline" ? "Declined" : "Canceled");
      qc.invalidateQueries({ queryKey: ["job-additional-work", job.id] });
      qc.invalidateQueries({ queryKey: ["job-findings", job.id] });
      qc.invalidateQueries({ queryKey: ["job-invoices", job.invoice_ids] });
      if (action === "approve") { qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["job", job.id] }); }
      setShowDecline(false); setNote("");
    } catch (e) { toast.error(e.message); }
    setBusy(null);
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> {aw.work_number}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={STATUS_CLS[aw.status]}>{aw.status}</Badge>
            {aw.processed_at && <Badge variant="outline" className="text-emerald-600 border-emerald-300">processed</Badge>}
            {aw.invoice_id && <Link to={`/InvoiceDetail?id=${aw.invoice_id}`} className="text-xs text-[#e20404] hover:underline">invoice →</Link>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {aw.title && <p className="font-medium text-slate-900">{aw.title}</p>}
        {aw.description && <p className="text-slate-600">{aw.description}</p>}
        {includedFindings.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {includedFindings.map(f => <Badge key={f.id} variant="outline" className="text-xs">{f.component}</Badge>)}
          </div>
        )}
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>Subtotal: {formatMoney(aw.subtotal)}</span>
          <span>Tax: {formatMoney(aw.tax_amount || 0)}</span>
          <span className="font-semibold text-slate-900">Total: {formatMoney(aw.total)}</span>
          {aw.version > 1 && <span>v{aw.version}</span>}
        </div>
        {aw.customer_response && aw.customer_response !== "pending" && (
          <div className={`flex items-center gap-1.5 text-xs pt-1 ${aw.customer_response === "approved" ? "text-blue-600" : "text-red-600"}`}>
            {aw.customer_response === "approved" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            Customer {aw.customer_response} this request{aw.customer_response_at ? ` on ${new Date(aw.customer_response_at).toLocaleDateString()}` : ""}
          </div>
        )}
        {aw.public_access_token && (
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Button size="sm" variant="outline" onClick={copyLink} disabled={!!busy}>
              <Link2 className="w-3.5 h-3.5" /> Copy Link
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowSend("email")} disabled={!!busy}>
              <Mail className="w-3.5 h-3.5" /> Email Link
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowSend("text")} disabled={!!busy}>
              <MessageSquare className="w-3.5 h-3.5" /> Text Link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => window.open(approvalUrl, "_blank")} disabled={!!busy}>
              <Eye className="w-3.5 h-3.5" /> Preview
            </Button>
          </div>
        )}
        {aw.status === "pending" && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => act("approve")} disabled={!!busy}>
              {busy === "approve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Approve & Apply
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowDecline(true)} disabled={!!busy}><XCircle className="w-3.5 h-3.5" /> Decline</Button>
            <Button size="sm" variant="ghost" onClick={() => act("cancel")} disabled={!!busy}><Ban className="w-3.5 h-3.5" /> Cancel</Button>
          </div>
        )}
        {aw.status === "approved" && !aw.processed_at && (
          <div className="flex items-center gap-2 text-amber-700 text-xs pt-1"><Clock className="w-3.5 h-3.5" /> Approved — awaiting processing into invoice</div>
        )}
        {aw.approved_at && <p className="text-xs text-slate-400">Approved {new Date(aw.approved_at).toLocaleDateString()} by {aw.approved_by || "—"}</p>}
        {aw.customer_note && <p className="text-xs text-slate-500 italic">"{aw.customer_note}"</p>}

        {showDecline && (
          <div className="bg-slate-50 rounded p-2 space-y-2 border">
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Decline reason (optional)" rows={2} className="text-sm" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => act("decline")} disabled={!!busy}>Confirm Decline</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowDecline(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {showSend && (
          <div className="bg-slate-50 rounded p-3 space-y-2 border">
            <p className="text-sm font-medium text-slate-700">
              {showSend === "email" ? "Email approval link" : "Text approval link"}
            </p>
            <p className="text-xs text-slate-500">
              {showSend === "email"
                ? (customer?.email ? `Sending to ${customer.email}` : "No email on file for this customer")
                : (customer?.phone ? `Sending to ${customer.phone}` : "No phone on file for this customer")}
            </p>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional personal note" rows={2} className="text-sm" />
            <div className="flex gap-2">
              <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303]" onClick={showSend === "email" ? sendEmail : sendText} disabled={!!busy || (showSend === "email" ? !customer?.email : !customer?.phone)}>
                {busy === showSend ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : showSend === "email" ? <Mail className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                Send {showSend === "email" ? "Email" : "Text"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowSend(null); setNote(""); }} disabled={!!busy}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}