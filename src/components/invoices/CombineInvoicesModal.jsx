import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Search, Layers, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const STAGE_LABELS = { stock: "Stock", stage_1: "Stage 1", stage_2: "Stage 2", stage_3: "Stage 3", contract: "Contract", custom: "Custom" };

function buildSectionLabel(invoice, engine, platform) {
  const eed = engine?.eed_id || invoice.eed_id;
  const serial = engine?.engine_serial_number || invoice.engine_serial_number;
  const plat = platform ? `${platform.manufacturer} ${platform.name}`.trim() : "";
  const stage = engine?.current_stage ? (STAGE_LABELS[engine.current_stage] || engine.current_stage) : "";
  let label = "";
  if (eed) label = `EED ${eed}`;
  else if (serial) label = `S/N ${serial}`;
  else label = invoice.invoice_number;
  if (plat) label += ` — ${plat}`;
  if (stage) label += ` (${stage})`;
  return label;
}

export default function CombineInvoicesModal({ open, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [combining, setCombining] = useState(false);

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list("-created_date", 200),
    enabled: open,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
    enabled: open,
  });
  const { data: engines = [] } = useQuery({
    queryKey: ["customerEngines-all"],
    queryFn: () => base44.entities.CustomerEngine.list("-created_date", 500),
    enabled: open,
  });
  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
    enabled: open,
  });

  // Only invoices that are not already combined, not void, and have a customer
  const eligible = useMemo(() => invoices.filter(i => !i.is_combined && i.status !== "void" && i.customer_id && !i.combined_parent_id), [invoices]);

  const getCustomer = (id) => customers.find(c => c.id === id);
  const getEngine = (id) => engines.find(e => e.id === id);
  const getPlatform = (id) => platforms.find(p => p.id === id);

  const selectedInvoices = eligible.filter(i => selected.includes(i.id));
  const selectedCustomerIds = [...new Set(selectedInvoices.map(i => i.customer_id))];
  const sameCustomer = selectedCustomerIds.length <= 1;

  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const filtered = eligible.filter(i => {
    const c = getCustomer(i.customer_id);
    const q = `${i.invoice_number} ${c?.first_name} ${c?.last_name} ${c?.company_name}`.toLowerCase();
    return q.includes(search.toLowerCase());
  });

  const handleCombine = async () => {
    if (selected.length < 2) { toast.error("Select at least 2 invoices to combine"); return; }
    if (!sameCustomer) { toast.error("All selected invoices must belong to the same customer"); return; }
    setCombining(true);
    try {
      const customerId = selectedInvoices[0].customer_id;
      const customer = getCustomer(customerId);

      // Build aggregated, sectioned line items / labor / machining
      const lineItems = [];
      const laborItems = [];
      const machiningItems = [];
      const memberIds = [];

      for (const inv of selectedInvoices) {
        memberIds.push(inv.id);
        const engine = getEngine(inv.customer_engine_id);
        const platform = getPlatform(engine?.platform_id);
        const section = buildSectionLabel(inv, engine, platform);

        (inv.line_items || []).forEach(l => {
          if (l.item_name || l.part_number || l.total) {
            lineItems.push({ ...l, engine_section: section });
          }
        });
        (inv.labor_items || []).forEach(l => {
          if (l.name || l.price) {
            laborItems.push({ ...l, engine_section: section });
          }
        });
        (inv.machining_items || []).forEach(m => {
          if (m.name || m.price) {
            machiningItems.push({ ...m, engine_section: section });
          }
        });
      }

      const partTotal = lineItems.reduce((s, l) => s + (l.total || 0), 0);
      const laborTotal = laborItems.reduce((s, l) => s + (Number(l.price) || 0), 0);
      const machiningTotal = machiningItems.reduce((s, m) => s + (Number(m.price) || 0), 0);
      const subtotal = partTotal + laborTotal + machiningTotal;
      const taxRate = customer?.tax_exempt ? 0 : (selectedInvoices[0].tax_rate || 0);
      const taxAmount = partTotal * (Number(taxRate) / 100);
      const total = subtotal + taxAmount;

      const combined = await base44.entities.Invoice.create({
        invoice_number: `INV-COMBINED-${Date.now().toString().slice(-6)}`,
        customer_id: customerId,
        is_combined: true,
        member_invoice_ids: memberIds,
        status: "draft",
        issue_date: new Date().toISOString().split("T")[0],
        due_date: "",
        line_items: lineItems,
        labor_items: laborItems,
        machining_items: machiningItems,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        subtotal,
        total,
        amount_paid: 0,
        balance_due: total,
        notes: `Combined invoice containing ${memberIds.length} invoices: ${selectedInvoices.map(i => i.invoice_number).join(", ")}`,
      });

      // Mark member invoices with combined_parent_id
      await base44.entities.Invoice.bulkUpdate(
        memberIds.map(id => ({ id, combined_parent_id: combined.id }))
      );

      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`Combined ${memberIds.length} invoices into ${combined.invoice_number}`);
      onClose();
      navigate(`/InvoiceDetail?id=${combined.id}`);
    } catch (err) {
      toast.error("Combine failed: " + (err?.message || "error"));
    } finally {
      setCombining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#e20404]" />
            Combine Invoices
          </DialogTitle>
          <p className="text-sm text-slate-500">
            Select multiple invoices for the same customer to merge into one combined invoice. The originals stay as separate internal records, each linked back to the combined invoice. Items will be grouped by engine on the customer-facing view.
          </p>
        </DialogHeader>

        {selected.length > 0 && !sameCustomer && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4" />
            All selected invoices must belong to the same customer.
          </div>
        )}

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-10" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="border border-slate-200 rounded-lg max-h-[45vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No eligible invoices</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="w-10 px-3 py-2"></th>
                  <th className="text-left px-2 py-2 font-medium text-slate-600">Invoice #</th>
                  <th className="text-left px-2 py-2 font-medium text-slate-600">Customer</th>
                  <th className="text-left px-2 py-2 font-medium text-slate-600">Engine</th>
                  <th className="text-right px-2 py-2 font-medium text-slate-600">Total</th>
                  <th className="text-center px-2 py-2 font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const c = getCustomer(inv.customer_id);
                  const engine = getEngine(inv.customer_engine_id);
                  const platform = getPlatform(engine?.platform_id);
                  const isSel = selected.includes(inv.id);
                  return (
                    <tr key={inv.id} className={`border-t border-slate-100 cursor-pointer ${isSel ? "bg-[#e20404]/5" : "hover:bg-slate-50"}`} onClick={() => toggle(inv.id)}>
                      <td className="px-3 py-2"><Checkbox checked={isSel} /></td>
                      <td className="px-2 py-2 font-mono font-medium text-[#e20404]">{inv.invoice_number}</td>
                      <td className="px-2 py-2 text-slate-900">{c ? `${c.first_name} ${c.last_name}` : "—"}</td>
                      <td className="px-2 py-2 text-slate-500 text-xs">{engine ? buildSectionLabel(inv, engine, platform) : "—"}</td>
                      <td className="px-2 py-2 text-right font-semibold">${(inv.total || 0).toFixed(2)}</td>
                      <td className="px-2 py-2 text-center"><Badge className="bg-slate-100 text-slate-600 border-0 capitalize text-xs">{inv.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="text-sm text-slate-500">{selected.length} selected</span>
          {selected.length > 0 && sameCustomer && (
            <span className="text-sm text-emerald-600 font-medium">
              {getCustomer(selectedInvoices[0].customer_id)?.first_name} {getCustomer(selectedInvoices[0].customer_id)?.last_name} • Total: ${selectedInvoices.reduce((s, i) => s + (i.total || 0), 0).toFixed(2)}
            </span>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleCombine} disabled={combining || selected.length < 2 || !sameCustomer}>
            <Layers className="w-4 h-4 mr-1" /> {combining ? "Combining..." : `Combine ${selected.length} Invoices`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}