import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const money = (n) => (typeof n === "number" ? `$${n.toFixed(2)}` : "—");

function Row({ label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex justify-between gap-3 text-sm py-1 border-b last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function LineItems({ items }) {
  if (!items || !items.length) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-medium text-slate-500 mb-1">Line items</div>
      <div className="border rounded-md max-h-48 overflow-y-auto">
        {items.slice(0, 12).map((it, i) => (
          <div key={i} className="flex justify-between gap-2 px-3 py-1.5 text-xs border-b last:border-0">
            <span className="truncate">{it.item_name || it.part_number || it.description || it.name || "—"}</span>
            <span className="text-slate-600 whitespace-nowrap">
              {it.quantity != null ? `×${it.quantity}` : ""} {it.total != null ? money(it.total) : (it.price != null ? money(it.price) : "")}
            </span>
          </div>
        ))}
        {items.length > 12 && <div className="px-3 py-1 text-xs text-slate-400">+{items.length - 12} more…</div>}
      </div>
    </div>
  );
}

export default function EmailDocPreview({ open, onClose, doc, docType }) {
  if (!doc) return null;
  const typeLabel =
    docType === "invoice" ? "Invoice" :
    docType === "estimate" ? "Estimate" :
    docType === "purchase_order" ? "Purchase Order" :
    docType === "build" ? "Engine Build" : "Document";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span>{typeLabel} Preview</span>
            <Button size="icon" variant="ghost" className="absolute right-4 top-4" onClick={onClose}><X className="w-4 h-4" /></Button>
          </DialogTitle>
          <DialogDescription>Confirm this is the correct document before linking.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {docType === "invoice" && (
            <>
              <Row label="Invoice #" value={doc.invoice_number} />
              <Row label="Status" value={doc.status} />
              <Row label="Issued" value={doc.issue_date} />
              <Row label="Due" value={doc.due_date} />
              <Row label="Subtotal" value={money(doc.subtotal)} />
              <Row label="Tax" value={money(doc.tax_amount)} />
              <Row label="Total" value={money(doc.total)} />
              <Row label="Amount paid" value={money(doc.amount_paid)} />
              <Row label="Balance due" value={money(doc.balance_due ?? doc.amount_due)} />
              <LineItems items={doc.line_items} />
              <LineItems items={(doc.labor_items || []).map((l) => ({ ...l, total: l.price }))} />
              <LineItems items={(doc.machining_items || []).map((m) => ({ ...m, total: (Number(m.price) || 0) * (Number(m.quantity) || 1), quantity: m.quantity || 1 }))} />
            </>
          )}
          {docType === "estimate" && (
            <>
              <Row label="Estimate #" value={doc.estimate_number} />
              <Row label="Status" value={doc.status} />
              <Row label="Issued" value={doc.issue_date} />
              <Row label="Expires" value={doc.expiry_date} />
              <Row label="Subtotal" value={money(doc.subtotal)} />
              <Row label="Total" value={money(doc.total)} />
              <Row label="Amount due" value={money(doc.amount_due)} />
              <LineItems items={doc.line_items} />
              <LineItems items={(doc.labor_items || []).map((l) => ({ ...l, total: l.price }))} />
              <LineItems items={(doc.machining_items || []).map((m) => ({ ...m, total: (Number(m.price) || 0) * (Number(m.quantity) || 1), quantity: m.quantity || 1 }))} />
            </>
          )}
          {docType === "purchase_order" && (
            <>
              <Row label="PO #" value={doc.po_number} />
              <Row label="Status" value={doc.status} />
              <Row label="Ordered" value={doc.order_date} />
              <Row label="Expected" value={doc.expected_date} />
              <Row label="Received" value={doc.received_date} />
              <Row label="Subtotal" value={money(doc.subtotal)} />
              <Row label="Shipping" value={money(doc.shipping_cost)} />
              <Row label="Tax" value={money(doc.tax_amount)} />
              <Row label="Total" value={money(doc.total)} />
              <LineItems items={doc.line_items} />
            </>
          )}
          {docType === "build" && (
            <>
              <Row label="Serial #" value={doc.engine_serial_number} />
              <Row label="EED ID" value={doc.eed_id} />
              <Row label="Build #" value={doc.build_number} />
              <Row label="Status" value={doc.status} />
              <Row label="Work tag" value={doc.work_tag} />
              <Row label="Platform" value={doc.platform_id} />
              <Row label="Application" value={doc.application} />
              <Row label="Target HP" value={doc.target_power_hp} />
              <Row label="Max RPM" value={doc.max_rpm} />
              <Row label="Started" value={doc.start_date} />
              <Row label="Completed" value={doc.completion_date} />
              {doc.assembly_notes && <div className="mt-2 text-xs text-slate-600 whitespace-pre-wrap">{doc.assembly_notes}</div>}
            </>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}