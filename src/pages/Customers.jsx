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
import { Plus, Search, User, Mail, Phone, Building2, Trash2, Edit, Users, Eye, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useRef } from "react";

const emptyCustomer = {
  first_name: "", last_name: "", company_name: "", email: "", phone: "",
  address_line1: "", address_line2: "", city: "", state: "", zip: "",
  notes: "", status: "active", tax_exempt: false, parts_markup_override: null
};

export default function Customers() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyCustomer);
  const qc = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
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

  const csvInputRef = useRef();

  const openNew = () => { setEditing(null); setForm(emptyCustomer); setDialogOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...c }); setDialogOpen(true); };

  const [importing, setImporting] = useState(false);
  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        // Strip BOM, normalize line endings
        const text = String(ev.target.result).replace(/^\ufeff/, "");
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) {
          toast.error("CSV needs a header row plus at least one customer");
          return;
        }
        const parseLine = (line) => {
          // simple CSV parse honoring quoted fields with commas
          const out = [];
          let cur = "", inQ = false;
          for (let j = 0; j < line.length; j++) {
            const ch = line[j];
            if (ch === '"') { inQ = !inQ; continue; }
            if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
            cur += ch;
          }
          out.push(cur);
          return out.map(v => v.trim());
        };
        const headers = parseLine(lines[0]).map(h => h.toLowerCase());
        const toCreate = [];
        for (let i = 1; i < lines.length; i++) {
          const vals = parseLine(lines[i]);
          const row = {};
          headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
          const customer = {
            first_name: row.first_name || row["first name"] || row.firstname || "",
            last_name: row.last_name || row["last name"] || row.lastname || "",
            company_name: row.company_name || row.company || "",
            email: row.email || "",
            phone: row.phone || "",
            address_line1: row.address_line1 || row.address || "",
            city: row.city || "",
            state: row.state || "",
            zip: row.zip || row.postal_code || "",
            status: "active",
          };
          if (customer.first_name || customer.email) toCreate.push(customer);
        }
        if (toCreate.length === 0) {
          toast.error("No valid rows found in CSV");
          return;
        }
        const created = await base44.entities.Customer.bulkCreate(toCreate);
        qc.invalidateQueries({ queryKey: ["customers"] });
        toast.success(`Imported ${created.length} customers`);
      } catch (err) {
        console.error("CSV import failed:", err);
        toast.error(`Import failed: ${err.message || err}`);
      } finally {
        setImporting(false);
      }
    };
    reader.onerror = () => { toast.error("Could not read file"); setImporting(false); };
    reader.readAsText(file);
    e.target.value = "";
  };

  const filtered = customers.filter(c =>
    `${c.first_name} ${c.last_name} ${c.company_name} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
          <p className="text-slate-500 mt-1">{customers.length} total customers</p>
        </div>
        <div className="flex gap-2">
          <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
          <Button variant="outline" onClick={() => csvInputRef.current.click()} disabled={importing}>
            <Upload className="w-4 h-4 mr-2" /> {importing ? "Importing..." : "Import CSV"}
          </Button>
          <Button onClick={openNew} className="bg-[#e20404] hover:bg-[#c00303] text-white">
            <Plus className="w-4 h-4 mr-2" /> Add Customer
          </Button>
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input className="pl-10" placeholder="Search by name, company, or email..." value={search} onChange={e => setSearch(e.target.value)} />
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
                {(c.tax_exempt || (c.parts_markup_override !== null && c.parts_markup_override !== undefined)) && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {c.tax_exempt && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">Tax Exempt</Badge>}
                    {c.parts_markup_override !== null && c.parts_markup_override !== undefined && <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px]">{c.parts_markup_override}% Markup</Badge>}
                  </div>
                )}
                <div className="flex gap-2 mt-4">
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
          <div className="grid grid-cols-2 gap-4 py-2">
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
    </div>
  );
}