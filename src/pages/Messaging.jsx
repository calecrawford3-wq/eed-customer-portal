import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, ArrowLeft, Phone, User, Search, RefreshCw, PenSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function normalizePhone(p) {
  if (!p) return "";
  let d = p.replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return d;
}

function formatPhoneDisplay(p) {
  if (!p) return "";
  let d = p.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("en-US", { hour: "numeric", "2-digit": true, minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export default function Messaging() {
  const queryClient = useQueryClient();
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePhone, setComposePhone] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeSearch, setComposeSearch] = useState("");
  const scrollRef = useRef(null);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 500),
    enabled: composeOpen,
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages"],
    queryFn: () => base44.entities.Message.list("-sent_at", 500),
    refetchInterval: 15000,
  });

  // Group messages into conversations by phone_number
  const conversations = useMemo(() => {
    const map = {};
    messages.forEach((m) => {
      const key = m.phone_number || normalizePhone(m.from_number);
      if (!map[key]) {
        map[key] = { phone: key, messages: [], lastAt: m.sent_at, unread: 0 };
      }
      map[key].messages.push(m);
      if (!m.is_read && m.direction === "inbound") map[key].unread++;
      if (m.sent_at && (!map[key].lastAt || new Date(m.sent_at) > new Date(map[key].lastAt))) {
        map[key].lastAt = m.sent_at;
      }
    });
    const list = Object.values(map);
    list.sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
    list.forEach((c) => c.messages.sort((a, b) => new Date(a.sent_at || 0) - new Date(b.sent_at || 0)));
    return list;
  }, [messages]);

  const filteredConversations = useMemo(() => {
    if (!search) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      const name = (c.messages[0]?.customer_name || "").toLowerCase();
      return name.includes(q) || formatPhoneDisplay(c.phone).includes(q);
    });
  }, [conversations, search]);

  const selectedConversation = conversations.find((c) => c.phone === selectedPhone) || null;

  // Mark unread messages as read when conversation is opened
  useEffect(() => {
    if (!selectedConversation) return;
    const unread = selectedConversation.messages.filter((m) => !m.is_read && m.direction === "inbound");
    if (unread.length === 0) return;
    Promise.all(unread.map((m) => base44.entities.Message.update(m.id, { is_read: true })))
      .then(() => queryClient.invalidateQueries({ queryKey: ["messages"] }))
      .catch(() => {});
  }, [selectedPhone, selectedConversation?.messages.length]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedConversation?.messages.length, selectedPhone]);

  const sendMutation = useMutation({
    mutationFn: (vars) => base44.functions.invoke("sendVoipSms", vars),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (e) => {
      console.error("Send failed", e);
    },
  });

  const handleSend = () => {
    if (!draft.trim() || !selectedPhone) return;
    const conv = selectedConversation;
    sendMutation.mutate({
      to: selectedPhone,
      message: draft.trim(),
      customer_id: conv?.messages[0]?.customer_id || null,
      customer_name: conv?.messages[0]?.customer_name || null,
    });
  };

  const composeMutation = useMutation({
    mutationFn: (vars) => base44.functions.invoke("sendVoipSms", vars),
    onSuccess: (_data, vars) => {
      setComposeOpen(false);
      setComposePhone("");
      setComposeMessage("");
      setComposeSearch("");
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      const phone = normalizePhone(vars.to);
      setTimeout(() => setSelectedPhone(phone), 300);
    },
    onError: (e) => {
      console.error("Compose send failed", e);
    },
  });

  const handleComposeSend = () => {
    if (!composePhone.trim() || !composeMessage.trim()) return;
    const matched = customers.find((c) => normalizePhone(c.phone) === normalizePhone(composePhone));
    composeMutation.mutate({
      to: composePhone.trim(),
      message: composeMessage.trim(),
      customer_id: matched?.id || null,
      customer_name: matched ? `${matched.first_name} ${matched.last_name}`.trim() : null,
    });
  };

  const filteredCustomers = useMemo(() => {
    if (!composeSearch) return customers.slice(0, 20);
    const q = composeSearch.toLowerCase();
    return customers
      .filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || (c.phone || "").includes(q))
      .slice(0, 20);
  }, [customers, composeSearch]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-[#e20404]" />
          <h1 className="text-lg font-semibold text-slate-900">Messages</h1>
          <span className="text-sm text-slate-400 hidden sm:inline">via VoIP.ms</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setComposeOpen(true)}
          >
            <PenSquare className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">New</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["messages"] })}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Conversation list */}
        <div className={cn(
          "w-full sm:w-80 border-r border-slate-200 bg-white flex flex-col",
          selectedPhone ? "hidden sm:flex" : "flex"
        )}>
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search name or number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-4 text-center text-slate-400 text-sm">Loading conversations...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No messages yet
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredConversations.map((conv) => {
                  const lastMsg = conv.messages[conv.messages.length - 1];
                  const name = conv.messages[0]?.customer_name;
                  return (
                    <button
                      key={conv.phone}
                      onClick={() => setSelectedPhone(conv.phone)}
                      className={cn(
                        "w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex gap-3 items-start",
                        selectedPhone === conv.phone && "bg-slate-100"
                      )}
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                        {name ? (
                          <span className="text-sm font-semibold text-slate-600">
                            {name.charAt(0).toUpperCase()}
                          </span>
                        ) : (
                          <User className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm text-slate-900 truncate">
                            {name || formatPhoneDisplay(conv.phone)}
                          </span>
                          <span className="text-xs text-slate-400 flex-shrink-0">
                            {formatTime(conv.lastAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500 truncate">
                            {lastMsg?.direction === "outbound" && "You: "}
                            {lastMsg?.body || ""}
                          </span>
                          {conv.unread > 0 && (
                            <span className="bg-[#e20404] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold flex-shrink-0">
                              {conv.unread}
                            </span>
                          )}
                        </div>
                        {!name && (
                          <span className="text-xs text-slate-400">{formatPhoneDisplay(conv.phone)}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Chat thread */}
        {selectedPhone && selectedConversation ? (
          <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
            {/* Chat header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => setSelectedPhone(null)}
                className="sm:hidden text-slate-500 hover:text-slate-900"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                {selectedConversation.messages[0]?.customer_name ? (
                  <span className="text-sm font-semibold text-slate-600">
                    {selectedConversation.messages[0].customer_name.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <User className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-slate-900 truncate">
                  {selectedConversation.messages[0]?.customer_name || formatPhoneDisplay(selectedPhone)}
                </div>
                <div className="text-xs text-slate-400">{formatPhoneDisplay(selectedPhone)}</div>
              </div>
              {selectedConversation.messages[0]?.customer_id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/CustomerDetail?id=${selectedConversation.messages[0].customer_id}`, "_blank")}
                >
                  <User className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {selectedConversation.messages.length === 0 ? (
                <div className="text-center text-slate-400 text-sm py-8">No messages</div>
              ) : (
                (() => {
                  let lastDay = "";
                  return selectedConversation.messages.map((msg, idx) => {
                    const dayLabel = formatDayLabel(msg.sent_at);
                    const showDay = dayLabel !== lastDay;
                    lastDay = dayLabel;
                    return (
                      <div key={msg.id}>
                        {showDay && (
                          <div className="text-center my-3">
                            <span className="text-xs text-slate-400 bg-slate-50 px-2">{dayLabel}</span>
                          </div>
                        )}
                        <div className={cn(
                          "flex",
                          msg.direction === "outbound" ? "justify-end" : "justify-start"
                        )}>
                          <div className={cn(
                            "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                            msg.direction === "outbound"
                              ? "bg-[#e20404] text-white rounded-br-sm"
                              : "bg-white border border-slate-200 text-slate-900 rounded-bl-sm"
                          )}>
                            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                            <div className={cn(
                              "text-[10px] mt-1",
                              msg.direction === "outbound" ? "text-white/70" : "text-slate-400"
                            )}>
                              {formatTime(msg.sent_at)}
                              {msg.direction === "outbound" && msg.status === "failed" && " · Failed"}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
              {sendMutation.isPending && (
                <div className="flex justify-end">
                  <div className="bg-slate-200 text-slate-500 rounded-2xl rounded-br-sm px-4 py-2 text-sm italic">
                    Sending...
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="bg-white border-t border-slate-200 p-3 flex items-center gap-2 flex-shrink-0">
              <Input
                placeholder="Type a message..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={160}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={!draft.trim() || sendMutation.isPending}
                className="bg-[#e20404] hover:bg-red-700"
                size="icon"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-xs text-slate-400 px-4 pb-1 text-right">
              {draft.length}/160
            </div>
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

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">To (phone number)</label>
              <Input
                placeholder="Enter phone number or search customer..."
                value={composeSearch ? composeSearch : composePhone}
                onChange={(e) => {
                  setComposeSearch(e.target.value);
                  setComposePhone(e.target.value);
                }}
              />
              {composeSearch && filteredCustomers.length > 0 && (
                <div className="mt-1 border border-slate-200 rounded-md max-h-40 overflow-y-auto divide-y divide-slate-100">
                  {filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setComposePhone(c.phone || "");
                        setComposeSearch(`${c.first_name} ${c.last_name}`);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                    >
                      <span className="font-medium">{c.first_name} {c.last_name}</span>
                      {c.phone && <span className="text-slate-400 ml-2">{formatPhoneDisplay(c.phone)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Message</label>
              <textarea
                placeholder="Type your message..."
                value={composeMessage}
                onChange={(e) => setComposeMessage(e.target.value)}
                maxLength={160}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                rows={3}
              />
              <div className="text-xs text-slate-400 text-right mt-1">{composeMessage.length}/160</div>
            </div>
            {composeMutation.isError && (
              <p className="text-sm text-red-600">Failed to send. Please try again.</p>
            )}
            <Button
              onClick={handleComposeSend}
              disabled={!composePhone.trim() || !composeMessage.trim() || composeMutation.isPending}
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