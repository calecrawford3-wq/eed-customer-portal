import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import {
  Gauge,
  FileText,
  Layers,
  Wrench,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Users,
  Receipt,
  ClipboardList,
  Package,
  Truck,
  ShoppingCart,
  Settings2,
  DollarSign,
  TrendingDown,
  BarChart2,
  RefreshCw,
  Award
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

export default function Layout({ children, currentPageName }) {
  const [collapsed, setCollapsed] = useState(false);

  const { data: refreshRequests = [] } = useQuery({
    queryKey: ["refreshRequests"],
    queryFn: () => base44.entities.RefreshRequest.list("-created_date", 50),
  });
  const pendingRefreshCount = refreshRequests.filter(r => r.status === "pending").length;

  const navigation = [
    { name: "Dashboard", page: "Dashboard", icon: Gauge },
    { name: "Customers", page: "Customers", icon: Users },
    { name: "Estimates", page: "Estimates", icon: ClipboardList },
    { name: "Invoices", page: "Invoices", icon: Receipt },
    { type: "divider" },
    { name: "Engine Builds", page: "Builds", icon: Wrench },
    { name: "Platforms", page: "Platforms", icon: Layers },
    { name: "Spec Sheets", page: "SpecSheets", icon: FileText },
    { name: "Documents", page: "Documents", icon: FolderOpen },
    { name: "Shop Display", page: "ShopDisplay", icon: Monitor },
    { type: "divider" },
    { name: "Inventory", page: "Inventory", icon: Package },
    { name: "Suppliers", page: "Suppliers", icon: Truck },
    { name: "Purchase Orders", page: "PurchaseOrders", icon: ShoppingCart },
    { type: "divider" },
    { name: "Payments", page: "Payments", icon: DollarSign },
    { name: "Expenses", page: "Expenses", icon: TrendingDown },
    { name: "Reports", page: "Reports", icon: BarChart2 },
    { type: "divider" },
    { name: "Credits", page: "Credits", icon: Award },
    { name: "Refresh Requests", page: "RefreshRequests", icon: RefreshCw, badge: true },
    { name: "Settings", page: "Settings", icon: Settings2 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-full bg-slate-900 text-white transition-all duration-300 z-50 flex flex-col",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-2 border-b border-slate-800">
          <div className="flex items-center justify-center w-full">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png" 
              alt="Elite Engine Development" 
              className={collapsed ? "h-6 object-contain" : "h-10 object-contain max-w-full"}
            />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navigation.map((item, idx) => {
            if (item.type === "divider") {
              return !collapsed ? <div key={idx} className="border-t border-slate-700 my-2 mx-1" /> : <div key={idx} className="border-t border-slate-700 my-2" />;
            }
            const isActive = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                  isActive
                    ? "bg-[#e20404] text-white font-medium"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <item.icon className={cn("w-5 h-5 flex-shrink-0", collapsed && "mx-auto")} />
                {!collapsed && <span className="text-sm flex-1">{item.name}</span>}
                {!collapsed && item.badge && pendingRefreshCount > 0 && (
                  <span className="bg-[#e20404] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {pendingRefreshCount}
                  </span>
                )}
                {collapsed && item.badge && pendingRefreshCount > 0 && (
                  <span className="absolute top-1 right-1 bg-[#e20404] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {pendingRefreshCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse Button */}
        <div className="p-3 border-t border-slate-800">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            {!collapsed && <span className="text-sm">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 transition-all duration-300",
          collapsed ? "ml-16" : "ml-64"
        )}
      >
        {children}
      </main>
    </div>
  );
}