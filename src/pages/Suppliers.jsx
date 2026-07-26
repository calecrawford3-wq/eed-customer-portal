import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Mail, Phone, Globe, Trash2, Edit, Truck } from "lucide-react";
import EmailsSection from "@/components/emails/EmailsSection";
import { toast } from "sonner";

const emptySupplier = {
  name: "", contact_name: "", email: "", phone: "", website: "",
  address_line1: "", city: "", state: "", zip: "",
  account_number: "", payment_terms: "", notes: "", status: "active"
};

export default function Suppliers() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptySupplier);
  const [emailsFor, setEmailsFor] = useState(null);
  const qc = useQueryClient();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => base44.entities.Supplier.list("-created_date", 200),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.Supplier.update(editing.id, data)
      : base44.entities.Supplier.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setDialogOpen(false);
      toast.success(editing ? "Supplier updated" : "Supplier created");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Supplier.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier deleted");
    },
  });

  const openNew = () => { setEditing(null); setForm(emptySupplier); setDialogOpen(true); };
  const openEdit = (s) => { setEditing(s); setForm({ ...s }); setDialogOpen(true); };

  const filtered = suppliers.filter(s =>
    `${s.name} ${s.contact_name} ${s.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Suppliers</h1>
          <p className="text-slate-500 mt-1">{suppliers.length} total suppliers</p>
        </div>
        <Button onClick={openNew} className="bg-[#e20404] hover:bg-[#c00303] text-white">
          <Plus className="w-4 h-4 mr-2" /> Add Supplier
        </Button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input className="pl-10" placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No suppliers yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <Card key={s.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    {s.contact_name && <p className="text-sm text-slate-500">{s.contact_name}</p>}
                  </div>
                  <Badge className={s.status === "active" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
                    {s.status}
                  </Badge>
                </div>
                {s.email && <div className="flex items-center gap-2 text-sm text-slate-600 mb-1"><Mail className="w-3.5 h-3.5" />{s.email}</div>}
                {s.phone && <div className="flex items-center gap-2 text-sm text-slate-600 mb-1"><Phone className="w-3.5 h-3.5" />{s.phone}</div>}
                {s.website && <div className="flex items-center gap-2 text-sm text-slate-600 mb-1"><Globe className="w-3.5 h-3.5" />{s.website}</div>}
                {s.payment_terms && <p className="text-xs text-slate-500 mt-2">Terms: {s.payment_terms}</p>}
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(s)}>
                    <Edit className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" title="View emails" onClick={() => setEmailsFor(s)}>
                    <Mail className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-500 hover:text-red-700" onClick={() => deleteMutation.mutate(s.id)}>
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
            <DialogTitle>{editing ? "Edit Supplier" : "New Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2"><Label>Company Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><Label>Contact Name</Label><Input value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            <div><Label>Website</Label><Input value={form.website} onChange={e => setForm({...form, website: e.target.value})} /></div>
            <div><Label>Account Number</Label><Input value={form.account_number} onChange={e => setForm({...form, account_number: e.target.value})} /></div>
            <div><Label>Payment Terms</Label><Input value={form.payment_terms} onChange={e => setForm({...form, payment_terms: e.target.value})} placeholder="e.g. Net 30" /></div>
            <div className="col-span-2"><Label>Address</Label><Input value={form.address_line1} onChange={e => setForm({...form, address_line1: e.target.value})} /></div>
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
              {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Create Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!emailsFor} onOpenChange={(o) => { if (!o) setEmailsFor(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-4 h-4 text-[#e20404]" /> Emails — {emailsFor?.name}</DialogTitle>
          </DialogHeader>
          {emailsFor && <EmailsSection supplierId={emailsFor.id} title={`All email threads with ${emailsFor.name}`} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}