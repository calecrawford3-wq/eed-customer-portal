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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, User, Mail, Phone, Building2, Trash2, Edit, Users, Eye, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useRef } from "react";

const emptyCustomer = {
  first_name: "", last_name: "", company_name: "", email: "", phone: "",
  address_line1: "", address_line2: "", city: "", state: "", zip: "",
  notes: "", status: "active"
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
        // Invite customer to portal if email is present
        if (data.email) {
          try {
            await base44.auth.inviteUser(data.email, "user");
          } catch (err) {
            console.warn("Portal invite failed:", err.message);
          }
        }
        return newCustomer;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setDialogOpen(false);
      toast.success(editing ? "Customer updated" : "Customer created & invite sent");
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

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const lines = ev.target.result.split("\n").filter(Boolean);
      const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, "").toLowerCase());
      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(",").map(v => v.trim().replace(/"/g, ""));
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
        if (customer.first_name || customer.email) {
          await base44.entities.Customer.create(customer);
          imported++;
        }
      }
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`Imported ${imported} customers`);
    };
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
          <Button variant="outline" onClick={() => csvInputRef.current.click()}>
            <Upload className="w-4 h-4 mr-2" /> Import CSV
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