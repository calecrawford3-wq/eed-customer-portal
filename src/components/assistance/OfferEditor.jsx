import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { base44 } from "@/api/base44Client";
import CannedJobPicker from "@/components/estimates/CannedJobPicker";
import { toast } from "sonner";

const blank = (kind) => (kind === "part"
  ? { item_name: "", description: "", quantity: 1, unit_price: 0 }
  : kind === "machining"
    ? { item_name: "", description: "", quantity: 1, price: 0 }
    : { item_name: "", description: "", price: 0 });

function ItemRows({ kind, items, setItems, disabled }) {
  const update = (index, patch) => setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-12 gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="col-span-12 sm:col-span-5">
            <Input
              value={item.item_name || ""}
              disabled={disabled}
              placeholder={kind === "part" ? "Part or kit name" : kind === "labor" ? "Labor description" : "Machining description"}
              onChange={(e) => update(index, { item_name: e.target.value })}
            />
          </div>
          {kind === "part" && (
            <div className="col-span-4 sm:col-span-2">
              <Input type="number" min="0" step="1" value={item.quantity ?? 1} disabled={disabled} onChange={(e) => update(index, { quantity: e.target.value })} placeholder="Qty" />
            </div>
          )}
          {kind === "machining" && (
            <div className="col-span-4 sm:col-span-2">
              <Input type="number" min="0" step="1" value={item.quantity ?? 1} disabled={disabled} onChange={(e) => update(index, { quantity: e.target.value })} placeholder="Qty" />
            </div>
          )}
          <div className={kind === "labor" ? "col-span-8 sm:col-span-6" : "col-span-4 sm:col-span-3"}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={kind === "part" ? item.unit_price ?? 0 : item.price ?? 0}
              disabled={disabled}
              onChange={(e) => update(index, kind === "part" ? { unit_price: e.target.value } : { price: e.target.value })}
              placeholder={kind === "part" ? "Unit price" : "Price"}
            />
          </div>
          <div className="col-span-3 sm:col-span-1 flex items-center justify-end">
            <span className="text-xs font-semibold text-slate-600 tabular-nums">
              {formatMoney(kind === "part" ? (Number(item.quantity) || 0) * (Number(item.unit_price) || 0) : (Number(item.price) || 0) * (kind === "machining" ? Number(item.quantity) || 1 : 1))}
            </span>
          </div>
          <div className="col-span-1 flex items-center justify-end">
            <button type="button" disabled={disabled} onClick={() => setItems(items.filter((_, i) => i !== index))} className="text-slate-400 hover:text-red-600" aria-label="Remove line">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setItems([...items, blank(kind)])}>
        <Plus className="h-4 w-4" /> Add {kind === "part" ? "part" : kind === "labor" ? "labor" : "machining"} line
      </Button>
    </div>
  );
}

export default function OfferEditor({ offer, onSave, busy }) {
  const locked = offer.status !== "draft";
  const [lineItems, setLineItems] = useState([]);
  const [laborItems, setLaborItems] = useState([]);
  const [machiningItems, setMachiningItems] = useState([]);
  const [assistanceType, setAssistanceType] = useState("percent");
  const [percent, setPercent] = useState(0);
  const [fixedAmount, setFixedAmount] = useState(0);
  const [expiresOn, setExpiresOn] = useState("");
  const [terms, setTerms] = useState("");
  const [depositPercent, setDepositPercent] = useState(50);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const importJob = async (job) => {
    if (locked || busy || importing) return;
    setImporting(true);
    try {
      const lookup = async (entity, id, name) => {
        const found = id ? await entity.filter({id}, "-created_date", 1) : await entity.filter({name}, "-created_date", 2);
        return found.length === 1 ? found[0] : null;
      };
      const price = (record, key, name) => {
        if (!record || record[key] == null || record[key] === "" || !Number.isFinite(Number(record[key])) || Number(record[key]) < 0) throw new Error("Missing catalog price for " + name + ". Update the canned job or catalog before importing.");
        return Number(record[key]);
      };
      const [parts, labor, machining] = await Promise.all([
        Promise.all((job.line_items || []).map(async item => {
          const record = await lookup(base44.entities.Part, item.part_id, item.item_name);
          const name = item.item_name || record?.item_name || item.part_number;
          return {part_id: record?.id || "", item_name: name, description: item.description || "", quantity: Number(item.quantity) || 1, unit_price: price(record,"sell_price",name)};
        })),
        Promise.all((job.labor_items || []).map(async item => {
          const record = await lookup(base44.entities.LaborItem,item.labor_item_id,item.name);
          return {item_name:item.name || record?.name,description:item.description || "",price:price(record,"price",item.name)};
        })),
        Promise.all((job.machining_items || []).map(async item => {
          const record = await lookup(base44.entities.MachiningItem,item.machining_item_id,item.name);
          return {item_name:item.name || record?.name,description:item.description || "",quantity:Number(item.quantity)||1,price:price(record,"price",item.name)};
        })),
      ]);
      if (![...parts,...labor,...machining].length) throw new Error("This canned job has no line items.");
      if ([lineItems.length+parts.length,laborItems.length+labor.length,machiningItems.length+machining.length].some(n=>n>100)) throw new Error("Offer limit is 100 lines per item type.");
      setLineItems(prev=>[...prev.filter(i=>i.item_name),...parts]);
      setLaborItems(prev=>[...prev.filter(i=>i.item_name),...labor]);
      setMachiningItems(prev=>[...prev.filter(i=>i.item_name),...machining]);
      toast.success(job.name + " imported with current catalog prices. Save the offer to keep changes.");
    } catch(error) { toast.error(error.message || "Canned job import failed."); }
    finally {setImporting(false);}
  };

  useEffect(() => {
    setLineItems(offer.line_items || []);
    setLaborItems(offer.labor_items || []);
    setMachiningItems(offer.machining_items || []);
    setAssistanceType(offer.assistance_type || "percent");
    setPercent(Number(offer.assistance_percent) || 0);
    setFixedAmount(Number(offer.requested_assistance_amount) || 0);
    setExpiresOn(offer.expires_on || "");
    setTerms(offer.terms_text || "");
    setDepositPercent(Number(offer.deposit_percent) || 50);
  }, [offer]);

  const parts = lineItems.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const labor = laborItems.reduce((sum, l) => sum + (Number(l.price) || 0), 0);
  const machining = machiningItems.reduce((sum, m) => sum + (Number(m.price) || 0) * (Number(m.quantity) || 1), 0);
  const subtotal = parts + labor + machining;
  const assistance = Math.max(0, Math.min(subtotal, assistanceType === "percent" ? (subtotal * Math.max(0, Math.min(100, Number(percent) || 0))) / 100 : Number(fixedAmount) || 0));
  const total = Math.max(0, subtotal - assistance);

  return (
    <div className="space-y-5">
      <Button type="button" variant="outline" disabled={locked || busy || importing} onClick={()=>setPickerOpen(true)}>{importing ? "Importing…" : "Import canned job"}</Button>
      <CannedJobPicker open={pickerOpen} onClose={()=>setPickerOpen(false)} onSelect={importJob} />
      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Parts</h4>
        <ItemRows kind="part" items={lineItems} setItems={setLineItems} disabled={locked} />
      </div>
      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Labor</h4>
        <ItemRows kind="labor" items={laborItems} setItems={setLaborItems} disabled={locked} />
      </div>
      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Machining</h4>
        <ItemRows kind="machining" items={machiningItems} setItems={setMachiningItems} disabled={locked} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-medium text-slate-600">Assistance basis</Label>
          <Select value={assistanceType} disabled={locked} onValueChange={setAssistanceType}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percent of build</SelectItem>
              <SelectItem value="fixed">Fixed dollar award</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {assistanceType === "percent" ? (
          <div>
            <Label className="text-xs font-medium text-slate-600">Assistance percent</Label>
            <Input type="number" min="0" max="100" step="0.5" className="mt-1" disabled={locked} value={percent} onChange={(e) => setPercent(e.target.value)} />
          </div>
        ) : (
          <div>
            <Label className="text-xs font-medium text-slate-600">Award amount</Label>
            <Input type="number" min="0" step="0.01" className="mt-1" disabled={locked} value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} />
          </div>
        )}
        <div>
          <Label className="text-xs font-medium text-slate-600">Offer expires</Label>
          <Input type="date" className="mt-1" disabled={locked} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium text-slate-600">Required deposit if the customer splits the balance</Label>
        <div className="mt-1 flex items-center gap-2">
          <Input type="number" min="10" max="90" step="5" className="w-28" disabled={locked} value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} />
          <span className="text-xs text-slate-500">
            % · {formatMoney(total * (Math.min(90, Math.max(10, Number(depositPercent) || 50)) / 100))} deposit, {formatMoney(Math.max(0, total - total * (Math.min(90, Math.max(10, Number(depositPercent) || 50)) / 100)))} financed by Elite
          </span>
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium text-slate-600">Offer terms</Label>
        <Textarea className="mt-1 min-h-24" disabled={locked} value={terms} onChange={(e) => setTerms(e.target.value)} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span className="tabular-nums">{formatMoney(subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-slate-600">Assistance</span><span className="tabular-nums text-emerald-700">− {formatMoney(assistance)}</span></div>
        <div className="flex justify-between border-t border-slate-300 mt-1.5 pt-1.5 font-bold"><span>Amount due</span><span className="tabular-nums">{formatMoney(total)}</span></div>
      </div>

      {locked ? (
        <p className="text-xs text-slate-500">This offer has been sent and can no longer be edited. Revoke it to issue a new one.</p>
      ) : (
        <Button
          disabled={busy || importing}
          onClick={() => onSave({
            offer_id: offer.id,
            line_items: lineItems,
            labor_items: laborItems,
            machining_items: machiningItems,
            assistance_type: assistanceType,
            assistance_percent: percent,
            requested_assistance_amount: fixedAmount,
            expires_on: expiresOn,
            terms_text: terms,
            deposit_percent: depositPercent,
          })}
        >
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save offer"}
        </Button>
      )}
    </div>
  );
}