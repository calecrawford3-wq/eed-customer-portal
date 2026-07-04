import React, { useState, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Upload, FileUp, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Fields that can be mapped from CSV columns
const MAPPABLE_FIELDS = [
  { key: "part_number", label: "Part Number", required: true, type: "string" },
  { key: "name", label: "Name", required: true, type: "string" },
  { key: "description", label: "Description", required: false, type: "string" },
  { key: "category", label: "Category", required: false, type: "string" },
  { key: "supplier_part_number", label: "Supplier Part #", required: false, type: "string" },
  { key: "unit_cost", label: "Unit Cost", required: false, type: "number" },
  { key: "sell_price", label: "Sell Price", required: false, type: "number" },
  { key: "quantity_on_hand", label: "Qty On Hand", required: false, type: "number" },
  { key: "reorder_point", label: "Reorder Point", required: false, type: "number" },
  { key: "reorder_quantity", label: "Reorder Qty", required: false, type: "number" },
  { key: "location", label: "Location", required: false, type: "string" },
  { key: "notes", label: "Notes", required: false, type: "string" },
];

const NUMERIC_FIELDS = new Set(
  MAPPABLE_FIELDS.filter((f) => f.type === "number").map((f) => f.key)
);

// Minimal CSV parser that handles quoted values and embedded commas
function parseCSV(text) {
  const rows = [];
  let current = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && next === "\n") i++;
        current.push(field);
        field = "";
        rows.push(current);
        current = [];
      } else {
        field += ch;
      }
    }
  }
  // last field/row
  if (field !== "" || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const guessMapping = (headers) => {
  const map = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
  MAPPABLE_FIELDS.forEach((f) => {
    const candidates = [f.key, f.key.replace(/_/g, " "), f.key.replace(/_/g, "")];
    if (f.key === "part_number") candidates.push("part #", "part#", "part no", "partno");
    if (f.key === "unit_cost") candidates.push("cost", "price");
    if (f.key === "sell_price") candidates.push("price", "retail", "sell");
    if (f.key === "quantity_on_hand") candidates.push("qty", "quantity", "on hand", "stock");
    if (f.key === "reorder_quantity") candidates.push("max stock", "max", "reorder qty");
    if (f.key === "supplier_part_number") candidates.push("supplier part #", "supplier part", "oem #");

    for (const c of candidates) {
      const idx = lowerHeaders.indexOf(c.toLowerCase());
      if (idx !== -1) {
        map[f.key] = idx;
        break;
      }
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
    return isNaN(n) ? 0 : n;
  }
  return trimmed;
};

export default function PartCsvImportModal({ open, onClose }) {
  const [step, setStep] = useState("upload"); // upload -> map -> review -> done
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({}); // fieldKey -> column index
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
      const text = ev.target.result;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast.error("CSV is empty");
        return;
      }
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

  // Build preview rows based on current mapping
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
    return previewRows.filter(
      (r) => r.part_number && r.name
    );
  }, [previewRows]);

  const importMutation = useMutation({
    mutationFn: async () => {
      let ok = 0;
      let fail = 0;
      const toImport = previewRows.filter((r) => selected.has(r._idx) && r.part_number && r.name);
      // batch in chunks of 50
      for (let i = 0; i < toImport.length; i += 50) {
        const chunk = toImport.slice(i, i + 50).map((r) => {
          const part = {
            part_number: r.part_number,
            name: r.name,
            status: "active",
          };
          MAPPABLE_FIELDS.forEach((f) => {
            if (f.required) return;
            if (r[f.key] !== undefined) part[f.key] = r[f.key];
          });
          return part;
        });
        try {
          await base44.entities.Part.bulkCreate(chunk);
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
      qc.invalidateQueries({ queryKey: ["parts"] });
      setStep("done");
    },
    onError: (err) => {
      toast.error("Import failed: " + err.message);
    },
  });

  const toggleRow = (idx) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (validRows.every((r) => prev.has(r._idx))) {
        // unselect all valid
        const next = new Set(prev);
        validRows.forEach((r) => next.delete(r._idx));
        return next;
      }
      // select all valid
      const next = new Set(prev);
      validRows.forEach((r) => next.add(r._idx));
      return next;
    });
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Parts from CSV
            {step !== "upload" && fileName && (
              <span className="text-sm font-normal text-slate-500 ml-2 truncate">{fileName}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
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
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                    active ? "bg-[#e20404] text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <span className="w-4 h-4 rounded-full flex items-center justify-center bg-white/30">
                    {i + 1}
                  </span>
                  {s.label}
                </div>
                {i < 3 && <div className="w-6 h-px bg-slate-200" />}
              </div>
            );
          })}
        </div>

        {/* Step: Upload */}
        {step === "upload" && (
          <div className="py-8 flex-1 flex flex-col items-center justify-center">
            <div
              className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center cursor-pointer hover:border-[#e20404] hover:bg-slate-50 transition-colors w-full max-w-md"
              onClick={() => fileRef.current.click()}
            >
              <FileUp className="w-12 h-12 mx-auto mb-3 text-slate-400" />
              <p className="text-lg font-medium text-slate-700">Click to choose a CSV file</p>
              <p className="text-sm text-slate-400 mt-1">
                Should have a header row with columns like part_number, name, unit_cost, etc.
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>
        )}

        {/* Step: Map */}
        {step === "map" && (
          <div className="flex-1 overflow-y-auto py-4">
            <p className="text-sm text-slate-500 mb-4">
              Map each CSV column to the corresponding part field. We auto-detected likely matches — adjust as needed.
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
                        <SelectItem key={idx} value={String(idx)}>
                          {h}
                        </SelectItem>
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
              (part_number + name).
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === "review" && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-500">
                Select which rows to import. {selected.size} selected · {validRows.length} valid · {rows.length - validRows.length} skipped (missing required)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={toggleAll}>
                  {validRows.every((r) => selected.has(r._idx)) ? "Unselect All" : "Select All Valid"}
                </Button>
              </div>
            </div>
            <div className="overflow-auto flex-1 border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left w-10"></th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Part #</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Name</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Category</th>
                    <th className="px-2 py-2 text-right font-medium text-slate-600">Cost</th>
                    <th className="px-2 py-2 text-right font-medium text-slate-600">Sell</th>
                    <th className="px-2 py-2 text-right font-medium text-slate-600">Qty</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => {
                    const isValid = r.part_number && r.name;
                    const isSelected = selected.has(r._idx);
                    return (
                      <tr
                        key={r._idx}
                        className={`border-b border-slate-100 ${isSelected ? "bg-white" : "bg-slate-50/50"} ${
                          !isValid ? "opacity-50" : ""
                        }`}
                      >
                        <td className="px-2 py-1.5">
                          <Checkbox
                            checked={isSelected}
                            disabled={!isValid}
                            onCheckedChange={() => toggleRow(r._idx)}
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-slate-700">
                          {r.part_number || <span className="text-red-400">— missing —</span>}
                        </td>
                        <td className="px-2 py-1.5 text-slate-900 font-medium">
                          {r.name || <span className="text-red-400">— missing —</span>}
                        </td>
                        <td className="px-2 py-1.5 text-slate-500">{r.category || "—"}</td>
                        <td className="px-2 py-1.5 text-right text-slate-600">
                          {r.unit_cost != null ? `$${Number(r.unit_cost).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600">
                          {r.sell_price != null ? `$${Number(r.sell_price).toFixed(2)}` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600">{r.quantity_on_hand ?? "—"}</td>
                        <td className="px-2 py-1.5 text-slate-500">{r.location || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="py-12 flex-1 flex flex-col items-center justify-center text-center">
            {failedCount === 0 ? (
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-3" />
            ) : (
              <AlertTriangle className="w-16 h-16 text-amber-500 mb-3" />
            )}
            <h3 className="text-xl font-semibold text-slate-900">Import Complete</h3>
            <p className="text-slate-500 mt-1">
              Successfully imported <strong className="text-emerald-600">{importedCount}</strong> parts
              {failedCount > 0 && (
                <> · <strong className="text-amber-600">{failedCount}</strong> failed</>
              )}
            </p>
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="flex !justify-between">
          <Button variant="ghost" onClick={close}>
            {step === "done" ? "Close" : "Cancel"}
          </Button>
          <div className="flex gap-2">
            {step === "map" && (
              <>
                <Button variant="outline" onClick={() => setStep("upload")}>
                  Back
                </Button>
                <Button
                  className="bg-[#e20404] hover:bg-[#c00303] text-white"
                  onClick={() => setStep("review")}
                  disabled={validRows.length === 0}
                >
                  Review {validRows.length} Rows
                </Button>
              </>
            )}
            {step === "review" && (
              <>
                <Button variant="outline" onClick={() => setStep("map")}>
                  Back to Mapping
                </Button>
                <Button
                  className="bg-[#e20404] hover:bg-[#c00303] text-white"
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending || selected.size === 0}
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...
                    </>
                  ) : (
                    `Import ${selected.size} Parts`
                  )}
                </Button>
              </>
            )}
            {step === "done" && (
              <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={close}>
                Done
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}