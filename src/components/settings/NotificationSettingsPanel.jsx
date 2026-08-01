import React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, ClipboardList, DollarSign, Package, Truck, RefreshCw, Wrench, AlertTriangle, Mail, FileWarning, Hand, Volume2 } from "lucide-react";

const NOTIF_TYPES = [
  {
    key: "estimate_accepted",
    label: "Estimate Accepted",
    description: "Customer approves an estimate",
    icon: ClipboardList,
    pushDefault: false,
  },
  {
    key: "payment_received",
    label: "Payment Received",
    description: "Payment recorded against an invoice",
    icon: DollarSign,
    pushDefault: false,
  },
  {
    key: "po_accepted",
    label: "PO Acknowledged",
    description: "Supplier acknowledges a purchase order",
    icon: Package,
    pushDefault: false,
  },
  {
    key: "po_ready",
    label: "PO Ready",
    description: "Purchase order is marked ready",
    icon: Truck,
    pushDefault: false,
  },
  {
    key: "refresh_request",
    label: "Refresh Request",
    description: "Customer submits an engine refresh request",
    icon: RefreshCw,
    pushDefault: true,
  },
  {
    key: "build_status_change",
    label: "Build Status Change",
    description: "Engine build marked complete or shipped",
    icon: Wrench,
    pushDefault: true,
  },
  {
    key: "low_stock",
    label: "Low Stock Alert",
    description: "Part drops at or below its reorder point",
    icon: AlertTriangle,
    pushDefault: true,
  },
  {
    key: "email_action_required",
    label: "Email Action Required",
    description: "Email thread flagged for follow-up",
    icon: Mail,
    pushDefault: true,
  },
  {
    key: "invoice_overdue",
    label: "Invoice Overdue",
    description: "Open invoice past its due date",
    icon: FileWarning,
    pushDefault: true,
  },
  {
    key: "engine_pickup_ready",
    label: "Engine Picked Up",
    description: "Customer confirms engine pickup via barcode",
    icon: Hand,
    pushDefault: true,
  },
];

export default function NotificationSettingsPanel({ form, set }) {
  const soundOn = form.notif_sound_enabled !== undefined ? form.notif_sound_enabled : true;

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4" /> Notification Preferences
          </CardTitle>
          <p className="text-sm text-slate-500">
            Control which alerts appear in the bell dropdown (In-App) and which trigger push notifications to your devices (Push). Disabled in-app types are skipped entirely.
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {/* Header row for the two-column toggle layout */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-4 px-3 pb-2 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider w-12 text-center">In-App</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider w-12 text-center">Push</span>
          </div>
          {NOTIF_TYPES.map((item) => {
            const inAppVal = form[`notif_${item.key}`] !== undefined ? form[`notif_${item.key}`] : true;
            const pushVal = form[`notif_push_${item.key}`] !== undefined ? form[`notif_push_${item.key}`] : item.pushDefault;
            return (
              <div
                key={item.key}
                className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 sm:gap-4 items-center py-3 border-b border-slate-50 last:border-0 px-3 rounded-lg hover:bg-slate-50/50"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-900">{item.label}</Label>
                    <p className="text-xs text-slate-400">{item.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <Switch checked={inAppVal} onCheckedChange={(v) => set(`notif_${item.key}`, v)} />
                </div>
                <div className="flex items-center justify-center">
                  <Switch checked={pushVal} onCheckedChange={(v) => set(`notif_push_${item.key}`, v)} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Volume2 className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-900">Notification Sound</Label>
              <p className="text-xs text-slate-400">Play a chime when a new notification arrives in real time</p>
            </div>
          </div>
          <Switch checked={soundOn} onCheckedChange={(v) => set("notif_sound_enabled", v)} />
        </CardContent>
      </Card>
    </div>
  );
}