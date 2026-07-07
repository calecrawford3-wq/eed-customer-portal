import React, { useState, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileUp, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

const MAPPABLE_FIELDS = [
  { key: "first_name", label: "First Name", required: true, type: "string" },
  { key: "last_name", label: "Last Name", required: true, type: "string" },
  { key: "company_name", label: "Company", required: false, type: "string" },
  { key: "email", label: "Email", required: true, type: "string" },
  { key: "phone", label: "Phone", required: false, type: "string" },
  { key: "address_line1", label: "Address 1", required: false, type: "string" },
  { key: "address_line2", label: "Address 2", required: false, type: "string" },
  { key: "city", label: "City", required: false, type: "string" },
  { key: "state", label: "State", required: false, type: "string" },
  { key: "zip", label: "ZIP", required: false, type: "string" },
  { key: "notes", label: "Notes", required: false, type: "string" },
  { key: "parts_markup_override", label: "Markup Override %", required: false, type: "number" },
];

const NUMERIC_FIELDS = new Set(
  MAPPABLE_FIELDS.filter((f) => f.type === "number").map((f) => f.key)
);

function parseCSV(text) {
  const rows = [];
  let current = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { current.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && next === "\n") i++;
        current.push(field); field = "";
        rows.push(current); current = [];
      } else { field += ch; }
    }
  }
  if (field !== "" || current.length > 0) { current.push(field); rows.push(current); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const guessMapping = (headers) => {
  const map = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
  const aliases = {
    first_name: ["first_name", "first name", "firstname", "first"],
    last_name: ["last_name", "last name", "lastname", "last"],
    company_name: ["company_name", "company name", "company", "companyname"],
    email: ["email", "email address", "e-mail"],
    phone: ["phone", "phone number", "tel", "mobile"],
    address_line1: ["address_line1", "address line1", "address 1", "address", "street", "street address"],
    address_line2: ["address_line2", "address line2", "address 2", "street2"],
    city: ["city"],
    state: ["state", "province", "region"],
    zip: ["zip", "zip code", "postal code", "postal", "postcode"],
    notes: ["notes", "note", "comments"],
    parts_markup_override: ["markup", "markup override", "markup %", "parts markup"],
  };
  MAPPABLE_FIELDS.forEach((f) => {
    const candidates = aliases[f.key] || [f.key, f.key.replace(/_/g, " "), f.key.replace(/_/g, "")];
    for (const c of candidates) {
      const idx = lowerHeaders.indexOf(c.toLowerCase());
      if (idx !== -1) { map[f.key] = idx; break; }
    }
  });
  return map;
};

const coerce = (val, fieldKey) => {
  if (val == null) return undefined;
  const trimmed = String(val).trim();
  if (trimmed === "") return undefined;
  if (NUMERIC_FIELDS.has(fieldKey)) {
    const n = parseFloat(trimmed.replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? undefined : n;
  }
  return trimmed;
};

export default function CustomerCsvImportModal({ open, onClose }) {
  const [step, setStep] = useState("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const fileRef = useRef();
  const qc = useQueryClient();

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setSelected(new Set());
    setImportedCount(0);
    setFailedCount(0);
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target.result).replace(/^\ufeff/, "");
      const parsed = parseCSV(text);
      if (parsed.length === 0) { toast.error("CSV is empty"); return; }
      const hdrs = parsed[0].map((h) => h.trim());
      const dataRows = parsed.slice(1);
      setHeaders(hdrs);
      setRows(dataRows);
      setMapping(guessMapping(hdrs));
      setSelected(new Set(dataRows.map((_, i) => i)));
      setStep("map");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const previewRows = useMemo(() => {
    return rows.map((row, idx) => {
      const obj = { _idx: idx };
      MAPPABLE_FIELDS.forEach((f) => {
        const colIdx = mapping[f.key];
        obj[f.key] = colIdx != null && colIdx !== "" ? coerce(row[colIdx], f.key) : undefined;
      });
      return obj;
    });
  }, [rows, mapping]);

  const validRows = useMemo(() => {
    return previewRows.filter((r) => r.first_name && r.last_name && r.email);
  }, [previewRows]);

  const importMutation = useMutation({
    mutationFn: async () => {
      let ok = 0;
      let fail = 0;
      const toImport = previewRows.filter(
        (r) => selected.has(r._idx) && r.first_name && r.last_name && r.email
      );
      for (let i = 0; i < toImport.length; i += 50) {
        const chunk = toImport.slice(i, i + 50).map((r) => {
          const customer = {
            first_name: r.first_name,
            last_name: r.last_name,
            email: r.email,
            status: "active",
          };
          MAPPABLE_FIELDS.forEach((f) => {
            if (f.required) return;
            if (r[f.key] !== undefined) customer[f.key] = r[f.key];
          });
          if (customer.parts_markup_override === undefined) customer.parts_markup_override = null;
          return customer;
        });
        try {
          await base44.entities.Customer.bulkCreate(chunk);
          ok += chunk.length;
        } catch (err) {
          fail += chunk.length;
        }
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      setImportedCount(ok);
      setFailedCount(fail);
      qc.invalidateQueries({ queryKey: ["customers"] });
      setStep("done");
    },
    onError: (err) => {
      toast.error("Import failed: " + err.message);
    },
  });

  const toggleRow = (idx) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (validRows.every((r) => prev.has(r._idx))) {
        const next = new Set(prev);
        validRows.forEach((r) => next.delete(r._idx));
        return next;
      }
      const next = new Set(prev);
      validRows.forEach((r) => next.add(r._idx));
      return next;
    });
  };

  const close = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Customers from CSV
            {step !== "upload" && fileName && (
              <span className="text-sm font-normal text-slate-500 ml-2 truncate">{fileName}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-1 pb-3 border-b">
          {[
            { key: "upload", label: "Upload" },
            { key: "map", label: "Map Columns" },
            { key: "review", label: "Review & Select" },
            { key: "done", label: "Done" },
          ].map((s, i) => {
            const stepOrder = ["upload", "map", "review", "done"];
            const active = stepOrder.indexOf(step) >= i;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${active ? "bg-[#e20404] text-white" : "bg-slate-100 text-slate-400"}`}>
                  <span className="w-4 h-4 rounded-full flex items-center justify-center bg-white/30">{i + 1}</span>
                  {s.label}
                </div>
                {i < 3 && <div className="w-6 h-px bg-slate-200" />}
              </div>
            );
          })}
        </div>

        {step === "upload" && (
          <div className="py-8 flex-1 flex flex-col items-center justify-center">
            <div
              className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center cursor-pointer hover:border-[#e20404] hover:bg-slate-50 transition-colors w-full max-w-md"
              onClick={() => fileRef.current.click()}
            >
              <FileUp className="w-12 h-12 mx-auto mb-3 text-slate-400" />
              <p className="text-lg font-medium text-slate-700">Click to choose a CSV file</p>
              <p className="text-sm text-slate-400 mt-1">
                Should have a header row with columns like first_name, last_name, email, phone, etc.
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>
        )}

        {step === "map" && (
          <div className="flex-1 overflow-y-auto py-4">
            <p className="text-sm text-slate-500 mb-4">
              Map each CSV column to the corresponding customer field. We auto-detected likely matches — adjust as needed.
            </p>
            <div className="space-y-2">
              {MAPPABLE_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-3 py-1">
                  <div className="w-44 flex items-center gap-1">
                    <span className="text-sm font-medium text-slate-700">{f.label}</span>
                    {f.required && <span className="text-[#e20404]">*</span>}
                  </div>
                  <Select
                    value={mapping[f.key] != null ? String(mapping[f.key]) : ""}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [f.key]: v === "" ? null : Number(v) }))
                    }
                  >
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder="— Skip —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>— Skip —</SelectItem>
                      {headers.map((h, idx) => (
                        <SelectItem key={idx} value={String(idx)}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mapping[f.key] != null && (
                    <span className="text-xs text-slate-400 truncate">
                      Preview: {rows[0]?.[mapping[f.key]] || <span className="italic">empty</span>}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
              <strong>{validRows.length}</strong> of {rows.length} rows have the required fields
              (first_name + last_name + email).
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-500">
                Select which rows to import. {selected.size} selected · {validRows.length} valid · {rows.length - validRows.length} skipped (missing required)
              </p>
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {validRows.every((r) => selected.has(r._idx)) ? "Unselect All" : "Select All Valid"}
              </Button>
            </div>
            <div className="overflow-auto flex-1 border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left w-10"></th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">First</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Last</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Company</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Email</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Phone</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">City</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">State</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => {
                    const isValid = r.first_name && r.last_name && r.email;
                    const isSelected = selected.has(r._idx);
                    return (
                      <tr key={r._idx} className={`border-b border-slate-100 ${isSelected ? "bg-white" : "bg-slate-50/50"} ${!isValid ? "opacity-50" : ""}`}>
                        <td className="px-2 py-1.5">
                          <Checkbox checked={isSelected} disabled={!isValid} onCheckedChange={() => toggleRow(r._idx)} />
                        </td>
                        <td className="px-2 py-1.5 text-slate-900 font-medium">{r.first_name || <span className="text-red-400">—</span>}</td>
                        <td className="px-2 py-1.5 text-slate-900 font-medium">{r.last_name || <span className="text-red-400">—</span>}</td>
                        <td className="px-2 py-1.5 text-slate-500">{r.company_name || "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.email || <span className="text-red-400">—</span>}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.phone || "—"}</td>
                        <td className="px-2 py-1.5 text-slate-500">{r.city || "—"}</td>
                        <td className="px-2 py-1.5 text-slate-500">{r.state || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="py-12 flex-1 flex flex-col items-center justify-center text-center">
            {failedCount === 0 ? (
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-3" />
            ) : (
              <AlertTriangle className="w-16 h-16 text-amber-500 mb-3" />
            )}
            <h3 className="text-xl font-semibold text-slate-900">Import Complete</h3>
            <p className="text-slate-500 mt-1">
              Successfully imported <strong className="text-emerald-600">{importedCount}</strong> customers
              {failedCount > 0 && (<> · <strong className="text-amber-600">{failedCount}</strong> failed</>)}
            </p>
          </div>
        )}

        <DialogFooter className="flex !justify-between">
          <Button variant="ghost" onClick={close}>{step === "done" ? "Close" : "Cancel"}</Button>
          <div className="flex gap-2">
            {step === "map" && (
              <>
                <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
                <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => setStep("review")} disabled={validRows.length === 0}>
                  Review {validRows.length} Rows
                </Button>
              </>
            )}
            {step === "review" && (
              <>
                <Button variant="outline" onClick={() => setStep("map")}>Back to Mapping</Button>
                <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => importMutation.mutate()} disabled={importMutation.isPending || selected.size === 0}>
                  {importMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>) : `Import ${selected.size} Customers`}
                </Button>
              </>
            )}
            {step === "done" && (
              <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={close}>Done</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}