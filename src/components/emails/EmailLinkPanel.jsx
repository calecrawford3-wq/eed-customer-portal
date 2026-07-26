import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Link2, Search, Loader2, Eye, X } from "lucide-react";
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

const LINK_LABEL = {
  customer: "Customer", supplier: "Supplier", invoice: "INV",
  estimate: "EST", purchase_order: "PO", build: "Build",
};

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

  // Existing flexible links for this email (multi-link)
  const { data: existingLinks = [] } = useQuery({
    queryKey: ["email-links", email?.id],
    queryFn: () => (email?.id ? base44.entities.EmailLink.filter({ email_id: email.id }, "-created_date", 100) : []),
    enabled: !!email?.id && open,
  });

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
          `${c.first_name} ${c.last_name} ${c.company_name || ""} ${c.email || ""} ${(c.additional_emails || []).join(" ")}`.toLowerCase().includes(ql)
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
      const newLinks = [];
      let customerId = selectedCust?.id || "";
      let customerName = selectedCust?.name || "";
      let supplierId = selectedSup?.id || "";
      let supplierName = selectedSup?.name || "";
      let primaryLinkType = "none";
      let primaryLinkId = "";
      let primaryLinkNumber = "";

      if (dt && selectedDoc) {
        primaryLinkId = selectedDoc.id;
        primaryLinkNumber = String(selectedDoc[dt.field] || "");
        primaryLinkType = linkType;
        newLinks.push({
          email_id: email.id,
          thread_id: email.thread_id || "",
          account_id: email.account_id || "",
          entity_type: linkType,
          entity_id: selectedDoc.id,
          entity_label: primaryLinkNumber,
          link_source: "manual",
        });
        if (linkType === "purchase_order" && selectedDoc.supplier_id) {
          supplierId = selectedDoc.supplier_id;
          try {
            const sups = await base44.entities.Supplier.list("-created_date", 200);
            const sup = sups.find((s) => s.id === selectedDoc.supplier_id);
            if (sup) supplierName = sup.name || "";
          } catch (_) { /* ignore */ }
        }
      }
      if (selectedCust?.id) {
        newLinks.push({ email_id: email.id, thread_id: email.thread_id || "", account_id: email.account_id || "", entity_type: "customer", entity_id: selectedCust.id, entity_label: customerName, link_source: "manual" });
      }
      if (selectedSup?.id) {
        newLinks.push({ email_id: email.id, thread_id: email.thread_id || "", account_id: email.account_id || "", entity_type: "supplier", entity_id: selectedSup.id, entity_label: supplierName, link_source: "manual" });
      }

      // Dedupe against existing links (same entity_type+entity_id)
      const existingKeys = new Set((existingLinks || []).map((l) => `${l.entity_type}|${l.entity_id}`));
      const toCreate = newLinks.filter((l) => !existingKeys.has(`${l.entity_type}|${l.entity_id}`));
      if (toCreate.length) {
        await base44.entities.EmailLink.bulkCreate(toCreate);
      }

      // Keep the Email denormalized "primary" link in sync for list badges/back-compat
      await base44.entities.Email.update(email.id, {
        customer_id: customerId,
        customer_name: customerName,
        supplier_id: supplierId,
        supplier_name: supplierName,
        link_type: primaryLinkId ? primaryLinkType : "none",
        link_id: primaryLinkId,
        link_number: primaryLinkId ? primaryLinkNumber : "",
        is_linked: !!(primaryLinkId || customerId || supplierId),
      });
      toast.success(toCreate.length ? `Linked (${toCreate.length} new)` : "Links up to date");
      qc.invalidateQueries({ queryKey: ["email-links", email.id] });
      qc.invalidateQueries({ queryKey: ["emails"] });
      qc.invalidateQueries({ queryKey: ["emails-section"] });
      onClose();
    } catch (e) {
      toast.error("Link failed: " + (e?.message || "error"));
    } finally {
      setSaving(false);
    }
  };

  const removeLink = async (link) => {
    setSaving(true);
    try {
      await base44.entities.EmailLink.delete(link.id);
      // If this was the primary document link, recompute primary from remaining links
      const remaining = existingLinks.filter((l) => l.id !== link.id);
      const docLink = remaining.find((l) => ["invoice", "estimate", "purchase_order", "build"].includes(l.entity_type));
      await base44.entities.Email.update(email.id, {
        link_type: docLink ? docLink.entity_type : "none",
        link_id: docLink ? docLink.entity_id : "",
        link_number: docLink ? docLink.entity_label : "",
        is_linked: remaining.length > 0,
      });
      qc.invalidateQueries({ queryKey: ["email-links", email.id] });
      qc.invalidateQueries({ queryKey: ["emails"] });
      toast.success("Link removed");
    } catch (e) {
      toast.error("Remove failed: " + (e?.message || "error"));
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkAll = async () => {
    if (!email) return;
    setSaving(true);
    try {
      // Delete all EmailLink records for this email
      const links = existingLinks || [];
      for (const l of links) {
        try { await base44.entities.EmailLink.delete(l.id); } catch (_) { /* best-effort */ }
      }
      await base44.entities.Email.update(email.id, {
        link_type: "none", link_id: "", link_number: "", is_linked: false,
      });
      toast.success("All links removed");
      qc.invalidateQueries({ queryKey: ["email-links", email.id] });
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
          {/* Existing links (multi-link) */}
          {existingLinks.length > 0 && (
            <div>
              <Label className="text-xs text-slate-500">Current links</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {existingLinks.map((l) => (
                  <Badge key={l.id} variant="outline" className="text-xs py-1 px-2 flex items-center gap-1">
                    <span className="text-slate-400">{LINK_LABEL[l.entity_type] || l.entity_type}:</span>
                    <span className="font-medium">{l.entity_label || l.entity_id}</span>
                    {l.link_source === "auto" && <span className="text-[10px] text-slate-400">·auto</span>}
                    <button onClick={() => removeLink(l)} disabled={saving} className="ml-0.5 text-slate-400 hover:text-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Party toggle */}
          <div className="flex gap-2">
            <Button size="sm" variant={party === "customer" ? "default" : "outline"} onClick={() => switchParty("customer")}
              className={party === "customer" ? "bg-[#e20404] hover:bg-[#c00303]" : ""}>
              Customer
            </Button>
            <Button size="sm" variant={party === "supplier" ? "default" : "outline"} onClick={() => switchParty("supplier")}
              className={party === "supplier" ? "bg-[#e20404] hover:bg-[#c00303]" : ""}>
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
                  <Button type="button" variant="outline" size="icon" disabled={!selectedDocId} onClick={() => setPreviewOpen(true)} title="Preview selected document">
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
            {existingLinks.length > 0 && (
              <Button variant="ghost" onClick={handleUnlinkAll} disabled={saving} className="text-red-600">Remove all links</Button>
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