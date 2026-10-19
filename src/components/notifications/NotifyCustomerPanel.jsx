import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Mail, MessageSquare, Send, X, CheckCircle, AlertCircle, Loader2, Phone } from "lucide-react";
import { toast } from "sonner";

/**
 * NotifyCustomerPanel — unified customer notification UI for email + SMS.
 *
 * Props:
 *   open / onClose           — dialog visibility
 *   eventType                — "estimate_ready" | "additional_work_ready" | "stage_change" | "completion"
 *   customerId               — linked Customer
 *   customerName             — display name
 *   customerEmail             — email on file (may be empty)
 *   customerPhone             — phone on file (may be empty)
 *   smsOptOut                — true if customer opted out of SMS
 *   idempotencyKey            — event_type + ":" + entity_id (deterministic, prevents duplicates)
 *   defaultSubject            — pre-filled email subject
 *   defaultEmailBody          — pre-filled HTML email body
 *   defaultSmsBody            — pre-filled SMS body
 *   linkUrl                   — document/approval link
 *   jobId / entityId / entityLabel — for audit trail
 *   onSent                    — callback after successful send (optional)
 *
 * Shows recipient details, editable message previews, and per-channel results.
 * "Not Now" dismisses without undoing the underlying action.
 */
export default function NotifyCustomerPanel({
  open,
  onClose,
  eventType,
  customerId,
  customerName,
  customerEmail,
  customerPhone,
  smsOptOut,
  idempotencyKey,
  defaultSubject,
  defaultEmailBody,
  defaultSmsBody,
  linkUrl,
  jobId,
  entityId,
  entityLabel,
  onSent,
}) {
  const [subject, setSubject] = useState(defaultSubject || "");
  const [emailBody, setEmailBody] = useState(defaultEmailBody || "");
  const [smsBody, setSmsBody] = useState(defaultSmsBody || "");
  const [sendEmail, setSendEmail] = useState(!!customerEmail);
  const [sendSms, setSendSms] = useState(!!customerPhone && !smsOptOut);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setSubject(defaultSubject || "");
      setEmailBody(defaultEmailBody || "");
      setSmsBody(defaultSmsBody || "");
      setSendEmail(!!customerEmail);
      setSendSms(!!customerPhone && !smsOptOut);
      setResult(null);
    }
  }, [open]);

  const hasEmail = !!customerEmail;
  const hasSms = !!customerPhone && !smsOptOut;
  const canSend = (sendEmail || sendSms) && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setResult(null);
    try {
      const channels = [];
      if (sendEmail) channels.push("email");
      if (sendSms) channels.push("sms");

      const res = await base44.functions.invoke("sendCustomerNotification", {
        event_type: eventType,
        idempotency_key: idempotencyKey,
        customer_id: customerId,
        channels,
        subject,
        email_body: emailBody,
        sms_body: smsBody,
        link_url: linkUrl,
        job_id: jobId,
        entity_id: entityId,
        entity_label: entityLabel,
      });

      const data = res?.data || res;
      setResult(data);

      if (data?.idempotent) {
        toast.info("This notification was already sent — showing the previous result.");
      } else {
        const emailOk = data?.email_status === "sent" || data?.email_status === "skipped";
        const smsOk = data?.sms_status === "sent" || data?.sms_status === "skipped" || data?.sms_status === "unknown";
        if (emailOk && smsOk) {
          toast.success("Notification sent to customer.");
        } else if (emailOk || smsOk) {
          toast.warning("Partially sent — one channel failed. See details below.");
        } else {
          toast.error("Failed to send notification. See details below.");
        }
      }

      if (onSent) onSent(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to send notification");
      setResult({ error: err?.message || "Failed to send" });
    } finally {
      setSending(false);
    }
  };

  const handleRetry = () => {
    // Re-send with the same idempotency key — the backend retries only failed channels
    handleSend();
  };

  const emailDone = result && ["sent", "skipped"].includes(result.email_status);
  const smsDone = result && ["sent", "skipped", "unknown"].includes(result.sms_status);
  const hasFailures = result && (!emailDone || !smsDone);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-[#e20404]" />
            Notify Customer
          </DialogTitle>
        </DialogHeader>

        {/* Recipient details */}
        <div className="space-y-2 py-1">
          <div className="text-sm font-medium text-slate-700">{customerName}</div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={`text-xs ${
                hasEmail
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-slate-50 text-slate-400 border-slate-200"
              }`}
            >
              <Mail className="w-3 h-3 mr-1" />
              {hasEmail ? customerEmail : "No email on file"}
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs ${
                hasSms
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : smsOptOut
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-slate-50 text-slate-400 border-slate-200"
              }`}
            >
              <Phone className="w-3 h-3 mr-1" />
              {hasSms
                ? customerPhone
                : smsOptOut
                ? "SMS opted out"
                : "No phone on file"}
            </Badge>
          </div>
        </div>

        {/* Channel toggles */}
        <div className="flex gap-2 py-1">
          <button
            type="button"
            disabled={!hasEmail}
            onClick={() => setSendEmail(!sendEmail)}
            className={`flex-1 flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
              sendEmail && hasEmail
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-400"
            } ${!hasEmail ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <Mail className="w-4 h-4" />
            <span>Email</span>
            {sendEmail && hasEmail && <CheckCircle className="w-3.5 h-3.5 ml-auto" />}
          </button>
          <button
            type="button"
            disabled={!hasSms}
            onClick={() => setSendSms(!sendSms)}
            className={`flex-1 flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
              sendSms && hasSms
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-400"
            } ${!hasSms ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Text</span>
            {sendSms && hasSms && <CheckCircle className="w-3.5 h-3.5 ml-auto" />}
          </button>
        </div>

        {/* Message editors */}
        {sendEmail && hasEmail && (
          <div className="space-y-2 py-1">
            <Label className="text-xs text-slate-500">Email Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="text-sm"
            />
            <Label className="text-xs text-slate-500">Email Body (HTML)</Label>
            <Textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={4}
              className="text-sm font-mono"
              placeholder="<p>Email body...</p>"
            />
          </div>
        )}

        {sendSms && hasSms && (
          <div className="space-y-1 py-1">
            <Label className="text-xs text-slate-500">
              Text Message ({smsBody.length} chars{smsBody.length > 160 ? " — MMS" : ""})
            </Label>
            <Textarea
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              rows={3}
              className="text-sm"
              placeholder="SMS message"
            />
          </div>
        )}

        {/* Per-channel results */}
        {result && (
          <div className="space-y-2 py-1 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Delivery Results
            </p>
            {result.error ? (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                {result.error}
              </div>
            ) : (
              <>
                {result.email_status && (
                  <div className="flex items-center gap-2 text-sm">
                    {result.email_status === "sent" ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : result.email_status === "skipped" ? (
                      <X className="w-4 h-4 text-slate-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-slate-600">Email:</span>
                    <span
                      className={
                        result.email_status === "sent"
                          ? "text-emerald-600"
                          : result.email_status === "skipped"
                          ? "text-slate-400"
                          : "text-red-600"
                      }
                    >
                      {result.email_status}
                      {result.email_error && ` — ${result.email_error}`}
                    </span>
                  </div>
                )}
                {result.sms_status && (
                  <div className="flex items-center gap-2 text-sm">
                    {result.sms_status === "sent" ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : result.sms_status === "skipped" ? (
                      <X className="w-4 h-4 text-slate-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    )}
                    <span className="text-slate-600">Text:</span>
                    <span
                      className={
                        result.sms_status === "sent"
                          ? "text-emerald-600"
                          : result.sms_status === "skipped"
                          ? "text-slate-400"
                          : result.sms_status === "unknown"
                          ? "text-amber-600"
                          : "text-red-600"
                      }
                    >
                      {result.sms_status}
                      {result.sms_error && ` — ${result.sms_error}`}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {hasFailures && !result?.error && (
            <Button
              variant="outline"
              onClick={handleRetry}
              disabled={sending}
              className="text-sm"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-1" />
              )}
              Retry Failed
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} className="text-sm">
            Not Now
          </Button>
          <Button
            className="bg-[#e20404] hover:bg-[#c00303] text-white text-sm"
            onClick={handleSend}
            disabled={!canSend}
          >
            {sending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-1" />
            )}
            Send Email & Text
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}