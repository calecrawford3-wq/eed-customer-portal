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
import { Link2, Search, Loader2, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import EmailDocPreview from "./EmailDocPreview";

const CUSTOMER_DOC_TYPES = [
  { value: "invoice", label: "Invoice", entity: "Invoice", field: "invoice_number", custField: "customer_id" },
  { value: "estimate", label: "Estimate", entity: "Estimate", field: "estimate_number", custField: "customer_id" },
  { value: "build", label: "Engine Build", entity: "EngineBuild", field: "engine_serial_number", custField: "customer_id" },
];
const SUPPLIER_DOC_TYPES = [
  { value: "purchase_order", label: "Purchase Order", entity: "PurchaseOrder", field: "po_number", filterField: "supplier_id" },
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
  const [party, setParty] = useState(
    email?.link_type === "purchase_order" || (email?.supplier_id && !email?.customer_id) ? "supplier" : "customer"
  );
  const [custQuery, setCustQuery] = useState("");
  const [supQuery, setSupQuery] = useState("");
  const [selectedCust, setSelectedCust] = useState(
    email?.customer_id ? { id: email.customer_id, name: email.customer_name } : null
  );
  const [selectedSup, setSelectedSup] = useState(
    email?.supplier_id ? { id: email.supplier_id, name: email.supplier_name } : null
  );
  const [linkType, setLinkType] = useState(() => {
    const t = email?.link_type && email.link_type !== "none" ? email.link_type : "invoice";
    return t === "purchase_order" ? "purchase_order" : (t === "build" ? "build" : (t === "estimate" ? "estimate" : "invoice"));
  });
  const [custResults, setCustResults] = useState([]);
  const [supResults, setSupResults] = useState([]);
  const [saving, setSaving] = useState(false);

  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(email?.link_id || "");
  const [previewOpen, setPreviewOpen] = useState(false);

  const docTypes = party === "supplier" ? SUPPLIER_DOC_TYPES : CUSTOMER_DOC_TYPES;
  const dt = docTypes.find((d) => d.value === linkType) || docTypes[0];

  // Reset link type when switching party so it stays valid for the available types.
  const switchParty = (p) => {
    setParty(p);
    const types = p === "supplier" ? SUPPLIER_DOC_TYPES : CUSTOMER_DOC_TYPES;
    if (!types.find((t) => t.value === linkType)) setLinkType(types[0].value);
  };

  useEffect(() => {
    let cancelled = false;
    if (!dt) { setDocs([]); return; }
    const needsCust = dt.custField && !selectedCust?.id;
    const needsSup = dt.filterField && !selectedSup?.id;
    if (needsCust || needsSup) { setDocs([]); setSelectedDocId(""); return; }
    setLoadingDocs(true);
    (async () => {
      try {
        let list;
        if (dt.custField) {
          list = await base44.entities[dt.entity].filter({ [dt.custField]: selectedCust.id }, "-created_date", 200);
        } else if (dt.filterField) {
          list = await base44.entities[dt.entity].filter({ [dt.filterField]: selectedSup.id }, "-created_date", 200);
        }
        if (cancelled) return;
        setDocs(list || []);
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
  }, [linkType, party, selectedCust?.id, selectedSup?.id, email?.link_id, email?.link_type]);

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

  const searchSuppliers = async (q) => {
    setSupQuery(q);
    if (q.trim().length < 2) { setSupResults([]); return; }
    try {
      const all = await base44.entities.Supplier.list("-created_date", 200);
      const ql = q.toLowerCase();
      setSupResults(
        all.filter((s) =>
          `${s.name || ""} ${s.contact_name || ""} ${s.email || ""}`.toLowerCase().includes(ql)
        ).slice(0, 8)
      );
    } catch (_) { setSupResults([]); }
  };

  const selectedDoc = docs.find((d) => d.id === selectedDocId);

  const handleLink = async () => {
    if (!email) return;
    setSaving(true);
    try {
      let linkId = "";
      let linkNumber = "";
      let customerId = selectedCust?.id || "";
      let customerName = selectedCust?.name || "";
      let supplierId = selectedSup?.id || "";
      let supplierName = selectedSup?.name || "";
      if (dt && selectedDoc) {
        linkId = selectedDoc.id;
        linkNumber = String(selectedDoc[dt.field] || "");
        if (linkType === "purchase_order" && selectedDoc.supplier_id) {
          supplierId = selectedDoc.supplier_id;
          try {
            const sups = await base44.entities.Supplier.list("-created_date", 200);
            const sup = sups.find((s) => s.id === selectedDoc.supplier_id);
            if (sup) supplierName = sup.name || "";
          } catch (_) { /* ignore */ }
        }
      }
      await base44.entities.Email.update(email.id, {
        customer_id: customerId,
        customer_name: customerName,
        supplier_id: supplierId,
        supplier_name: supplierName,
        link_type: linkId ? linkType : "none",
        link_id: linkId,
        link_number: linkId ? linkNumber : "",
        is_linked: !!(linkId || customerId || supplierId),
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

  const needsSelection =
    (dt?.custField && !selectedCust?.id) || (dt?.filterField && !selectedSup?.id);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Link Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Party toggle */}
          <div className="flex gap-2">
            <Button
              size="sm" variant={party === "customer" ? "default" : "outline"}
              onClick={() => switchParty("customer")}
              className={party === "customer" ? "bg-[#e20404] hover:bg-[#c00303]" : ""}
            >
              Customer
            </Button>
            <Button
              size="sm" variant={party === "supplier" ? "default" : "outline"}
              onClick={() => switchParty("supplier")}
              className={party === "supplier" ? "bg-[#e20404] hover:bg-[#c00303]" : ""}
            >
              Supplier
            </Button>
          </div>

          {/* Customer search */}
          {party === "customer" && (
            <div>
              <Label className="text-xs text-slate-500">Customer</Label>
              {selectedCust ? (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-medium">{selectedCust.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => { setSelectedCust(null); setCustQuery(""); }}>Change</Button>
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
          )}

          {/* Supplier search */}
          {party === "supplier" && (
            <div>
              <Label className="text-xs text-slate-500">Supplier</Label>
              {selectedSup ? (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-medium">{selectedSup.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => { setSelectedSup(null); setSupQuery(""); }}>Change</Button>
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
                    <Input className="pl-8" value={supQuery} onChange={(e) => searchSuppliers(e.target.value)} placeholder="Search supplier by name or email" />
                  </div>
                  {supResults.length > 0 && (
                    <div className="mt-1 border rounded-md max-h-40 overflow-y-auto bg-white">
                      {supResults.map((s) => (
                        <button key={s.id} onClick={() => { setSelectedSup({ id: s.id, name: s.name }); setSupResults([]); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 border-b last:border-0">
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-slate-500">{s.email} {s.contact_name ? `· ${s.contact_name}` : ""}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Document type + picker */}
          <div>
            <Label className="text-xs text-slate-500">Link to document</Label>
            <Select value={linkType} onValueChange={setLinkType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {docTypes.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {needsSelection ? (
              <p className="text-xs text-amber-600 mt-2">
                Select a {party === "supplier" ? "supplier" : "customer"} first to see their {dt.label.toLowerCase()}s.
              </p>
            ) : loadingDocs ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading {dt.label.toLowerCase()}s…</div>
            ) : (
              <>
                <div className="flex gap-2 mt-2">
                  <Select value={selectedDocId || "none"} onValueChange={(v) => setSelectedDocId(v === "none" ? "" : v)} className="flex-1">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific document</SelectItem>
                      {docs.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{docLabel(d, dt)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button" variant="outline" size="icon"
                    disabled={!selectedDocId}
                    onClick={() => setPreviewOpen(true)}
                    title="Preview selected document"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
                {docs.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">No {dt.label.toLowerCase()}s found for this {party === "supplier" ? "supplier" : "customer"}.</p>
                )}
                <p className="text-xs text-slate-400 mt-1">Pick "No specific document" to link only the {party === "supplier" ? "supplier" : "customer"}.</p>
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

      {selectedDoc && (
        <EmailDocPreview open={previewOpen} onClose={() => setPreviewOpen(false)} doc={selectedDoc} docType={linkType} />
      )}
    </Dialog>
  );
}