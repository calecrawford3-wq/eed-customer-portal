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
  Settings,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Layout({ children, currentPageName }) {
  const [collapsed, setCollapsed] = useState(false);

  const navigation = [
    { name: "Dashboard", page: "Dashboard", icon: Gauge },
    { name: "Platforms", page: "Platforms", icon: Layers },
    { name: "Spec Sheets", page: "SpecSheets", icon: FileText },
    { name: "Engine Builds", page: "Builds", icon: Wrench },
    { name: "Documents", page: "Documents", icon: FolderOpen },
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
        <div className="h-16 flex items-center px-4 border-b border-slate-800">
          {!collapsed && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#e20404] rounded-lg flex items-center justify-center">
                <Gauge className="w-5 h-5 text-slate-900" />
              </div>
              <span className="font-semibold text-lg tracking-tight">SpecVault</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 bg-[#e20404] rounded-lg flex items-center justify-center mx-auto">
              <Gauge className="w-5 h-5 text-slate-900" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 px-3 space-y-1">
          {navigation.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                  isActive
                    ? "bg-[#e20404] text-slate-900 font-medium"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <item.icon className={cn("w-5 h-5 flex-shrink-0", collapsed && "mx-auto")} />
                {!collapsed && <span>{item.name}</span>}
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