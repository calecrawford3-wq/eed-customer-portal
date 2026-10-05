import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "./utils";
import {
  ChevronLeft,
  ChevronRight,
  ScanLine,
  Menu,
  X,
} from "lucide-react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import usePushNotifications from "@/hooks/usePushNotifications";
import NotificationBell from "@/components/NotificationBell";
import GlobalSearch from "@/components/GlobalSearch";
import GlobalBarcodeListener from "@/components/GlobalBarcodeListener";
import NavSidebar from "@/components/NavSidebar";

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Register push notification service worker globally on all admin pages
  usePushNotifications();

  // On the Build Workflow page the nav sidebar is hidden on desktop and revealed on hover.
  const isWorkflow = currentPageName === "BuildWorkflow" || currentPageName === "MachiningStation";
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const hoverTimerRef = useRef(null);
  const enterSidebar = () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); setSidebarHovered(true); };
  const leaveSidebar = () => { hoverTimerRef.current = setTimeout(() => setSidebarHovered(false), 250); };



  return (
    <div className="min-h-screen bg-slate-50 flex overflow-x-hidden">
      <GlobalBarcodeListener />
      <GlobalSearch />
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}
      {/* Hover trigger to reveal the hidden sidebar on the Build Workflow page (desktop only) */}
      {isWorkflow && (
        <div
          className="hidden md:block fixed left-0 top-0 h-full w-3 z-50"
          onMouseEnter={enterSidebar}
          onMouseLeave={leaveSidebar}
        />
      )}
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-full bg-slate-900 text-white transition-all duration-300 z-50 flex flex-col w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          isWorkflow
            ? (sidebarHovered ? "md:translate-x-0" : "md:-translate-x-full")
            : "md:translate-x-0",
          collapsed && "md:w-16"
        )}
        onMouseEnter={isWorkflow ? enterSidebar : undefined}
        onMouseLeave={isWorkflow ? leaveSidebar : undefined}
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
        <NavSidebar
          currentPageName={currentPageName}
          collapsed={collapsed}
          onNavigate={() => setMobileOpen(false)}
        />

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
          isWorkflow ? "md:ml-0" : (collapsed ? "md:ml-16" : "md:ml-64")
        )}
      >
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 bg-slate-900 text-white flex items-center justify-between px-4 h-14 border-b border-slate-800 print:hidden">
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
        {/* Desktop sticky bar — hidden on Build Workflow (full-screen dark mode); Back button shown on non-Dashboard pages */}
        {!isWorkflow && (
          <div className="hidden md:flex sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-slate-100 px-4 md:px-8 h-12 items-center justify-between print:hidden">
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(createPageUrl("BarcodeScan"))}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-[#e20404] hover:border-slate-300 transition-colors text-sm"
              >
                <ScanLine className="w-4 h-4" />
                <span className="hidden lg:inline">Scan</span>
              </button>
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
          </div>
        )}
        {children}
      </main>
    </div>
  );
}