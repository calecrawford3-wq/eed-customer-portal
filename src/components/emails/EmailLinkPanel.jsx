import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Link2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const DOC_TYPES = [
  { value: "purchase_order", label: "Purchase Order", field: "po_number" },
  { value: "invoice", label: "Invoice", field: "invoice_number" },
  { value: "estimate", label: "Estimate", field: "estimate_number" },
  { value: "build", label: "Engine Build", field: "engine_serial_number" },
];

export default function EmailLinkPanel({ open, onClose, email }) {
  const qc = useQueryClient();
  const [custQuery, setCustQuery] = useState("");
  const [selectedCust, setSelectedCust] = useState(
    email?.customer_id ? { id: email.customer_id, name: email.customer_name } : null
  );
  const [linkType, setLinkType] = useState(email?.link_type && email.link_type !== "none" ? email.link_type : "purchase_order");
  const [docNumber, setDocNumber] = useState(email?.link_number || "");
  const [custResults, setCustResults] = useState([]);
  const [saving, setSaving] = useState(false);

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
      let linkId = "";
      let linkNumber = docNumber.trim();
      if (dt && linkNumber) {
        const entityName =
          dt.value === "purchase_order" ? "PurchaseOrder" :
          dt.value === "invoice" ? "Invoice" :
          dt.value === "estimate" ? "Estimate" :
          dt.value === "build" ? "EngineBuild" : null;
        if (entityName) {
          const matches = await base44.entities[entityName].list("-created_date", 200);
          const found = matches.find((m) => String(m[dt.field] || "") === linkNumber);
          if (!found) {
            toast.error(`No ${dt.label} found with number "${linkNumber}"`);
            setSaving(false);
            return;
          }
          linkId = found.id;
        }
      }
      await base44.entities.Email.update(email.id, {
        customer_id: selectedCust?.id || "",
        customer_name: selectedCust?.name || "",
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
            <Input className="mt-2" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="Document number (e.g. PO-1024, INV-205, serial #)" />
            <p className="text-xs text-slate-400 mt-1">Leave the number blank to link only the customer.</p>
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