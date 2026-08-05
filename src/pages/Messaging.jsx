import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { base44 } from "@/api/base44Client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  MessageSquare,
  Send,
  ArrowLeft,
  User,
  Search,
  RefreshCw,
  PenSquare,
  Facebook,
  Bell,
  BellOff,
  Image as ImageIcon,
  Trash2,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

import { cn } from "@/lib/utils";
import CallsView from "@/components/messaging/CallsView";
import usePushNotifications from "@/hooks/usePushNotifications";

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 1300 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
]);

function normalizePhone(value) {
  if (!value) return "";

  let digits = String(value).replace(/\D/g, "");

  if (digits.length === 10) {
    digits = `1${digits}`;
  }

  return digits;
}

function formatPhoneDisplay(value) {
  if (!value) return "";

  let digits = String(value).replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(
      3,
      6
    )}-${digits.slice(6)}`;
  }

  return String(value);
}

function formatTime(iso) {
  if (!iso) return "";

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDayLabel(iso) {
  if (!iso) return "";

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return "Today";
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function getCustomerFullName(customer) {
  if (!customer) return "";

  return `${customer.first_name || ""} ${
    customer.last_name || ""
  }`.trim();
}

function getContactFullName(contact) {
  if (!contact) return "";

  return `${contact.first_name || ""} ${
    contact.last_name || ""
  }`.trim();
}

function findCustomerByPhone(customers, phoneNumber) {
  const target = normalizePhone(phoneNumber);

  if (!target) return null;

  return (
    customers.find(
      (customer) =>
        normalizePhone(customer.phone) === target
    ) || null
  );
}

function findContactByPhone(customerContacts, phoneNumber) {
  const target = normalizePhone(phoneNumber);

  if (!target) return null;

  return (
    customerContacts.find(
      (contact) =>
        normalizePhone(contact.phone) === target
    ) || null
  );
}

function resolveConversationParty(
  customers,
  customerContacts,
  phoneNumber,
  messages = []
) {
  const primaryCustomer = findCustomerByPhone(
    customers,
    phoneNumber
  );

  if (primaryCustomer) {
    return {
      customer: primaryCustomer,
      contact: null,
      customerName: getCustomerFullName(primaryCustomer),
      contactName: "",
      customerId: primaryCustomer.id,
    };
  }

  const additionalContact = findContactByPhone(
    customerContacts,
    phoneNumber
  );

  if (additionalContact) {
    const parentCustomer =
      customers.find(
        (customer) =>
          customer.id === additionalContact.customer_id
      ) || null;

    return {
      customer: parentCustomer,
      contact: additionalContact,
      customerName: getCustomerFullName(parentCustomer),
      contactName: getContactFullName(additionalContact),
      customerId:
        parentCustomer?.id ||
        additionalContact.customer_id ||
        null,
    };
  }

  return {
    customer: null,
    contact: null,
    customerName:
      messages.find((message) => message.customer_name)
        ?.customer_name || "",
    contactName:
      messages.find((message) => message.contact_name)
        ?.contact_name || "",
    customerId:
      messages.find((message) => message.customer_id)
        ?.customer_id || null,
  };
}

function getDisplayName(contactName, customerName, fallback) {
  const contact = String(contactName || "").trim();
  const customer = String(customerName || "").trim();

  if (
    contact &&
    customer &&
    contact.toLowerCase() === customer.toLowerCase()
  ) {
    return customer;
  }

  if (contact && customer) {
    return `${contact} · ${customer}`;
  }

  return contact || customer || fallback;
}

function getMediaUrls(message) {
  const value = message?.media_urls;

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => String(item || "").trim())
        .filter(Boolean);
    }
  } catch {
    // Continue with comma/newline parsing.
  }

  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getConversationPreview(message) {
  if (!message) return "";

  const body = String(message.body || "").trim();
  const mediaUrls = getMediaUrls(message);

  if (body && mediaUrls.length > 0) {
    return `📷 ${body}`;
  }

  if (body) {
    return body;
  }

  if (mediaUrls.length === 1) {
    return "📷 Photo";
  }

  if (mediaUrls.length > 1) {
    return `📷 ${mediaUrls.length} photos`;
  }

  if (message.channel === "mms") {
    return "📎 MMS attachment";
  }

  return "";
}

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.error ||
    error?.data?.error ||
    error?.message ||
    fallback
  );
}

function revokeAttachmentPreviews(attachments) {
  attachments.forEach((attachment) => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  });
}

function buildAttachmentsFromFiles(files, existingCount = 0) {
  const selectedFiles = Array.from(files || []);
  const remainingSlots = MAX_ATTACHMENTS - existingCount;

  if (remainingSlots <= 0) {
    throw new Error(
      `A maximum of ${MAX_ATTACHMENTS} images can be attached.`
    );
  }

  if (selectedFiles.length > remainingSlots) {
    throw new Error(
      `You can only add ${remainingSlots} more image${
        remainingSlots === 1 ? "" : "s"
      }.`
    );
  }

  for (const file of selectedFiles) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new Error(
        "Only JPG, JPEG, PNG, and GIF images can be attached."
      );
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        "Each image must be 1,300 KB or smaller."
      );
    }
  }

  return selectedFiles.map((file) => ({
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
    previewUrl: URL.createObjectURL(file),
  }));
}

async function uploadAttachments(attachments) {
  const uploadedUrls = [];

  for (const attachment of attachments) {
    const result =
      await base44.integrations.Core.UploadFile({
        file: attachment.file,
      });

    if (!result?.file_url) {
      throw new Error(
        `Upload failed for ${attachment.file.name}.`
      );
    }

    uploadedUrls.push(result.file_url);
  }

  return uploadedUrls;
}

function AttachmentPreviewList({
  attachments,
  onRemove,
  disabled,
}) {
  if (!attachments.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment, index) => (
        <div
          key={attachment.id}
          className="relative w-20 h-20 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden"
        >
          <img
            src={attachment.previewUrl}
            alt={`Selected attachment ${index + 1}`}
            className="w-full h-full object-cover"
          />

          <button
            type="button"
            onClick={() => onRemove(attachment.id)}
            disabled={disabled}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black disabled:opacity-50"
            title="Remove attachment"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

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

  const [composeAttachments, setComposeAttachments] =
    useState([]);
  const [
    composeAttachmentError,
    setComposeAttachmentError,
  ] = useState("");

  const [
    deleteDialogOpen,
    setDeleteDialogOpen,
  ] = useState(false);

  const [
    deleteConfirmation,
    setDeleteConfirmation,
  ] = useState("");

  const [tab, setTab] = useState("messages");

  const scrollRef = useRef(null);
  const replyFileInputRef = useRef(null);
  const composeFileInputRef = useRef(null);

  const {
    permission,
    requestPermission,
  } = usePushNotifications();

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );

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

  useEffect(() => {
    return () => {
      revokeAttachmentPreviews(attachments);
      revokeAttachmentPreviews(composeAttachments);
    };
  }, []);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () =>
      base44.entities.Customer.list("-created_date", 500),
    refetchInterval: 30000,
  });

  const { data: customerContacts = [] } = useQuery({
    queryKey: ["customer-contacts-all"],
    queryFn: () =>
      base44.entities.CustomerContact.list(
        "-created_date",
        1000
      ),
    refetchInterval: 30000,
  });

  const {
    data: messages = [],
    isLoading,
  } = useQuery({
    queryKey: ["messages"],
    queryFn: () =>
      base44.entities.Message.list("-sent_at", 500),
    refetchInterval: 15000,
  });

  const conversations = useMemo(() => {
    const map = {};

    messages.forEach((message) => {
      const rawConversationNumber =
        message.phone_number ||
        (message.direction === "inbound"
          ? message.from_number
          : message.to_number) ||
        message.from_number ||
        message.to_number;

      const key = normalizePhone(rawConversationNumber);

      if (!key) return;

      if (!map[key]) {
        map[key] = {
          phone: key,
          messages: [],
          lastAt: message.sent_at,
          unread: 0,
        };
      }

      map[key].messages.push(message);

      if (
        !message.is_read &&
        message.direction === "inbound"
      ) {
        map[key].unread += 1;
      }

      if (
        message.sent_at &&
        (!map[key].lastAt ||
          new Date(message.sent_at) >
            new Date(map[key].lastAt))
      ) {
        map[key].lastAt = message.sent_at;
      }
    });

    const list = Object.values(map);

    list.sort(
      (a, b) =>
        new Date(b.lastAt || 0) -
        new Date(a.lastAt || 0)
    );

    list.forEach((conversation) => {
      conversation.messages.sort(
        (a, b) =>
          new Date(a.sent_at || 0) -
          new Date(b.sent_at || 0)
      );
    });

    return list;
  }, [messages]);

  const filteredConversations = useMemo(() => {
    if (!search) {
      return conversations;
    }

    const query = search.toLowerCase();

    return conversations.filter((conversation) => {
      const party = resolveConversationParty(
        customers,
        customerContacts,
        conversation.phone,
        conversation.messages
      );

      const displayName = getDisplayName(
        party.contactName,
        party.customerName,
        ""
      ).toLowerCase();

      const relationship = String(
        party.contact?.relationship || ""
      ).toLowerCase();

      const phone = formatPhoneDisplay(
        conversation.phone
      ).toLowerCase();

      return (
        displayName.includes(query) ||
        relationship.includes(query) ||
        phone.includes(query)
      );
    });
  }, [
    conversations,
    customers,
    customerContacts,
    search,
  ]);

  const selectedConversation =
    conversations.find(
      (conversation) =>
        conversation.phone === selectedPhone
    ) || null;

  const totalUnread = useMemo(
    () =>
      conversations.reduce(
        (total, conversation) =>
          total + (conversation.unread || 0),
        0
      ),
    [conversations]
  );

  useEffect(() => {
    document.title =
      totalUnread > 0
        ? `(${totalUnread}) Communications — EED`
        : "Communications — EED";
  }, [totalUnread]);

  useEffect(() => {
    if (!selectedConversation) return;

    const unread = selectedConversation.messages.filter(
      (message) =>
        !message.is_read &&
        message.direction === "inbound"
    );

    if (unread.length === 0) return;

    Promise.all(
      unread.map((message) =>
        base44.entities.Message.update(message.id, {
          is_read: true,
        })
      )
    )
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: ["messages"],
        })
      )
      .catch(() => {});
  }, [
    selectedPhone,
    selectedConversation?.messages.length,
    queryClient,
  ]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop =
        scrollRef.current.scrollHeight;
    }
  }, [
    selectedConversation?.messages.length,
    selectedPhone,
  ]);

  const sendMutation = useMutation({
    mutationFn: async ({
      attachmentsToUpload = [],
      ...variables
    }) => {
      const mediaUrls = await uploadAttachments(
        attachmentsToUpload
      );

      return base44.functions.invoke("sendVoipSms", {
        ...variables,
        media_urls: mediaUrls,
      });
    },

    onSuccess: () => {
      revokeAttachmentPreviews(attachments);
      setAttachments([]);
      setAttachmentError("");
      setDraft("");

      if (replyFileInputRef.current) {
        replyFileInputRef.current.value = "";
      }

      queryClient.invalidateQueries({
        queryKey: ["messages"],
      });
    },

    onError: (error) => {
      console.error("Send failed", error);
    },
  });

  const sendFacebookMutation = useMutation({
    mutationFn: (variables) =>
      base44.functions.invoke(
        "sendFacebookMessage",
        variables
      ),

    onSuccess: () => {
      setDraft("");

      queryClient.invalidateQueries({
        queryKey: ["messages"],
      });
    },

    onError: (error) => {
      console.error(
        "Facebook send failed",
        error
      );
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async ({ messagesToDelete }) => {
      if (
        !Array.isArray(messagesToDelete) ||
        messagesToDelete.length === 0
      ) {
        throw new Error(
          "No messages were found in this conversation."
        );
      }

      const results = await Promise.allSettled(
        messagesToDelete.map((message) =>
          base44.entities.Message.delete(message.id)
        )
      );

      const failures = results.filter(
        (result) => result.status === "rejected"
      );

      if (failures.length > 0) {
        throw new Error(
          `${failures.length} message${
            failures.length === 1 ? "" : "s"
          } could not be deleted.`
        );
      }

      return {
        success: true,
        deleted_count: results.length,
      };
    },

    onSuccess: () => {
      setDeleteDialogOpen(false);
      setDeleteConfirmation("");
      setSelectedPhone(null);

      queryClient.invalidateQueries({
        queryKey: ["messages"],
      });
    },

    onError: (error) => {
      console.error(
        "Delete conversation failed:",
        error
      );
    },
  });

  const isFacebookConv = Boolean(
    selectedConversation?.messages.some(
      (message) =>
        message.channel === "facebook"
    )
  );

  const handleReplyFiles = (event) => {
    try {
      const additions = buildAttachmentsFromFiles(
        event.target.files,
        attachments.length
      );

      setAttachments((current) => [
        ...current,
        ...additions,
      ]);

      setAttachmentError("");
    } catch (error) {
      setAttachmentError(
        error?.message || "Unable to attach image."
      );
    } finally {
      event.target.value = "";
    }
  };

  const removeReplyAttachment = (attachmentId) => {
    setAttachments((current) => {
      const removed = current.find(
        (attachment) => attachment.id === attachmentId
      );

      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }

      return current.filter(
        (attachment) => attachment.id !== attachmentId
      );
    });

    setAttachmentError("");
  };

  const handleSend = () => {
    const hasText = Boolean(draft.trim());
    const hasAttachments = attachments.length > 0;

    if (
      (!hasText && !hasAttachments) ||
      !selectedPhone
    ) {
      return;
    }

    if (isFacebookConv) {
      if (hasAttachments) {
        setAttachmentError(
          "Image sending is currently enabled for SMS/MMS conversations only."
        );
        return;
      }

      sendFacebookMutation.mutate({
        recipient_psid: selectedPhone,
        message: draft.trim(),
      });

      return;
    }

    const party = resolveConversationParty(
      customers,
      customerContacts,
      selectedPhone,
      selectedConversation?.messages || []
    );

    sendMutation.mutate({
      to: selectedPhone,
      message: draft.trim(),
      customer_id: party.customerId || null,
      customer_name: party.customerName || null,
      contact_name: party.contactName || null,
      attachmentsToUpload: attachments,
    });
  };

  const handleDeleteConversation = () => {
    if (
      !selectedConversation ||
      deleteConfirmation !== "DELETE"
    ) {
      return;
    }

    deleteConversationMutation.mutate({
      messagesToDelete: selectedConversation.messages,
    });
  };

  const composeMutation = useMutation({
    mutationFn: async ({
      attachmentsToUpload = [],
      ...variables
    }) => {
      const mediaUrls = await uploadAttachments(
        attachmentsToUpload
      );

      return base44.functions.invoke("sendVoipSms", {
        ...variables,
        media_urls: mediaUrls,
      });
    },

    onSuccess: (_data, variables) => {
      revokeAttachmentPreviews(composeAttachments);
      setComposeAttachments([]);
      setComposeAttachmentError("");
      setComposeOpen(false);
      setComposePhone("");
      setComposeMessage("");
      setComposeSearch("");

      if (composeFileInputRef.current) {
        composeFileInputRef.current.value = "";
      }

      queryClient.invalidateQueries({
        queryKey: ["messages"],
      });

      const phone = normalizePhone(variables.to);

      setTimeout(() => {
        setSelectedPhone(phone);
      }, 300);
    },

    onError: (error) => {
      console.error(
        "Compose send failed",
        error
      );
    },
  });

  const handleComposeFiles = (event) => {
    try {
      const additions = buildAttachmentsFromFiles(
        event.target.files,
        composeAttachments.length
      );

      setComposeAttachments((current) => [
        ...current,
        ...additions,
      ]);

      setComposeAttachmentError("");
    } catch (error) {
      setComposeAttachmentError(
        error?.message || "Unable to attach image."
      );
    } finally {
      event.target.value = "";
    }
  };

  const removeComposeAttachment = (attachmentId) => {
    setComposeAttachments((current) => {
      const removed = current.find(
        (attachment) => attachment.id === attachmentId
      );

      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }

      return current.filter(
        (attachment) => attachment.id !== attachmentId
      );
    });

    setComposeAttachmentError("");
  };

  const handleComposeSend = () => {
    const hasText = Boolean(composeMessage.trim());
    const hasAttachments = composeAttachments.length > 0;

    if (
      !composePhone.trim() ||
      (!hasText && !hasAttachments)
    ) {
      return;
    }

    const party = resolveConversationParty(
      customers,
      customerContacts,
      composePhone,
      []
    );

    composeMutation.mutate({
      to: composePhone.trim(),
      message: composeMessage.trim(),
      customer_id: party.customerId || null,
      customer_name: party.customerName || null,
      contact_name: party.contactName || null,
      attachmentsToUpload: composeAttachments,
    });
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
      const parentCustomer =
        customers.find(
          (customer) =>
            customer.id === contact.customer_id
        ) || null;

      const contactName = getContactFullName(contact);
      const customerName =
        getCustomerFullName(parentCustomer);

      return {
        type: "contact",
        id: `contact-${contact.id}`,
        phone: contact.phone || "",
        displayName: getDisplayName(
          contactName,
          customerName,
          contactName
        ),
        customerId:
          parentCustomer?.id ||
          contact.customer_id ||
          null,
        customerName,
        contactName,
        relationship: contact.relationship || "",
      };
    });

    return [...customerRows, ...contactRows];
  }, [customers, customerContacts]);

  const filteredRecipients = useMemo(() => {
    if (!composeSearch) {
      return composeRecipients.slice(0, 20);
    }

    const query = composeSearch.toLowerCase();

    return composeRecipients
      .filter(
        (recipient) =>
          recipient.displayName
            .toLowerCase()
            .includes(query) ||
          recipient.relationship
            .toLowerCase()
            .includes(query) ||
          String(recipient.phone)
            .toLowerCase()
            .includes(query)
      )
      .slice(0, 20);
  }, [composeRecipients, composeSearch]);

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      handleSend();
    }
  };

  const closeComposeDialog = (open) => {
    if (composeMutation.isPending) return;

    setComposeOpen(open);

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
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#e20404]" />

            <h1 className="text-lg font-semibold text-slate-900 hidden sm:inline">
              Communications
            </h1>
          </div>

          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setTab("messages")}
              className={cn(
                "px-3 py-1 text-sm rounded-md font-medium transition-colors",
                tab === "messages"
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              Communications
            </button>

            <button
              onClick={() => setTab("calls")}
              className={cn(
                "px-3 py-1 text-sm rounded-md font-medium transition-colors",
                tab === "calls"
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={requestPermission}
                  title="Enable push notifications"
                >
                  <BellOff className="w-4 h-4" />

                  <span className="hidden sm:inline ml-1">
                    Enable Alerts
                  </span>
                </Button>
              )}

              {permission === "granted" && (
                <Bell className="w-4 h-4 text-[#e20404]" />
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setComposeOpen(true)}
              >
                <PenSquare className="w-4 h-4 mr-1" />

                <span className="hidden sm:inline">
                  New
                </span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  queryClient.invalidateQueries({
                    queryKey: ["messages"],
                  });

                  queryClient.invalidateQueries({
                    queryKey: ["customers"],
                  });

                  queryClient.invalidateQueries({
                    queryKey: ["customer-contacts-all"],
                  });
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
          <div
            className={cn(
              "w-full sm:w-80 border-r border-slate-200 bg-white flex flex-col",
              selectedPhone ? "hidden sm:flex" : "flex"
            )}
          >
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                <Input
                  placeholder="Search name or number..."
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  className="pl-8"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="p-4 text-sm text-slate-400">
                  Loading messages...
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-sm">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No messages yet
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredConversations.map(
                    (conversation) => {
                      const lastMessage =
                        conversation.messages[
                          conversation.messages.length - 1
                        ];

                      const party = resolveConversationParty(
                        customers,
                        customerContacts,
                        conversation.phone,
                        conversation.messages
                      );

                      const displayName = getDisplayName(
                        party.contactName,
                        party.customerName,
                        formatPhoneDisplay(
                          conversation.phone
                        )
                      );

                      return (
                        <button
                          key={conversation.phone}
                          onClick={() =>
                            setSelectedPhone(
                              conversation.phone
                            )
                          }
                          className={cn(
                            "w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex gap-3 items-start",
                            selectedPhone ===
                              conversation.phone &&
                              "bg-slate-100"
                          )}
                        >
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                            {party.contactName ||
                            party.customerName ? (
                              <span className="text-sm font-semibold text-slate-600">
                                {displayName
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                            ) : (
                              <User className="w-5 h-5 text-slate-400" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm text-slate-900 truncate flex items-center gap-1">
                                {conversation.messages.some(
                                  (message) =>
                                    message.channel ===
                                    "facebook"
                                ) && (
                                  <Facebook className="w-3 h-3 text-[#1877F2] flex-shrink-0" />
                                )}

                                {displayName}
                              </span>

                              <span className="text-xs text-slate-400 flex-shrink-0">
                                {formatTime(
                                  conversation.lastAt
                                )}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-500 truncate">
                                {lastMessage?.direction ===
                                  "outbound" && "You: "}

                                {getConversationPreview(
                                  lastMessage
                                )}
                              </span>

                              {conversation.unread > 0 && (
                                <span className="bg-[#e20404] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold flex-shrink-0">
                                  {conversation.unread}
                                </span>
                              )}
                            </div>

                            {party.contact?.relationship && (
                              <span className="text-[11px] text-slate-400 truncate block">
                                {party.contact.relationship}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    }
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          {selectedPhone && selectedConversation ? (
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
              {(() => {
                const party = resolveConversationParty(
                  customers,
                  customerContacts,
                  selectedPhone,
                  selectedConversation.messages
                );

                const displayName = getDisplayName(
                  party.contactName,
                  party.customerName,
                  formatPhoneDisplay(selectedPhone)
                );

                return (
                  <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() =>
                        setSelectedPhone(null)
                      }
                      className="sm:hidden text-slate-500 hover:text-slate-900"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>

                    <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      {party.contactName ||
                      party.customerName ? (
                        <span className="text-sm font-semibold text-slate-600">
                          {displayName
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                      ) : (
                        <User className="w-5 h-5 text-slate-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-900 truncate flex items-center gap-1.5">
                        {isFacebookConv && (
                          <Facebook className="w-3.5 h-3.5 text-[#1877F2] flex-shrink-0" />
                        )}

                        {displayName}
                      </div>

                      <div className="text-xs text-slate-400">
                        {isFacebookConv
                          ? "Facebook Messenger"
                          : formatPhoneDisplay(
                              selectedPhone
                            )}

                        {party.contact?.relationship
                          ? ` · ${party.contact.relationship}`
                          : ""}
                      </div>
                    </div>

                    {party.customerId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(
                            `/CustomerDetail?id=${party.customerId}`,
                            "_blank"
                          )
                        }
                        title="Open customer"
                      >
                        <User className="w-4 h-4" />
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                      onClick={() => {
                        setDeleteConfirmation("");
                        setDeleteDialogOpen(true);
                      }}
                      title="Delete entire conversation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })()}

              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
              >
                {(() => {
                  let lastDay = "";

                  return selectedConversation.messages.map(
                    (message) => {
                      const dayLabel = formatDayLabel(
                        message.sent_at
                      );

                      const showDay =
                        dayLabel !== lastDay;

                      lastDay = dayLabel;

                      const mediaUrls =
                        getMediaUrls(message);

                      const hasBody = Boolean(
                        String(
                          message.body || ""
                        ).trim()
                      );

                      return (
                        <div key={message.id}>
                          {showDay && (
                            <div className="text-center my-3">
                              <span className="text-xs text-slate-400 bg-slate-50 px-2">
                                {dayLabel}
                              </span>
                            </div>
                          )}

                          <div
                            className={cn(
                              "flex",
                              message.direction ===
                                "outbound"
                                ? "justify-end"
                                : "justify-start"
                            )}
                          >
                            <div
                              className={cn(
                                "max-w-[75%] rounded-2xl px-4 py-2 text-sm overflow-hidden",
                                message.direction ===
                                  "outbound"
                                  ? "bg-[#e20404] text-white rounded-br-sm"
                                  : "bg-white border border-slate-200 text-slate-900 rounded-bl-sm"
                              )}
                            >
                              {hasBody && (
                                <p className="whitespace-pre-wrap break-words">
                                  {message.body}
                                </p>
                              )}

                              {mediaUrls.length > 0 && (
                                <div
                                  className={cn(
                                    "space-y-2",
                                    hasBody && "mt-2"
                                  )}
                                >
                                  {mediaUrls.map(
                                    (mediaUrl, index) => (
                                      <a
                                        key={`${message.id}-media-${index}`}
                                        href={mediaUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block"
                                      >
                                        <img
                                          src={mediaUrl}
                                          alt={`MMS attachment ${
                                            index + 1
                                          }`}
                                          className="block max-w-full max-h-96 rounded-lg object-contain bg-slate-100"
                                          loading="lazy"
                                          onError={(event) => {
                                            event.currentTarget.style.display =
                                              "none";

                                            const fallback =
                                              event
                                                .currentTarget
                                                .nextElementSibling;

                                            if (fallback) {
                                              fallback.style.display =
                                                "flex";
                                            }
                                          }}
                                        />

                                        <div className="hidden min-h-24 items-center justify-center gap-2 rounded-lg bg-slate-100 text-slate-500 px-4 py-3">
                                          <ImageIcon className="w-5 h-5" />
                                          <span>
                                            Open attachment
                                          </span>
                                        </div>
                                      </a>
                                    )
                                  )}
                                </div>
                              )}

                              {!hasBody &&
                                mediaUrls.length === 0 &&
                                message.channel ===
                                  "mms" && (
                                  <p className="italic opacity-70">
                                    Attachment unavailable
                                  </p>
                                )}

                              <div
                                className={cn(
                                  "text-[10px] mt-1",
                                  message.direction ===
                                    "outbound"
                                    ? "text-white/70"
                                    : "text-slate-400"
                                )}
                              >
                                {formatTime(
                                  message.sent_at
                                )}

                                {message.direction ===
                                  "outbound" &&
                                  message.status ===
                                    "failed" &&
                                  " · Failed"}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  );
                })()}

                {(sendMutation.isPending ||
                  sendFacebookMutation.isPending) && (
                  <div className="flex justify-end">
                    <div className="bg-slate-200 text-slate-500 rounded-2xl rounded-br-sm px-4 py-2 text-sm italic">
                      {sendMutation.isPending
                        ? "Uploading and sending..."
                        : "Sending..."}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white border-t border-slate-200 p-3 space-y-2 flex-shrink-0">
                <AttachmentPreviewList
                  attachments={attachments}
                  onRemove={removeReplyAttachment}
                  disabled={sendMutation.isPending}
                />

                {attachmentError && (
                  <p className="text-xs text-red-600">
                    {attachmentError}
                  </p>
                )}

                {sendMutation.isError && (
                  <p className="text-xs text-red-600">
                    {getErrorMessage(
                      sendMutation.error,
                      "Unable to send message."
                    )}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <input
                    ref={replyFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif"
                    multiple
                    className="hidden"
                    onChange={handleReplyFiles}
                  />

                  {!isFacebookConv && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        replyFileInputRef.current?.click()
                      }
                      disabled={
                        sendMutation.isPending ||
                        attachments.length >=
                          MAX_ATTACHMENTS
                      }
                      title="Attach images"
                    >
                      <Paperclip className="w-4 h-4" />
                    </Button>
                  )}

                  <Input
                    placeholder={
                      isFacebookConv
                        ? "Type a Facebook message..."
                        : attachments.length > 0
                        ? "Add a caption, optional..."
                        : "Type a message..."
                    }
                    value={draft}
                    onChange={(event) =>
                      setDraft(event.target.value)
                    }
                    onKeyDown={handleKeyDown}
                    className="flex-1"
                  />

                  <Button
                    onClick={handleSend}
                    disabled={
                      (!draft.trim() &&
                        attachments.length === 0) ||
                      sendMutation.isPending ||
                      sendFacebookMutation.isPending
                    }
                    className="bg-[#e20404] hover:bg-red-700"
                    size="icon"
                  >
                    {sendMutation.isPending ||
                    sendFacebookMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                <div className="flex justify-between text-xs text-slate-400">
                  <span>
                    {!isFacebookConv &&
                      `${attachments.length}/${MAX_ATTACHMENTS} images`}
                  </span>

                  <span>
                    {draft.length} characters
                    {!isFacebookConv &&
                      (draft.length > 160 ||
                        attachments.length > 0) &&
                      " · Sends as MMS"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden sm:flex flex-1 items-center justify-center bg-slate-50">
              <div className="text-center text-slate-400">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />

                <p className="text-sm">
                  Select a conversation to view messages
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "calls" && <CallsView />}

      <Dialog
        open={composeOpen}
        onOpenChange={closeComposeDialog}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                To
              </label>

              <Input
                placeholder="Enter phone number or search customer/contact..."
                value={
                  composeSearch
                    ? composeSearch
                    : composePhone
                }
                onChange={(event) => {
                  setComposeSearch(
                    event.target.value
                  );

                  setComposePhone(
                    event.target.value
                  );
                }}
              />

              {composeSearch &&
                filteredRecipients.length > 0 && (
                  <div className="mt-1 border border-slate-200 rounded-md max-h-52 overflow-y-auto divide-y divide-slate-100">
                    {filteredRecipients.map(
                      (recipient) => (
                        <button
                          key={recipient.id}
                          onClick={() => {
                            setComposePhone(
                              recipient.phone || ""
                            );

                            setComposeSearch(
                              recipient.displayName
                            );
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                        >
                          <div className="font-medium">
                            {recipient.displayName}
                          </div>

                          <div className="text-xs text-slate-400">
                            {formatPhoneDisplay(
                              recipient.phone
                            )}

                            {recipient.relationship
                              ? ` · ${recipient.relationship}`
                              : ""}
                          </div>
                        </button>
                      )
                    )}
                  </div>
                )}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                Message
              </label>

              <textarea
                placeholder={
                  composeAttachments.length > 0
                    ? "Add a caption, optional..."
                    : "Type your message..."
                }
                value={composeMessage}
                onChange={(event) =>
                  setComposeMessage(
                    event.target.value
                  )
                }
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                rows={5}
              />

              <div className="text-xs text-slate-400 text-right mt-1">
                {composeMessage.length} characters
                {(composeMessage.length > 160 ||
                  composeAttachments.length > 0) &&
                  " · Sends as MMS"}
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
                onClick={() =>
                  composeFileInputRef.current?.click()
                }
                disabled={
                  composeMutation.isPending ||
                  composeAttachments.length >=
                    MAX_ATTACHMENTS
                }
              >
                <Paperclip className="w-4 h-4 mr-2" />
                Add Images
              </Button>

              <AttachmentPreviewList
                attachments={composeAttachments}
                onRemove={removeComposeAttachment}
                disabled={composeMutation.isPending}
              />

              <div className="text-xs text-slate-400">
                {composeAttachments.length}/
                {MAX_ATTACHMENTS} images selected
              </div>

              {composeAttachmentError && (
                <p className="text-xs text-red-600">
                  {composeAttachmentError}
                </p>
              )}
            </div>

            {composeMutation.isError && (
              <p className="text-sm text-red-600">
                {getErrorMessage(
                  composeMutation.error,
                  "Failed to send. Please try again."
                )}
              </p>
            )}

            <Button
              onClick={handleComposeSend}
              disabled={
                !composePhone.trim() ||
                (!composeMessage.trim() &&
                  composeAttachments.length === 0) ||
                composeMutation.isPending
              }
              className="w-full bg-[#e20404] hover:bg-red-700"
            >
              {composeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading and Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Message
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleteConversationMutation.isPending) {
            return;
          }

          setDeleteDialogOpen(open);

          if (!open) {
            setDeleteConfirmation("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">
              Delete Entire Conversation
            </DialogTitle>

            <DialogDescription>
              This permanently deletes every stored message in
              this conversation from the app. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">
                Conversation
              </p>

              <p className="text-sm text-red-700 mt-1">
                {selectedPhone
                  ? formatPhoneDisplay(selectedPhone)
                  : ""}
              </p>

              <p className="text-xs text-red-600 mt-1">
                {selectedConversation?.messages.length || 0}{" "}
                stored message
                {(selectedConversation?.messages.length ||
                  0) === 1
                  ? ""
                  : "s"}{" "}
                will be deleted.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                Type DELETE to confirm
              </label>

              <Input
                value={deleteConfirmation}
                onChange={(event) =>
                  setDeleteConfirmation(
                    event.target.value
                  )
                }
                placeholder="DELETE"
                autoComplete="off"
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    deleteConfirmation === "DELETE" &&
                    !deleteConversationMutation.isPending
                  ) {
                    handleDeleteConversation();
                  }
                }}
              />
            </div>

            {deleteConversationMutation.isError && (
              <p className="text-sm text-red-600">
                {getErrorMessage(
                  deleteConversationMutation.error,
                  "Unable to delete conversation."
                )}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setDeleteDialogOpen(false)
              }
              disabled={
                deleteConversationMutation.isPending
              }
            >
              Cancel
            </Button>

            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteConversation}
              disabled={
                deleteConfirmation !== "DELETE" ||
                deleteConversationMutation.isPending
              }
            >
              {deleteConversationMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Permanently Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
