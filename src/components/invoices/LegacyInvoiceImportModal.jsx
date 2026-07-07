import React, { useState, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileUp, CheckCircle2, AlertTriangle, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";

const MAPPABLE_FIELDS = [
  { key: "invoice_number", label: "Invoice #", type: "string" },
  { key: "client_name", label: "Customer Name", type: "string" },
  { key: "issue_date", label: "Issue Date", type: "date" },
  { key: "total", label: "Total", type: "number" },
  { key: "tax_amount", label: "Tax Amount", type: "number" },
  { key: "amount_paid", label: "Paid Amount", type: "number" },
  { key: "balance_due", label: "Balance Due", type: "number" },
  { key: "status", label: "Status", type: "string" },
];

const NUMERIC_FIELDS = new Set(["total", "tax_amount", "amount_paid", "balance_due"]);

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
    invoice_number: ["_id", "id", "invoice_number", "invoice number", "invoiceno", "invoice #", "estimateid", "estimate_id", "estimate id"],
    client_name: ["clientname", "client name", "customer", "customer name", "customername", "name", "client"],
    issue_date: ["jobcardcreatedat", "jobcardcreated", "issue_date", "issue date", "date", "invoicedate", "invoice_date", "createdat", "created_at"],
    total: ["total", "grandtotal", "grand total", "invoice total", "amount"],
    tax_amount: ["tax1", "tax", "taxamount", "tax amount", "tax_total", "totaltax"],
    amount_paid: ["paidamount", "paid amount", "paid", "amountpaid", "payments"],
    balance_due: ["balancedue", "balance due", "balance", "owed", "remaining"],
    status: ["status", "invoicestatus", "invoice status", "state"],
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

const normalizeDate = (val) => {
  if (!val) return new Date().toISOString().split("T")[0];
  const s = String(val).trim();
  // ISO or yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split("T")[0];
  // mm/dd/yyyy or dd/mm/yyyy — assume mm/dd/yyyy (US)
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return new Date().toISOString().split("T")[0];
};

const mapStatus = (raw, balance, paid) => {
  const s = String(raw || "").toLowerCase().trim();
  if (["paid", "closed", "completed", "settled"].includes(s)) return "paid";
  if (["partial", "partially paid"].includes(s)) return "partial";
  if (["sent", "open", "outstanding", "unpaid"].includes(s)) return "sent";
  if (["overdue", "late", "past due"].includes(s)) return "overdue";
  if (["void", "cancelled", "canceled"].includes(s)) return "void";
  if (["draft"].includes(s)) return "draft";
  // auto-derive
  if (balance != null && balance <= 0) return "paid";
  if (paid != null && paid > 0) return "partial";
  return "sent";
};

const matchCustomer = (clientName, customers) => {
  if (!clientName || !customers.length) return null;
  const target = clientName.toLowerCase().trim();
  // exact full name
  let match = customers.find(c =>
    `${c.first_name} ${c.last_name}`.toLowerCase().trim() === target
  );
  if (match) return match.id;
  // exact company
  match = customers.find(c => c.company_name && c.company_name.toLowerCase().trim() === target);
  if (match) return match.id;
  // contains
  match = customers.find(c =>
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(target) ||
    target.includes(`${c.first_name} ${c.last_name}`.toLowerCase())
  );
  if (match) return match.id;
  match = customers.find(c => c.company_name && target.includes(c.company_name.toLowerCase()));
  if (match) return match.id;
  return null;
};

export default function LegacyInvoiceImportModal({ open, onClose }) {
  const [step, setStep] = useState("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [customerMap, setCustomerMap] = useState({});
  const [engineMap, setEngineMap] = useState({});
  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const fileRef = useRef();
  const qc = useQueryClient();

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 500),
  });

  const { data: customerEngines = [] } = useQuery({
    queryKey: ["customerEngines"],
    queryFn: () => base44.entities.CustomerEngine.list("-created_date", 500),
  });

  const reset = () => {
    setStep("upload"); setFileName(""); setHeaders([]); setRows([]);
    setMapping({}); setSelected(new Set()); setCustomerMap({}); setEngineMap({});
    setImportedCount(0); setFailedCount(0);
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
      obj._rawName = obj.client_name || "";
      obj._matchedCustomerId = matchCustomer(obj._rawName, customers);
      return obj;
    });
  }, [rows, mapping, customers]);

  // initialize customer map when preview changes
  useMemo(() => {
    const init = {};
    previewRows.forEach((r) => {
      if (r._matchedCustomerId) init[r._idx] = r._matchedCustomerId;
    });
    setCustomerMap((prev) => {
      const merged = { ...init };
      Object.keys(prev).forEach((k) => { if (prev[k]) merged[k] = prev[k]; });
      return merged;
    });
  }, [previewRows]);

  const validRows = useMemo(() => previewRows.filter((r) => r.total != null && customerMap[r._idx]), [previewRows, customerMap]);

  const importMutation = useMutation({
    mutationFn: async () => {
      let ok = 0, fail = 0;
      const toImport = previewRows.filter((r) => selected.has(r._idx) && r.total != null && customerMap[r._idx]);
      const records = toImport.map((r) => {
        const total = Number(r.total) || 0;
        const paid = Number(r.amount_paid) || 0;
        const balance = r.balance_due != null ? Number(r.balance_due) : Math.max(0, total - paid);
        const tax = Number(r.tax_amount) || 0;
        const status = mapStatus(r.status, balance, paid);
        const issueDate = normalizeDate(r.issue_date);
        const inv = {
          invoice_number: r.invoice_number || `LEG-${Date.now().toString().slice(-6)}-${r._idx}`,
          customer_id: customerMap[r._idx],
          customer_engine_id: engineMap[r._idx] || "",
          is_legacy: true,
          status,
          issue_date: issueDate,
          line_items: [{
            part_id: "", part_number: "",
            item_name: "Imported legacy invoice",
            quantity: 1, unit_cost: 0, unit_price: total, total,
          }],
          labor_items: [],
          machining_items: [],
          payments: paid > 0 ? [{ amount: paid, method: "other", note: "Imported from previous system", date: issueDate }] : [],
          subtotal: total,
          tax_rate: 0,
          tax_amount: 0,
          total,
          amount_paid: paid,
          balance_due: balance,
          amount_due: total,
          notes: tax > 0 ? `Original tax: $${tax.toFixed(2)}` : "",
        };
        return inv;
      });
      for (let i = 0; i < records.length; i += 50) {
        const chunk = records.slice(i, i + 50);
        try {
          await base44.entities.Invoice.bulkCreate(chunk);
          ok += chunk.length;
        } catch (err) {
          fail += chunk.length;
          console.error("Legacy import chunk failed:", err);
        }
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      setImportedCount(ok); setFailedCount(fail);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setStep("done");
    },
    onError: (err) => toast.error("Import failed: " + err.message),
  });

  const toggleRow = (idx) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    return next;
  });

  const toggleAll = () => setSelected((prev) => {
    if (validRows.every((r) => prev.has(r._idx))) {
      const next = new Set(prev);
      validRows.forEach((r) => next.delete(r._idx));
      return next;
    }
    const next = new Set(prev);
    validRows.forEach((r) => next.add(r._idx));
    return next;
  });

  const close = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" /> Import Legacy Invoices
            {step !== "upload" && fileName && (
              <span className="text-sm font-normal text-slate-500 ml-2 truncate">{fileName}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-1 pb-3 border-b">
          {[
            { key: "upload", label: "Upload" },
            { key: "map", label: "Map Columns" },
            { key: "review", label: "Link Customers" },
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
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center cursor-pointer hover:border-[#e20404] hover:bg-slate-50 transition-colors w-full max-w-md" onClick={() => fileRef.current.click()}>
              <FileUp className="w-12 h-12 mx-auto mb-3 text-slate-400" />
              <p className="text-lg font-medium text-slate-700">Click to choose a CSV file</p>
              <p className="text-sm text-slate-400 mt-1">
                Columns like: _id, ClientName, jobCardCreatedAt, Total, PaidAmount, BalanceDue, Status
              </p>
            </div>
            <p className="text-xs text-slate-400 mt-4 max-w-md text-center">
              Each row becomes a summary invoice (no line items). You can attach the original PDF to each invoice after import. Customers are auto-matched by name — you'll confirm them in the next step.
            </p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>
        )}

        {step === "map" && (
          <div className="flex-1 overflow-y-auto py-4">
            <p className="text-sm text-slate-500 mb-4">
              Map each CSV column to an invoice field. We auto-detected likely matches — adjust as needed.
            </p>
            <div className="space-y-2">
              {MAPPABLE_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-3 py-1">
                  <div className="w-40"><span className="text-sm font-medium text-slate-700">{f.label}</span></div>
                  <Select value={mapping[f.key] != null ? String(mapping[f.key]) : ""} onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "" ? null : Number(v) }))}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="— Skip —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>— Skip —</SelectItem>
                      {headers.map((h, idx) => <SelectItem key={idx} value={String(idx)}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {mapping[f.key] != null && (
                    <span className="text-xs text-slate-400 truncate">Preview: {rows[0]?.[mapping[f.key]] || <span className="italic">empty</span>}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
              <strong>{rows.length}</strong> rows detected. {previewRows.filter(r => r.total != null).length} have a total amount.
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-500">
                {selected.size} selected · {validRows.length} ready (total + customer set) · {rows.length - validRows.length} need attention
              </p>
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {validRows.every((r) => selected.has(r._idx)) ? "Unselect All" : "Select All Valid"}
              </Button>
            </div>
            <div className="overflow-auto flex-1 border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left w-8"></th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Invoice #</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">CSV Name</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600 w-56">Link Customer *</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600 w-48">Engine (optional)</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Date</th>
                    <th className="px-2 py-2 text-right font-medium text-slate-600">Total</th>
                    <th className="px-2 py-2 text-right font-medium text-slate-600">Paid</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => {
                    const isSelected = selected.has(r._idx);
                    const custId = customerMap[r._idx] || "";
                    const engines = customerEngines.filter(e => e.customer_id === custId);
                    const ready = r.total != null && custId;
                    return (
                      <tr key={r._idx} className={`border-b border-slate-100 ${isSelected ? "bg-white" : "bg-slate-50/50"} ${!ready ? "opacity-60" : ""}`}>
                        <td className="px-2 py-1.5"><Checkbox checked={isSelected} onCheckedChange={() => toggleRow(r._idx)} /></td>
                        <td className="px-2 py-1.5 font-mono text-slate-700">{r.invoice_number || "—"}</td>
                        <td className="px-2 py-1.5 text-slate-500 max-w-[160px] truncate" title={r._rawName}>{r._rawName || "—"}</td>
                        <td className="px-2 py-1.5">
                          <CustomerSearchSelect
                            customers={customers}
                            value={custId}
                            onValueChange={(v) => setCustomerMap((m) => ({ ...m, [r._idx]: v }))}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Select value={engineMap[r._idx] || "none"} onValueChange={(v) => setEngineMap((m) => ({ ...m, [r._idx]: v === "none" ? "" : v }))}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— None —</SelectItem>
                              {engines.map(e => (
                                <SelectItem key={e.id} value={e.id}>{e.eed_id} · {e.engine_serial_number}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5 text-slate-500">{r.issue_date || "—"}</td>
                        <td className="px-2 py-1.5 text-right font-semibold">{r.total != null ? `$${Number(r.total).toFixed(2)}` : <span className="text-red-400">—</span>}</td>
                        <td className="px-2 py-1.5 text-right text-emerald-600">{r.amount_paid != null ? `$${Number(r.amount_paid).toFixed(2)}` : "—"}</td>
                        <td className="px-2 py-1.5"><Badge className="bg-slate-100 text-slate-600 border-0 capitalize">{mapStatus(r.status, r.balance_due, r.amount_paid)}</Badge></td>
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
            {failedCount === 0 ? <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-3" /> : <AlertTriangle className="w-16 h-16 text-amber-500 mb-3" />}
            <h3 className="text-xl font-semibold text-slate-900">Import Complete</h3>
            <p className="text-slate-500 mt-1">
              Imported <strong className="text-emerald-600">{importedCount}</strong> legacy invoices
              {failedCount > 0 && (<> · <strong className="text-amber-600">{failedCount}</strong> failed</>)}
            </p>
            <p className="text-xs text-slate-400 mt-3 max-w-sm">
              Tip: Open each imported invoice and use "Attach PDF" to upload the original document so customers can download it from the portal.
            </p>
          </div>
        )}

        <DialogFooter className="flex !justify-between">
          <Button variant="ghost" onClick={close}>{step === "done" ? "Close" : "Cancel"}</Button>
          <div className="flex gap-2">
            {step === "map" && (
              <>
                <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
                <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => setStep("review")} disabled={previewRows.filter(r => r.total != null).length === 0}>
                  Continue
                </Button>
              </>
            )}
            {step === "review" && (
              <>
                <Button variant="outline" onClick={() => setStep("map")}>Back to Mapping</Button>
                <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => importMutation.mutate()} disabled={importMutation.isPending || validRows.length === 0}>
                  {importMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>) : `Import ${validRows.length} Invoices`}
                </Button>
              </>
            )}
            {step === "done" && <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={close}>Done</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}