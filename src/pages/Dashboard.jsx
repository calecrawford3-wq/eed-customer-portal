import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Layers,
  FileText,
  Wrench,
  FolderOpen,
  ArrowRight,
  Clock,
  AlertCircle,
  Users,
  Receipt,
  Package,
  ClipboardList
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: platforms = [], isLoading: loadingPlatforms } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const { data: specSheets = [], isLoading: loadingSpecs } = useQuery({
    queryKey: ["specSheets"],
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 100),
  });

  const { data: builds = [], isLoading: loadingBuilds } = useQuery({
    queryKey: ["builds"],
    queryFn: () => base44.entities.EngineBuild.list("-created_date", 100),
  });

  const { data: documents = [], isLoading: loadingDocs } = useQuery({
    queryKey: ["documents"],
    queryFn: () => base44.entities.TechnicalDocument.list("-created_date", 100),
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

  const activeBuilds = builds.filter(b => !["complete", "shipped"].includes(b.status));
  const recentBuilds = builds.slice(0, 5);

  const outstandingBalance = invoices
    .filter(i => ["sent","partial","overdue"].includes(i.status))
    .reduce((sum, i) => sum + (i.balance_due || i.total || 0), 0);
  const lowStockCount = parts.filter(p => p.quantity_on_hand <= p.reorder_point && p.reorder_point > 0).length;

  const stats = [
    { label: "Active Builds", value: activeBuilds.length, icon: Wrench, color: "bg-[#e20404]", page: "Builds" },
    { label: "Customers", value: customers.length, icon: Users, color: "bg-blue-500", page: "Customers" },
    { label: "Outstanding", value: `$${outstandingBalance.toLocaleString("en-US", {minimumFractionDigits: 0})}`, icon: Receipt, color: "bg-amber-500", page: "Invoices" },
    { label: "Low Stock Parts", value: lowStockCount, icon: Package, color: lowStockCount > 0 ? "bg-red-500" : "bg-emerald-500", page: "Inventory" },
  ];

  const isLoading = loadingPlatforms || loadingSpecs || loadingBuilds || loadingDocs;

  const statusColors = {
    planning: "bg-slate-100 text-slate-700",
    in_progress: "bg-blue-100 text-blue-700",
    assembly: "bg-[#e20404]/10 text-amber-700",
    testing: "bg-purple-100 text-purple-700",
    complete: "bg-emerald-100 text-emerald-700",
    shipped: "bg-slate-100 text-slate-500"
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-slate-500 mt-1">Engine specification vault overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <Link key={stat.label} to={createPageUrl(stat.page)}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                    {isLoading ? (
                      <Skeleton className="h-9 w-16 mt-1" />
                    ) : (
                      <p className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</p>
                    )}
                  </div>
                  <div className={`${stat.color} p-3 rounded-xl`}>
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Builds */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Recent Builds</CardTitle>
              <Link
                to={createPageUrl("Builds")}
                className="text-sm text-[#e20404] hover:text-[#c00303] flex items-center gap-1"
              >
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loadingBuilds ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentBuilds.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Wrench className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>No builds yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentBuilds.map((build) => {
                  const platform = platforms.find(p => p.id === build.platform_id);
                  return (
                    <Link
                      key={build.id}
                      to={createPageUrl(`BuildDetail?id=${build.id}`)}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{build.build_number}</p>
                        <p className="text-sm text-slate-500">
                          {platform?.name || "Unknown Platform"} • {build.application || "No application"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {build.overrides?.length > 0 && (
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                        )}
                        <Badge className={statusColors[build.status]}>
                          {build.status?.replace("_", " ")}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              to={createPageUrl("Platforms")}
              className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 hover:border-[#e20404]/30 hover:bg-[#e20404]/5 transition-all"
            >
              <div className="bg-blue-100 p-3 rounded-lg">
                <Layers className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Add Engine Platform</p>
                <p className="text-sm text-slate-500">Create a new platform configuration</p>
              </div>
            </Link>
            
            <Link
              to={createPageUrl("SpecSheets")}
              className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 hover:border-[#e20404]/30 hover:bg-[#e20404]/5 transition-all"
            >
              <div className="bg-emerald-100 p-3 rounded-lg">
                <FileText className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Create Spec Sheet</p>
                <p className="text-sm text-slate-500">Define specifications for a platform</p>
              </div>
            </Link>
            
            <Link
              to={createPageUrl("Builds")}
              className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 hover:border-[#e20404]/30 hover:bg-[#e20404]/5 transition-all"
            >
              <div className="bg-[#e20404]/10 p-3 rounded-lg">
                <Wrench className="w-5 h-5 text-[#e20404]" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Start New Build</p>
                <p className="text-sm text-slate-500">Begin a new engine build project</p>
              </div>
            </Link>
            
            <Link
              to={createPageUrl("Documents")}
              className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 hover:border-[#e20404]/30 hover:bg-[#e20404]/5 transition-all"
            >
              <div className="bg-purple-100 p-3 rounded-lg">
                <FolderOpen className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Upload Document</p>
                <p className="text-sm text-slate-500">Add manuals, diagrams, or charts</p>
              </div>
            </Link>

            <Link
              to={createPageUrl("Estimates")}
              className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 hover:border-[#e20404]/30 hover:bg-[#e20404]/5 transition-all"
            >
              <div className="bg-amber-100 p-3 rounded-lg">
                <ClipboardList className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">New Estimate</p>
                <p className="text-sm text-slate-500">Create and send an estimate to a customer</p>
              </div>
            </Link>

            <Link
              to={createPageUrl("Inventory")}
              className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 hover:border-[#e20404]/30 hover:bg-[#e20404]/5 transition-all"
            >
              <div className="bg-slate-100 p-3 rounded-lg">
                <Package className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Manage Inventory</p>
                <p className="text-sm text-slate-500">Track parts and stock levels</p>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}