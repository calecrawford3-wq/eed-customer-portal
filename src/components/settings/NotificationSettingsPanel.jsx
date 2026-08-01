import React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, ClipboardList, DollarSign, Package, Truck, RefreshCw } from "lucide-react";

const NOTIF_TYPES = [
  {
    key: "notif_estimate_accepted",
    label: "Estimate Accepted",
    description: "When a customer approves an estimate",
    icon: ClipboardList,
  },
  {
    key: "notif_payment_received",
    label: "Payment Received",
    description: "When a payment is recorded against an invoice",
    icon: DollarSign,
  },
  {
    key: "notif_po_accepted",
    label: "PO Acknowledged",
    description: "When a supplier acknowledges a purchase order",
    icon: Package,
  },
  {
    key: "notif_po_ready",
    label: "PO Ready",
    description: "When a purchase order is marked ready",
    icon: Truck,
  },
  {
    key: "notif_refresh_request",
    label: "Refresh Request",
    description: "When a customer submits an engine refresh request",
    icon: RefreshCw,
  },
];

export default function NotificationSettingsPanel({ form, set }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4" /> Notification Preferences
        </CardTitle>
        <p className="text-sm text-slate-500">
          Toggle which notifications generate an in-app alert and push notification. Disabled types are silently skipped.
        </p>
      </CardHeader>
      <CardContent className="space-y-1">
        {NOTIF_TYPES.map((item) => {
          const val = form[item.key] !== undefined ? form[item.key] : true;
          return (
            <div
              key={item.key}
              className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0"
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
              <Switch checked={val} onCheckedChange={(v) => set(item.key, v)} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}