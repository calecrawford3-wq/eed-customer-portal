import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import NotifyCustomerPanel from "@/components/notifications/NotifyCustomerPanel";

const PREF_FIELD = {
  estimate_ready: "notif_customer_estimate_ready",
  additional_work_ready: "notif_customer_additional_work",
  stage_change: "notif_customer_stage_change",
  completion: "notif_customer_completion",
};

/**
 * useCustomerNotification — shared hook for customer-facing notifications.
 *
 * Returns:
 *   triggerNotify({ eventType, customerId, jobId?, entityId, entityLabel, prepare })
 *     Fetches the customer + AppSettings, calls prepare({ customer, settings })
 *     to get { subject, emailBody, smsBody, linkUrl }, then checks the per-event
 *     preference:
 *       "off"       → skip silently
 *       "automatic" → send both channels via the backend, toast the result
 *       "ask_me"    → open the NotifyCustomerPanel dialog for the admin to review/send
 *   notifyDialog — render this in your JSX (null when not open)
 */
export function useCustomerNotification() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);

  const triggerNotify = async ({
    eventType,
    customerId,
    jobId,
    entityId,
    entityLabel,
    prepare,
    onSent = undefined,
  }) => {
    if (!customerId) return;

    const prefField = PREF_FIELD[eventType] || PREF_FIELD.estimate_ready;

    let customer = null;
    let settings = {};
    let pref = "ask_me";

    try {
      const [custRes, settingsRes] = await Promise.all([
        base44.entities.Customer.get(customerId),
        base44.entities.AppSettings.filter({ key: "global" }),
      ]);
      customer = custRes;
      settings = (settingsRes?.items || settingsRes || [])[0] || {};
      pref = settings[prefField] || "ask_me";
    } catch {
      // If we can't fetch, default to ask_me so the admin can still send manually
    }

    if (pref === "off") return;

    // Let the caller build message bodies using the fetched customer + settings
    const built = prepare
      ? prepare({ customer: customer || {}, settings })
      : { subject: "", emailBody: "", smsBody: "", linkUrl: "" };

    const idempotencyKey = `${eventType}:${entityId || customerId}`;
    const customerName = customer
      ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
      : entityLabel || "Customer";

    const payload = {
      eventType,
      customerId,
      customerName,
      customerEmail: customer?.email || "",
      customerPhone: customer?.phone || "",
      smsOptOut: customer?.sms_opt_out || false,
      idempotencyKey,
      defaultSubject: built.subject || "",
      defaultEmailBody: built.emailBody || "",
      defaultSmsBody: built.smsBody || "",
      linkUrl: built.linkUrl || "",
      jobId,
      entityId,
      entityLabel,
      onSent,
    };

    if (pref === "automatic") {
      try {
        const channels = [];
        if (customer?.email) channels.push("email");
        if (customer?.phone && !customer?.sms_opt_out) channels.push("sms");
        if (channels.length === 0) {
          toast.info("No contact info on file — notification skipped.");
          return;
        }
        const res = await base44.functions.invoke("sendCustomerNotification", {
          event_type: eventType,
          idempotency_key: idempotencyKey,
          customer_id: customerId,
          channels,
          subject: built.subject,
          email_body: built.emailBody,
          sms_body: built.smsBody,
          link_url: built.linkUrl,
          job_id: jobId,
          entity_id: entityId,
          entity_label: entityLabel,
        });
        const result = res?.data || res;
        if (result?.idempotent) {
          toast.info("Customer was already notified for this event.");
        } else {
          toast.success("Customer notified automatically (email + text).");
        }
      } catch (err) {
        console.error(err);
        toast.error("Automatic notification failed — try sending manually.");
      }
      return;
    }

    // ask_me — open the panel
    setData(payload);
    setOpen(true);
  };

  const notifyDialog = data ? (
    <NotifyCustomerPanel
      open={open}
      onClose={() => {
        setOpen(false);
        setData(null);
      }}
      eventType={data.eventType}
      customerId={data.customerId}
      customerName={data.customerName}
      customerEmail={data.customerEmail}
      customerPhone={data.customerPhone}
      smsOptOut={data.smsOptOut}
      idempotencyKey={data.idempotencyKey}
      defaultSubject={data.defaultSubject}
      defaultEmailBody={data.defaultEmailBody}
      defaultSmsBody={data.defaultSmsBody}
      linkUrl={data.linkUrl}
      jobId={data.jobId}
      entityId={data.entityId}
      entityLabel={data.entityLabel}
      onSent={data.onSent}
    />
  ) : null;

  return { triggerNotify, notifyDialog };
}