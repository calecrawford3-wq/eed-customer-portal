import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Trash2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const TYPE_META = {
  estimate_accepted: { label: "Estimate Accepted", color: "bg-emerald-100 text-emerald-700" },
  payment_received: { label: "Payment Received", color: "bg-blue-100 text-blue-700" },
  po_accepted: { label: "PO Acknowledged", color: "bg-purple-100 text-purple-700" },
  po_ready: { label: "PO Ready", color: "bg-teal-100 text-teal-700" },
  refresh_request: { label: "Refresh Request", color: "bg-amber-100 text-amber-700" },
  other: { label: "Notification", color: "bg-slate-100 text-slate-600" },
};

export default function NotificationBell() {
  const qc = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => base44.entities.Notification.list("-created_date", 30),
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { is_read: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter((n) => !n.is_read);
      if (unread.length) {
        await base44.entities.Notification.bulkUpdate(unread.map((n) => ({ id: n.id, is_read: true })));
      }
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg text-slate-500 hover:text-[#e20404] hover:bg-slate-100 transition-colors">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-[#e20404] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#e20404]" />
            <span className="font-semibold text-slate-900 text-sm">Notifications</span>
            {unreadCount > 0 && (
              <Badge className="bg-[#e20404] text-white border-0 text-xs">{unreadCount} new</Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-[#e20404] hover:text-[#c00303]"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {notifications.map((n) => {
                const meta = TYPE_META[n.type] || TYPE_META.other;
                return (
                  <div
                    key={n.id}
                    className={`px-4 py-3 flex items-start gap-3 group ${n.is_read ? "bg-white" : "bg-red-50/40"}`}
                  >
                    <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.is_read ? "bg-transparent" : "bg-[#e20404]"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${meta.color} border-0 text-[10px] px-1.5 py-0`}>{meta.label}</Badge>
                        <span className="text-[10px] text-slate-400">
                          {n.created_date ? format(new Date(n.created_date), "MMM d, h:mm a") : ""}
                        </span>
                      </div>
                      <p className={`mt-1 text-sm text-slate-900 ${n.is_read ? "font-normal" : "font-semibold"}`}>{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <div className="flex gap-1.5 mt-1.5">
                        {n.link_url && (
                          <Link to={n.link_url} onClick={() => markReadMutation.mutate(n.id)}>
                            <Button size="sm" variant="outline" className="h-6 text-[11px] px-2">
                              <ExternalLink className="w-3 h-3 mr-1" /> View
                            </Button>
                          </Link>
                        )}
                        {!n.is_read && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[11px] px-2 text-slate-500"
                            onClick={() => markReadMutation.mutate(n.id)}
                          >
                            <CheckCheck className="w-3 h-3 mr-1" /> Read
                          </Button>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-200 hover:text-red-500 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
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
      </PopoverContent>
    </Popover>
  );
}