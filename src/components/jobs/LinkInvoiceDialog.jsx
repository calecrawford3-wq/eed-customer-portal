import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Receipt } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";

export default function LinkInvoiceDialog({ open, onClose, job }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: invoicesData } = useQuery({
    queryKey: ["link-invoices", job?.customer_id],
    queryFn: () =>
      base44.entities.Invoice.filter(
        { customer_id: job.customer_id, status: { $ne: "void" } },
        { sort: "-issue_date", limit: 100, fields: ["invoice_number", "status", "total", "balance_due", "issue_date"] }
      ),
    enabled: !!job?.customer_id && open,
  });

  const invoices = invoicesData?.items || invoicesData || [];
  const existingIds = job?.invoice_ids || [];
  const filtered = invoices.filter(
    (inv) =>
      !existingIds.includes(inv.id) &&
      (!search || (inv.invoice_number || "").toLowerCase().includes(search.toLowerCase()))
  );

  const linkInvoice = async (invoiceId) => {
    setSaving(true);
    try {
      await base44.entities.Job.update(job.id, {
        invoice_ids: [...existingIds, invoiceId],
      });
      qc.invalidateQueries({ queryKey: ["job", job.id] });
      qc.invalidateQueries({ queryKey: ["job-invoices"] });
      toast.success("Invoice linked to job");
      onClose();
    } catch (e) {
      toast.error("Failed to link invoice: " + e.message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Link Invoice to {job?.job_number}</DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice number..."
            className="pl-9 h-9"
          />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No available invoices found for this customer.
            </p>
          ) : (
            filtered.map((inv) => (
              <button
                key={inv.id}
                onClick={() => linkInvoice(inv.id)}
                disabled={saving}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-[#e20404] hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-slate-400" />
                  <span className="font-mono text-sm">{inv.invoice_number}</span>
                  <Badge variant="outline" className="text-xs">{inv.status}</Badge>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{formatMoney(inv.total || 0)}</p>
                  <p className="text-xs text-slate-400">Bal: {formatMoney(inv.balance_due || 0)}</p>
                </div>
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}