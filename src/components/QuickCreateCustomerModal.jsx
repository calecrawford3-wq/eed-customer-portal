import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatPhone } from "@/lib/formatPhone";
import CountrySelect from "@/components/CountrySelect";

const empty = { first_name: "", last_name: "", company_name: "", email: "", phone: "", country: "", status: "active" };

export default function QuickCreateCustomerModal({ open, onClose, onCreated, defaultPhone }) {
  const [form, setForm] = useState(empty);
  const qc = useQueryClient();

  useEffect(() => {
    if (open && defaultPhone) setForm((f) => ({ ...f, phone: formatPhone(defaultPhone) }));
  }, [open, defaultPhone]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Customer.create(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created");
      onCreated(result);
      setForm(empty);
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Quick Add Customer</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div><Label>First Name *</Label><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><Label>Last Name *</Label><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
          <div className="col-span-2"><Label>Company</Label><Input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} /></div>
          <div className="col-span-2"><Label>Email *</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div className="col-span-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: formatPhone(e.target.value) })} placeholder="(999) 999-9999" /></div>
          <div className="col-span-2"><Label>Country</Label><CountrySelect value={form.country} onChange={v => setForm({ ...form, country: v })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-[#e20404] hover:bg-[#c00303] text-white"
            onClick={() => createMutation.mutate(form)}
            disabled={createMutation.isPending || !form.first_name || !form.last_name || !form.email}
          >
            {createMutation.isPending ? "Creating..." : "Create Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}