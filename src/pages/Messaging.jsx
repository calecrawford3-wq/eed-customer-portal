import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Bell,
  BellOff,
  PenSquare,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMessaging } from "@/contexts/MessagingContext";
import { toast } from "sonner";
import CallsView from "@/components/messaging/CallsView";
import usePushNotifications from "@/hooks/usePushNotifications";
import QuickCreateCustomerModal from "@/components/QuickCreateCustomerModal";
import QuickCreateSupplierModal from "@/components/QuickCreateSupplierModal";
import {
  normalizePhone,
  resolveConversationParty,
  revokeAttachmentPreviews,
  getMediaUrls,
} from "@/lib/messagingUtils";
import ConversationList from "@/components/messaging/ConversationList";
import ConversationHeader from "@/components/messaging/ConversationHeader";
import MessageThread from "@/components/messaging/MessageThread";
import ReplyComposer from "@/components/messaging/ReplyComposer";
import ComposeDialog from "@/components/messaging/ComposeDialog";
import DeleteConversationDialog from "@/components/messaging/DeleteConversationDialog";

export default function Messaging() {
  const queryClient = useQueryClient();

  const [selectedPhone, setSelectedPhone] = useState(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");

  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState("");

  const [composeOpen, setComposeOpen] = useState(false);
  const [composePhone, setComposePhone] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeSearch, setComposeSearch] = useState("");
  const [composeAttachments, setComposeAttachments] = useState([]);
  const [composeAttachmentError, setComposeAttachmentError] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [createSupplierOpen, setCreateSupplierOpen] = useState(false);

  const [tab, setTab] = useState("messages");

  const { permission, requestPermission } = usePushNotifications();
  const { pendingMessages, sendMessage, retrySend } = useMessaging();

  // Handle URL params (?phone=, ?compose=, ?callId=)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callId = params.get("callId");
    if (callId) {
      setTab("calls");
      return;
    }
    const phoneParam = params.get("phone");
    if (phoneParam) {
      const normalized = normalizePhone(phoneParam);
      setSelectedPhone(normalized);
      setTab("messages");
      if (params.get("compose")) {
        setComposePhone(normalized);
        setComposeOpen(true);
      }
    }
  }, []);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      revokeAttachmentPreviews(attachments);
      revokeAttachmentPreviews(composeAttachments);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 500),
    refetchInterval: 30000,
  });

  const { data: customerContacts = [] } = useQuery({
    queryKey: ["customer-contacts-all"],
    queryFn: () => base44.entities.CustomerContact.list("-created_date", 1000),
    refetchInterval: 30000,
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages"],
    queryFn: () => base44.entities.Message.list("-sent_at", 500),
    refetchInterval: 15000,
  });

  // Build conversation list from messages
  const conversations = useMemo(() => {
    const map = {};
    messages.forEach((message) => {
      const rawConversationNumber =
        message.phone_number ||
        (message.direction === "inbound" ? message.from_number : message.to_number) ||
        message.from_number ||
        message.to_number;
      const key = normalizePhone(rawConversationNumber);
      if (!key) return;
      if (!map[key]) {
        map[key] = { phone: key, messages: [], lastAt: message.sent_at, unread: 0 };
      }
      map[key].messages.push(message);
      if (!message.is_read && message.direction === "inbound") {
        map[key].unread += 1;
      }
      if (message.sent_at && (!map[key].lastAt || new Date(message.sent_at) > new Date(map[key].lastAt))) {
        map[key].lastAt = message.sent_at;
      }
    });
    const list = Object.values(map);
    list.sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
    list.forEach((conv) => {
      conv.messages.sort((a, b) => new Date(a.sent_at || 0) - new Date(b.sent_at || 0));
    });
    return list;
  }, [messages]);

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    if (!search) return conversations;
    const query = search.toLowerCase();
    return conversations.filter((conversation) => {
      const party = resolveConversationParty(
        customers,
        customerContacts,
        conversation.phone,
        conversation.messages
      );
      const displayName = (party.contactName || party.customerName || "").toLowerCase();
      const relationship = String(party.contact?.relationship || "").toLowerCase();
      const phone = conversation.phone.toLowerCase();
      return displayName.includes(query) || relationship.includes(query) || phone.includes(query);
    });
  }, [conversations, customers, customerContacts, search]);

  const selectedConversation =
    conversations.find((c) => c.phone === selectedPhone) || null;

  const totalUnread = useMemo(
    () => conversations.reduce((total, c) => total + (c.unread || 0), 0),
    [conversations]
  );

  useEffect(() => {
    document.title =
      totalUnread > 0 ? `(${totalUnread}) Communications — EED` : "Communications — EED";
  }, [totalUnread]);

  // Mark inbound messages as read when conversation is selected
  useEffect(() => {
    if (!selectedConversation) return;
    const unread = selectedConversation.messages.filter(
      (m) => !m.is_read && m.direction === "inbound"
    );
    if (unread.length === 0) return;
    Promise.all(
      unread.map((message) => base44.entities.Message.update(message.id, { is_read: true }))
    )
      .then(() => queryClient.invalidateQueries({ queryKey: ["messages"] }))
      .catch(() => {});
  }, [selectedPhone, selectedConversation?.messages.length, queryClient]);

  // Delete conversation mutation
  const deleteConversationMutation = useMutation({
    mutationFn: async ({ messagesToDelete }) => {
      if (!Array.isArray(messagesToDelete) || messagesToDelete.length === 0) {
        throw new Error("No messages were found in this conversation.");
      }
      const results = await Promise.allSettled(
        messagesToDelete.map((message) => base44.entities.Message.delete(message.id))
      );
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        throw new Error(`${failures.length} message${failures.length === 1 ? "" : "s"} could not be deleted.`);
      }
      return { success: true, deleted_count: results.length };
    },
    onSuccess: () => {
      setDeleteDialogOpen(false);
      setDeleteConfirmation("");
      setSelectedPhone(null);
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (error) => {
      console.error("Delete conversation failed:", error);
    },
  });

  // Resend failed/unconfirmed message
  const resendMessageMutation = useMutation({
    mutationFn: async (message) => {
      const mediaUrls = getMediaUrls(message);
      return base44.functions.invoke("sendVoipSms", {
        to: message.to_number || message.phone_number,
        message: message.body || "",
        media_urls: mediaUrls,
        customer_id: message.customer_id || null,
        customer_name: message.customer_name || null,
        contact_name: message.contact_name || null,
        message_id_to_update: message.id,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      if (result?.status === "sent") {
        toast.success("Message resent successfully.");
      } else {
        toast.error(
          result?.status === "unknown"
            ? "Resent but delivery still unconfirmed."
            : "Resend failed — try again."
        );
      }
    },
    onError: () => {
      toast.error("Resend failed — try again.");
    },
  });

  // Send reply in selected conversation
  const handleSend = () => {
    const hasText = Boolean(draft.trim());
    const hasAttachments = attachments.length > 0;
    if ((!hasText && !hasAttachments) || !selectedPhone) return;

    const party = resolveConversationParty(
      customers,
      customerContacts,
      selectedPhone,
      selectedConversation?.messages || []
    );

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previewUrls = attachments.map((a) => a.previewUrl);
    const isMms = draft.trim().length > 160 || attachments.length > 0;
    const capturedAttachments = attachments;
    const capturedDraft = draft.trim();

    sendMessage({
      tempId,
      phone_number: selectedPhone,
      direction: "outbound",
      body: capturedDraft,
      media_urls: previewUrls,
      previewUrls,
      channel: isMms ? "mms" : "sms",
      status: "sending",
      is_read: true,
      sent_at: new Date().toISOString(),
      _pending: true,
      _sendParams: {
        to: selectedPhone,
        message: capturedDraft,
        customer_id: party.customerId || null,
        customer_name: party.customerName || null,
        contact_name: party.contactName || null,
        attachmentsToUpload: capturedAttachments,
      },
    });

    setDraft("");
    setAttachments([]);
    setAttachmentError("");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleDeleteConversation = () => {
    if (!selectedConversation || deleteConfirmation !== "DELETE") return;
    deleteConversationMutation.mutate({ messagesToDelete: selectedConversation.messages });
  };

  // Send from compose dialog
  const handleComposeSend = () => {
    const hasText = Boolean(composeMessage.trim());
    const hasAttachments = composeAttachments.length > 0;
    if (!composePhone.trim() || (!hasText && !hasAttachments)) return;

    const party = resolveConversationParty(customers, customerContacts, composePhone, []);
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previewUrls = composeAttachments.map((a) => a.previewUrl);
    const isMms = composeMessage.trim().length > 160 || composeAttachments.length > 0;
    const phone = normalizePhone(composePhone.trim());
    const capturedAttachments = composeAttachments;
    const capturedMessage = composeMessage.trim();
    const capturedPhone = composePhone.trim();

    sendMessage({
      tempId,
      phone_number: phone,
      direction: "outbound",
      body: capturedMessage,
      media_urls: previewUrls,
      previewUrls,
      channel: isMms ? "mms" : "sms",
      status: "sending",
      is_read: true,
      sent_at: new Date().toISOString(),
      _pending: true,
      _sendParams: {
        to: capturedPhone,
        message: capturedMessage,
        customer_id: party.customerId || null,
        customer_name: party.customerName || null,
        contact_name: party.contactName || null,
        attachmentsToUpload: capturedAttachments,
      },
    });

    setComposeAttachments([]);
    setComposeAttachmentError("");
    setComposeOpen(false);
    setComposePhone("");
    setComposeMessage("");
    setComposeSearch("");

    queryClient.invalidateQueries({ queryKey: ["messages"] });
    setTimeout(() => setSelectedPhone(phone), 300);
  };

  const selectedParty = selectedPhone
    ? resolveConversationParty(
        customers,
        customerContacts,
        selectedPhone,
        selectedConversation?.messages || []
      )
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#e20404]" />
            <h1 className="text-lg font-semibold text-slate-900 hidden sm:inline">Communications</h1>
          </div>
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setTab("messages")}
              className={cn(
                "px-3 py-1 text-sm rounded-md font-medium transition-colors",
                tab === "messages" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Communications
            </button>
            <button
              onClick={() => setTab("calls")}
              className={cn(
                "px-3 py-1 text-sm rounded-md font-medium transition-colors",
                tab === "calls" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Calls
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {tab === "messages" && (
            <>
              {permission !== "granted" && (
                <Button variant="ghost" size="sm" onClick={requestPermission} title="Enable push notifications">
                  <BellOff className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1">Enable Alerts</span>
                </Button>
              )}
              {permission === "granted" && <Bell className="w-4 h-4 text-[#e20404]" />}
              <Button variant="outline" size="sm" onClick={() => setComposeOpen(true)}>
                <PenSquare className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">New</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["messages"] });
                  queryClient.invalidateQueries({ queryKey: ["customers"] });
                  queryClient.invalidateQueries({ queryKey: ["customer-contacts-all"] });
                }}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {tab === "messages" && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Conversation list sidebar */}
          <div
            className={cn(
              "w-full sm:w-80 border-r border-slate-200 bg-white flex flex-col",
              selectedPhone ? "hidden sm:flex" : "flex"
            )}
          >
            <ConversationList
              conversations={filteredConversations}
              customers={customers}
              customerContacts={customerContacts}
              selectedPhone={selectedPhone}
              onSelect={setSelectedPhone}
              search={search}
              setSearch={setSearch}
              isLoading={isLoading}
            />
          </div>

          {/* Selected conversation */}
          {selectedPhone && selectedConversation ? (
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
              <ConversationHeader
                party={selectedParty}
                selectedPhone={selectedPhone}
                onBack={() => setSelectedPhone(null)}
                onOpenCustomer={() =>
                  window.open(`/CustomerDetail?id=${selectedParty.customerId}`, "_blank")
                }
                onCreateCustomer={() => setCreateCustomerOpen(true)}
                onCreateSupplier={() => setCreateSupplierOpen(true)}
                onDeleteConversation={() => {
                  setDeleteConfirmation("");
                  setDeleteDialogOpen(true);
                }}
              />

              <MessageThread
                selectedPhone={selectedPhone}
                selectedConversation={selectedConversation}
                pendingMessages={pendingMessages}
                onRetryPending={retrySend}
                onResend={resendMessageMutation.mutate}
                resendIsPending={resendMessageMutation.isPending}
              />

              <ReplyComposer
                draft={draft}
                setDraft={setDraft}
                attachments={attachments}
                setAttachments={setAttachments}
                attachmentError={attachmentError}
                setAttachmentError={setAttachmentError}
                onSend={handleSend}
                onKeyDown={handleKeyDown}
              />
            </div>
          ) : (
            <div className="hidden sm:flex flex-1 items-center justify-center bg-slate-50">
              <div className="text-center text-slate-400">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a conversation to view messages</p>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "calls" && <CallsView />}

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        composePhone={composePhone}
        setComposePhone={setComposePhone}
        composeMessage={composeMessage}
        setComposeMessage={setComposeMessage}
        composeSearch={composeSearch}
        setComposeSearch={setComposeSearch}
        composeAttachments={composeAttachments}
        setComposeAttachments={setComposeAttachments}
        composeAttachmentError={composeAttachmentError}
        setComposeAttachmentError={setComposeAttachmentError}
        customers={customers}
        customerContacts={customerContacts}
        onSend={handleComposeSend}
      />

      <DeleteConversationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        selectedPhone={selectedPhone}
        messageCount={selectedConversation?.messages.length || 0}
        deleteConfirmation={deleteConfirmation}
        setDeleteConfirmation={setDeleteConfirmation}
        onDelete={handleDeleteConversation}
        isPending={deleteConversationMutation.isPending}
        error={deleteConversationMutation.error}
      />

      <QuickCreateCustomerModal
        open={createCustomerOpen}
        onClose={() => setCreateCustomerOpen(false)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["customers"] })}
        defaultPhone={selectedPhone || ""}
      />

      <QuickCreateSupplierModal
        open={createSupplierOpen}
        onClose={() => setCreateSupplierOpen(false)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["suppliers"] })}
        defaultPhone={selectedPhone || ""}
      />
    </div>
  );
}