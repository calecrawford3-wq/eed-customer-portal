import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Trash2, ExternalLink, BellRing, Volume2, VolumeX } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const TYPE_META = {
  estimate_accepted: { label: "Estimate Accepted", color: "bg-emerald-100 text-emerald-700" },
  payment_received: { label: "Payment Received", color: "bg-blue-100 text-blue-700" },
  po_accepted: { label: "PO Acknowledged", color: "bg-purple-100 text-purple-700" },
  po_ready: { label: "PO Ready", color: "bg-teal-100 text-teal-700" },
  refresh_request: { label: "Refresh Request", color: "bg-amber-100 text-amber-700" },
  build_status_change: { label: "Build Status", color: "bg-indigo-100 text-indigo-700" },
  low_stock: { label: "Low Stock", color: "bg-orange-100 text-orange-700" },
  email_action_required: { label: "Email Action", color: "bg-rose-100 text-rose-700" },
  invoice_overdue: { label: "Invoice Overdue", color: "bg-red-100 text-red-700" },
  engine_pickup_ready: { label: "Pickup Ready", color: "bg-cyan-100 text-cyan-700" },
  new_message: { label: "New Message", color: "bg-green-100 text-green-700" },
  other: { label: "Notification", color: "bg-slate-100 text-slate-600" },
};

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_e) {
    // ignore audio errors
  }
}

export default function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem("notif_sound") !== "off";
    } catch (_e) {
      return true;
    }
  });
  const [pushPermission, setPushPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const prevCountRef = useRef(0);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => base44.entities.Notification.list("-created_date", 30),
    refetchInterval: 30000,
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Real-time subscription — update list instantly on create/update/delete
  useEffect(() => {
    const unsubscribe = base44.entities.Notification.subscribe((event) => {
      qc.invalidateQueries({ queryKey: ["notifications"] });

      // On new notification: play sound + desktop notification
      if (event.type === "create" && event.data) {
        const n = event.data;
        if (!n.is_read) {
          // Sound
          if (soundOn) playChime();
          // Desktop notification (if permission granted and tab not focused)
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
            try {
              const notif = new Notification(n.title || "New Notification", {
                body: n.message || "",
                icon: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png",
              });
              notif.onclick = () => {
                window.focus();
                if (n.link_url) {
                  window.location.hash = n.link_url;
                }
                notif.close();
              };
            } catch (_e) {
              // ignore
            }
          }
        }
      }
    });
    return unsubscribe;
  }, [qc, soundOn]);

  // Track unread count for badge animation
  useEffect(() => {
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem("notif_sound", next ? "on" : "off");
    } catch (_e) { /* ignore */ }
    if (next) playChime();
  };

  const requestDesktopPermission = async () => {
    if (typeof Notification === "undefined") {
      toast.error("Desktop notifications are not supported in this browser.");
      return;
    }
    const result = await Notification.requestPermission();
    setPushPermission(result);
    if (result === "granted") {
      toast.success("Desktop notifications enabled — you'll see alerts even when the tab is in the background.");
    } else if (result === "denied") {
      toast.error("Desktop notifications were blocked. You can enable them in your browser settings.");
    }
  };

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg text-slate-500 hover:text-[#e20404] hover:bg-slate-100 transition-colors">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-[#e20404] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 animate-pulse">
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
          <div className="flex items-center gap-1">
            <button
              onClick={toggleSound}
              title={soundOn ? "Sound on" : "Sound off"}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-[#e20404] hover:text-[#c00303]"
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark all
              </Button>
            )}
          </div>
        </div>

        {/* Desktop notification enable prompt */}
        {pushPermission !== "granted" && (
          <button
            onClick={requestDesktopPermission}
            className="w-full flex items-center gap-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-medium border-b border-amber-100 transition-colors"
          >
            <BellRing className="w-3.5 h-3.5 flex-shrink-0" />
            Enable desktop notifications
          </button>
        )}

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
                          <Link to={n.link_url} onClick={() => { markReadMutation.mutate(n.id); setOpen(false); }}>
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