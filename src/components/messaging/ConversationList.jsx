import React from "react";
import { MessageSquare, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  resolveConversationParty,
  getDisplayName,
  formatPhoneDisplay,
  formatTime,
  getConversationPreview,
} from "@/lib/messagingUtils";

export default function ConversationList({
  conversations,
  customers,
  customerContacts,
  selectedPhone,
  onSelect,
  search,
  setSearch,
  isLoading,
}) {
  return (
    <div className="p-3 border-b border-slate-100">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search name or number..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-8"
        />
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-sm text-slate-400">Loading messages...</div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-slate-400 text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No messages yet
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {conversations.map((conversation) => {
              const lastMessage = conversation.messages[conversation.messages.length - 1];
              const party = resolveConversationParty(
                customers,
                customerContacts,
                conversation.phone,
                conversation.messages
              );
              const displayName = getDisplayName(
                party.contactName,
                party.customerName,
                formatPhoneDisplay(conversation.phone)
              );
              return (
                <button
                  key={conversation.phone}
                  onClick={() => onSelect(conversation.phone)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex gap-3 items-start",
                    selectedPhone === conversation.phone && "bg-slate-100"
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                      {party.contactName || party.customerName ? (
                        <span className="text-sm font-semibold text-slate-600">
                          {displayName.charAt(0).toUpperCase()}
                        </span>
                      ) : (
                        <User className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    {conversation.unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-[#e20404] rounded-full border-2 border-white" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm text-slate-900 truncate">
                        {displayName}
                      </span>
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        {formatTime(conversation.lastAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 truncate">
                        {lastMessage?.direction === "outbound" && "You: "}
                        {getConversationPreview(lastMessage)}
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
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}