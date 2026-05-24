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
import { ArrowLeft, Plus, Trash2, Send, Printer, DollarSign, Package, Wrench, Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PartPickerModal from "@/components/estimates/PartPickerModal";
import GeneratePOModal from "@/components/estimates/GeneratePOModal";

const emptyPart = { part_id: "", part_number: "", item_name: "", quantity: 1, unit_cost: 0, unit_price: 0, total: 0 };
const emptyLabor = { name: "", description: "", price: 0 };

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-slate-100 text-slate-400",
};

export default function InvoiceDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const isNew = params.get("new") === "1";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    invoice_number: `INV-${Date.now().toString().slice(-6)}`,
    customer_id: "", status: "draft",
    issue_date: new Date().toISOString().split("T")[0],
    due_date: "",
    line_items: [{ ...emptyPart }],
    labor_items: [],
    tax_rate: 0, notes: "", amount_paid: 0, balance_due: 0
  });
  const [sending, setSending] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [pickingIdx, setPickingIdx] = useState(null);
  const [poModalOpen, setPoModalOpen] = useState(false);

  const { data: invoice } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => base44.entities.Invoice.filter({ id }),
    enabled: !!id,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 500),
  });

  const { data: settingsData } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.filter({ key: "global" }),
  });

  useEffect(() => {
    if (invoice && invoice[0]) setForm({ labor_items: [], ...invoice[0] });
  }, [invoice]);

  useEffect(() => {
    if (isNew && settingsData && settingsData[0] && settingsData[0].default_tax_rate) {
      setForm(f => ({ ...f, tax_rate: settingsData[0].default_tax_rate }));
    }
  }, [settingsData, isNew]);

  const saveMutation = useMutation({
    mutationFn: (data) => id
      ? base44.entities.Invoice.update(id, data)
      : base44.entities.Invoice.create(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice saved");
      if (isNew) navigate(`/InvoiceDetail?id=${result.id}`);
    },
  });

  const recalc = (lineItems, laborItems, taxRate, amountPaid) => {
    const partTotal = lineItems.reduce((s, l) => s + (l.total || 0), 0);
    const laborTotal = laborItems.reduce((s, l) => s + (Number(l.price) || 0), 0);
    const subtotal = partTotal + laborTotal;
    const tax_amount = subtotal * (Number(taxRate) / 100);
    const total = subtotal + tax_amount;
    const balance_due = total - (Number(amountPaid) || 0);
    return { subtotal, tax_amount, total, balance_due };
  };

  const updateLine = (idx, field, value) => {
    const lines = [...form.line_items];
    lines[idx] = { ...lines[idx], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      lines[idx].total = (Number(lines[idx].quantity) || 0) * (Number(lines[idx].unit_price) || 0);
    }
    const totals = recalc(lines, form.labor_items || [], form.tax_rate, form.amount_paid);
    setForm(f => ({ ...f, line_items: lines, ...totals }));
  };

  const selectPart = (part) => {
    const lines = [...form.line_items];
    lines[pickingIdx] = {
      part_id: part.id,
      part_number: part.part_number,
      item_name: part.name,
      quantity: 1,
      unit_cost: part.unit_cost || 0,
      unit_price: part.sell_price || 0,
      total: part.sell_price || 0,
    };
    const totals = recalc(lines, form.labor_items || [], form.tax_rate, form.amount_paid);
    setForm(f => ({ ...f, line_items: lines, ...totals }));
  };

  const addLine = () => setForm(f => ({ ...f, line_items: [...f.line_items, { ...emptyPart }] }));
  const removeLine = (idx) => {
    const lines = form.line_items.filter((_, i) => i !== idx);
    const totals = recalc(lines, form.labor_items || [], form.tax_rate, form.amount_paid);
    setForm(f => ({ ...f, line_items: lines, ...totals }));
  };

  const addLabor = () => setForm(f => ({ ...f, labor_items: [...(f.labor_items || []), { ...emptyLabor }] }));
  const updateLabor = (idx, field, value) => {
    const items = [...(form.labor_items || [])];
    items[idx] = { ...items[idx], [field]: value };
    const totals = recalc(form.line_items, items, form.tax_rate, form.amount_paid);
    setForm(f => ({ ...f, labor_items: items, ...totals }));
  };
  const removeLabor = (idx) => {
    const items = (form.labor_items || []).filter((_, i) => i !== idx);
    const totals = recalc(form.line_items, items, form.tax_rate, form.amount_paid);
    setForm(f => ({ ...f, labor_items: items, ...totals }));
  };

  const updateTaxRate = (rate) => {
    const totals = recalc(form.line_items, form.labor_items || [], rate, form.amount_paid);
    setForm(f => ({ ...f, tax_rate: rate, ...totals }));
  };

  const recordPayment = async () => {
    const paid = Number(paymentAmount) + (Number(form.amount_paid) || 0);
    const balance = (form.total || 0) - paid;
    const status = balance <= 0 ? "paid" : "partial";
    const updated = { ...form, amount_paid: paid, balance_due: Math.max(0, balance), status };
    await saveMutation.mutateAsync(updated);
    setForm(updated);
    setRecordingPayment(false);
    setPaymentAmount("");
    toast.success("Payment recorded");
  };

  const sendInvoice = async () => {
    const customer = customers.find(c => c.id === form.customer_id);
    if (!customer?.email) { toast.error("Customer has no email"); return; }
    setSending(true);
    await saveMutation.mutateAsync(form);
    const partsText = (form.line_items || []).filter(l => l.item_name).map(l =>
      `  [${l.part_number}] ${l.item_name} | Qty: ${l.quantity} | Price: $${Number(l.unit_price).toFixed(2)} | Total: $${Number(l.total).toFixed(2)}`
    ).join("\n");
    const laborText = (form.labor_items || []).filter(l => l.name).map(l =>
      `  ${l.name}${l.description ? ` - ${l.description}` : ""} | $${Number(l.price).toFixed(2)}`
    ).join("\n");
    const settings = settingsData?.[0] || {};
    const subject = encodeURIComponent(`Invoice ${form.invoice_number} from ${settings.company_name || "Elite Engine Development"}`);
    const body = encodeURIComponent(
      `Dear ${customer.first_name} ${customer.last_name},\n\n` +
      `Please find your invoice below. Payment is due by ${form.due_date || "30 days from issue"}.\n\n` +
      `Invoice #${form.invoice_number}\n` +
      `-------------------------------\n` +
      (partsText ? `PARTS:\n${partsText}\n\n` : "") +
      (laborText ? `LABOR:\n${laborText}\n\n` : "") +
      `-------------------------------\n` +
      `Subtotal: $${Number(form.subtotal || 0).toFixed(2)}\n` +
      (Number(form.tax_rate) > 0 ? `Tax (${form.tax_rate}%): $${Number(form.tax_amount || 0).toFixed(2)}\n` : "") +
      `Total Due: $${Number(form.total || 0).toFixed(2)}\n` +
      (form.notes ? `\nNotes: ${form.notes}\n` : "") +
      `\n${settings.email_signature || "Thank you for your business!\n\nElite Engine Development"}`
    );
    window.open(`mailto:${customer.email}?subject=${subject}&body=${body}`, "_blank");
    await base44.entities.Invoice.update(id || "", { status: "sent" });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    setForm(f => ({ ...f, status: "sent" }));
    setSending(false);
    toast.success(`Email draft opened for ${customer.email}`);
  };

  const customer = customers.find(c => c.id === form.customer_id);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PartPickerModal
        open={partPickerOpen}
        onClose={() => setPartPickerOpen(false)}
        parts={parts}
        onSelect={(part) => { selectPart(part); setPartPickerOpen(false); }}
      />
      <GeneratePOModal
        open={poModalOpen}
        onClose={() => setPoModalOpen(false)}
        lineItems={form.line_items}
        sourceNumber={form.invoice_number}
      />

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <Link to="/Invoices"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{form.invoice_number}</h1>
        </div>
        <Badge className={`${STATUS_STYLES[form.status]} border-0 capitalize`}>{form.status}</Badge>
        <Button variant="outline" size="sm" onClick={() => setPoModalOpen(true)} disabled={!id}>
          <Package className="w-4 h-4 mr-1" /> Generate POs
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Print</Button>
        <Button variant="outline" size="sm" onClick={sendInvoice} disabled={sending || !form.customer_id}>
          <Send className="w-4 h-4 mr-1" />{sending ? "Sending..." : "Send"}
        </Button>
        {["sent","partial","overdue"].includes(form.status) && (
          <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700" onClick={() => setRecordingPayment(true)}>
            <DollarSign className="w-4 h-4 mr-1" /> Record Payment
          </Button>
        )}
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      {recordingPayment && (
        <Card className="border-emerald-200 bg-emerald-50 mb-6">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex-1">
              <Label>Payment Amount</Label>
              <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" className="w-48 mt-1" />
            </div>
            <div className="text-sm text-slate-600">Balance: ${Number(form.balance_due || form.total || 0).toFixed(2)}</div>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={recordPayment}>Record</Button>
            <Button variant="outline" onClick={() => setRecordingPayment(false)}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-6 mb-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Invoice Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Customer *</Label>
              <Select value={form.customer_id} onValueChange={v => setForm({...form, customer_id: v})}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.company_name ? ` (${c.company_name})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Issue Date</Label><Input type="date" value={form.issue_date} onChange={e => setForm({...form, issue_date: e.target.value})} /></div>
              <div><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} /></div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["draft","sent","partial","paid","overdue","void"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        {customer && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Bill To</CardTitle></CardHeader>
            <CardContent>
              <p className="font-semibold">{customer.first_name} {customer.last_name}</p>
              {customer.company_name && <p className="text-slate-600">{customer.company_name}</p>}
              {customer.address_line1 && <p className="text-slate-600">{customer.address_line1}</p>}
              {customer.city && <p className="text-slate-600">{customer.city}, {customer.state} {customer.zip}</p>}
              {customer.email && <p className="text-slate-600">{customer.email}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Parts */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Parts</CardTitle>
          <Button size="sm" variant="outline" onClick={addLine}><Plus className="w-4 h-4 mr-1" /> Add Part</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600 w-28">Part #</th>
                  <th className="text-left py-2 font-medium text-slate-600">Item Name</th>
                  <th className="text-center py-2 font-medium text-slate-600 w-16">Qty</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Unit Cost</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Unit Price</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Total</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {(form.line_items || []).map((line, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-2">
                      <Input value={line.part_number} onChange={e => updateLine(idx, "part_number", e.target.value)} placeholder="Part #" className="border-slate-200 text-xs font-mono" />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex gap-1">
                        <Input value={line.item_name} onChange={e => updateLine(idx, "item_name", e.target.value)} placeholder="Item name..." className="border-slate-200" />
                        <Button size="sm" variant="ghost" className="text-slate-400 hover:text-[#e20404] px-2 shrink-0" title="Pick from inventory" onClick={() => { setPickingIdx(idx); setPartPickerOpen(true); }}>
                          <Search className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                    <td className="py-2 px-1">
                      <Input type="number" value={line.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} className="text-center border-slate-200" min="0" />
                    </td>
                    <td className="py-2 px-1">
                      <Input type="number" value={line.unit_cost} onChange={e => updateLine(idx, "unit_cost", Number(e.target.value))} className="text-right border-slate-200 text-slate-400" min="0" step="0.01" />
                    </td>
                    <td className="py-2 px-1">
                      <Input type="number" value={line.unit_price} onChange={e => updateLine(idx, "unit_price", Number(e.target.value))} className="text-right border-slate-200" min="0" step="0.01" />
                    </td>
                    <td className="py-2 px-1 text-right font-medium">${Number(line.total || 0).toFixed(2)}</td>
                    <td className="py-2">
                      <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => removeLine(idx)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Labor */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Wrench className="w-4 h-4" /> Labor</CardTitle>
          <Button size="sm" variant="outline" onClick={addLabor}><Plus className="w-4 h-4 mr-1" /> Add Labor</Button>
        </CardHeader>
        <CardContent>
          {(form.labor_items || []).length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">No labor items added.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600 w-40">Name</th>
                  <th className="text-left py-2 font-medium text-slate-600">Description</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-28">Price</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {(form.labor_items || []).map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-2"><Input value={item.name} onChange={e => updateLabor(idx, "name", e.target.value)} placeholder="Labor name..." className="border-slate-200" /></td>
                    <td className="py-2 pr-2"><Input value={item.description} onChange={e => updateLabor(idx, "description", e.target.value)} placeholder="Description..." className="border-slate-200" /></td>
                    <td className="py-2 px-1"><Input type="number" value={item.price} onChange={e => updateLabor(idx, "price", Number(e.target.value))} className="text-right border-slate-200" min="0" step="0.01" /></td>
                    <td className="py-2"><Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => removeLabor(idx)}><Trash2 className="w-3.5 h-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="w-64 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Parts Subtotal</span><span>${(form.line_items || []).reduce((s, l) => s + (l.total || 0), 0).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Labor Subtotal</span><span>${(form.labor_items || []).reduce((s, l) => s + (Number(l.price) || 0), 0).toFixed(2)}</span></div>
          <div className="flex justify-between font-medium border-t border-slate-200 pt-2"><span className="text-slate-600">Subtotal</span><span>${Number(form.subtotal || 0).toFixed(2)}</span></div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">Tax Rate (%)</span>
            <Input type="number" value={form.tax_rate} onChange={e => updateTaxRate(Number(e.target.value))} className="w-20 text-right h-7" min="0" step="0.1" />
          </div>
          {Number(form.tax_rate) > 0 && <div className="flex justify-between"><span className="text-slate-600">Tax</span><span>${Number(form.tax_amount || 0).toFixed(2)}</span></div>}
          <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2"><span>Total</span><span>${Number(form.total || 0).toFixed(2)}</span></div>
          {Number(form.amount_paid) > 0 && <div className="flex justify-between text-emerald-600"><span>Paid</span><span>-${Number(form.amount_paid).toFixed(2)}</span></div>}
          <div className="flex justify-between text-base font-bold text-[#e20404]"><span>Balance Due</span><span>${Number(form.balance_due || 0).toFixed(2)}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div><Label>Notes for Customer</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={4} /></div>
        <div><Label>Payment Notes</Label><Textarea value={form.payment_notes} onChange={e => setForm({...form, payment_notes: e.target.value})} rows={4} /></div>
      </div>
    </div>
  );
}