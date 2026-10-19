import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import {
  Gauge, Briefcase, MessageSquare, Receipt, MoreHorizontal,
  Search, X, ChevronRight,
  Users, Package, ShoppingCart, Settings2, LifeBuoy,
  ShieldCheck, Calendar, RefreshCw, ClipboardList, DollarSign,
  Award, TrendingDown, BarChart2, Layers, FileText, Boxes,
  Sparkles, Wrench, Monitor, ListChecks, FlaskConical, FolderOpen,
  ClipboardCheck, ScanLine,
} from "lucide-react";

/**
 * iPhone-style bottom navigation bar for mobile.  Five primary tabs:
 * Today, Jobs, Inbox, Billing, More.  The "More" tab opens a full-screen
 * sheet listing every remaining destination grouped by section.
 *
 * Badges show actionable counts (unread messages on Inbox, active
 * exceptions on Today, pending approvals on Billing).
 */
const PRIMARY_TABS = [
  { key: "Dashboard", label: "Today", icon: Gauge, badge: "exceptions" },
  { key: "Jobs", label: "Jobs", icon: Briefcase },
  { key: "Communications", label: "Inbox", icon: MessageSquare, badge: "messages" },
  { key: "Invoices", label: "Billing", icon: Receipt, badge: "approvals" },
];

const MORE_SECTIONS = [
  {
    label: "Today",
    items: [
      { name: "Exceptions", page: "ExceptionDashboard", icon: ShieldCheck, badge: "exceptions" },
      { name: "Calendar", page: "Calendar", icon: Calendar },
      { name: "Shop Display", page: "ShopDisplay", icon: Monitor },
    ],
  },
  {
    label: "Customers",
    items: [
      { name: "Customers", page: "Customers", icon: Users },
      { name: "Customer Success", page: "CustomerSuccess", icon: LifeBuoy },
      { name: "Refresh Requests", page: "RefreshRequests", icon: RefreshCw, badge: "refresh" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { name: "Inventory", page: "Inventory", icon: Package },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { name: "Purchase Orders", page: "PurchaseOrders", icon: ShoppingCart },
      { name: "Suppliers", page: "Suppliers", icon: ShoppingCart },
    ],
  },
  {
    label: "Billing",
    items: [
      { name: "Estimates", page: "Estimates", icon: ClipboardList },
      { name: "Approvals", page: "Approvals", icon: ClipboardCheck, badge: "approvals" },
      { name: "Payments", page: "Payments", icon: DollarSign },
      { name: "Credits", page: "Credits", icon: Award },
      { name: "Expenses", page: "Expenses", icon: TrendingDown },
      { name: "Reports", page: "Reports", icon: BarChart2 },
    ],
  },
  {
    label: "Workstations",
    items: [
      { name: "Build Workflow", page: "BuildWorkflow", icon: ListChecks },
      { name: "Machining Station", page: "MachiningStation", icon: Wrench },
      { name: "Barcode Scan", page: "BarcodeScan", icon: ScanLine },
    ],
  },
  {
    label: "Settings",
    items: [
      { name: "Settings", page: "Settings", icon: Settings2 },
      { name: "Platforms", page: "Platforms", icon: Layers },
      { name: "Spec Sheets", page: "SpecSheets", icon: FileText },
      { name: "Canned Jobs", page: "CannedJobs", icon: Boxes },
      { name: "Addons", page: "Addons", icon: Sparkles },
      { name: "Replacement Rules", page: "ReplacementRules", icon: Wrench },
    ],
  },
  {
    label: "Tools",
    items: [
      { name: "R&D Developer", page: "RnDEngineDeveloper", icon: FlaskConical },
      { name: "Document Library", page: "Documents", icon: FolderOpen },
    ],
  },
];

const formatCount = (n) => (n > 99 ? "99+" : String(n));

export default function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["nav-badge-messages"],
    queryFn: () => base44.entities.Message.count({ is_read: false, direction: "inbound" }),
    refetchInterval: 30000,
  });
  const { data: approvalsCount = 0 } = useQuery({
    queryKey: ["nav-badge-approvals"],
    queryFn: () => base44.entities.Estimate.count({ status: "sent" }),
  });
  const { data: refreshCount = 0 } = useQuery({
    queryKey: ["nav-badge-refresh"],
    queryFn: () => base44.entities.RefreshRequest.count({ status: "pending" }),
  });
  const { data: exceptionsCount = 0 } = useQuery({
    queryKey: ["nav-badge-exceptions"],
    queryFn: () => base44.entities.ExceptionAlert.count({ status: "active" }),
  });

  const badgeFor = (key) => {
    if (key === "messages") return unreadCount;
    if (key === "approvals") return approvalsCount;
    if (key === "refresh") return refreshCount;
    if (key === "exceptions") return exceptionsCount;
    return 0;
  };

  const isActive = (pageKey) => {
    const path = location.pathname.replace("/", "");
    return path === pageKey || path.startsWith(pageKey + "/");
  };

  const isMoreActive = () => {
    const primaryPages = PRIMARY_TABS.map((t) => t.key);
    return !primaryPages.some((p) => isActive(p));
  };

  const handleTabClick = (pageKey) => {
    navigate(createPageUrl(pageKey));
  };

  const handleMoreItemClick = (pageKey) => {
    setMoreOpen(false);
    navigate(createPageUrl(pageKey));
  };

  return (
    <>
      {/* Bottom bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 flex items-stretch print:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
      >
        {PRIMARY_TABS.map((tab) => {
          const active = isActive(tab.key);
          const count = tab.badge ? badgeFor(tab.badge) : 0;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabClick(tab.key)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 relative transition-colors",
                active ? "text-[#e20404]" : "text-slate-400 hover:text-slate-600"
              )}
              style={{ minHeight: "50px" }}
            >
              <div className="relative">
                <tab.icon className={cn("w-5 h-5", active && "stroke-[2.5]")} />
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-[#e20404] text-white text-[10px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center font-bold leading-none">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </div>
              <span className={cn("text-[10px] font-medium", active && "font-semibold")}>{tab.label}</span>
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#e20404] rounded-full" />}
            </button>
          );
        })}

        {/* More tab */}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 transition-colors",
            isMoreActive() ? "text-[#e20404]" : "text-slate-400 hover:text-slate-600"
          )}
          style={{ minHeight: "50px" }}
        >
          <MoreHorizontal className={cn("w-5 h-5", isMoreActive() && "stroke-[2.5]")} />
          <span className={cn("text-[10px] font-medium", isMoreActive() && "font-semibold")}>More</span>
          {isMoreActive() && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#e20404] rounded-full" />}
        </button>
      </nav>

      {/* More sheet — full-screen overlay */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />

          {/* Sheet */}
          <div
            className="mt-auto bg-white rounded-t-2xl flex flex-col max-h-[85vh] relative"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
          >
            {/* Drag handle */}
            <div className="pt-2 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>

            {/* Header */}
            <div className="px-4 pb-3 flex items-center justify-between border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">More</h2>
              <button
                onClick={() => setMoreOpen(false)}
                className="h-9 w-9 flex items-center justify-center -mr-2 text-slate-400 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable sections */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {MORE_SECTIONS.map((section) => (
                <div key={section.label} className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1">
                    {section.label}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = isActive(item.page);
                      const count = item.badge ? badgeFor(item.badge) : 0;
                      return (
                        <button
                          key={item.page}
                          onClick={() => handleMoreItemClick(item.page)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left",
                            active ? "bg-red-50 text-[#e20404]" : "text-slate-700 hover:bg-slate-50"
                          )}
                          style={{ minHeight: "44px" }}
                        >
                          <item.icon className={cn("w-5 h-5 flex-shrink-0", active ? "text-[#e20404]" : "text-slate-400")} />
                          <span className={cn("flex-1 text-base", active && "font-medium")}>{item.name}</span>
                          {count > 0 && (
                            <span className="bg-[#e20404] text-white text-xs rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center font-bold">
                              {formatCount(count)}
                            </span>
                          )}
                          <ChevronRight className={cn("w-4 h-4 flex-shrink-0", active ? "text-[#e20404]" : "text-slate-300")} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}