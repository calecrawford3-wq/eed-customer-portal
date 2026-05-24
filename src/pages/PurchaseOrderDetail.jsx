import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Send, Printer, AlertTriangle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

const emptyLine = { part_id: "", part_number: "", description: "", quantity: 1, unit_cost: 0, total: 0, received_qty: 0 };

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  acknowledged: "bg-purple-100 text-purple-700",
  partial: "bg-amber-100 text-amber-700",
  received: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function PurchaseOrderDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const isNew = params.get("new") === "1";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    po_number: `PO-${Date.now().toString().slice(-6)}`,
    supplier_id: "", status: "draft",
    order_date: new Date().toISOString().split("T")[0],
    expected_date: "",
    line_items: [{ ...emptyLine }],
    shipping_cost: 0, notes: "", shipping_address: ""
  });
  const [sending, setSending] = useState(false);

  const { data: po } = useQuery({
    queryKey: ["po", id],
    queryFn: () => base44.entities.PurchaseOrder.filter({ id }),
    enabled: !!id,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-created_date", 200),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 500),
  });

  useEffect(() => {
    if (po && po[0]) setForm({ ...po[0] });
  }, [po]);

  const saveMutation = useMutation({
    mutationFn: (data) => id
      ? base44.entities.PurchaseOrder.update(id, data)
      : base44.entities.PurchaseOrder.create(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
      toast.success("Purchase order saved");
      if (isNew) navigate(`/PurchaseOrderDetail?id=${result.id}`);
    },
  });

  const updateLine = (idx, field, value) => {
    const lines = [...form.line_items];
    lines[idx] = { ...lines[idx], [field]: value };
    if (field === "part_id") {
      const part = parts.find(p => p.id === value);
      if (part) {
        lines[idx].part_number = part.part_number;
        lines[idx].description = part.name;
        lines[idx].unit_cost = part.unit_cost || 0;
        lines[idx].total = (lines[idx].quantity || 1) * (part.unit_cost || 0);
      }
    }
    if (field === "quantity" || field === "unit_cost") {
      lines[idx].total = (Number(lines[idx].quantity) || 0) * (Number(lines[idx].unit_cost) || 0);
    }
    recalc(lines, form.shipping_cost);
  };

  const recalc = (lines, shippingCost) => {
    const subtotal = lines.reduce((s, l) => s + (l.total || 0), 0);
    const total = subtotal + (Number(shippingCost) || 0);
    setForm(f => ({ ...f, line_items: lines, subtotal, total }));
  };

  const addLine = () => setForm(f => ({ ...f, line_items: [...f.line_items, { ...emptyLine }] }));
  const removeLine = (idx) => {
    const lines = form.line_items.filter((_, i) => i !== idx);
    recalc(lines, form.shipping_cost);
  };

  const sendPO = async () => {
    const supplier = suppliers.find(s => s.id === form.supplier_id);
    if (!supplier?.email) { toast.error("Supplier has no email address"); return; }
    setSending(true);
    await saveMutation.mutateAsync(form);

    const lineItemsText = (form.line_items || []).map(l =>
      `  ${l.part_number || "Custom"} | ${l.description} | Qty: ${l.quantity} | Unit: $${Number(l.unit_cost).toFixed(2)} | Total: $${Number(l.total).toFixed(2)}`
    ).join("\n");

    const subject = `Purchase Order ${form.po_number} from Elite Engine Development`;
    const html = `
      <p>To: ${supplier.name}${supplier.contact_name ? ` / ${supplier.contact_name}` : ""}</p>
      <h3>Purchase Order #${form.po_number}</h3>
      <p>Order Date: ${form.order_date || ""}${form.expected_date ? ` | Expected Delivery: ${form.expected_date}` : ""}</p>
      <hr/>
      <pre>${lineItemsText}</pre>
      <hr/>
      <p>Subtotal: $${Number(form.subtotal || 0).toFixed(2)}<br/>
      ${Number(form.shipping_cost) > 0 ? `Shipping: $${Number(form.shipping_cost).toFixed(2)}<br/>` : ""}
      <strong>Total: $${Number(form.total || 0).toFixed(2)}</strong></p>
      ${form.shipping_address ? `<p>Ship To: ${form.shipping_address}</p>` : ""}
      ${form.notes ? `<p>Notes: ${form.notes}</p>` : ""}
      <p>Please confirm receipt of this purchase order.</p>
      <p>Elite Engine Development</p>
    `;

    const result = await base44.functions.invoke("sendSmtpEmail", { to: supplier.email, subject, html, usePOSmtp: true });
    if (result?.data?.error) { toast.error("Failed to send email"); setSending(false); return; }

    await base44.entities.PurchaseOrder.update(id || "", { status: "sent" });
    qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
    setForm(f => ({ ...f, status: "sent" }));
    setSending(false);
    toast.success(`PO sent to ${supplier.email}`);
  };

  const supplier = suppliers.find(s => s.id === form.supplier_id);

  const fillLowStockItems = () => {
    if (!form.supplier_id) {
      toast.error("Select a supplier first");
      return;
    }
    const lowStockItems = parts.filter(p =>
      p.supplier_id === form.supplier_id &&
      p.reorder_point > 0 &&
      p.quantity_on_hand <= p.reorder_point
    );
    if (lowStockItems.length === 0) {
      toast.info("No low stock items found for this supplier");
      return;
    }
    const newLines = lowStockItems.map(p => {
      const maxStock = p.reorder_quantity || p.reorder_point * 2;
      const qtyToOrder = Math.max(1, maxStock - p.quantity_on_hand);
      return {
        part_id: p.id,
        part_number: p.part_number,
        description: p.name,
        quantity: qtyToOrder,
        unit_cost: p.unit_cost || 0,
        total: qtyToOrder * (p.unit_cost || 0),
        received_qty: 0,
      };
    });
    const subtotal = newLines.reduce((s, l) => s + l.total, 0);
    const total = subtotal + (Number(form.shipping_cost) || 0);
    setForm(f => ({ ...f, line_items: newLines, subtotal, total }));
    toast.success(`Added ${newLines.length} low stock item(s) to order`);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/PurchaseOrders"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{form.po_number}</h1>
        </div>
        <Badge className={`${STATUS_STYLES[form.status]} border-0 capitalize`}>{form.status}</Badge>
        <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={fillLowStockItems} disabled={!form.supplier_id}>
          <AlertTriangle className="w-4 h-4 mr-1" /> Order Low Stock
        </Button>
        <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Print</Button>
        <Button variant="outline" onClick={sendPO} disabled={sending || !form.supplier_id}>
          <Send className="w-4 h-4 mr-1" />{sending ? "Sending..." : "Email to Supplier"}
        </Button>
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">PO Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Supplier *</Label>
              <Select value={form.supplier_id} onValueChange={v => setForm({...form, supplier_id: v})}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Order Date</Label><Input type="date" value={form.order_date} onChange={e => setForm({...form, order_date: e.target.value})} /></div>
              <div><Label>Expected Delivery</Label><Input type="date" value={form.expected_date} onChange={e => setForm({...form, expected_date: e.target.value})} /></div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["draft","sent","acknowledged","partial","received","cancelled"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Ship To</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={form.shipping_address} onChange={e => setForm({...form, shipping_address: e.target.value})} rows={5} placeholder="Shipping address..." />
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Order Items</CardTitle>
          <Button size="sm" variant="outline" onClick={addLine}><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 font-medium text-slate-600">Part</th>
                <th className="text-left py-2 font-medium text-slate-600">Description</th>
                <th className="text-center py-2 font-medium text-slate-600 w-20">Qty</th>
                <th className="text-right py-2 font-medium text-slate-600 w-28">Unit Cost</th>
                <th className="text-right py-2 font-medium text-slate-600 w-28">Total</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(form.line_items || []).map((line, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="py-2 pr-2 w-44">
                    <Select value={line.part_id || ""} onValueChange={v => updateLine(idx, "part_id", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select part" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>Custom</SelectItem>
                        {parts.map(p => <SelectItem key={p.id} value={p.id}>{p.part_number} - {p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-2 pr-3">
                    <Input value={line.description} onChange={e => updateLine(idx, "description", e.target.value)} className="border-0 shadow-none px-0" placeholder="Description..." />
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" value={line.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} className="text-center border-slate-200 h-8" min="0" />
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" value={line.unit_cost} onChange={e => updateLine(idx, "unit_cost", Number(e.target.value))} className="text-right border-slate-200 h-8" min="0" step="0.01" />
                  </td>
                  <td className="py-2 px-2 text-right font-medium">${Number(line.total || 0).toFixed(2)}</td>
                  <td className="py-2">
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => removeLine(idx)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mt-4 pt-4 border-t border-slate-200">
            <div className="w-64 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span className="font-medium">${Number(form.subtotal || 0).toFixed(2)}</span></div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-600">Shipping</span>
                <Input type="number" value={form.shipping_cost} onChange={e => { const sc = Number(e.target.value); recalc(form.line_items, sc); setForm(f => ({...f, shipping_cost: sc})); }} className="w-24 text-right h-7" min="0" step="0.01" />
              </div>
              <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2"><span>Total</span><span className="text-[#e20404]">${Number(form.total || 0).toFixed(2)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={4} placeholder="Special instructions, notes for supplier..." /></div>
    </div>
  );
}