import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatPhone } from "@/lib/formatPhone";

const empty = { name: "", contact_name: "", email: "", phone: "", website: "", account_number: "", payment_terms: "", status: "active" };

export default function QuickCreateSupplierModal({ open, onClose, onCreated, defaultPhone }) {
  const [form, setForm] = useState(empty);
  const qc = useQueryClient();

  useEffect(() => {
    if (open && defaultPhone) setForm((f) => ({ ...f, phone: formatPhone(defaultPhone) }));
  }, [open, defaultPhone]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Supplier.create(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Supplier created");
      onCreated(result);
      setForm(empty);
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Quick Add Supplier</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2"><Label>Supplier Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cometic Gaskets" /></div>
          <div><Label>Contact Name</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: formatPhone(e.target.value) })} placeholder="(999) 999-9999" /></div>
          <div className="col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div className="col-span-2"><Label>Website</Label><Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://" /></div>
          <div><Label>Account #</Label><Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} /></div>
          <div><Label>Payment Terms</Label><Input value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} placeholder="Net 30" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-[#e20404] hover:bg-[#c00303] text-white"
            onClick={() => createMutation.mutate(form)}
            disabled={createMutation.isPending || !form.name}
          >
            {createMutation.isPending ? "Creating..." : "Create Supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}