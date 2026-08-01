import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, AlertTriangle, ArrowRight } from "lucide-react";

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isLastMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
}

export default function RevenueInsights({ invoices, customers, isLoading }) {
  const data = useMemo(() => {
    const paid = invoices.filter((i) => i.status === "paid");
    const outstanding = invoices.filter((i) => ["sent", "partial", "overdue"].includes(i.status));
    const overdue = invoices.filter((i) => i.status === "overdue");

    const thisMonthRevenue = paid
      .filter((i) => isThisMonth(i.issue_date || i.updated_date))
      .reduce((sum, i) => sum + (i.total || 0), 0);

    const lastMonthRevenue = paid
      .filter((i) => isLastMonth(i.issue_date || i.updated_date))
      .reduce((sum, i) => sum + (i.total || 0), 0);

    const outstandingTotal = outstanding.reduce((sum, i) => sum + (i.balance_due ?? i.total ?? 0), 0);
    const overdueTotal = overdue.reduce((sum, i) => sum + (i.balance_due ?? i.total ?? 0), 0);

    const trendPct = lastMonthRevenue > 0
      ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : thisMonthRevenue > 0 ? 100 : 0;

    // Top-paying customers (by total paid across all invoices)
    const custMap = {};
    paid.forEach((inv) => {
      const cid = inv.customer_id;
      if (!cid) return;
      custMap[cid] = (custMap[cid] || 0) + (inv.total || 0);
    });
    const topCustomers = Object.entries(custMap)
      .map(([cid, total]) => ({
        name: getCustomerName(cid, customers),
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    return { thisMonthRevenue, outstandingTotal, overdueTotal, overdueCount: overdue.length, trendPct, topCustomers };
  }, [invoices, customers]);

  const formatMoney = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-500" /> Revenue Insights
          </CardTitle>
          <Link to="/Invoices" className="text-sm text-[#e20404] hover:text-[#c00303] flex items-center gap-1">
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* This Month Revenue */}
            <div className="bg-emerald-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Revenue This Month</p>
                {data.trendPct !== 0 && (
                  <span className={`text-xs font-bold flex items-center gap-0.5 ${data.trendPct > 0 ? "text-emerald-700" : "text-red-600"}`}>
                    <TrendingUp className={`w-3 h-3 ${data.trendPct < 0 ? "rotate-180" : ""}`} />
                    {data.trendPct > 0 ? "+" : ""}{data.trendPct}%
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-slate-900">{formatMoney(data.thisMonthRevenue)}</p>
            </div>

            {/* Outstanding + Overdue */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">Outstanding</p>
                <p className="text-lg font-bold text-slate-900">{formatMoney(data.outstandingTotal)}</p>
              </div>
              <div className={`rounded-lg p-3 ${data.overdueCount > 0 ? "bg-red-50" : "bg-slate-50"}`}>
                <p className={`text-xs font-medium uppercase tracking-wide mb-1 flex items-center gap-1 ${data.overdueCount > 0 ? "text-red-700" : "text-slate-500"}`}>
                  {data.overdueCount > 0 && <AlertTriangle className="w-3 h-3" />}
                  Overdue
                </p>
                <p className="text-lg font-bold text-slate-900">{formatMoney(data.overdueTotal)}</p>
              </div>
            </div>

            {/* Top Customers */}
            {data.topCustomers.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Top Customers</p>
                <div className="space-y-1.5">
                  {data.topCustomers.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 truncate flex-1">
                        <span className="text-slate-300 mr-2">{i + 1}.</span>
                        {c.name}
                      </span>
                      <span className="font-medium text-slate-900 ml-2">{formatMoney(c.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getCustomerName(customerId, customers) {
  const c = customers.find((x) => x.id === customerId);
  if (!c) return "Unknown";
  return c.company_name || `${c.first_name} ${c.last_name}`;
}