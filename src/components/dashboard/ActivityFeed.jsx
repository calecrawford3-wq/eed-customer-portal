import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wrench,
  Receipt,
  ShoppingCart,
  Users,
  Clock,
  ArrowRight,
} from "lucide-react";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default function ActivityFeed({ builds, invoices, purchaseOrders, customers, isLoading }) {
  const activities = useMemo(() => {
    const items = [];

    builds.forEach((b) => {
      items.push({
        id: `build-${b.id}`,
        date: b.updated_date || b.created_date,
        icon: Wrench,
        color: "bg-[#e20404]/10 text-[#e20404]",
        title: `${b.build_number || b.engine_serial_number || "Build"} → ${b.status?.replace("_", " ")}`,
        link: `/BuildDetail?id=${b.id}`,
      });
    });

    invoices.forEach((inv) => {
      items.push({
        id: `inv-${inv.id}`,
        date: inv.updated_date || inv.created_date,
        icon: Receipt,
        color: "bg-amber-100 text-amber-700",
        title: `${inv.invoice_number || "Invoice"} · ${inv.status}`,
        link: `/InvoiceDetail?id=${inv.id}`,
      });
    });

    purchaseOrders.forEach((po) => {
      items.push({
        id: `po-${po.id}`,
        date: po.updated_date || po.created_date,
        icon: ShoppingCart,
        color: "bg-blue-100 text-blue-700",
        title: `PO ${po.po_number} · ${po.status}`,
        link: `/PurchaseOrderDetail?id=${po.id}`,
      });
    });

    customers.forEach((c) => {
      items.push({
        id: `cust-${c.id}`,
        date: c.created_date,
        icon: Users,
        color: "bg-emerald-100 text-emerald-700",
        title: `New customer: ${c.first_name} ${c.last_name}`,
        link: `/CustomerDetail?id=${c.id}`,
      });
    });

    return items
      .filter((a) => a.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 12);
  }, [builds, invoices, purchaseOrders, customers]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No recent activity</p>
        ) : (
          <div className="space-y-1">
            {activities.map((a) => (
              <Link
                key={a.id}
                to={a.link}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className={`${a.color} p-1.5 rounded-lg shrink-0`}>
                  <a.icon className="w-3.5 h-3.5" />
                </div>
                <p className="text-sm text-slate-700 flex-1 truncate">{a.title}</p>
                <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" />
                  {timeAgo(a.date)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}