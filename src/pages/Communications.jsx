import React from "react";
import { useSearchParams } from "react-router-dom";
import { MessageSquare, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import Messaging from "@/pages/Messaging";
import Emails from "@/pages/Emails";

/**
 * Unified Communications inbox — tabbed wrapper around the existing
 * Messages (SMS/MMS) and Emails capabilities. Tab state persists in the URL
 * (?tab=messages|emails) so it can be linked directly. Both underlying pages
 * retain their full distinct capabilities.
 */
export default function Communications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "emails" ? "emails" : "messages";

  const setTab = (t) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <div className="border-b border-slate-200 bg-white sticky top-14 md:top-12 z-10 print:hidden">
        <div className="px-4 md:px-8 flex gap-1">
          <button
            onClick={() => setTab("messages")}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
              tab === "messages" ? "border-[#e20404] text-[#e20404]" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <MessageSquare className="w-4 h-4" /> Messages
          </button>
          <button
            onClick={() => setTab("emails")}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
              tab === "emails" ? "border-[#e20404] text-[#e20404]" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <Mail className="w-4 h-4" /> Emails
          </button>
        </div>
      </div>
      {tab === "messages" ? <Messaging /> : <Emails />}
    </div>
  );
}