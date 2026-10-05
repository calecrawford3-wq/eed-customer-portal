import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import {
  Gauge, FileText, Layers, Wrench, FolderOpen, ChevronDown,
  Users, Receipt, ClipboardList, Package, Truck, ShoppingCart,
  ListChecks, Settings2, Sparkles, DollarSign, TrendingDown,
  BarChart2, RefreshCw, Award, LifeBuoy, Calendar, MessageSquare,
  ClipboardCheck, FlaskConical, Boxes, Briefcase, ShieldCheck, Monitor,
} from "lucide-react";

/**
 * Simplified sidebar navigation.
 *
 * Seven primary sections (Today, Jobs, Customers, Inventory, Purchasing,
 * Billing, Inbox) each show a single main destination; secondary pages are
 * revealed when the section is expanded. Settings sits at the bottom, and a
 * collapsed Tools section holds R&D plus the searchable document library.
 *
 * The section containing the current page auto-expands. Every existing page
 * remains reachable — this is a reorganization, not a removal.
 */
const navSections = [
  {
    label: "Today",
    icon: Gauge,
    main: { name: "Work Queue", page: "Dashboard" },
    secondary: [
      { name: "Exceptions", page: "ExceptionDashboard", icon: ShieldCheck, badge: "exceptions" },
      { name: "Calendar", page: "Calendar", icon: Calendar },
      { name: "Shop Display", page: "ShopDisplay", icon: Monitor },
    ],
  },
  {
    label: "Jobs",
    icon: Briefcase,
    main: { name: "All Jobs", page: "Jobs" },
    secondary: [
      {
        submenu: "Workstations",
        items: [
          { name: "Build Workflow", page: "BuildWorkflow", icon: ListChecks },
          { name: "Machining Station", page: "MachiningStation", icon: Wrench },
        ],
      },
    ],
  },
  {
    label: "Customers",
    icon: Users,
    main: { name: "Customers", page: "Customers" },
    secondary: [
      { name: "Customer Success", page: "CustomerSuccess", icon: LifeBuoy },
      { name: "Refresh Requests", page: "RefreshRequests", icon: RefreshCw, badge: "refresh" },
    ],
  },
  {
    label: "Inventory",
    icon: Package,
    main: { name: "Inventory", page: "Inventory" },
    secondary: [],
  },
  {
    label: "Purchasing",
    icon: ShoppingCart,
    main: { name: "Purchase Orders", page: "PurchaseOrders" },
    secondary: [
      { name: "Suppliers", page: "Suppliers", icon: Truck },
    ],
  },
  {
    label: "Billing",
    icon: Receipt,
    main: { name: "Invoices", page: "Invoices" },
    secondary: [
      { name: "Estimates", page: "Estimates", icon: ClipboardList },
      { name: "Approvals", page: "Approvals", icon: ClipboardCheck, badge: "approvals" },
      { name: "Payments", page: "Payments", icon: DollarSign },
      { name: "Credits", page: "Credits", icon: Award },
      { name: "Expenses", page: "Expenses", icon: TrendingDown },
      { name: "Reports", page: "Reports", icon: BarChart2 },
    ],
  },
  {
    label: "Inbox",
    icon: MessageSquare,
    main: { name: "Inbox", page: "Communications", badge: "messages" },
    secondary: [],
  },
  {
    label: "Settings",
    icon: Settings2,
    main: { name: "Settings", page: "Settings" },
    secondary: [
      { name: "Platforms", page: "Platforms", icon: Layers },
      { name: "Spec Sheets", page: "SpecSheets", icon: FileText },
      { name: "Canned Jobs", page: "CannedJobs", icon: Boxes },
      { name: "Addons", page: "Addons", icon: Sparkles },
      { name: "Replacement Rules", page: "ReplacementRules", icon: Wrench },
    ],
    bottom: true,
  },
  {
    label: "Tools",
    icon: FlaskConical,
    main: null,
    secondary: [
      { name: "R&D Developer", page: "RnDEngineDeveloper", icon: FlaskConical },
      { name: "Document Library", page: "Documents", icon: FolderOpen },
    ],
    bottom: true,
  },
];

function sectionPages(section) {
  const pages = [];
  if (section.main) pages.push(section.main.page);
  section.secondary.forEach((s) => {
    if (s.submenu) s.items.forEach((i) => pages.push(i.page));
    else pages.push(s.page);
  });
  return pages;
}

const formatCount = (n) => (n > 99 ? "99+" : String(n));

export default function NavSidebar({ currentPageName, collapsed, onNavigate }) {
  const [expandedSections, setExpandedSections] = useState(() => new Set());
  const [expandedSubmenus, setExpandedSubmenus] = useState(() => new Set());

  // Actionable-count badges only (messages, approvals, refresh requests, exceptions)
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

  const toggleSection = (label) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const toggleSubmenu = (key) => {
    setExpandedSubmenus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isSectionExpanded = (section) => {
    if (sectionPages(section).includes(currentPageName)) return true;
    return expandedSections.has(section.label);
  };

  // Collapsed icon-rail: one icon per section, linking to its main (or first secondary) page.
  if (collapsed) {
    return (
      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        {navSections.map((section, idx) => {
          const targetPage = section.main ? section.main.page : section.secondary[0]?.page;
          if (!targetPage) return null;
          const isSectionActive = sectionPages(section).includes(currentPageName);
          const badgeKey = section.main?.badge;
          const count = badgeKey ? badgeFor(badgeKey) : 0;
          return (
            <div key={section.label} className={cn("mb-1", section.bottom && idx === navSections.findIndex((s) => s.bottom) && "mt-4 pt-2 border-t border-slate-800")}>
              <Link
                to={createPageUrl(targetPage)}
                onClick={onNavigate}
                className={cn(
                  "relative flex items-center justify-center py-2.5 rounded-lg transition-all duration-200",
                  isSectionActive ? "bg-[#e20404] text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
                title={section.label}
              >
                <section.icon className="w-5 h-5 flex-shrink-0" />
                {count > 0 && (
                  <span className="absolute top-1 right-1 bg-[#e20404] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex-1 py-3 px-3 overflow-y-auto">
      {navSections.map((section, idx) => {
        const pages = sectionPages(section);
        const isMainActive = section.main && currentPageName === section.main.page;
        const isSectionActive = pages.includes(currentPageName);
        const expanded = isSectionExpanded(section);
        const hasSecondary = section.secondary.length > 0;
        const mainBadgeCount = section.main?.badge ? badgeFor(section.main.badge) : 0;

        return (
          <div
            key={section.label}
            className={cn("mb-1", section.bottom && idx === navSections.findIndex((s) => s.bottom) && "mt-4 pt-2 border-t border-slate-800")}
          >
            {/* Section row */}
            {section.main ? (
              <Link
                to={createPageUrl(section.main.page)}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                  isMainActive ? "bg-[#e20404] text-white font-medium" : isSectionActive ? "text-white hover:bg-slate-800" : "text-slate-200 hover:text-white hover:bg-slate-800"
                )}
              >
                <section.icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm flex-1">{section.main.name}</span>
                {mainBadgeCount > 0 && (
                  <span className="bg-[#e20404] text-white text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center font-bold">
                    {formatCount(mainBadgeCount)}
                  </span>
                )}
                {hasSecondary && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSection(section.label); }}
                    className="p-0.5 text-slate-400 hover:text-white"
                    aria-label={expanded ? "Collapse" : "Expand"}
                  >
                    <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
                  </button>
                )}
              </Link>
            ) : (
              <button
                onClick={() => toggleSection(section.label)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                  isSectionActive ? "bg-[#e20404] text-white font-medium" : "text-slate-200 hover:text-white hover:bg-slate-800"
                )}
              >
                <section.icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm flex-1 text-left">{section.label}</span>
                {hasSecondary && (
                  <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", expanded && "rotate-180")} />
                )}
              </button>
            )}

            {/* Secondary items */}
            {expanded && hasSecondary && (
              <div className="mt-0.5 ml-3 pl-3 border-l border-slate-700/60 space-y-0.5">
                {section.secondary.map((item, sIdx) => {
                  if (item.submenu) {
                    const subKey = section.label + ":" + item.submenu;
                    const subExpanded = expandedSubmenus.has(subKey) || item.items.some((i) => i.page === currentPageName);
                    return (
                      <div key={sIdx}>
                        <button
                          onClick={() => toggleSubmenu(subKey)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          <span className="flex-1 text-left">{item.submenu}</span>
                          <ChevronDown className={cn("w-3 h-3 transition-transform", subExpanded && "rotate-180")} />
                        </button>
                        {subExpanded && (
                          <div className="space-y-0.5 ml-3 pl-3 border-l border-slate-700/40">
                            {item.items.map((sub) => {
                              const active = currentPageName === sub.page;
                              return (
                                <Link
                                  key={sub.page}
                                  to={createPageUrl(sub.page)}
                                  onClick={onNavigate}
                                  className={cn(
                                    "flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors",
                                    active ? "bg-[#e20404] text-white font-medium" : "text-slate-400 hover:text-white hover:bg-slate-800"
                                  )}
                                >
                                  <sub.icon className="w-4 h-4 flex-shrink-0" />
                                  <span className="flex-1">{sub.name}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }
                  const active = currentPageName === item.page;
                  const itemBadgeCount = item.badge ? badgeFor(item.badge) : 0;
                  return (
                    <Link
                      key={item.page}
                      to={createPageUrl(item.page)}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors",
                        active ? "bg-[#e20404] text-white font-medium" : "text-slate-400 hover:text-white hover:bg-slate-800"
                      )}
                    >
                      {item.icon && <item.icon className="w-4 h-4 flex-shrink-0" />}
                      <span className="flex-1">{item.name}</span>
                      {itemBadgeCount > 0 && (
                        <span className="bg-[#e20404] text-white text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center font-bold">
                          {formatCount(itemBadgeCount)}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}