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
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { cn } from "@/lib/utils";
import CallsView from "@/components/messaging/CallsView";
import usePushNotifications from "@/hooks/usePushNotifications";

/**
 * Convert U.S./Canadian phone numbers to one canonical format:
 * 1 + 10-digit number.
 *
 * This keeps SMS and MMS records grouped together even when one record
 * stores 9185551212 and another stores 19185551212.
 */
function normalizePhone(value) {
  if (!value) return "";

  let digits = String(value).replace(/\D/g, "");

  if (digits.length === 10) {
    digits = `1${digits}`;
  }

  return digits;
}

/**
 * Format a normalized phone number for display.
 */
function formatPhoneDisplay(value) {
  if (!value) return "";

  let digits = String(value).replace(/\D/g, "");

  if (
    digits.length === 11 &&
    digits.startsWith("1")
  ) {
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

/**
 * Format a message timestamp.
 */
function formatTime(iso) {
  if (!iso) return "";

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const isToday =
    date.toDateString() === now.toDateString();

  if (isToday) {
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

/**
 * Format the day divider shown in the chat thread.
 */
function formatDayLabel(iso) {
  if (!iso) return "";

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  if (
    date.toDateString() === now.toDateString()
  ) {
    return "Today";
  }

  const yesterday = new Date(now);

  yesterday.setDate(
    yesterday.getDate() - 1
  );

  if (
    date.toDateString() ===
    yesterday.toDateString()
  ) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

/**
 * Prevent duplicate labels such as:
 * Josh Keeler · Josh Keeler
 *
 * When the contact and customer names match, display the name once.
 */
function getDisplayName(
  contactName,
  customerName,
  fallback
) {
  const contact = String(
    contactName || ""
  ).trim();

  const customer = String(
    customerName || ""
  ).trim();

  if (
    contact &&
    customer &&
    contact.toLowerCase() ===
      customer.toLowerCase()
  ) {
    return customer;
  }

  if (contact && customer) {
    return `${contact} · ${customer}`;
  }

  return contact || customer || fallback;
}

/**
 * Read media_urls regardless of whether Base44 returns it as:
 * - An array
 * - A JSON-encoded array
 * - A comma-separated string
 */
function getMediaUrls(message) {
  const value = message?.media_urls;

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        String(item || "").trim()
      )
      .filter(Boolean);
  }

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) =>
          String(item || "").trim()
        )
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

/**
 * Generate the preview displayed in the conversation list.
 */
function getConversationPreview(message) {
  if (!message) return "";

  const body = String(
    message.body || ""
  ).trim();

  const mediaUrls =
    getMediaUrls(message);

  if (
    body &&
    mediaUrls.length > 0
  ) {
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

export default function Messaging() {
  const queryClient =
    useQueryClient();

  const [
    selectedPhone,
    setSelectedPhone,
  ] = useState(null);

  const [draft, setDraft] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [
    composeOpen,
    setComposeOpen,
  ] = useState(false);

  const [
    composePhone,
    setComposePhone,
  ] = useState("");

  const [
    composeMessage,
    setComposeMessage,
  ] = useState("");

  const [
    composeSearch,
    setComposeSearch,
  ] = useState("");

  const [tab, setTab] =
    useState("messages");

  const scrollRef =
    useRef(null);

  const {
    permission,
    requestPermission,
  } = usePushNotifications();

  /**
   * Handle deep links:
   *
   * /Messaging?phone=...&compose=1
   * /Messaging?callId=...
   */
  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const callId =
      params.get("callId");

    if (callId) {
      setTab("calls");
      return;
    }

    const phoneParam =
      params.get("phone");

    if (phoneParam) {
      const normalized =
        normalizePhone(phoneParam);

      setSelectedPhone(
        normalized
      );

      setTab("messages");

      if (params.get("compose")) {
        setComposePhone(
          normalized
        );

        setComposeOpen(true);
      }
    }
  }, []);

  const {
    data: customers = [],
  } = useQuery({
    queryKey: ["customers"],

    queryFn: () =>
      base44.entities.Customer.list(
        "-created_date",
        500
      ),

    enabled: composeOpen,
  });

  const {
    data: messages = [],
    isLoading,
  } = useQuery({
    queryKey: ["messages"],

    queryFn: () =>
      base44.entities.Message.list(
        "-sent_at",
        500
      ),

    refetchInterval: 15000,
  });

  /**
   * Group all SMS and MMS records by normalized phone number.
   */
  const conversations =
    useMemo(() => {
      const map = {};

      messages.forEach(
        (message) => {
          const rawConversationNumber =
            message.phone_number ||
            (message.direction ===
            "inbound"
              ? message.from_number
              : message.to_number) ||
            message.from_number ||
            message.to_number;

          const key =
            normalizePhone(
              rawConversationNumber
            );

          if (!key) return;

          if (!map[key]) {
            map[key] = {
              phone: key,
              messages: [],
              lastAt:
                message.sent_at,
              unread: 0,
            };
          }

          map[key].messages.push(
            message
          );

          if (
            !message.is_read &&
            message.direction ===
              "inbound"
          ) {
            map[key].unread += 1;
          }

          if (
            message.sent_at &&
            (!map[key].lastAt ||
              new Date(
                message.sent_at
              ) >
                new Date(
                  map[key].lastAt
                ))
          ) {
            map[key].lastAt =
              message.sent_at;
          }
        }
      );

      const list =
        Object.values(map);

      list.sort(
        (a, b) =>
          new Date(
            b.lastAt || 0
          ) -
          new Date(
            a.lastAt || 0
          )
      );

      list.forEach(
        (conversation) => {
          conversation.messages.sort(
            (a, b) =>
              new Date(
                a.sent_at || 0
              ) -
              new Date(
                b.sent_at || 0
              )
          );
        }
      );

      return list;
    }, [messages]);

  const filteredConversations =
    useMemo(() => {
      if (!search) {
        return conversations;
      }

      const query =
        search.toLowerCase();

      return conversations.filter(
        (conversation) => {
          const customerName =
            String(
              conversation
                .messages[0]
                ?.customer_name ||
                ""
            ).toLowerCase();

          const contactName =
            String(
              conversation.messages.find(
                (message) =>
                  message.contact_name
              )?.contact_name ||
                ""
            ).toLowerCase();

          const phone =
            formatPhoneDisplay(
              conversation.phone
            ).toLowerCase();

          return (
            customerName.includes(
              query
            ) ||
            contactName.includes(
              query
            ) ||
            phone.includes(query)
          );
        }
      );
    }, [
      conversations,
      search,
    ]);

  const selectedConversation =
    conversations.find(
      (conversation) =>
        conversation.phone ===
        selectedPhone
    ) || null;

  const totalUnread =
    useMemo(
      () =>
        conversations.reduce(
          (
            total,
            conversation
          ) =>
            total +
            (conversation.unread ||
              0),
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

  /**
   * Mark inbound messages read when the conversation opens.
   */
  useEffect(() => {
    if (
      !selectedConversation
    ) {
      return;
    }

    const unread =
      selectedConversation.messages.filter(
        (message) =>
          !message.is_read &&
          message.direction ===
            "inbound"
      );

    if (
      unread.length === 0
    ) {
      return;
    }

    Promise.all(
      unread.map((message) =>
        base44.entities.Message.update(
          message.id,
          {
            is_read: true,
          }
        )
      )
    )
      .then(() =>
        queryClient.invalidateQueries(
          {
            queryKey: [
              "messages",
            ],
          }
        )
      )
      .catch(() => {});
  }, [
    selectedPhone,
    selectedConversation
      ?.messages.length,
  ]);

  /**
   * Scroll to the newest message.
   */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop =
        scrollRef.current
          .scrollHeight;
    }
  }, [
    selectedConversation
      ?.messages.length,
    selectedPhone,
  ]);

  const sendMutation =
    useMutation({
      mutationFn: (variables) =>
        base44.functions.invoke(
          "sendVoipSms",
          variables
        ),

      onSuccess: () => {
        setDraft("");

        queryClient.invalidateQueries(
          {
            queryKey: [
              "messages",
            ],
          }
        );
      },

      onError: (error) => {
        console.error(
          "Send failed",
          error
        );
      },
    });

  const sendFacebookMutation =
    useMutation({
      mutationFn: (variables) =>
        base44.functions.invoke(
          "sendFacebookMessage",
          variables
        ),

      onSuccess: () => {
        setDraft("");

        queryClient.invalidateQueries(
          {
            queryKey: [
              "messages",
            ],
          }
        );
      },

      onError: (error) => {
        console.error(
          "Facebook send failed",
          error
        );
      },
    });

  const isFacebookConv =
    Boolean(
      selectedConversation?.messages.some(
        (message) =>
          message.channel ===
          "facebook"
      )
    );

  const handleSend = () => {
    if (
      !draft.trim() ||
      !selectedPhone
    ) {
      return;
    }

    const conversation =
      selectedConversation;

    if (isFacebookConv) {
      sendFacebookMutation.mutate(
        {
          recipient_psid:
            selectedPhone,

          message:
            draft.trim(),
        }
      );

      return;
    }

    sendMutation.mutate({
      to: selectedPhone,

      message:
        draft.trim(),

      customer_id:
        conversation
          ?.messages[0]
          ?.customer_id ||
        null,

      customer_name:
        conversation
          ?.messages[0]
          ?.customer_name ||
        null,
    });
  };

  const composeMutation =
    useMutation({
      mutationFn: (variables) =>
        base44.functions.invoke(
          "sendVoipSms",
          variables
        ),

      onSuccess: (
        _data,
        variables
      ) => {
        setComposeOpen(false);
        setComposePhone("");
        setComposeMessage("");
        setComposeSearch("");

        queryClient.invalidateQueries(
          {
            queryKey: [
              "messages",
            ],
          }
        );

        const phone =
          normalizePhone(
            variables.to
          );

        setTimeout(() => {
          setSelectedPhone(
            phone
          );
        }, 300);
      },

      onError: (error) => {
        console.error(
          "Compose send failed",
          error
        );
      },
    });

  const handleComposeSend =
    () => {
      if (
        !composePhone.trim() ||
        !composeMessage.trim()
      ) {
        return;
      }

      const matchedCustomer =
        customers.find(
          (customer) =>
            normalizePhone(
              customer.phone
            ) ===
            normalizePhone(
              composePhone
            )
        );

      composeMutation.mutate({
        to: composePhone.trim(),

        message:
          composeMessage.trim(),

        customer_id:
          matchedCustomer?.id ||
          null,

        customer_name:
          matchedCustomer
            ? `${matchedCustomer.first_name || ""} ${
                matchedCustomer.last_name || ""
              }`.trim()
            : null,
      });
    };

  const filteredCustomers =
    useMemo(() => {
      if (!composeSearch) {
        return customers.slice(
          0,
          20
        );
      }

      const query =
        composeSearch.toLowerCase();

      return customers
        .filter((customer) => {
          const name =
            `${customer.first_name || ""} ${
              customer.last_name || ""
            }`.toLowerCase();

          const phone =
            String(
              customer.phone || ""
            );

          return (
            name.includes(query) ||
            phone.includes(query)
          );
        })
        .slice(0, 20);
    }, [
      customers,
      composeSearch,
    ]);

  const handleKeyDown = (
    event
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen bg-slate-50">
      {/* Header */}
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
              onClick={() =>
                setTab(
                  "messages"
                )
              }
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
              onClick={() =>
                setTab("calls")
              }
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
              {permission !==
                "granted" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={
                    requestPermission
                  }
                  title="Enable push notifications"
                >
                  <BellOff className="w-4 h-4" />

                  <span className="hidden sm:inline ml-1">
                    Enable Alerts
                  </span>
                </Button>
              )}

              {permission ===
                "granted" && (
                <Bell className="w-4 h-4 text-[#e20404]" />
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setComposeOpen(
                    true
                  )
                }
              >
                <PenSquare className="w-4 h-4 mr-1" />

                <span className="hidden sm:inline">
                  New
                </span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  queryClient.invalidateQueries(
                    {
                      queryKey: [
                        "messages",
                      ],
                    }
                  )
                }
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {tab === "messages" && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Conversation list */}
          <div
            className={cn(
              "w-full sm:w-80 border-r border-slate-200 bg-white flex flex-col",
              selectedPhone
                ? "hidden sm:flex"
                : "flex"
            )}
          >
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                <Input
                  placeholder="Search name or number..."
                  value={search}
                  onChange={(
                    event
                  ) =>
                    setSearch(
                      event.target
                        .value
                    )
                  }
                  className="pl-8"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({
                    length: 5,
                  }).map(
                    (
                      _,
                      index
                    ) => (
                      <div
                        key={
                          index
                        }
                        className="flex items-center gap-3"
                      >
                        <div className="w-10 h-10 bg-slate-200 rounded-full animate-pulse shrink-0" />

                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-slate-200 rounded animate-pulse w-1/3" />
                          <div className="h-3 bg-slate-200 rounded animate-pulse w-1/2" />
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : filteredConversations.length ===
                0 ? (
                <div className="p-4 text-center text-slate-400 text-sm">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />

                  No messages yet
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredConversations.map(
                    (
                      conversation
                    ) => {
                      const lastMessage =
                        conversation
                          .messages[
                          conversation
                            .messages
                            .length -
                            1
                        ];

                      const customerName =
                        conversation
                          .messages[0]
                          ?.customer_name;

                      const contactName =
                        conversation.messages.find(
                          (
                            message
                          ) =>
                            message.contact_name
                        )?.contact_name;

                      const displayName =
                        getDisplayName(
                          contactName,
                          customerName,
                          formatPhoneDisplay(
                            conversation.phone
                          )
                        );

                      const preview =
                        getConversationPreview(
                          lastMessage
                        );

                      return (
                        <button
                          key={
                            conversation.phone
                          }
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
                            {displayName &&
                            displayName !==
                              formatPhoneDisplay(
                                conversation.phone
                              ) ? (
                              <span className="text-sm font-semibold text-slate-600">
                                {displayName
                                  .charAt(
                                    0
                                  )
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
                                  (
                                    message
                                  ) =>
                                    message.channel ===
                                    "facebook"
                                ) && (
                                  <Facebook className="w-3 h-3 text-[#1877F2] flex-shrink-0" />
                                )}

                                {
                                  displayName
                                }
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
                                  "outbound" &&
                                  "You: "}

                                {preview}
                              </span>

                              {conversation.unread >
                                0 && (
                                <span className="bg-[#e20404] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold flex-shrink-0">
                                  {
                                    conversation.unread
                                  }
                                </span>
                              )}
                            </div>

                            {!customerName &&
                              !contactName && (
                                <span className="text-xs text-slate-400">
                                  {formatPhoneDisplay(
                                    conversation.phone
                                  )}
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

          {/* Chat thread */}
          {selectedPhone &&
          selectedConversation ? (
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
              {/* Chat header */}
              <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={() =>
                    setSelectedPhone(
                      null
                    )
                  }
                  className="sm:hidden text-slate-500 hover:text-slate-900"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                  {(() => {
                    const contactName =
                      selectedConversation.messages.find(
                        (
                          message
                        ) =>
                          message.contact_name
                      )?.contact_name;

                    const customerName =
                      selectedConversation
                        .messages[0]
                        ?.customer_name;

                    const name =
                      getDisplayName(
                        contactName,
                        customerName,
                        ""
                      );

                    if (name) {
                      return (
                        <span className="text-sm font-semibold text-slate-600">
                          {name
                            .charAt(
                              0
                            )
                            .toUpperCase()}
                        </span>
                      );
                    }

                    return (
                      <User className="w-5 h-5 text-slate-400" />
                    );
                  })()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-slate-900 truncate flex items-center gap-1.5">
                    {isFacebookConv && (
                      <Facebook className="w-3.5 h-3.5 text-[#1877F2] flex-shrink-0" />
                    )}

                    {(() => {
                      const contactName =
                        selectedConversation.messages.find(
                          (
                            message
                          ) =>
                            message.contact_name
                        )?.contact_name;

                      const customerName =
                        selectedConversation
                          .messages[0]
                          ?.customer_name;

                      return getDisplayName(
                        contactName,
                        customerName,
                        formatPhoneDisplay(
                          selectedPhone
                        )
                      );
                    })()}
                  </div>

                  <div className="text-xs text-slate-400">
                    {isFacebookConv
                      ? "Facebook Messenger"
                      : formatPhoneDisplay(
                          selectedPhone
                        )}
                  </div>
                </div>

                {selectedConversation
                  .messages[0]
                  ?.customer_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `/CustomerDetail?id=${selectedConversation.messages[0].customer_id}`,
                        "_blank"
                      )
                    }
                  >
                    <User className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {/* Messages */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
              >
                {selectedConversation
                  .messages
                  .length === 0 ? (
                  <div className="text-center text-slate-400 text-sm py-8">
                    No messages
                  </div>
                ) : (
                  (() => {
                    let lastDay =
                      "";

                    return selectedConversation.messages.map(
                      (
                        message
                      ) => {
                        const dayLabel =
                          formatDayLabel(
                            message.sent_at
                          );

                        const showDay =
                          dayLabel !==
                          lastDay;

                        lastDay =
                          dayLabel;

                        const mediaUrls =
                          getMediaUrls(
                            message
                          );

                        const hasBody =
                          Boolean(
                            String(
                              message.body ||
                                ""
                            ).trim()
                          );

                        return (
                          <div
                            key={
                              message.id
                            }
                          >
                            {showDay && (
                              <div className="text-center my-3">
                                <span className="text-xs text-slate-400 bg-slate-50 px-2">
                                  {
                                    dayLabel
                                  }
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
                                    {
                                      message.body
                                    }
                                  </p>
                                )}

                                {mediaUrls.length >
                                  0 && (
                                  <div
                                    className={cn(
                                      "space-y-2",
                                      hasBody &&
                                        "mt-2"
                                    )}
                                  >
                                    {mediaUrls.map(
                                      (
                                        mediaUrl,
                                        index
                                      ) => (
                                        <a
                                          key={`${message.id}-media-${index}`}
                                          href={
                                            mediaUrl
                                          }
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="block"
                                        >
                                          <img
                                            src={
                                              mediaUrl
                                            }
                                            alt={`MMS attachment ${
                                              index +
                                              1
                                            }`}
                                            className="block max-w-full max-h-96 rounded-lg object-contain bg-slate-100"
                                            loading="lazy"
                                            onError={(
                                              event
                                            ) => {
                                              console.error(
                                                "MMS image failed to load:",
                                                mediaUrl
                                              );

                                              event.currentTarget.style.display =
                                                "none";

                                              const fallback =
                                                event
                                                  .currentTarget
                                                  .nextElementSibling;

                                              if (
                                                fallback
                                              ) {
                                                fallback.style.display =
                                                  "flex";
                                              }
                                            }}
                                          />

                                          <div className="hidden min-h-24 items-center justify-center gap-2 rounded-lg bg-slate-100 text-slate-500 px-4 py-3">
                                            <ImageIcon className="w-5 h-5" />

                                            <span>
                                              Open
                                              attachment
                                            </span>
                                          </div>
                                        </a>
                                      )
                                    )}
                                  </div>
                                )}

                                {!hasBody &&
                                  mediaUrls.length ===
                                    0 && (
                                    <p className="italic opacity-70">
                                      {message.channel ===
                                      "mms"
                                        ? "Attachment unavailable"
                                        : ""}
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
                  })()
                )}

                {(sendMutation.isPending ||
                  sendFacebookMutation.isPending) && (
                  <div className="flex justify-end">
                    <div className="bg-slate-200 text-slate-500 rounded-2xl rounded-br-sm px-4 py-2 text-sm italic">
                      Sending...
                    </div>
                  </div>
                )}
              </div>

              {/* Reply input */}
              <div className="bg-white border-t border-slate-200 p-3 flex items-center gap-2 flex-shrink-0">
                <Input
                  placeholder="Type a message..."
                  value={draft}
                  onChange={(
                    event
                  ) =>
                    setDraft(
                      event.target
                        .value
                    )
                  }
                  onKeyDown={
                    handleKeyDown
                  }
                  className="flex-1"
                />

                <Button
                  onClick={
                    handleSend
                  }
                  disabled={
                    !draft.trim() ||
                    sendMutation.isPending ||
                    sendFacebookMutation.isPending
                  }
                  className="bg-[#e20404] hover:bg-red-700"
                  size="icon"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              <div className="text-xs text-slate-400 px-4 pb-1 text-right">
                {draft.length}{" "}
                characters
                {!isFacebookConv &&
                  draft.length >
                    160 &&
                  " · Sends as MMS"}
              </div>
            </div>
          ) : (
            <div className="hidden sm:flex flex-1 items-center justify-center bg-slate-50">
              <div className="text-center text-slate-400">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />

                <p className="text-sm">
                  Select a
                  conversation to
                  view messages
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "calls" && (
        <CallsView />
      )}

      {/* New-message dialog */}
      <Dialog
        open={composeOpen}
        onOpenChange={
          setComposeOpen
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              New Message
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                To (phone
                number)
              </label>

              <Input
                placeholder="Enter phone number or search customer..."
                value={
                  composeSearch
                    ? composeSearch
                    : composePhone
                }
                onChange={(
                  event
                ) => {
                  setComposeSearch(
                    event.target
                      .value
                  );

                  setComposePhone(
                    event.target
                      .value
                  );
                }}
              />

              {composeSearch &&
                filteredCustomers.length >
                  0 && (
                  <div className="mt-1 border border-slate-200 rounded-md max-h-40 overflow-y-auto divide-y divide-slate-100">
                    {filteredCustomers.map(
                      (
                        customer
                      ) => (
                        <button
                          key={
                            customer.id
                          }
                          onClick={() => {
                            setComposePhone(
                              customer.phone ||
                                ""
                            );

                            setComposeSearch(
                              `${customer.first_name || ""} ${
                                customer.last_name ||
                                ""
                              }`.trim()
                            );
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                        >
                          <span className="font-medium">
                            {
                              customer.first_name
                            }{" "}
                            {
                              customer.last_name
                            }
                          </span>

                          {customer.phone && (
                            <span className="text-slate-400 ml-2">
                              {formatPhoneDisplay(
                                customer.phone
                              )}
                            </span>
                          )}
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
                placeholder="Type your message..."
                value={
                  composeMessage
                }
                onChange={(
                  event
                ) =>
                  setComposeMessage(
                    event.target
                      .value
                  )
                }
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                rows={5}
              />

              <div className="text-xs text-slate-400 text-right mt-1">
                {
                  composeMessage.length
                }{" "}
                characters
                {composeMessage.length >
                  160 &&
                  " · Sends as MMS"}
              </div>
            </div>

            {composeMutation.isError && (
              <p className="text-sm text-red-600">
                Failed to send.
                Please try again.
              </p>
            )}

            <Button
              onClick={
                handleComposeSend
              }
              disabled={
                !composePhone.trim() ||
                !composeMessage.trim() ||
                composeMutation.isPending
              }
              className="w-full bg-[#e20404] hover:bg-red-700"
            >
              <Send className="w-4 h-4 mr-2" />

              Send Message
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}