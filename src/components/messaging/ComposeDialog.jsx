import React, { useRef, useMemo } from "react";
import { Paperclip, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MAX_ATTACHMENTS,
  buildAttachmentsFromFiles,
  formatPhoneDisplay,
  getCustomerFullName,
  getContactFullName,
  getDisplayName,
  revokeAttachmentPreviews,
} from "@/lib/messagingUtils";
import AttachmentPreviewList from "./AttachmentPreviewList";

export default function ComposeDialog({
  open,
  onOpenChange,
  composePhone,
  setComposePhone,
  composeMessage,
  setComposeMessage,
  composeSearch,
  setComposeSearch,
  composeAttachments,
  setComposeAttachments,
  composeAttachmentError,
  setComposeAttachmentError,
  customers,
  customerContacts,
  onSend,
}) {
  const composeFileInputRef = useRef(null);

  const handleComposeFiles = async (event) => {
    try {
      const additions = await buildAttachmentsFromFiles(event.target.files, composeAttachments.length);
      setComposeAttachments((current) => [...current, ...additions]);
      setComposeAttachmentError("");
    } catch (error) {
      setComposeAttachmentError(error?.message || "Unable to attach image.");
    } finally {
      event.target.value = "";
    }
  };

  const removeComposeAttachment = (attachmentId) => {
    setComposeAttachments((current) => {
      const removed = current.find((a) => a.id === attachmentId);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((a) => a.id !== attachmentId);
    });
    setComposeAttachmentError("");
  };

  const composeRecipients = useMemo(() => {
    const customerRows = customers.map((customer) => ({
      type: "customer",
      id: `customer-${customer.id}`,
      phone: customer.phone || "",
      displayName: getCustomerFullName(customer),
      customerId: customer.id,
      customerName: getCustomerFullName(customer),
      contactName: "",
      relationship: "",
    }));

    const contactRows = customerContacts.map((contact) => {
      const parentCustomer = customers.find((c) => c.id === contact.customer_id) || null;
      const contactName = getContactFullName(contact);
      const customerName = getCustomerFullName(parentCustomer);
      return {
        type: "contact",
        id: `contact-${contact.id}`,
        phone: contact.phone || "",
        displayName: getDisplayName(contactName, customerName, contactName),
        customerId: parentCustomer?.id || contact.customer_id || null,
        customerName,
        contactName,
        relationship: contact.relationship || "",
      };
    });

    return [...customerRows, ...contactRows];
  }, [customers, customerContacts]);

  const filteredRecipients = useMemo(() => {
    if (!composeSearch) return composeRecipients.slice(0, 20);
    const query = composeSearch.toLowerCase();
    return composeRecipients
      .filter(
        (r) =>
          r.displayName.toLowerCase().includes(query) ||
          r.relationship.toLowerCase().includes(query) ||
          String(r.phone).toLowerCase().includes(query)
      )
      .slice(0, 20);
  }, [composeRecipients, composeSearch]);

  const closeDialog = (open) => {
    onOpenChange(open);
    if (!open) {
      revokeAttachmentPreviews(composeAttachments);
      setComposeAttachments([]);
      setComposeAttachmentError("");
      setComposePhone("");
      setComposeMessage("");
      setComposeSearch("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">To</label>
            <Input
              placeholder="Enter phone number or search customer/contact..."
              value={composeSearch ? composeSearch : composePhone}
              onChange={(event) => {
                setComposeSearch(event.target.value);
                setComposePhone(event.target.value);
              }}
            />
            {composeSearch && filteredRecipients.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-md max-h-52 overflow-y-auto divide-y divide-slate-100">
                {filteredRecipients.map((recipient) => (
                  <button
                    key={recipient.id}
                    onClick={() => {
                      setComposePhone(recipient.phone || "");
                      setComposeSearch(recipient.displayName);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                  >
                    <div className="font-medium">{recipient.displayName}</div>
                    <div className="text-xs text-slate-400">
                      {formatPhoneDisplay(recipient.phone)}
                      {recipient.relationship ? ` · ${recipient.relationship}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Message</label>
            <textarea
              placeholder={composeAttachments.length > 0 ? "Add a caption, optional..." : "Type your message..."}
              value={composeMessage}
              onChange={(event) => setComposeMessage(event.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              rows={5}
            />
            <div className="text-xs text-slate-400 text-right mt-1">
              {composeMessage.length} characters
              {(composeMessage.length > 160 || composeAttachments.length > 0) && " · Sends as MMS"}
            </div>
          </div>

          <div className="space-y-2">
            <input
              ref={composeFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif"
              multiple
              className="hidden"
              onChange={handleComposeFiles}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => composeFileInputRef.current?.click()}
              disabled={composeAttachments.length >= MAX_ATTACHMENTS}
            >
              <Paperclip className="w-4 h-4 mr-2" />
              Add Images
            </Button>
            <AttachmentPreviewList attachments={composeAttachments} onRemove={removeComposeAttachment} />
            <div className="text-xs text-slate-400">
              {composeAttachments.length}/{MAX_ATTACHMENTS} images selected
            </div>
            {composeAttachmentError && <p className="text-xs text-red-600">{composeAttachmentError}</p>}
          </div>

          <Button
            onClick={onSend}
            disabled={!composePhone.trim() || (!composeMessage.trim() && composeAttachments.length === 0)}
            className="w-full bg-[#e20404] hover:bg-red-700"
          >
            <Send className="w-4 h-4 mr-2" />
            Send Message
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}