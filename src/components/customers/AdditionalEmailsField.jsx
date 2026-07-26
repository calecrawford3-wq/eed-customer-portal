import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

export default function AdditionalEmailsField({ emails = [], onChange }) {
  const list = Array.isArray(emails) ? emails.filter((e) => e != null) : [];
  const update = (i, val) => onChange(list.map((e, idx) => (idx === i ? val : e)));
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const add = () => onChange([...list, ""]);

  return (
    <div className="space-y-2">
      {list.map((e, i) => (
        <div key={i} className="flex gap-2">
          <Input
            type="email"
            value={e || ""}
            onChange={(ev) => update(i, ev.target.value)}
            placeholder="additional@email.com"
          />
          <Button type="button" size="icon" variant="outline" onClick={() => remove(i)} title="Remove">
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={add}>
        <Plus className="w-4 h-4 mr-1" /> Add email
      </Button>
    </div>
  );
}