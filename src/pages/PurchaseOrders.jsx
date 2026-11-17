import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import ConfirmDialog from "@/components/ConfirmDialog";

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  acknowledged: "bg-purple-100 text-purple-700",
  partial: "bg-amber-100 text-amber-700",
  received: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function PurchaseOrders() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [orderSource,setOrderSource]=useState("shop");
  const qc = useQueryClient();
  const [confirmState, setConfirmState] = useState(/** @type {Record<string, any>} */ ({ open: false }));

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["purchaseOrders"],
    queryFn: () => base44.entities.PurchaseOrder.list("-created_date", 200),
  });

  const {data: websiteFulfillments=[],isLoading:websiteLoading}=useQuery({
    queryKey:["purchaseOrdersWebsiteDropship"],
    queryFn:()=>base44.entities.WebsitePartsFulfillment.list("-created_date",500),
  });
  const websiteSupplierOrders=websiteFulfillments.filter(o=>["pending_review","ready_for_submission","submitted","shipped","exception"].includes(o.turn14_dropship_status)||!!o.turn14_quote_id||!!o.turn14_supplier_order_reference);
  const filteredWebsite=websiteSupplierOrders.filter(o=>{
    const query=`${o.order_number||""} ${o.recipient_name||""} ${o.turn14_quote_id||""} ${o.turn14_supplier_order_reference||""} ${(o.turn14_dropship_lines||[]).map(l=>l.supplier_sku||l.sku).join(" ")}`.toLowerCase();
    return query.includes(search.toLowerCase())&&(filterStatus==="all"||o.turn14_dropship_status===filterStatus);
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-created_date", 200),
  });

  const deleteMutation = useMutation({
    mutationFn: /** @param {string} id */ (id) => base44.entities.PurchaseOrder.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchaseOrders"] }); toast.success("PO deleted"); },
  });

  const getSupplier = (id) => suppliers.find(s => s.id === id);

  const filtered = orders.filter(o => {
    const supplier = getSupplier(o.supplier_id);
    const matchSearch = `${o.po_number} ${supplier?.name}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-slate-500 mt-1">{orders.length} shop POs · {websiteSupplierOrders.length} website supplier requests</p>
        </div>
        <Link to="/PurchaseOrderDetail?new=1">
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white">
            <Plus className="w-4 h-4 mr-2" /> New Purchase Order
          </Button>
        </Link>
      </div>

      <div className="flex gap-2 mb-5 border-b pb-3">
        <Button variant={orderSource==="shop"?"default":"outline"} onClick={()=>{setOrderSource("shop");setFilterStatus("all")}}>Shop Purchase Orders ({orders.length})</Button>
        <Button variant={orderSource==="website"?"default":"outline"} onClick={()=>{setOrderSource("website");setFilterStatus("all")}}>Website Dropship Orders ({websiteSupplierOrders.length})</Button>
      </div>
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-10" placeholder="Search by PO# or supplier..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {(orderSource==="shop"?["draft","sent","acknowledged","partial","received","cancelled"]:["pending_review","ready_for_submission","submitted","shipped","exception"]).map(s => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {orderSource==="website" ? (
        websiteLoading?<p className="py-8 text-slate-500">Loading website supplier orders…</p>:
        filteredWebsite.length===0?<div className="border rounded-xl p-8 text-center text-slate-500">No website dropship orders match your filters.</div>:
        <div className="bg-white border rounded-xl overflow-x-auto"><table className="w-full min-w-[850px] text-sm">
          <thead className="bg-slate-50 border-b"><tr><th className="text-left p-3">Website Order</th><th className="text-left p-3">Supplier</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Turn 14 Quote / Order</th><th className="text-right p-3">Supplier Quote</th><th className="text-center p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>{filteredWebsite.map(o=><tr key={o.id} className="border-b hover:bg-slate-50">
            <td className="p-3 font-mono font-medium">{o.order_number}</td><td className="p-3">Turn 14 Distribution</td><td className="p-3">{o.recipient_name||"—"}</td>
            <td className="p-3 text-xs"><div>Quote: {o.turn14_quote_id||"Not requested"}</div><div>Order: {o.turn14_supplier_order_reference||"Not submitted"}</div></td>
            <td className="p-3 text-right">{o.turn14_quote_response?.data?.attributes?.total!=null?"$"+Number(o.turn14_quote_response.data.attributes.total).toFixed(2):"—"}</td>
            <td className="p-3 text-center"><Badge className="capitalize">{(o.turn14_dropship_status||"not_requested").replaceAll("_"," ")}</Badge></td>
            <td className="p-3 text-right"><Link to="/WebsiteOrderFulfillment"><Button size="sm" variant="outline">Manage</Button></Link></td>
          </tr>)}</tbody>
        </table></div>
      ) : isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No purchase orders yet</p>
          <Link to="/PurchaseOrderDetail?new=1"><Button className="mt-4 bg-[#e20404] hover:bg-[#c00303] text-white">Create First PO</Button></Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">PO #</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Supplier</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Order Date</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Expected</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => {
                const supplier = getSupplier(o.supplier_id);
                return (
                  <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-medium text-[#e20404]">
                      <Link to={`/PurchaseOrderDetail?id=${o.id}`} className="hover:underline">{o.po_number}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-900">{supplier?.name || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{o.order_date ? format(new Date(o.order_date), "MMM d, yyyy") : "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{o.expected_date ? format(new Date(o.expected_date), "MMM d, yyyy") : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">${(o.total || 0).toLocaleString("en-US", {minimumFractionDigits: 2})}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={`${STATUS_STYLES[o.status]} border-0 capitalize`}>{o.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <Link to={`/PurchaseOrderDetail?id=${o.id}`}><Button size="sm" variant="outline">View</Button></Link>
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => setConfirmState({ open: true, title: "Delete PO", message: "Delete this purchase order? This cannot be undone.", confirmLabel: "Delete", onConfirm: () => deleteMutation.mutate(o.id) })}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState({})}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
      />
    </div>
  );
}