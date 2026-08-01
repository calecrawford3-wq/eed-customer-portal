import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { Monitor, Wrench, Users, Receipt, Package } from "lucide-react";
import DashboardStats from "@/components/dashboard/DashboardStats";
import ActionItemsRow from "@/components/dashboard/ActionItemsRow";
import RecentBuilds from "@/components/dashboard/RecentBuilds";
import QuickActions from "@/components/dashboard/QuickActions";

export default function Dashboard() {
  const qc = useQueryClient();

  const { data: platforms = [], isLoading: loadingPlatforms } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });
  const { data: builds = [], isLoading: loadingBuilds } = useQuery({
    queryKey: ["builds"],
    queryFn: () => base44.entities.EngineBuild.list("-created_date", 100),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 100),
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list("-created_date", 100),
  });
  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 100),
  });
  const { data: refreshRequests = [] } = useQuery({
    queryKey: ["refreshRequests"],
    queryFn: () => base44.entities.RefreshRequest.list("-created_date", 50),
  });
  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["purchaseOrders"],
    queryFn: () => base44.entities.PurchaseOrder.list("-created_date", 100),
    staleTime: 0,
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => base44.entities.Expense.list("-date", 200),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-created_date", 100),
  });

  const expenseMutation = useMutation({
    mutationFn: (data) => base44.entities.Expense.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
    },
  });

  const handleExpensePO = async (po) => {
    const supplier = suppliers.find((s) => s.id === po.supplier_id);
    const lineTotal = (po.line_items || []).reduce((s, l) => s + (l.total || 0), 0);
    const totalCost = lineTotal + (po.shipping_cost || 0);
    const desc = (po.line_items || []).map((l) => l.description || l.part_number).filter(Boolean).join(", ");
    await expenseMutation.mutateAsync({
      expense_number: `EXP-${po.po_number}`,
      category: "parts_cogs",
      description: `PO ${po.po_number}${desc ? `: ${desc.substring(0, 80)}` : ""}`,
      vendor: supplier?.name || "",
      amount: totalCost,
      tax_amount: 0,
      date: po.received_date || new Date().toISOString().split("T")[0],
      payment_method: "other",
      is_deductible: true,
      notes: `Auto-expensed from Purchase Order ${po.po_number}`,
      source: "purchase_order",
      po_id: po.id,
    });
  };

  // Derived values
  const pendingRefreshes = refreshRequests.filter((r) => r.status === "pending");
  const openPOs = purchaseOrders.filter((po) => ["sent", "acknowledged", "ready", "partial"].includes(po.status));
  const pendingExpensePOs = purchaseOrders.filter(
    (po) => (po.status === "received" || po.status === "partial") && !expenses.find((e) => e.po_id === po.id)
  );
  const activeBuilds = builds.filter((b) => !["complete", "shipped"].includes(b.status));
  const outstandingBalance = invoices
    .filter((i) => ["sent", "partial", "overdue"].includes(i.status))
    .reduce((sum, i) => sum + (i.balance_due || i.total || 0), 0);
  const lowStockCount = parts.filter((p) => p.quantity_on_hand <= p.reorder_point && p.reorder_point > 0).length;

  const stats = [
    { label: "Active Builds", value: activeBuilds.length, icon: Wrench, color: "bg-[#e20404]", page: "Builds" },
    { label: "Customers", value: customers.length, icon: Users, color: "bg-blue-500", page: "Customers" },
    {
      label: "Outstanding",
      value: `$${outstandingBalance.toLocaleString("en-US", { minimumFractionDigits: 0 })}`,
      icon: Receipt,
      color: "bg-amber-500",
      page: "Invoices",
    },
    {
      label: "Low Stock Parts",
      value: lowStockCount,
      icon: Package,
      color: lowStockCount > 0 ? "bg-red-500" : "bg-emerald-500",
      page: "Inventory",
    },
  ];

  const isLoading = loadingPlatforms || loadingBuilds;

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-slate-500 mt-1">Engine specification vault overview</p>
        </div>
        <a
          href={createPageUrl("ShopDisplay")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Monitor className="w-4 h-4" />
          Shop Display
        </a>
      </div>

      {/* Stats Grid */}
      <DashboardStats stats={stats} isLoading={isLoading} />

      {/* Action Items Row */}
      <ActionItemsRow
        openPOs={openPOs}
        pendingRefreshes={pendingRefreshes}
        pendingExpensePOs={pendingExpensePOs}
        suppliers={suppliers}
        onExpensePO={handleExpensePO}
        expensePending={expenseMutation.isPending}
      />

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <RecentBuilds builds={builds} platforms={platforms} isLoading={loadingBuilds} />
        <QuickActions />
      </div>
    </div>
  );
}