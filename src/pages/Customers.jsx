import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, User, Mail, Phone, Building2, Trash2, Edit, Users, Eye, Upload, MessageSquare, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useRef } from "react";
import CustomerCsvImportModal from "@/components/customers/CustomerCsvImportModal";
import CountrySelect from "@/components/CountrySelect";
import CallButton from "@/components/CallButton";

function normalizePhone(p) { if (!p) return ""; let d = p.replace(/\D/g, ""); if (d.length === 10) d = "1" + d; return d; }

const emptyCustomer = {
  first_name: "", last_name: "", company_name: "", email: "", phone: "",
  address_line1: "", address_line2: "", city: "", state: "", zip: "", country: "",
  notes: "", status: "active", tax_exempt: false, parts_markup_override: null
};

export default function Customers() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyCustomer);
  const [importOpen, setImportOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("recent");
  const qc = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["all-invoices-stats"],
    queryFn: () => base44.entities.Invoice.list("-created_date", 500),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editing) {
        return base44.entities.Customer.update(editing.id, data);
      } else {
        const newCustomer = await base44.entities.Customer.create(data);
        // Send signup email if email is present
        if (data.email) {
          try {
            await base44.functions.invoke('sendCustomerSignupEmail', {
              email: data.email,
              customerName: `${data.first_name} ${data.last_name}`.trim()
            });
          } catch (err) {
            console.warn("Signup email failed:", err.message);
          }
        }
        return newCustomer;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setDialogOpen(false);
      toast.success(editing ? "Customer updated" : "Customer created & signup email sent");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Customer.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer deleted");
    },
  });

  const openNew = () => { setEditing(null); setForm(emptyCustomer); setDialogOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...c }); setDialogOpen(true); };



  const customerBalances = {};
  const customerInvoiced = {};
  invoices.forEach(inv => {
    const cid = inv.customer_id;
    if (!cid) return;
    customerBalances[cid] = (customerBalances[cid] || 0) + (inv.balance_due || 0);
    customerInvoiced[cid] = (customerInvoiced[cid] || 0) + (inv.total || 0);
  });

  const activeCount = customers.filter(c => c.status === "active").length;
  const inactiveCount = customers.filter(c => c.status !== "active").length;
  const totalOutstanding = Object.values(customerBalances).reduce((s, v) => s + Math.max(0, v), 0);
  const totalLifetime = Object.values(customerInvoiced).reduce((s, v) => s + v, 0);

  let filtered = customers.filter(c =>
    `${c.first_name} ${c.last_name} ${c.company_name} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  if (statusFilter === "active") filtered = filtered.filter(c => c.status === "active");
  else if (statusFilter === "inactive") filtered = filtered.filter(c => c.status !== "active");
  else if (statusFilter === "tax_exempt") filtered = filtered.filter(c => c.tax_exempt);
  else if (statusFilter === "has_balance") filtered = filtered.filter(c => (customerBalances[c.id] || 0) > 0);

  if (sortKey === "name") filtered.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  else if (sortKey === "balance_desc") filtered.sort((a, b) => (customerBalances[b.id] || 0) - (customerBalances[a.id] || 0));
  else if (sortKey === "oldest") filtered.sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Customers</h1>
          <p className="text-slate-500 mt-1">{customers.length} total customers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import CSV
          </Button>
          <Button onClick={openNew} className="bg-[#e20404] hover:bg-[#c00303] text-white">
            <Plus className="w-4 h-4 mr-2" /> Add Customer
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="border-0 shadow-sm"><CardContent className="p-4">
          <p className="text-xs text-slate-500">Active Customers</p>
          <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4">
          <p className="text-xs text-slate-500">Inactive</p>
          <p className="text-2xl font-bold text-slate-400">{inactiveCount}</p>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4">
          <p className="text-xs text-slate-500">Outstanding Balances</p>
          <p className="text-2xl font-bold text-[#e20404]">${totalOutstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-4">
          <p className="text-xs text-slate-500">Total Lifetime Revenue</p>
          <p className="text-2xl font-bold text-slate-900">${totalLifetime.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
        </CardContent></Card>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-10" placeholder="Search by name, company, or email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Filter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="inactive">Inactive Only</SelectItem>
            <SelectItem value="tax_exempt">Tax Exempt</SelectItem>
            <SelectItem value="has_balance">Has Balance Due</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={setSortKey}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="balance_desc">Highest Balance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-40 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No customers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <Card key={c.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#e20404]/10 p-2 rounded-lg">
                      <User className="w-5 h-5 text-[#e20404]" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{c.first_name} {c.last_name}</p>
                      {c.company_name && <p className="text-sm text-slate-500">{c.company_name}</p>}
                    </div>
                  </div>
                  <Badge className={c.status === "active" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                    {c.status}
                  </Badge>
                </div>
                {c.email && <div className="flex items-center gap-2 text-sm text-slate-600 mb-1"><Mail className="w-3.5 h-3.5" />{c.email}</div>}
                {c.phone && <div className="flex items-center gap-2 text-sm text-slate-600 mb-1"><Phone className="w-3.5 h-3.5" />{c.phone}</div>}
                {c.city && <div className="flex items-center gap-2 text-sm text-slate-600"><Building2 className="w-3.5 h-3.5" />{c.city}, {c.state}</div>}
                {c.created_date && <div className="flex items-center gap-2 text-sm text-slate-400"><Calendar className="w-3.5 h-3.5" />Since {new Date(c.created_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</div>}
                {(customerBalances[c.id] || 0) > 0 && <Badge className="bg-red-100 text-red-700 border-0 text-[10px] mt-1">Owes ${(customerBalances[c.id] || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</Badge>}
                {(c.tax_exempt || (c.parts_markup_override !== null && c.parts_markup_override !== undefined)) && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {c.tax_exempt && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">Tax Exempt</Badge>}
                    {c.parts_markup_override !== null && c.parts_markup_override !== undefined && <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px]">{c.parts_markup_override}% Markup</Badge>}
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                   <CallButton customer={c} iconOnly size="sm" />
                   <Link to={`/Messaging?phone=${normalizePhone(c.phone || "")}&compose=1`}>
                     <Button size="sm" variant="outline" className="w-8 h-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title={`Message ${c.first_name}`}>
                       <MessageSquare className="w-3.5 h-3.5" />
                     </Button>
                   </Link>
                   <Link to={`/CustomerDetail?id=${c.id}`} className="flex-1">
                     <Button size="sm" variant="outline" className="w-full">
                       <Eye className="w-3.5 h-3.5 mr-1" /> View
                     </Button>
                   </Link>
                   <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                     <Edit className="w-3.5 h-3.5" />
                   </Button>
                   <Button size="sm" variant="outline" className="text-red-500 hover:text-red-700" onClick={() => deleteMutation.mutate(c.id)}>
                     <Trash2 className="w-3.5 h-3.5" />
                   </Button>
                 </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Customer" : "New Customer"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div><Label>First Name *</Label><Input value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} /></div>
            <div><Label>Last Name *</Label><Input value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} /></div>
            <div><Label>Company</Label><Input value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})} /></div>
            <div><Label>Email *</Label><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Address</Label><Input value={form.address_line1} onChange={e => setForm({...form, address_line1: e.target.value})} placeholder="Street address" /></div>
            <div><Label>City</Label><Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>State</Label><Input value={form.state} onChange={e => setForm({...form, state: e.target.value})} /></div>
              <div><Label>ZIP</Label><Input value={form.zip} onChange={e => setForm({...form, zip: e.target.value})} /></div>
            </div>
            <div className="col-span-2"><Label>Country</Label><CountrySelect value={form.country || ""} onChange={v => setForm({...form, country: v})} /></div>
            <div className="col-span-2 flex items-center gap-3 pt-3 border-t border-slate-100">
              <Switch checked={!!form.tax_exempt} onCheckedChange={v => setForm({...form, tax_exempt: v})} />
              <div>
                <Label className="cursor-pointer">Tax Exempt</Label>
                <p className="text-xs text-slate-400">No sales tax charged on this customer's estimates/invoices</p>
              </div>
            </div>
            <div className="col-span-2">
              <Label>Parts Markup Override (%)</Label>
              <Input type="number" value={form.parts_markup_override ?? ""} onChange={e => setForm({...form, parts_markup_override: e.target.value === "" ? null : Number(e.target.value)})} placeholder="Leave blank to use each part's own markup" min="0" step="0.1" />
              <p className="text-xs text-slate-400 mt-1">Set a percentage to override each part's markup for this customer (e.g. 10 = 10% markup on cost instead of the part's default).</p>
            </div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Create Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerCsvImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}