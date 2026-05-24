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
import { ArrowLeft, Plus, Trash2, Send, Printer } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";

const emptyLine = { description: "", quantity: 1, unit_price: 0, total: 0 };

export default function EstimateDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const isNew = params.get("new") === "1";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    estimate_number: `EST-${Date.now().toString().slice(-6)}`,
    customer_id: "", status: "draft",
    issue_date: new Date().toISOString().split("T")[0],
    expiry_date: "",
    line_items: [{ ...emptyLine }],
    tax_rate: 0, notes: "", internal_notes: ""
  });
  const [sending, setSending] = useState(false);

  const { data: estimate } = useQuery({
    queryKey: ["estimate", id],
    queryFn: () => base44.entities.Estimate.filter({ id }),
    enabled: !!id,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  useEffect(() => {
    if (estimate && estimate[0]) {
      setForm({ ...estimate[0] });
    }
  }, [estimate]);

  const saveMutation = useMutation({
    mutationFn: (data) => id
      ? base44.entities.Estimate.update(id, data)
      : base44.entities.Estimate.create(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      toast.success("Estimate saved");
      if (isNew) navigate(`/EstimateDetail?id=${result.id}`);
    },
  });

  const updateLine = (idx, field, value) => {
    const lines = [...form.line_items];
    lines[idx] = { ...lines[idx], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      lines[idx].total = (Number(lines[idx].quantity) || 0) * (Number(lines[idx].unit_price) || 0);
    }
    const subtotal = lines.reduce((s, l) => s + (l.total || 0), 0);
    const tax_amount = subtotal * (Number(form.tax_rate) / 100);
    setForm({ ...form, line_items: lines, subtotal, tax_amount, total: subtotal + tax_amount });
  };

  const addLine = () => setForm({ ...form, line_items: [...form.line_items, { ...emptyLine }] });
  const removeLine = (idx) => {
    const lines = form.line_items.filter((_, i) => i !== idx);
    const subtotal = lines.reduce((s, l) => s + (l.total || 0), 0);
    const tax_amount = subtotal * (Number(form.tax_rate) / 100);
    setForm({ ...form, line_items: lines, subtotal, tax_amount, total: subtotal + tax_amount });
  };

  const updateTaxRate = (rate) => {
    const subtotal = form.line_items.reduce((s, l) => s + (l.total || 0), 0);
    const tax_amount = subtotal * (Number(rate) / 100);
    setForm({ ...form, tax_rate: rate, subtotal, tax_amount, total: subtotal + tax_amount });
  };

  const sendEstimate = async () => {
    const customer = customers.find(c => c.id === form.customer_id);
    if (!customer?.email) { toast.error("Customer has no email address"); return; }
    setSending(true);
    await saveMutation.mutateAsync(form);

    const lineItemsText = (form.line_items || []).map(l =>
      `  ${l.description} | Qty: ${l.quantity} | Unit: $${Number(l.unit_price).toFixed(2)} | Total: $${Number(l.total).toFixed(2)}`
    ).join("\n");

    const subject = encodeURIComponent(`Estimate ${form.estimate_number} from Elite Engine Development`);
    const body = encodeURIComponent(
      `Dear ${customer.first_name} ${customer.last_name},\n\n` +
      `Please find your estimate below. This estimate is valid until ${form.expiry_date || "30 days from issue"}.\n\n` +
      `Estimate #${form.estimate_number}\n` +
      `-------------------------------\n` +
      `${lineItemsText}\n` +
      `-------------------------------\n` +
      `Subtotal: $${Number(form.subtotal || 0).toFixed(2)}\n` +
      (Number(form.tax_rate) > 0 ? `Tax (${form.tax_rate}%): $${Number(form.tax_amount || 0).toFixed(2)}\n` : "") +
      `Total: $${Number(form.total || 0).toFixed(2)}\n` +
      (form.notes ? `\nNotes: ${form.notes}\n` : "") +
      `\nTo approve or discuss this estimate, please contact us.\n\nElite Engine Development`
    );

    window.open(`mailto:${customer.email}?subject=${subject}&body=${body}`, "_blank");

    await base44.entities.Estimate.update(id || "", { status: "sent" });
    qc.invalidateQueries({ queryKey: ["estimates"] });
    setForm(f => ({ ...f, status: "sent" }));
    setSending(false);
    toast.success(`Email draft opened for ${customer.email}`);
  };

  const customer = customers.find(c => c.id === form.customer_id);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/Estimates"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{form.estimate_number}</h1>
        </div>
        <Badge className={form.status === "draft" ? "bg-slate-100 text-slate-600 border-0" : form.status === "sent" ? "bg-blue-100 text-blue-700 border-0" : form.status === "approved" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-red-100 text-red-700 border-0"}>
          {form.status}
        </Badge>
        <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Print</Button>
        <Button variant="outline" onClick={sendEstimate} disabled={sending || !form.customer_id}>
          <Send className="w-4 h-4 mr-1" /> {sending ? "Sending..." : "Send to Customer"}
        </Button>
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Estimate Details</CardTitle></CardHeader>
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
              <div><Label>Expiry Date</Label><Input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} /></div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["draft","sent","approved","declined","expired"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
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
              {customer.phone && <p className="text-slate-600">{customer.phone}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Line Items */}
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
                    <Input value={line.description} onChange={e => updateLine(idx, "description", e.target.value)} placeholder="Description of work or parts..." className="border-0 shadow-none px-0" />
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
              <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2"><span>Total</span><span className="text-[#e20404]">${Number(form.total || 0).toFixed(2)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <div><Label>Customer Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={4} placeholder="Notes visible to customer..." /></div>
        <div><Label>Internal Notes</Label><Textarea value={form.internal_notes} onChange={e => setForm({...form, internal_notes: e.target.value})} rows={4} placeholder="Internal only..." /></div>
      </div>
    </div>
  );
}