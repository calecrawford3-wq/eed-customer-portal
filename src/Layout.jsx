import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "./utils";
import {
  Gauge,
  FileText,
  Layers,
  Wrench,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Users,
  Receipt,
  ClipboardList,
  Package,
  Truck,
  ShoppingCart,
  ScanLine,
  Settings2,
  DollarSign,
  TrendingDown,
  BarChart2,
  RefreshCw,
  Award,
  LifeBuoy,
  Calendar,
  MessageSquare,
  Mail,
  Menu,
  X,
  ClipboardCheck,
  FlaskConical,
  Boxes,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import usePushNotifications from "@/hooks/usePushNotifications";
import NotificationBell from "@/components/NotificationBell";
import GlobalSearch from "@/components/GlobalSearch";
import { Search } from "lucide-react";

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Register push notification service worker globally on all admin pages
  usePushNotifications();

  const { data: refreshRequests = [] } = useQuery({
    queryKey: ["refreshRequests"],
    queryFn: () => base44.entities.RefreshRequest.list("-created_date", 50),
  });
  const pendingRefreshCount = refreshRequests.filter(r => r.status === "pending").length;

  const { data: messages = [] } = useQuery({
    queryKey: ["messages-unread-count"],
    queryFn: () => base44.entities.Message.list("-sent_at", 500),
    refetchInterval: 30000,
  });
  const unreadMessageCount = messages.filter(m => !m.is_read && m.direction === "inbound").length;



  const navGroups = [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", page: "Dashboard", icon: Gauge },
      ],
    },
    {
      label: "Sales & Billing",
      items: [
        { name: "Customers", page: "Customers", icon: Users },
        { name: "Estimates", page: "Estimates", icon: ClipboardList },
        { name: "Invoices", page: "Invoices", icon: Receipt },
        { name: "Approvals", page: "Approvals", icon: ClipboardCheck },
        { name: "Payments", page: "Payments", icon: DollarSign },
      ],
    },
    {
      label: "Engine Shop",
      items: [
        { name: "Builds", page: "Builds", icon: Wrench },
        { name: "Platforms", page: "Platforms", icon: Layers },
        { name: "Spec Sheets", page: "SpecSheets", icon: FileText },
        { name: "Canned Jobs", page: "CannedJobs", icon: Boxes },
        { name: "Documents", page: "Documents", icon: FolderOpen },
      ],
    },
    {
      label: "Inventory & Procurement",
      items: [
        { name: "Inventory", page: "Inventory", icon: Package },
        { name: "Barcode Scan", page: "BarcodeScan", icon: ScanLine },
        { name: "Suppliers", page: "Suppliers", icon: Truck },
        { name: "Purchase Orders", page: "PurchaseOrders", icon: ShoppingCart },
      ],
    },
    {
      label: "Finance",
      items: [
        { name: "Expenses", page: "Expenses", icon: TrendingDown },
        { name: "Credits", page: "Credits", icon: Award },
        { name: "Reports", page: "Reports", icon: BarChart2 },
      ],
    },
    {
      label: "Communications",
      items: [
        { name: "Customer Success", page: "CustomerSuccess", icon: LifeBuoy },
        { name: "Calendar", page: "Calendar", icon: Calendar },
        { name: "Messages", page: "Messaging", icon: MessageSquare, badge: true },
        { name: "Emails", page: "Emails", icon: Mail },
      ],
    },
    {
      label: "R&D",
      items: [
        { name: "R&D Engine Developer", page: "RnDEngineDeveloper", icon: FlaskConical },
      ],
    },
    {
      label: "Admin",
      items: [
        { name: "Refresh Requests", page: "RefreshRequests", icon: RefreshCw, badge: true },
        { name: "Settings", page: "Settings", icon: Settings2 },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-x-hidden">
      <GlobalSearch />
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-full bg-slate-900 text-white transition-all duration-300 z-50 flex flex-col w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0",
          collapsed && "md:w-16"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-2 border-b border-slate-800">
          <div className="flex items-center justify-center flex-1">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png" 
              alt="Elite Engine Development" 
              className={collapsed ? "h-6 object-contain" : "h-10 object-contain max-w-full"}
            />
          </div>
          <button onClick={() => setMobileOpen(false)} className="md:hidden text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-3 overflow-y-auto">
          {navGroups.map((group, gIdx) => {
            const showHeader = !collapsed;
            return (
              <div key={gIdx} className="mb-1">
                {showHeader && (
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = currentPageName === item.page;
                    return (
                      <Link
                        key={item.page}
                        to={createPageUrl(item.page)}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                          isActive
                            ? "bg-[#e20404] text-white font-medium"
                            : "text-slate-400 hover:text-white hover:bg-slate-800"
                        )}
                      >
                        <item.icon className={cn("w-5 h-5 flex-shrink-0", collapsed && "mx-auto")} />
                        {!collapsed && <span className="text-sm flex-1">{item.name}</span>}
                        {!collapsed && item.badge && item.page === "RefreshRequests" && pendingRefreshCount > 0 && (
                          <span className="bg-[#e20404] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                            {pendingRefreshCount}
                          </span>
                        )}
                        {collapsed && item.badge && item.page === "RefreshRequests" && pendingRefreshCount > 0 && (
                          <span className="absolute top-1 right-1 bg-[#e20404] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                            {pendingRefreshCount}
                          </span>
                        )}
                        {!collapsed && item.badge && item.page === "Messaging" && unreadMessageCount > 0 && (
                          <span className="bg-[#e20404] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                            {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                          </span>
                        )}
                        {collapsed && item.badge && item.page === "Messaging" && unreadMessageCount > 0 && (
                          <span className="absolute top-1 right-1 bg-[#e20404] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                            {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Collapse Button */}
        <div className="p-3 border-t border-slate-800 hidden md:block">
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
          "flex-1 min-w-0 transition-all duration-300",
          collapsed ? "md:ml-16" : "md:ml-64"
        )}
      >
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 bg-slate-900 text-white flex items-center justify-between px-4 h-14 border-b border-slate-800">
          <button onClick={() => setMobileOpen(true)} className="text-white p-1">
            <Menu className="w-6 h-6" />
          </button>
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png" 
            alt="Elite Engine Development" 
            className="h-7 object-contain"
          />
          <NotificationBell />
        </div>
        {/* Desktop sticky bar — always visible with bell; Back button shown on non-Dashboard pages */}
        <div className="hidden md:flex sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-slate-100 px-4 md:px-8 h-12 items-center justify-between">
          {currentPageName !== "Dashboard" ? (
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-[#e20404] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={() => { const e = new KeyboardEvent("keydown", { metaKey: true, key: "k" }); document.dispatchEvent(e); }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors text-sm"
          >
            <Search className="w-4 h-4" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden lg:inline-block text-[10px] font-mono bg-slate-100 border border-slate-200 rounded px-1 py-0.5">⌘K</kbd>
          </button>
          <NotificationBell />
        </div>
        {children}
      </main>
    </div>
  );
}