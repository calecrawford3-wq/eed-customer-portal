import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, X, ExternalLink } from "lucide-react";

const ZOHO_GUIDE_URL = "https://www.zoho.com/mail/help/dynamic-from-address.html";

export default function FromAddressesEditor({ value = [], onChange }) {
  const list = Array.isArray(value) ? value.filter((e) => e != null) : [];
  const update = (i, val) => onChange(list.map((e, idx) => (idx === i ? val : e)));
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const add = () => onChange([...list, ""]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Sender Addresses</Label>
        <a href={ZOHO_GUIDE_URL} target="_blank" rel="noreferrer" className="text-xs text-[#e20404] hover:underline inline-flex items-center gap-1">
          How to add a sender in Zoho <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      {list.map((e, i) => (
        <div key={i} className="flex gap-2">
          <Input type="email" value={e || ""} onChange={(ev) => update(i, ev.target.value)} placeholder="cale@eedpower.com" />
          <Button type="button" size="icon" variant="outline" onClick={() => remove(i)} title="Remove">
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={add}>
        <Plus className="w-4 h-4 mr-1" /> Add sender
      </Button>
      <p className="text-xs text-slate-400">
        Each address appears as a "From" choice when composing emails. Every address <strong>must be added & verified in Zoho Mail</strong> (Settings → Send Mail As → Add new From email address) before it can be used, or Zoho will reject sends from it.
      </p>
    </div>
  );
}