import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Link2, Search, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const DOC_TYPES = [
  { value: "purchase_order", label: "Purchase Order", entity: "PurchaseOrder", field: "po_number", custField: null },
  { value: "invoice", label: "Invoice", entity: "Invoice", field: "invoice_number", custField: "customer_id" },
  { value: "estimate", label: "Estimate", entity: "Estimate", field: "estimate_number", custField: "customer_id" },
  { value: "build", label: "Engine Build", entity: "EngineBuild", field: "engine_serial_number", custField: "customer_id" },
];

function docLabel(doc, dt) {
  const num = doc[dt.field] || "(no number)";
  let sub = "";
  if (dt.value === "build") sub = doc.eed_id || doc.build_number || "";
  else sub = doc.status || "";
  return sub ? `${num} · ${sub}` : num;
}

export default function EmailLinkPanel({ open, onClose, email }) {
  const qc = useQueryClient();
  const [custQuery, setCustQuery] = useState("");
  const [selectedCust, setSelectedCust] = useState(
    email?.customer_id ? { id: email.customer_id, name: email.customer_name } : null
  );
  const [linkType, setLinkType] = useState(email?.link_type && email.link_type !== "none" ? email.link_type : "purchase_order");
  const [custResults, setCustResults] = useState([]);
  const [saving, setSaving] = useState(false);

  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(email?.link_id || "");

  useEffect(() => {
    let cancelled = false;
    const dt = DOC_TYPES.find((d) => d.value === linkType);
    if (!dt) { setDocs([]); return; }
    // Document types tied to a customer require a customer selection first.
    if (dt.custField && !selectedCust?.id) {
      setDocs([]); setSelectedDocId("");
      return;
    }
    setLoadingDocs(true);
    (async () => {
      try {
        let list;
        if (dt.custField && selectedCust?.id) {
          list = await base44.entities[dt.entity].filter({ [dt.custField]: selectedCust.id }, "-created_date", 200);
        } else {
          list = await base44.entities[dt.entity].list("-created_date", 200);
        }
        if (cancelled) return;
        setDocs(list || []);
        // Preserve the existing link if it's still present in the list.
        if (email?.link_type === linkType && email?.link_id && (list || []).some((d) => d.id === email.link_id)) {
          setSelectedDocId(email.link_id);
        } else {
          setSelectedDocId("");
        }
      } catch (_) {
        if (!cancelled) setDocs([]);
      } finally {
        if (!cancelled) setLoadingDocs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [linkType, selectedCust?.id, email?.link_id, email?.link_type]);

  const searchCustomers = async (q) => {
    setCustQuery(q);
    if (q.trim().length < 2) { setCustResults([]); return; }
    try {
      const all = await base44.entities.Customer.list("-created_date", 200);
      const ql = q.toLowerCase();
      setCustResults(
        all.filter((c) =>
          `${c.first_name} ${c.last_name} ${c.company_name || ""} ${c.email || ""}`.toLowerCase().includes(ql)
        ).slice(0, 8)
      );
    } catch (_) { setCustResults([]); }
  };

  const handleLink = async () => {
    if (!email) return;
    setSaving(true);
    try {
      const dt = DOC_TYPES.find((d) => d.value === linkType);
      const selectedDoc = docs.find((d) => d.id === selectedDocId);
      let linkId = "";
      let linkNumber = "";
      let matchedSupplierId = "";
      let matchedSupplierName = "";
      if (dt && selectedDoc) {
        linkId = selectedDoc.id;
        linkNumber = String(selectedDoc[dt.field] || "");
        // When linking to a purchase order, capture the PO's supplier so the
        // email also appears on that vendor's profile.
        if (linkType === "purchase_order" && selectedDoc.supplier_id) {
          matchedSupplierId = selectedDoc.supplier_id;
          try {
            const sups = await base44.entities.Supplier.list("-created_date", 200);
            const sup = sups.find((s) => s.id === selectedDoc.supplier_id);
            if (sup) matchedSupplierName = sup.name || "";
          } catch (_) { /* ignore */ }
        }
      }
      await base44.entities.Email.update(email.id, {
        customer_id: selectedCust?.id || "",
        customer_name: selectedCust?.name || "",
        supplier_id: matchedSupplierId,
        supplier_name: matchedSupplierName,
        link_type: linkId ? linkType : "none",
        link_id: linkId,
        link_number: linkId ? linkNumber : "",
        is_linked: !!linkId,
      });
      toast.success("Email linked");
      qc.invalidateQueries({ queryKey: ["emails"] });
      onClose();
    } catch (e) {
      toast.error("Link failed: " + (e?.message || "error"));
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (!email) return;
    setSaving(true);
    try {
      await base44.entities.Email.update(email.id, {
        link_type: "none", link_id: "", link_number: "", is_linked: false,
      });
      toast.success("Link removed");
      qc.invalidateQueries({ queryKey: ["emails"] });
      onClose();
    } catch (e) {
      toast.error("Unlink failed: " + (e?.message || "error"));
    } finally {
      setSaving(false);
    }
  };

  const dt = DOC_TYPES.find((d) => d.value === linkType);
  const needsCustomer = dt?.custField && !selectedCust?.id;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Link Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-slate-500">Customer</Label>
            {selectedCust ? (
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-medium">{selectedCust.name}</span>
                <Button size="sm" variant="ghost" onClick={() => { setSelectedCust(null); setCustQuery(""); }}>
                  Change
                </Button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
                  <Input className="pl-8" value={custQuery} onChange={(e) => searchCustomers(e.target.value)} placeholder="Search customer by name or email" />
                </div>
                {custResults.length > 0 && (
                  <div className="mt-1 border rounded-md max-h-40 overflow-y-auto bg-white">
                    {custResults.map((c) => (
                      <button key={c.id} onClick={() => { setSelectedCust({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() }); setCustResults([]); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 border-b last:border-0">
                        <div className="font-medium">{c.first_name} {c.last_name}</div>
                        <div className="text-xs text-slate-500">{c.email} {c.company_name ? `· ${c.company_name}` : ""}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs text-slate-500">Link to document</Label>
            <Select value={linkType} onValueChange={setLinkType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {needsCustomer ? (
              <p className="text-xs text-amber-600 mt-2">Select a customer first to see their {dt.label.toLowerCase()}s.</p>
            ) : loadingDocs ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading {dt.label.toLowerCase()}s…</div>
            ) : (
              <>
                <Select value={selectedDocId || "none"} onValueChange={(v) => setSelectedDocId(v === "none" ? "" : v)}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific document</SelectItem>
                    {docs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{docLabel(d, dt)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {docs.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">No {dt.label.toLowerCase()}s found for this customer.</p>
                )}
                <p className="text-xs text-slate-400 mt-1">Pick "No specific document" to link only the customer.</p>
              </>
            )}
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          <div>
            {email?.is_linked && (
              <Button variant="ghost" onClick={handleUnlink} disabled={saving} className="text-red-600">Remove link</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleLink} disabled={saving} className="bg-[#e20404] hover:bg-[#c00303]">
              {saving ? "Saving…" : "Save link"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}