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
import { ArrowLeft, Plus, Trash2, Send, Printer, AlertTriangle, PackageCheck, CheckCircle2, Package } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { appParams } from "@/lib/app-params";
import PoPartPickerModal from "@/components/estimates/PoPartPickerModal";

const emptyLine = { part_id: "", part_number: "", description: "", quantity: 1, unit_cost: 0, total: 0, received_qty: 0 };

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  acknowledged: "bg-purple-100 text-purple-700",
  ready: "bg-teal-100 text-teal-700",
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
    shipping_cost: 0, tax_amount: 0, notes: "", shipping_address: ""
  });
  const [sending, setSending] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [receiveMode, setReceiveMode] = useState(false);
  const [receiveQtys, setReceiveQtys] = useState({});
  const [receiveCosts, setReceiveCosts] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: settingsList = [] } = useQuery({
    queryKey: ["appSettings"],
    queryFn: () => base44.entities.AppSettings.filter({ key: "global" }),
  });
  const settings = settingsList[0];

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
    recalc(lines, form.shipping_cost, form.tax_amount);
  };

  const recalc = (lines, shippingCost, taxAmount) => {
    const subtotal = lines.reduce((s, l) => s + (l.total || 0), 0);
    const tax = Number(taxAmount) || 0;
    const total = subtotal + (Number(shippingCost) || 0) + tax;
    setForm(f => ({ ...f, line_items: lines, subtotal, tax_amount: tax, total }));
  };

  const addLine = () => setForm(f => ({ ...f, line_items: [...f.line_items, { ...emptyLine }] }));
  const removeLine = (idx) => {
    const lines = form.line_items.filter((_, i) => i !== idx);
    recalc(lines, form.shipping_cost, form.tax_amount);
  };

  const sendPO = async () => {
    const supplier = suppliers.find(s => s.id === form.supplier_id);
    if (!supplier?.email) { toast.error("Supplier has no email address"); return; }
    setSending(true);
    const saved = await saveMutation.mutateAsync(form);
    const poId = id || saved?.id;

    // Build acknowledge URL — functions are served at /functions/<name> on the app domain
    const token = btoa(`${poId}:${form.po_number}`).replace(/=/g, "");
    const baseUrl = (appParams.appBaseUrl || window.location.origin).replace(/\/$/, "");
    const ackUrl = `${baseUrl}/functions/acknowledgePO?po_id=${poId}&token=${token}`;

    const subject = `Purchase Order ${form.po_number} from Elite Engine Development`;
    const lineRows = (form.line_items || []).map(l =>
      `<tr>
        <td style="padding:6px 12px 6px 0;border-bottom:1px solid #eee;font-family:monospace;font-size:13px">${l.part_number || "—"}</td>
        <td style="padding:6px 12px 6px 0;border-bottom:1px solid #eee">${l.description || ""}</td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:center">${l.quantity}</td>
      </tr>`
    ).join("");
    const html = `
      <p>To: ${supplier.name}${supplier.contact_name ? ` / ${supplier.contact_name}` : ""}</p>
      <h3>Purchase Order #${form.po_number}</h3>
      <p>Order Date: ${form.order_date || ""}${form.expected_date ? ` | Expected Delivery: ${form.expected_date}` : ""}</p>
      <hr/>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 12px 6px 0;border-bottom:2px solid #ccc">Part #</th>
            <th style="text-align:left;padding:6px 12px 6px 0;border-bottom:2px solid #ccc">Description</th>
            <th style="text-align:center;padding:6px 0;border-bottom:2px solid #ccc">Qty</th>
          </tr>
        </thead>
        <tbody>${lineRows}</tbody>
      </table>
      <br/>
      ${form.shipping_address ? `<p>Ship To: ${form.shipping_address}</p>` : ""}
      ${form.notes ? `<p>Notes: ${form.notes}</p>` : ""}
      <p>Please use the buttons below to update the status of this order:</p>
      <table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto">
        <tr>
          <td style="padding:0 8px">
            <a href="${ackUrl}" style="display:inline-block;background:#7c3aed;color:white;font-family:sans-serif;font-size:15px;font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none">
              &#10003; Acknowledge Order
            </a>
          </td>
          <td style="padding:0 8px">
            <a href="${ackUrl}&action=ready" style="display:inline-block;background:#0d9488;color:white;font-family:sans-serif;font-size:15px;font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none">
              &#128230; Order Ready
            </a>
          </td>
        </tr>
      </table>
      <p style="font-size:12px;color:#94a3b8">Click "Acknowledge Order" when you confirm the order, and "Order Ready" when the items are ready for shipment or pickup.</p>
      <p>Elite Engine Development</p>
    `;

    const result = await base44.functions.invoke("sendSmtpEmail", { to: supplier.email, subject, html, usePOSmtp: true });
    if (result?.data?.error) { toast.error("Failed to send email"); setSending(false); return; }

    await base44.entities.PurchaseOrder.update(poId, { status: "sent" });
    qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
    setForm(f => ({ ...f, status: "sent" }));
    setSending(false);
    toast.success(`PO sent to ${supplier.email}`);
  };

  const supplier = suppliers.find(s => s.id === form.supplier_id);

  const openReceiveMode = () => {
    const initialQtys = {};
    const initialCosts = {};
    (form.line_items || []).forEach((line, idx) => {
      const remaining = (line.quantity || 0) - (line.received_qty || 0);
      initialQtys[idx] = remaining > 0 ? remaining : 0;
      initialCosts[idx] = line.unit_cost || 0;
    });
    setReceiveQtys(initialQtys);
    setReceiveCosts(initialCosts);
    setReceiveMode(true);
  };

  const handleReceiveItems = async () => {
    setReceiving(true);
    const updatedLines = (form.line_items || []).map((line, idx) => {
      const qtyToReceive = Number(receiveQtys[idx] || 0);
      const newCost = Number(receiveCosts[idx] ?? line.unit_cost ?? 0);
      return {
        ...line,
        received_qty: (line.received_qty || 0) + qtyToReceive,
        unit_cost: newCost,
        total: (line.quantity || 0) * newCost,
      };
    });

    // Determine new PO status
    const allReceived = updatedLines.every(l => (l.received_qty || 0) >= (l.quantity || 0));
    const anyReceived = updatedLines.some(l => (l.received_qty || 0) > 0);
    const newStatus = allReceived ? "received" : anyReceived ? "partial" : form.status;

    const subtotal = updatedLines.reduce((s, l) => s + (l.total || 0), 0);
    const updatedForm = {
      ...form,
      line_items: updatedLines,
      subtotal,
      total: subtotal + (Number(form.shipping_cost) || 0) + (Number(form.tax_amount) || 0),
      status: newStatus,
      received_date: allReceived ? new Date().toISOString().split("T")[0] : form.received_date,
    };

    // Save PO first
    await base44.entities.PurchaseOrder.update(id, updatedForm);

    // Update inventory for each line item that has a part_id and received qty > 0
    const inventoryUpdates = [];
    for (const [idx, line] of updatedLines.entries()) {
      const qtyReceived = Number(receiveQtys[idx] || 0);
      if (line.part_id && qtyReceived > 0) {
        const part = parts.find(p => p.id === line.part_id);
        if (part) {
          const newCost = line.unit_cost;
          const partUpdates = {
            quantity_on_hand: (part.quantity_on_hand || 0) + qtyReceived,
            unit_cost: newCost,
          };
          // Auto-update sell price if part uses markup pricing
          if (part.use_markup && part.markup_percentage) {
            partUpdates.sell_price = parseFloat((newCost * (1 + part.markup_percentage / 100)).toFixed(2));
          }
          inventoryUpdates.push(base44.entities.Part.update(line.part_id, partUpdates));
        }
      }
    }
    await Promise.all(inventoryUpdates);

    setForm(updatedForm);
    qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
    qc.invalidateQueries({ queryKey: ["parts"] });
    setReceiveMode(false);
    setReceiving(false);
    toast.success(`Items received${inventoryUpdates.length > 0 ? ` — ${inventoryUpdates.length} inventory record(s) updated` : ""}`);
  };

  const addPartFromPicker = (newLine) => {
    setForm(f => {
      const existingIdx = (f.line_items || []).findIndex(l => l.part_id && l.part_id === newLine.part_id);
      let lines;
      if (existingIdx >= 0) {
        lines = f.line_items.map((l, j) => j === existingIdx
          ? { ...l, quantity: (Number(l.quantity) || 0) + (Number(newLine.quantity) || 0), total: ((Number(l.quantity) || 0) + (Number(newLine.quantity) || 0)) * (Number(l.unit_cost) || 0) }
          : l);
      } else {
        lines = [...(f.line_items || []), { ...newLine }];
      }
      recalc(lines, f.shipping_cost, f.tax_amount);
      return { ...f, line_items: lines };
    });
    toast.success(`${newLine.description} added to PO`);
  };

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
    const total = subtotal + (Number(form.shipping_cost) || 0) + (Number(form.tax_amount) || 0);
    setForm(f => ({ ...f, line_items: newLines, subtotal, total }));
    toast.success(`Added ${newLines.length} low stock item(s) to order`);
  };

  const printPO = (poData, supplierData, settingsData) => {
    const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : "N/A";
    const money = (n) => `$${Number(n || 0).toFixed(2)}`;

    const companyAddress = [
      settingsData?.company_address,
      settingsData?.company_city ? `${settingsData.company_city}, ${settingsData.company_state} ${settingsData.company_zip}` : null,
      settingsData?.company_phone,
      settingsData?.company_email,
    ].filter(Boolean).join("<br/>");

    const supplierLines = [
      supplierData?.name,
      supplierData?.contact_name,
      supplierData?.address_line1,
      supplierData?.address_line2,
      supplierData?.city ? `${supplierData.city}, ${supplierData.state} ${supplierData.zip}` : null,
      supplierData?.phone,
      supplierData?.email,
    ].filter(Boolean).map(l => `<p style="margin:2px 0">${l}</p>`).join("");

    const itemRows = (poData.line_items || []).map((line, idx) => `
      <tr style="border-bottom:1px solid #eee">
        <td style="padding:8px 12px;color:#999">${idx + 1}</td>
        <td style="padding:8px 12px;font-family:monospace;font-size:12px">${line.part_number || "—"}</td>
        <td style="padding:8px 12px">${line.description || ""}</td>
        <td style="padding:8px 12px;text-align:center">${line.quantity}</td>
        <td style="padding:8px 12px;text-align:right">${money(line.unit_cost)}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:500">${money(line.total)}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><title>PO ${poData.po_number}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 32px; max-width: 800px; margin: 0 auto; color: #1a1a1a; }
        @media print { @page { margin: 0.5in; } body { padding: 0; } }
      </style>
    </head><body>
      <div style="border-bottom:3px solid #e20404;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end">
        <div>
          <img src="${LOGO_URL}" alt="Logo" style="height:56px;margin-bottom:8px"/>
          <h1 style="font-size:26px;font-weight:bold;margin:0;letter-spacing:1px">PURCHASE ORDER</h1>
          <p style="font-size:13px;color:#666;margin-top:4px">${settingsData?.company_name || "Elite Engine Development"}</p>
        </div>
        <div style="text-align:right">
          <p style="font-size:20px;font-weight:bold;color:#e20404;margin-bottom:6px">${poData.po_number}</p>
          <p style="font-size:13px;color:#666;margin:2px 0">Order Date: ${fmtDate(poData.order_date)}</p>
          <p style="font-size:13px;color:#666;margin:2px 0">Expected: ${fmtDate(poData.expected_date)}</p>
          <p style="font-size:13px;color:#666;margin:2px 0;text-transform:capitalize">Status: ${poData.status}</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px">
        <div>
          <h2 style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#999;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px">Supplier / Vendor</h2>
          ${supplierLines}
        </div>
        <div>
          <h2 style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#999;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px">Ship To</h2>
          <p style="font-size:13px;font-weight:bold;margin:2px 0">${settingsData?.company_name || "Elite Engine Development"}</p>
          <p style="font-size:13px;color:#555;margin:2px 0">${companyAddress}</p>
          ${poData.shipping_address ? `<p style="font-size:13px;margin-top:6px;color:#555;font-style:italic">Attn: ${poData.shipping_address.replace(/\n/g, ", ")}</p>` : ""}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
        <thead>
          <tr style="background:#1a1a1a;color:#fff">
            <th style="text-align:left;padding:10px 12px;font-size:12px;text-transform:uppercase">#</th>
            <th style="text-align:left;padding:10px 12px;font-size:12px;text-transform:uppercase">Part Number</th>
            <th style="text-align:left;padding:10px 12px;font-size:12px;text-transform:uppercase">Description</th>
            <th style="text-align:center;padding:10px 12px;font-size:12px;text-transform:uppercase">Qty</th>
            <th style="text-align:right;padding:10px 12px;font-size:12px;text-transform:uppercase">Unit Cost</th>
            <th style="text-align:right;padding:10px 12px;font-size:12px;text-transform:uppercase">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-bottom:28px">
        <div style="width:280px;font-size:13px">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee"><span style="color:#666">Subtotal</span><span>${money(poData.subtotal)}</span></div>
          ${Number(poData.shipping_cost) > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee"><span style="color:#666">Shipping</span><span>${money(poData.shipping_cost)}</span></div>` : ""}
          ${Number(poData.tax_amount) > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee"><span style="color:#666">Tax</span><span>${money(poData.tax_amount)}</span></div>` : ""}
          <div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:bold;font-size:16px;color:#e20404;border-top:2px solid #e20404"><span>Total</span><span>${money(poData.total)}</span></div>
        </div>
      </div>
      ${poData.notes ? `<div style="margin-bottom:32px"><h3 style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#999;margin-bottom:6px">Notes / Special Instructions</h3><p style="font-size:13px;color:#555;white-space:pre-wrap;padding:10px 14px;background:#f8f8f8;border-left:3px solid #e20404">${poData.notes}</p></div>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px;padding-top:20px;border-top:1px solid #eee">
        <div><div style="border-top:1px solid #333;padding-top:6px;font-size:12px;color:#666">Authorized Signature</div><div style="font-size:11px;color:#999;margin-top:2px">${settingsData?.company_name || "Elite Engine Development"}</div></div>
        <div><div style="border-top:1px solid #333;padding-top:6px;font-size:12px;color:#666">Date</div><div style="font-size:11px;color:#999;margin-top:2px">&nbsp;</div></div>
      </div>
      <div style="margin-top:40px;padding-top:12px;border-top:2px solid #e20404;text-align:center">
        <p style="font-size:11px;color:#999">${settingsData?.company_name || "Elite Engine Development"}${settingsData?.company_website ? ` · ${settingsData.company_website}` : ""}${settingsData?.company_email ? ` · ${settingsData.company_email}` : ""}</p>
        <p style="font-size:10px;color:#bbb;margin-top:4px">Please reference PO number ${poData.po_number} on all correspondence and shipments.</p>
      </div>
    </body></html>`;

    const win = window.open("", "_blank", "width=850,height=600");
    if (!win) { toast.error("Pop-up blocked — allow pop-ups to print the PO"); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 250);
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
        <Button variant="outline" onClick={() => printPO(form, supplier, settings)}><Printer className="w-4 h-4 mr-1" /> Print</Button>
        <Button variant="outline" onClick={sendPO} disabled={sending || !form.supplier_id}>
          <Send className="w-4 h-4 mr-1" />{sending ? "Sending..." : "Email to Supplier"}
        </Button>
        {id && ["sent","acknowledged","ready","partial"].includes(form.status) && (
          <Button variant="outline" className="border-emerald-400 text-emerald-700 hover:bg-emerald-50" onClick={openReceiveMode}>
            <PackageCheck className="w-4 h-4 mr-1" /> Receive Items
          </Button>
        )}
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
                  {["draft","sent","acknowledged","ready","partial","received","cancelled"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
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
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}><Package className="w-4 h-4 mr-1" /> Add Part</Button>
            <Button size="sm" variant="outline" onClick={addLine}><Plus className="w-4 h-4 mr-1" /> Add Blank Item</Button>
          </div>
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
                       {parts
                         .filter(p => !form.supplier_id || p.supplier_id === form.supplier_id || p.id === line.part_id)
                         .map(p => <SelectItem key={p.id} value={p.id}>{p.part_number} - {p.name}</SelectItem>)}
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
                <Input type="number" value={form.shipping_cost} onChange={e => { const sc = Number(e.target.value); recalc(form.line_items, sc, form.tax_amount); setForm(f => ({...f, shipping_cost: sc})); }} className="w-24 text-right h-7" min="0" step="0.01" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-600">Tax ($)</span>
                <Input type="number" value={form.tax_amount} onChange={e => { const ta = Number(e.target.value); recalc(form.line_items, form.shipping_cost, ta); setForm(f => ({...f, tax_amount: ta})); }} className="w-24 text-right h-7" min="0" step="0.01" placeholder="0.00" />
              </div>
              <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2"><span>Total</span><span className="text-[#e20404]">${Number(form.total || 0).toFixed(2)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Receive Items Panel */}
      {receiveMode && (
        <Card className="border-0 shadow-sm mb-6 border-l-4 border-l-emerald-400">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-700">
              <PackageCheck className="w-4 h-4" /> Receive Items
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-slate-400" onClick={() => setReceiveMode(false)}>Cancel</Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 mb-4">Enter the quantity received for each item. Inventory will be updated automatically for linked parts.</p>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600">Part</th>
                  <th className="text-left py-2 font-medium text-slate-600">Description</th>
                  <th className="text-center py-2 font-medium text-slate-600 w-24">Ordered</th>
                  <th className="text-center py-2 font-medium text-slate-600 w-24">Already Recv'd</th>
                  <th className="text-center py-2 font-medium text-slate-600 w-24">Receiving Now</th>
                  <th className="text-center py-2 font-medium text-slate-600 w-28">Unit Cost</th>
                  <th className="text-center py-2 font-medium text-slate-600 w-20">Status</th>
                </tr>
              </thead>
              <tbody>
                {(form.line_items || []).map((line, idx) => {
                  const alreadyReceived = line.received_qty || 0;
                  const remaining = (line.quantity || 0) - alreadyReceived;
                  const receivingNow = Number(receiveQtys[idx] || 0);
                  const totalAfter = alreadyReceived + receivingNow;
                  const isFullyReceived = totalAfter >= (line.quantity || 0);
                  return (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-2 pr-2 font-mono text-xs text-slate-500">{line.part_number || "Custom"}</td>
                      <td className="py-2 pr-3 text-slate-700">{line.description}</td>
                      <td className="py-2 text-center">{line.quantity}</td>
                      <td className="py-2 text-center text-slate-500">{alreadyReceived}</td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={receiveQtys[idx] ?? remaining}
                          onChange={e => setReceiveQtys(q => ({ ...q, [idx]: Number(e.target.value) }))}
                          className="text-center border-emerald-200 focus:border-emerald-400 h-8 w-20 mx-auto"
                          min="0"
                          max={remaining}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <div className="relative w-24 mx-auto">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                          <Input
                            type="number"
                            value={receiveCosts[idx] ?? line.unit_cost ?? 0}
                            onChange={e => setReceiveCosts(c => ({ ...c, [idx]: Number(e.target.value) }))}
                            className="text-right border-emerald-200 focus:border-emerald-400 h-8 pl-5"
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </td>
                      <td className="py-2 text-center">
                        {isFullyReceived ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                        ) : (
                          <span className="text-xs text-amber-600">{remaining - receivingNow} left</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex justify-end">
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleReceiveItems}
                disabled={receiving}
              >
                <PackageCheck className="w-4 h-4 mr-2" />
                {receiving ? "Processing..." : "Confirm Receipt & Update Inventory"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={4} placeholder="Special instructions, notes for supplier..." /></div>

      <PoPartPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        parts={parts}
        suppliers={suppliers}
        currentSupplierId={form.supplier_id}
        currentSupplierName={supplier?.name}
        existingPartIds={(form.line_items || []).map(l => l.part_id).filter(Boolean)}
        onAdd={addPartFromPicker}
      />
    </div>
  );
}