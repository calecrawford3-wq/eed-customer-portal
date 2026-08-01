import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShoppingCart, RefreshCw, TrendingDown, PackageCheck, Receipt } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ActionItemsRow({ openPOs, pendingRefreshes, pendingExpensePOs, suppliers, onExpensePO, expensePending }) {
  const poStatusColors = {
    sent: "bg-blue-100 text-blue-700",
    acknowledged: "bg-purple-100 text-purple-700",
    ready: "bg-teal-100 text-teal-700",
    partial: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
      {/* Open Purchase Orders */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-blue-500" /> Open POs
              {openPOs.length > 0 && <Badge className="bg-blue-100 text-blue-700 border-0">{openPOs.length}</Badge>}
            </CardTitle>
            <Link to="/PurchaseOrders" className="text-xs text-[#e20404] hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {openPOs.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No open POs</p>
          ) : (
            <div className="space-y-2">
              {openPOs.slice(0, 5).map((po) => {
                const supplier = suppliers.find((s) => s.id === po.supplier_id);
                return (
                  <div key={po.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-900 truncate">{po.po_number}</p>
                      <p className="text-xs text-slate-500 truncate">{supplier?.name || "Unknown"}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <Badge className={`${poStatusColors[po.status]} border-0 text-xs capitalize`}>{po.status}</Badge>
                      <Link to={`/PurchaseOrderDetail?id=${po.id}`}>
                        <Button size="sm" variant="outline" className="h-7 px-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs">
                          <PackageCheck className="w-3 h-3 mr-1" /> Receive
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Refresh Requests */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-500" /> Refresh Requests
              {pendingRefreshes.length > 0 && <Badge className="bg-amber-100 text-amber-700 border-0">{pendingRefreshes.length}</Badge>}
            </CardTitle>
            <Link to="/RefreshRequests" className="text-xs text-[#e20404] hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {pendingRefreshes.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No pending requests</p>
          ) : (
            <div className="space-y-2">
              {pendingRefreshes.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate">{r.customer_name || "Customer"}</p>
                    <p className="text-xs text-slate-500 truncate">{r.build_serial || r.message?.substring(0, 40) || "No message"}</p>
                  </div>
                  <Badge className="bg-amber-100 text-amber-700 border-0 text-xs ml-2 shrink-0">Pending</Badge>
                </div>
              ))}
              {pendingRefreshes.length > 5 && (
                <p className="text-xs text-slate-400 text-center pt-1">+{pendingRefreshes.length - 5} more</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Expense Confirmations */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-500" /> Pending Expenses
              {pendingExpensePOs.length > 0 && <Badge className="bg-rose-100 text-rose-700 border-0">{pendingExpensePOs.length}</Badge>}
            </CardTitle>
            <Link to="/Expenses" className="text-xs text-[#e20404] hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {pendingExpensePOs.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">All POs expensed</p>
          ) : (
            <div className="space-y-2">
              {pendingExpensePOs.slice(0, 5).map((po) => {
                const supplier = suppliers.find((s) => s.id === po.supplier_id);
                const total = (po.line_items || []).reduce((s, l) => s + (l.total || 0), 0) + (po.shipping_cost || 0);
                return (
                  <div key={po.id} className="flex items-center justify-between p-2.5 rounded-lg bg-rose-50">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-900 truncate">{po.po_number}</p>
                      <p className="text-xs text-slate-500">{supplier?.name || "Unknown"} · ${total.toFixed(2)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 border-rose-300 text-rose-700 hover:bg-rose-50 text-xs ml-2 shrink-0"
                      onClick={() => onExpensePO(po)}
                      disabled={expensePending}
                    >
                      <Receipt className="w-3 h-3 mr-1" /> Confirm
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}