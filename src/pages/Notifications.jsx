import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Trash2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const TYPE_META = {
  estimate_accepted: { label: "Estimate Accepted", color: "bg-emerald-100 text-emerald-700" },
  payment_received: { label: "Payment Received", color: "bg-blue-100 text-blue-700" },
  po_accepted: { label: "PO Acknowledged", color: "bg-purple-100 text-purple-700" },
  po_ready: { label: "PO Ready", color: "bg-teal-100 text-teal-700" },
  refresh_request: { label: "Refresh Request", color: "bg-amber-100 text-amber-700" },
  other: { label: "Notification", color: "bg-slate-100 text-slate-600" },
};

export default function Notifications() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => base44.entities.Notification.list("-created_date", 200),
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { is_read: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter((n) => !n.is_read);
      await base44.entities.Notification.bulkUpdate(
        unread.map((n) => ({ id: n.id, is_read: true }))
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All marked as read");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const shown = filter === "unread" ? notifications.filter((n) => !n.is_read) : notifications;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Bell className="w-7 h-7 text-[#e20404]" /> Notifications
          </h1>
          <p className="text-slate-500 mt-1">
            {unreadCount > 0 ? (
              <span className="text-[#e20404] font-medium">{unreadCount} unread</span>
            ) : "You're all caught up"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setFilter(filter === "unread" ? "all" : "unread")}>
            {filter === "unread" ? "Show All" : "Show Unread"}
          </Button>
          {unreadCount > 0 && (
            <Button size="sm" onClick={() => markAllMutation.mutate()} disabled={markAllMutation.isPending}>
              <CheckCheck className="w-4 h-4 mr-1" /> Mark All Read
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : shown.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No notifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((n) => {
            const meta = TYPE_META[n.type] || TYPE_META.other;
            return (
              <div
                key={n.id}
                className={`bg-white rounded-xl border p-4 flex items-start gap-4 transition-all ${n.is_read ? "border-slate-200" : "border-[#e20404]/30 bg-red-50/30"}`}
              >
                <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.is_read ? "bg-transparent" : "bg-[#e20404]"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${meta.color} border-0`}>{meta.label}</Badge>
                    <span className="text-xs text-slate-400">
                      {n.created_date ? format(new Date(n.created_date), "MMM d, yyyy h:mm a") : ""}
                    </span>
                  </div>
                  <h3 className={`mt-1.5 text-slate-900 ${n.is_read ? "font-normal" : "font-semibold"}`}>{n.title}</h3>
                  <p className="text-sm text-slate-600 mt-0.5">{n.message}</p>
                  <div className="flex gap-2 mt-2">
                    {n.link_url && (
                      <Link to={n.link_url}>
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                          <ExternalLink className="w-3 h-3 mr-1" /> View
                        </Button>
                      </Link>
                    )}
                    {!n.is_read && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => markReadMutation.mutate(n.id)}>
                        <CheckCheck className="w-3 h-3 mr-1" /> Mark read
                      </Button>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-slate-300 hover:text-red-500 h-8 w-8 p-0"
                  onClick={() => deleteMutation.mutate(n.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}