import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { Monitor, Wrench, Users, Receipt, Package, ShoppingCart, TrendingDown, Settings2, ArrowRight, LogOut } from "lucide-react";
import { Link } from 'react-router-dom';
import {AppLauncher} from '@/components/navigation/AppLauncher';
import StaffSignOut from '@/components/hr/StaffSignOut';
import DashboardStats from "@/components/dashboard/DashboardStats";
import ActionItemsRow from "@/components/dashboard/ActionItemsRow";
import RecentBuilds from "@/components/dashboard/RecentBuilds";
import QuickActions from "@/components/dashboard/QuickActions";
import TodayWorkPanel from "@/components/dashboard/TodayWorkPanel";
import BuildPipeline from "@/components/dashboard/BuildPipeline";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import RevenueInsights from "@/components/dashboard/RevenueInsights";
import EngineCheckInModal from "@/components/engines/EngineCheckInModal";
import PageHeader from "@/components/PageHeader";
import TodayAlertsBar from "@/components/dashboard/TodayAlertsBar";
import OwnerExceptionQueue from "@/components/dashboard/OwnerExceptionQueue";
import AutomationSummaryCard from "@/components/dashboard/AutomationSummaryCard";
import { formatMoney } from "@/lib/money";

export default function Dashboard() {
  const qc = useQueryClient();
  const [checkInOpen, setCheckInOpen] = useState(false);

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
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
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
      value: formatMoney(outstandingBalance),
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
  const poCounts = Object.fromEntries(['sent','acknowledged','ready'].map(status=>[status,purchaseOrders.filter(po=>po.status===status).length]));
  const headlineCards = [
    {label:'Builds in progress',value:activeBuilds.length,icon:Wrench,to:'/Builds',color:'text-red-600 bg-red-50'},
    {label:'POs sent',value:poCounts.sent,icon:ShoppingCart,to:'/PurchaseOrders',color:'text-blue-600 bg-blue-50'},
    {label:'POs acknowledged',value:poCounts.acknowledged,icon:ShoppingCart,to:'/PurchaseOrders',color:'text-violet-600 bg-violet-50'},
    {label:'POs ready',value:poCounts.ready,icon:Package,to:'/PurchaseOrders',color:'text-teal-600 bg-teal-50'},
    {label:'POs to expense',value:pendingExpensePOs.length,icon:TrendingDown,to:'/Expenses',color:'text-amber-600 bg-amber-50'},
    {label:'Outstanding invoices',value:formatMoney(outstandingBalance),icon:Receipt,to:'/Invoices',color:'text-emerald-600 bg-emerald-50'},
    {label:'Low stock parts',value:lowStockCount,icon:Package,to:'/Inventory',color:'text-orange-600 bg-orange-50'},
    {label:'Refresh requests',value:pendingRefreshes.length,icon:Users,to:'/RefreshRequests',color:'text-indigo-600 bg-indigo-50'},
  ];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-900">Today at Elite</h1><p className="text-sm text-slate-500">Your shop at a glance</p></div>
        <div className="flex gap-2 items-center"><Link to="/Settings" aria-label="Settings" title="Settings" className="inline-flex items-center justify-center h-11 w-11 rounded-xl border bg-white hover:bg-slate-100"><Settings2 className="h-5 w-5"/></Link><StaffSignOut/></div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" aria-label="Shop overview">
        {headlineCards.map(card=><Link key={card.label} to={card.to} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
          <span className={'inline-flex p-2 rounded-xl mb-3 '+card.color}><card.icon className="h-5 w-5"/></span>
          <div className="text-2xl font-bold text-slate-900">{isLoading?'…':card.value}</div>
          <div className="text-xs sm:text-sm text-slate-500 mt-1">{card.label}</div>
        </Link>)}
      </div>
      <div className="mb-7"><AppLauncher/></div>
      <TodayAlertsBar />
      <details className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold text-slate-800">Detailed work queue, alerts & reports</summary>
        <div className="mt-5">

      {/* Owner exception queue — triage inline without leaving Today */}
      <OwnerExceptionQueue />

      {/* Today's Work — guided lifecycle action list */}
      <TodayWorkPanel builds={builds} invoices={invoices} customers={customers} platforms={platforms} />

      {/* Quick Actions */}
      <QuickActions onCheckIn={() => setCheckInOpen(true)} />

      <EngineCheckInModal open={checkInOpen} onClose={() => setCheckInOpen(false)} />

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

      {/* Insights Row: Revenue + Build Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
        <RevenueInsights invoices={invoices} customers={customers} isLoading={loadingBuilds} />
        <BuildPipeline builds={builds} isLoading={loadingBuilds} />
      </div>

      {/* Recent Activity Feed + Recent Builds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
        <ActivityFeed
          builds={builds}
          invoices={invoices}
          purchaseOrders={purchaseOrders}
          customers={customers}
          isLoading={loadingBuilds}
        />
        <RecentBuilds builds={builds} platforms={platforms} isLoading={loadingBuilds} />
      </div>

      {/* Automation activity — recent run summaries with safe retry */}
      <AutomationSummaryCard />
      </div></details>

    </div>
  );
}