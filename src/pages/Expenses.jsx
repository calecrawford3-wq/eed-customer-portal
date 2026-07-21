import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Trash2, Edit, ShoppingCart, Receipt, TrendingDown, AlertCircle, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "parts_cogs", label: "Parts / COGS" },
  { value: "supplies", label: "Supplies" },
  { value: "tools_equipment", label: "Tools & Equipment" },
  { value: "shipping", label: "Shipping" },
  { value: "utilities", label: "Utilities" },
  { value: "rent", label: "Rent" },
  { value: "labor", label: "Labor" },
  { value: "marketing", label: "Marketing" },
  { value: "insurance", label: "Insurance" },
  { value: "taxes", label: "Taxes & Fees" },
  { value: "other", label: "Other" },
];

const emptyExpense = {
  expense_number: "",
  category: "other",
  description: "",
  vendor: "",
  amount: 0,
  tax_amount: 0,
  date: new Date().toISOString().split("T")[0],
  payment_method: "card",
  is_deductible: true,
  notes: "",
  source: "manual",
};

export default function Expenses() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyExpense);
  const [tab, setTab] = useState("all");
  const [scanning, setScanning] = useState(false);
  const receiptInputRef = useRef(null);
  const qc = useQueryClient();

  const handleReceiptScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this receipt image and extract the expense details. Return ONLY a JSON object with these fields:
- description: what was purchased (brief, max 80 chars)
- vendor: store/vendor name
- amount: total amount paid (number, no currency symbol)
- tax_amount: tax amount if visible (number, 0 if not found)
- date: date in YYYY-MM-DD format (use today if not found)
- category: one of: parts_cogs, supplies, tools_equipment, shipping, utilities, rent, labor, marketing, insurance, taxes, other
- payment_method: one of: cash, card, check, ach, other`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            description: { type: "string" },
            vendor: { type: "string" },
            amount: { type: "number" },
            tax_amount: { type: "number" },
            date: { type: "string" },
            category: { type: "string" },
            payment_method: { type: "string" },
          }
        }
      });
      setForm(f => ({
        ...f,
        description: result.description || f.description,
        vendor: result.vendor || f.vendor,
        amount: result.amount || f.amount,
        tax_amount: result.tax_amount ?? f.tax_amount,
        date: result.date || f.date,
        category: result.category || f.category,
        payment_method: result.payment_method || f.payment_method,
        receipt_url: file_url,
      }));
      toast.success("Receipt scanned — please review the details");
    } catch {
      toast.error("Failed to scan receipt");
    }
    setScanning(false);
    e.target.value = "";
  };

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => base44.entities.Expense.list("-date", 500),
  });

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["purchaseOrders"],
    queryFn: () => base44.entities.PurchaseOrder.list("-created_date", 200),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-created_date", 100),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.Expense.update(editing.id, data)
      : base44.entities.Expense.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setDialogOpen(false);
      toast.success(editing ? "Expense updated" : "Expense recorded");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Expense.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense deleted");
    },
  });

  // Received POs not yet expensed
  const receivedPOs = purchaseOrders.filter(po =>
    (po.status === "received" || po.status === "partial") &&
    !expenses.find(e => e.po_id === po.id)
  );

  const handleExpensePO = async (po) => {
    const supplier = suppliers.find(s => s.id === po.supplier_id);
    const lineTotal = (po.line_items || []).reduce((s, l) => s + (l.total || 0), 0);
    const poTax = po.tax_amount || 0;
    const totalCost = lineTotal + (po.shipping_cost || 0) + poTax;
    const desc = (po.line_items || []).map(l => l.description || l.part_number).filter(Boolean).join(", ");
    await saveMutation.mutateAsync({
      expense_number: `EXP-${po.po_number}`,
      category: "parts_cogs",
      description: `PO ${po.po_number}${desc ? `: ${desc.substring(0, 80)}` : ""}`,
      vendor: supplier?.name || "",
      amount: totalCost,
      tax_amount: poTax,
      date: po.received_date || new Date().toISOString().split("T")[0],
      payment_method: "other",
      is_deductible: true,
      notes: `Auto-expensed from Purchase Order ${po.po_number}`,
      source: "purchase_order",
      po_id: po.id,
    });
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyExpense, expense_number: `EXP-${Date.now().toString().slice(-6)}` });
    setDialogOpen(true);
  };
  const openEdit = (e) => { setEditing(e); setForm({ ...e }); setDialogOpen(true); };

  const filtered = expenses.filter(e => {
    const matchSearch = (e.description + e.vendor + e.category + (e.expense_number || "")).toLowerCase().includes(search.toLowerCase());
    if (tab === "po") return matchSearch && e.source === "purchase_order";
    if (tab === "manual") return matchSearch && e.source === "manual";
    return matchSearch;
  });

  const totalExpenses = filtered.reduce((s, e) => s + (e.amount || 0), 0);
  const totalTax = filtered.reduce((s, e) => s + (e.tax_amount || 0), 0);
  const deductible = filtered.filter(e => e.is_deductible).reduce((s, e) => s + (e.amount || 0), 0);

  const getCategoryLabel = (val) => CATEGORIES.find(c => c.value === val)?.label || val;

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Expenses</h1>
          <p className="text-slate-500 mt-1">Track costs, COGS, and write-offs</p>
        </div>
        <Button onClick={openNew} className="bg-[#e20404] hover:bg-[#c00303] text-white">
          <Plus className="w-4 h-4 mr-2" /> Add Expense
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Total Expenses (filtered)</p>
            <p className="text-2xl font-bold text-slate-900">${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Tax Paid</p>
            <p className="text-2xl font-bold text-slate-900">${totalTax.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Deductible</p>
            <p className="text-2xl font-bold text-emerald-600">${deductible.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending PO Expenses */}
      {receivedPOs.length > 0 && (
        <Card className="border-0 shadow-sm mb-6 border-l-4 border-l-amber-400">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              {receivedPOs.length} Received PO{receivedPOs.length > 1 ? "s" : ""} Pending Expense Entry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {receivedPOs.map(po => {
              const supplier = suppliers.find(s => s.id === po.supplier_id);
              const total = (po.line_items || []).reduce((s, l) => s + (l.total || 0), 0) + (po.shipping_cost || 0) + (po.tax_amount || 0);
              return (
                <div key={po.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">PO {po.po_number}</p>
                    <p className="text-xs text-slate-500">{supplier?.name || "Unknown vendor"} · ${total.toFixed(2)}</p>
                  </div>
                  <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-50"
                    onClick={() => handleExpensePO(po)} disabled={saveMutation.isPending}>
                    <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Expense This PO
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Search & Tabs */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-10" placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All ({expenses.length})</TabsTrigger>
          <TabsTrigger value="manual">Manual</TabsTrigger>
          <TabsTrigger value="po">From POs</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <TrendingDown className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>No expenses recorded</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Date</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Description</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Vendor</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Category</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600">Amount</th>
                <th className="text-center py-3 px-4 font-medium text-slate-600">Deductible</th>
                <th className="py-3 px-4 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(exp => (
                <tr key={exp.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{exp.date}</td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900">{exp.description}</p>
                    {exp.source === "purchase_order" && <Badge className="text-xs bg-blue-100 text-blue-700 border-0 mt-0.5">PO</Badge>}
                  </td>
                  <td className="py-3 px-4 text-slate-600">{exp.vendor || "—"}</td>
                  <td className="py-3 px-4"><Badge className="bg-slate-100 text-slate-700 border-0 text-xs">{getCategoryLabel(exp.category)}</Badge></td>
                  <td className="py-3 px-4 text-right font-semibold">${Number(exp.amount || 0).toFixed(2)}</td>
                  <td className="py-3 px-4 text-center">
                    {exp.is_deductible ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Yes</Badge> : <Badge className="bg-slate-100 text-slate-400 border-0 text-xs">No</Badge>}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(exp)}><Edit className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(exp.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200">
              <tr>
                <td colSpan={4} className="py-3 px-4 font-semibold text-slate-700">Total</td>
                <td className="py-3 px-4 text-right font-bold text-slate-900">${totalExpenses.toFixed(2)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Expense" : "Add Expense"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {/* Receipt Scanner */}
            {!editing && (
              <div>
                <input ref={receiptInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleReceiptScan} />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed border-slate-300 text-slate-600 hover:border-[#e20404] hover:text-[#e20404]"
                  onClick={() => receiptInputRef.current?.click()}
                  disabled={scanning}
                >
                  {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
                  {scanning ? "Scanning receipt..." : "Scan Receipt with AI"}
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Reference #</Label><Input value={form.expense_number || ""} onChange={e => setForm({ ...form, expense_number: e.target.value })} placeholder="EXP-001" /></div>
              <div><Label>Date *</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            </div>
            <div><Label>Description *</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What was purchased..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Vendor</Label><Input value={form.vendor || ""} onChange={e => setForm({ ...form, vendor: e.target.value })} /></div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount *</Label>
                <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} className="pl-7" min="0" step="0.01" />
                </div>
              </div>
              <div>
                <Label>Tax Paid</Label>
                <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <Input type="number" value={form.tax_amount || 0} onChange={e => setForm({ ...form, tax_amount: Number(e.target.value) })} className="pl-7" min="0" step="0.01" />
                </div>
              </div>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="ach">ACH</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_deductible} onCheckedChange={v => setForm({ ...form, is_deductible: v })} />
              <Label>Tax Deductible</Label>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.description || !form.amount}>
              {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Add Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}