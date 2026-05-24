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
import { ArrowLeft, Plus, Trash2, Send, Printer, DollarSign } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

const emptyLine = { description: "", quantity: 1, unit_price: 0, total: 0 };

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
    line_items: [{ ...emptyLine }],
    tax_rate: 0, notes: "", amount_paid: 0, balance_due: 0
  });
  const [sending, setSending] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");

  const { data: invoice } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => base44.entities.Invoice.filter({ id }),
    enabled: !!id,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  useEffect(() => {
    if (invoice && invoice[0]) setForm({ ...invoice[0] });
  }, [invoice]);

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

  const updateLine = (idx, field, value) => {
    const lines = [...form.line_items];
    lines[idx] = { ...lines[idx], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      lines[idx].total = (Number(lines[idx].quantity) || 0) * (Number(lines[idx].unit_price) || 0);
    }
    recalc(lines, form.tax_rate, form.amount_paid);
  };

  const recalc = (lines, taxRate, amountPaid) => {
    const subtotal = lines.reduce((s, l) => s + (l.total || 0), 0);
    const tax_amount = subtotal * (Number(taxRate) / 100);
    const total = subtotal + tax_amount;
    const balance_due = total - (Number(amountPaid) || 0);
    setForm(f => ({ ...f, line_items: lines, subtotal, tax_amount, total, balance_due }));
  };

  const addLine = () => setForm(f => ({ ...f, line_items: [...f.line_items, { ...emptyLine }] }));
  const removeLine = (idx) => {
    const lines = form.line_items.filter((_, i) => i !== idx);
    recalc(lines, form.tax_rate, form.amount_paid);
  };

  const updateTaxRate = (rate) => recalc(form.line_items, rate, form.amount_paid);

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

    const lineItemsText = (form.line_items || []).map(l =>
      `  ${l.description} | Qty: ${l.quantity} | Unit: $${Number(l.unit_price).toFixed(2)} | Total: $${Number(l.total).toFixed(2)}`
    ).join("\n");

    const subject = encodeURIComponent(`Invoice ${form.invoice_number} from Elite Engine Development`);
    const body = encodeURIComponent(
      `Dear ${customer.first_name} ${customer.last_name},\n\n` +
      `Please find your invoice below. Payment is due by ${form.due_date || "30 days from issue"}.\n\n` +
      `Invoice #${form.invoice_number}\n` +
      `-------------------------------\n` +
      `${lineItemsText}\n` +
      `-------------------------------\n` +
      `Subtotal: $${Number(form.subtotal || 0).toFixed(2)}\n` +
      (Number(form.tax_rate) > 0 ? `Tax (${form.tax_rate}%): $${Number(form.tax_amount || 0).toFixed(2)}\n` : "") +
      `Total Due: $${Number(form.total || 0).toFixed(2)}\n` +
      (form.notes ? `\nNotes: ${form.notes}\n` : "") +
      `\nThank you for your business!\n\nElite Engine Development`
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
      <div className="flex items-center gap-4 mb-6">
        <Link to="/Invoices"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{form.invoice_number}</h1>
        </div>
        <Badge className={`${STATUS_STYLES[form.status]} border-0 capitalize`}>{form.status}</Badge>
        <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Print</Button>
        <Button variant="outline" onClick={sendInvoice} disabled={sending || !form.customer_id}>
          <Send className="w-4 h-4 mr-1" />{sending ? "Sending..." : "Send"}
        </Button>
        {["sent","partial","overdue"].includes(form.status) && (
          <Button variant="outline" className="border-emerald-300 text-emerald-700" onClick={() => setRecordingPayment(true)}>
            <DollarSign className="w-4 h-4 mr-1" /> Record Payment
          </Button>
        )}
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
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
            <div className="text-sm text-slate-600">Balance remaining: ${Number(form.balance_due || form.total || 0).toFixed(2)}</div>
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

      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Line Items</CardTitle>
          <Button size="sm" variant="outline" onClick={addLine}><Plus className="w-4 h-4 mr-1" /> Add Line</Button>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 font-medium text-slate-600">Description</th>
                <th className="text-center py-2 font-medium text-slate-600 w-20">Qty</th>
                <th className="text-right py-2 font-medium text-slate-600 w-28">Unit Price</th>
                <th className="text-right py-2 font-medium text-slate-600 w-28">Total</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(form.line_items || []).map((line, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="py-2 pr-3">
                    <Input value={line.description} onChange={e => updateLine(idx, "description", e.target.value)} className="border-0 shadow-none px-0" />
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" value={line.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} className="text-center border-slate-200" min="0" />
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" value={line.unit_price} onChange={e => updateLine(idx, "unit_price", Number(e.target.value))} className="text-right border-slate-200" min="0" step="0.01" />
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
                <span className="text-slate-600">Tax Rate (%)</span>
                <Input type="number" value={form.tax_rate} onChange={e => updateTaxRate(Number(e.target.value))} className="w-20 text-right h-7" min="0" step="0.1" />
              </div>
              {Number(form.tax_rate) > 0 && <div className="flex justify-between"><span className="text-slate-600">Tax</span><span>${Number(form.tax_amount || 0).toFixed(2)}</span></div>}
              <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2"><span>Total</span><span>${Number(form.total || 0).toFixed(2)}</span></div>
              {Number(form.amount_paid) > 0 && <div className="flex justify-between text-emerald-600"><span>Paid</span><span>-${Number(form.amount_paid).toFixed(2)}</span></div>}
              <div className="flex justify-between text-base font-bold text-[#e20404]"><span>Balance Due</span><span>${Number(form.balance_due || 0).toFixed(2)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <div><Label>Notes for Customer</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={4} /></div>
        <div><Label>Payment Notes</Label><Textarea value={form.payment_notes} onChange={e => setForm({...form, payment_notes: e.target.value})} rows={4} /></div>
      </div>
    </div>
  );
}