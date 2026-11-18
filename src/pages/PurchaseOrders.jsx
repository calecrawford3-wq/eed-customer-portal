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
  const [syncBusy,setSyncBusy]=useState(false);
  const [syncResult,setSyncResult]=useState(null);
  const [websiteEditor,setWebsiteEditor]=useState(null);
  const [poActionBusy,setPoActionBusy]=useState(false);
  const [poActionError,setPoActionError]=useState("");
  const [chosenSupplier,setChosenSupplier]=useState("");
  const [chosenPo,setChosenPo]=useState("");
  const [deliveryMode,setDeliveryMode]=useState("ship_to_shop");
  const [chosenLines,setChosenLines]=useState([]);
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
  const websiteSupplierOrders=websiteFulfillments;
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

  const syncTurn14=async()=>{
    setSyncBusy(true);setSyncResult(null);
    try{
      const r=await base44.functions.invoke("turn14SyncOrderTracking",{limit:60});
      const data=r.data||r;
      if(data.error)throw Error(data.error);
      setSyncResult(data);
      await Promise.all([qc.invalidateQueries({queryKey:"purchaseOrders"}),qc.invalidateQueries({queryKey:"purchaseOrdersWebsiteDropship"})]);
      if(data.errors?.length)toast.warning("Turn 14 sync finished with errors");
      else toast.success("Turn 14 order status sync completed");
    }catch(e){setSyncResult({error:e?.response?.data?.error||e.message||"Unable to sync Turn 14 orders"})}
    finally{setSyncBusy(false)}
  };
  const shopOrders=orders.filter(o=>!o.website_fulfillment_id);
  const linkedForWebsite=o=>orders.filter(p=>p.website_fulfillment_id===o.id);
  const openWebsiteEditor=o=>{setWebsiteEditor(o);setChosenSupplier("");setChosenPo("");setDeliveryMode("ship_to_shop");setChosenLines((o.line_items||[]).map((_,i)=>i));setPoActionError("");};
  const websitePoAction=async(action)=>{
    if(!websiteEditor)return;
    setPoActionBusy(true);setPoActionError("");
    try{
      const r=await base44.functions.invoke("websitePurchaseOrderLink",{action,fulfillment_id:websiteEditor.id,supplier_id:chosenSupplier,po_id:chosenPo,mode:deliveryMode,line_indices:chosenLines});
      const data=r.data||r;if(data.error)throw Error(data.error);
      toast.success(action==="create"?"Supplier purchase order created":"Purchase order assigned");
      await Promise.all([qc.invalidateQueries({queryKey:["purchaseOrders"]}),qc.invalidateQueries({queryKey:["purchaseOrdersWebsiteDropship"]})]);
      setWebsiteEditor(null);
    }catch(e){setPoActionError(e.response?.data?.error||e.message||"Unable to link purchase order")}
    finally{setPoActionBusy(false)}
  };
  const filtered = shopOrders.filter(o => {
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
          <p className="text-slate-500 mt-1">{shopOrders.length} shop POs · {websiteSupplierOrders.length} website orders</p>
        </div>
        <Button variant="outline" disabled={syncBusy} onClick={syncTurn14}>{syncBusy?"Syncing…":"Sync Turn 14 Status"}</Button>
        <Link to="/PurchaseOrderDetail?new=1">
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white">
            <Plus className="w-4 h-4 mr-2" /> New Purchase Order
          </Button>
        </Link>
      </div>

      {syncResult&&<div role="status" className="border rounded-lg p-3 mb-4 text-sm bg-slate-50">
        {syncResult.error?<p className="text-red-700">{syncResult.error}</p>:<><p className="font-semibold">Turn 14 test sync: {syncResult.checked} orders checked · {syncResult.updated} updated · {(syncResult.errors||[]).length} errors</p><p className="text-slate-600">Sandbox only. Customer tracking emails are disabled during testing.</p>{(syncResult.errors||[]).map((e,i)=><p key={i} className="text-amber-700 mt-1">Order {e.order}: {e.error||e.notification}</p>)}</>}
      </div>}
      <div className="flex gap-2 mb-5 border-b pb-3">
        <Button variant={orderSource==="shop"?"default":"outline"} onClick={()=>{setOrderSource("shop");setFilterStatus("all")}}>Shop Purchase Orders ({shopOrders.length})</Button>
        <Button variant={orderSource==="website"?"default":"outline"} onClick={()=>{setOrderSource("website");setFilterStatus("all")}}>Website Orders ({websiteSupplierOrders.length})</Button>
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
        filteredWebsite.length===0?<div className="border rounded-xl p-8 text-center text-slate-500">No website orders match your filters.</div>:
        <div className="bg-white border rounded-xl overflow-x-auto"><table className="w-full min-w-[850px] text-sm">
          <thead className="bg-slate-50 border-b"><tr><th className="text-left p-3">Website Order</th><th className="text-left p-3">Supplier</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Linked Purchase Orders</th><th className="text-right p-3">Supplier Quote</th><th className="text-center p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>{filteredWebsite.map(o=><tr key={o.id} className="border-b hover:bg-slate-50">
            <td className="p-3 font-mono font-medium">{o.order_number}</td><td className="p-3">{o.turn14_quote_id||o.turn14_supplier_order_reference?"Turn 14 Distribution":"Multiple / Unassigned"}</td><td className="p-3">{o.recipient_name||"—"}</td>
            <td className="p-3 text-xs"><div>Turn 14: {o.turn14_supplier_order_reference||o.turn14_quote_id||"—"}</div>{o.supplier_shipping_status&&<div>Supplier: {o.supplier_shipping_status}</div>}{(o.supplier_tracking||[]).map((t,i)=><div key={i}><strong>{t.carrier||"Carrier"}: {t.tracking_number}</strong> · {t.carrier_status||"Tracking issued"}{t.tracking_url&&<a className="underline text-blue-700 ml-2" target="_blank" rel="noopener noreferrer" href={t.tracking_url}>Track</a>}</div>)}{linkedForWebsite(o).map(p=><div key={p.id}><Link className="underline text-blue-700" to={`/PurchaseOrderDetail?id=${p.id}`}>{p.po_number}</Link> · {getSupplier(p.supplier_id)?.name||"Supplier"} · {p.website_fulfillment_mode==="direct_to_customer"?"Direct":"To shop"}</div>)}</td>
            <td className="p-3 text-right">{o.turn14_quote_response?.data?.attributes?.total!=null?"$"+Number(o.turn14_quote_response.data.attributes.total).toFixed(2):"—"}</td>
            <td className="p-3 text-center"><Badge className="capitalize">{(o.turn14_dropship_status||"not_requested").replaceAll("_"," ")}</Badge></td>
            <td className="p-3 text-right"><div className="flex gap-2 justify-end"><Button size="sm" variant="outline" onClick={()=>openWebsiteEditor(o)}>Assign / Create PO</Button><Link to="/WebsiteOrderFulfillment"><Button size="sm" variant="outline">Fulfillment</Button></Link></div></td>
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
                    <td className="px-4 py-3 text-slate-900">{supplier?.name || "—"}{o.supplier_shipping_status&&<p className="text-xs text-slate-500">Supplier: {o.supplier_shipping_status}</p>}{(o.supplier_tracking||[]).map((t,i)=><p key={i} className="text-xs">{t.carrier||"Carrier"} · {t.tracking_number} · {t.carrier_status||"Tracking issued"} {t.tracking_url&&<a className="underline text-blue-700" href={t.tracking_url} target="_blank" rel="noopener noreferrer">Track</a>}</p>)}</td>
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

      {websiteEditor&&<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-label="Website purchase order assignment" className="bg-white rounded-xl p-5 max-w-xl w-full max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex justify-between items-center"><h2 className="font-bold text-lg">Supplier POs · {websiteEditor.order_number}</h2><Button variant="outline" onClick={()=>setWebsiteEditor(null)}>Close</Button></div>
        <p className="text-sm text-slate-600">Assign an existing supplier purchase order or create a new draft for selected website items. No supplier order is sent automatically.</p>
        {poActionError&&<p className="text-red-700 text-sm">{poActionError}</p>}
        <div className="border rounded p-3 space-y-2"><h3 className="font-semibold">Assign existing purchase order</h3>
          <select className="w-full border rounded p-2" value={chosenPo} onChange={e=>setChosenPo(e.target.value)}><option value="">Choose unassigned PO</option>{orders.filter(p=>!p.website_fulfillment_id||p.website_fulfillment_id===websiteEditor.id).map(p=><option key={p.id} value={p.id}>{p.po_number} · {getSupplier(p.supplier_id)?.name||"Supplier"}</option>)}</select>
          <Button disabled={!chosenPo||poActionBusy} onClick={()=>websitePoAction("assign")}>Assign PO</Button>
        </div>
        <div className="border rounded p-3 space-y-3"><h3 className="font-semibold">Create purchase order from website items</h3>
          <select className="w-full border rounded p-2" value={chosenSupplier} onChange={e=>setChosenSupplier(e.target.value)}><option value="">Select supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <div className="space-y-1"><p className="text-sm font-medium">Items to purchase</p>{(websiteEditor.line_items||[]).map((l,i)=><label key={i} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={chosenLines.includes(i)} onChange={e=>setChosenLines(v=>e.target.checked?[...v,i]:v.filter(x=>x!==i))}/>{l.quantity} × {l.name} ({l.sku})</label>)}</div>
          <div><p className="text-sm font-medium">Supplier delivery</p><select className="w-full border rounded p-2" value={deliveryMode} onChange={e=>setDeliveryMode(e.target.value)}><option value="ship_to_shop">Ship to Elite shop</option><option value="direct_to_customer">Ship directly to website customer</option></select></div>
          <Button disabled={!chosenSupplier||!chosenLines.length||poActionBusy} onClick={()=>websitePoAction("create")}>{poActionBusy?"Saving…":"Create Draft Purchase Order"}</Button>
        </div>
      </div></div>}
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