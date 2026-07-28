import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Phone, Users } from "lucide-react";
import { formatPhone } from "@/lib/formatPhone";
import { toast } from "sonner";

const empty = { first_name: "", last_name: "", phone: "", email: "", relationship: "", notes: "" };

export default function CustomerContactsCard({ customerId }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const { data: contacts = [] } = useQuery({
    queryKey: ["customer-contacts", customerId],
    queryFn: () => base44.entities.CustomerContact.filter({ customer_id: customerId }, "-created_date", 200),
    enabled: !!customerId,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editingId
      ? base44.entities.CustomerContact.update(editingId, data)
      : base44.entities.CustomerContact.create({ ...data, customer_id: customerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-contacts", customerId] });
      setOpen(false); setForm(empty); setEditingId(null);
      toast.success("Contact saved");
    },
    onError: (e) => toast.error(e?.message || "Failed to save contact"),
  });

  const deleteMutation = useMutation({
    mutationFn: (cid) => base44.entities.CustomerContact.delete(cid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customer-contacts", customerId] }); toast.success("Contact deleted"); },
  });

  const openAdd = () => { setForm(empty); setEditingId(null); setOpen(true); };
  const openEdit = (c) => {
    setForm({ first_name: c.first_name || "", last_name: c.last_name || "", phone: c.phone || "", email: c.email || "", relationship: c.relationship || "", notes: c.notes || "" });
    setEditingId(c.id); setOpen(true);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> Additional Contacts</CardTitle>
          <Button size="sm" variant="outline" onClick={openAdd}><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>
        </div>
        <div className="space-y-2">
          {contacts.length === 0 ? (
            <p className="text-sm text-slate-400">No additional contacts. Add the driver, dad, crew chief, etc.</p>
          ) : contacts.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-50 last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {c.first_name} {c.last_name}{c.relationship ? <span className="text-slate-400 font-normal"> · {c.relationship}</span> : null}
                </p>
                {c.phone && <p className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</p>}
                {c.email && <p className="text-xs text-slate-500 truncate">{c.email}</p>}
                {c.notes && <p className="text-xs text-slate-400 truncate">{c.notes}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(c)}><Edit2 className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500" onClick={() => deleteMutation.mutate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Edit Contact" : "Add Contact"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div><Label>First Name *</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><Label>Last Name *</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
            <div className="col-span-2"><Label>Phone *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} placeholder="(999) 999-9999" /></div>
            <div className="col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="col-span-2"><Label>Relationship / Role</Label><Input value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} placeholder="Driver, Father, Crew Chief..." /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" disabled={!form.first_name || !form.last_name || !form.phone || saveMutation.isPending} onClick={() => saveMutation.mutate(form)}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}