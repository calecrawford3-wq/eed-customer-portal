import React from "react";
import { ArrowLeft, Trash2, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { formatPhoneDisplay, getDisplayName } from "@/lib/messagingUtils";

export default function ConversationHeader({
  party,
  selectedPhone,
  onBack,
  onOpenCustomer,
  onCreateCustomer,
  onCreateSupplier,
  onDeleteConversation,
}) {
  const displayName = getDisplayName(
    party.contactName,
    party.customerName,
    formatPhoneDisplay(selectedPhone)
  );

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
      <button onClick={onBack} className="sm:hidden text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-5 h-5" />
      </button>

      <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
        {party.contactName || party.customerName ? (
          <span className="text-sm font-semibold text-slate-600">
            {displayName.charAt(0).toUpperCase()}
          </span>
        ) : (
          <User className="w-5 h-5 text-slate-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-slate-900 truncate">{displayName}</div>
        <div className="text-xs text-slate-400">
          {formatPhoneDisplay(selectedPhone)}
          {party.contact?.relationship ? ` · ${party.contact.relationship}` : ""}
        </div>
      </div>

      {party.customerId && (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenCustomer}
          title="Open customer"
        >
          <User className="w-4 h-4" />
        </Button>
      )}

      {!party.customerId && !party.contact && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" title="Add this number to contacts">
              <UserPlus className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCreateCustomer}>Create Customer</DropdownMenuItem>
            <DropdownMenuItem onClick={onCreateSupplier}>Create Vendor</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Button
        variant="outline"
        size="sm"
        className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
        onClick={onDeleteConversation}
        title="Delete entire conversation"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}