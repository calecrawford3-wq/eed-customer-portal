import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";

const empty = { name: "", subject: "", body: "", category: "" };

export default function EmailTemplatesModal({ open, onClose }) {
  const qc = useQueryClient();
  const { data: templates = [] } = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => base44.entities.EmailTemplate.list("-created_date", 200),
    enabled: open,
  });
  const [editing, setEditing] = useState(null); // record being edited (null = closed form)

  const saveMut = useMutation({
    mutationFn: async ({ id, data }) =>
      id ? base44.entities.EmailTemplate.update(id, data) : base44.entities.EmailTemplate.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      setEditing(null);
      toast.success("Template saved");
    },
    onError: (e) => toast.error("Save failed: " + (e?.message || "error")),
  });

  const delMut = useMutation({
    mutationFn: (id) => base44.entities.EmailTemplate.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); toast.success("Template deleted"); },
    onError: (e) => toast.error("Delete failed: " + (e?.message || "error")),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setEditing(null); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email Templates</DialogTitle>
        </DialogHeader>

        {editing ? (
          <TemplateForm
            initial={editing.id ? editing : empty}
            onCancel={() => setEditing(null)}
            onSave={(data) => saveMut.mutate({ id: editing.id || null, data })}
            saving={saveMut.isPending}
          />
        ) : (
          <>
            <div className="flex justify-end mb-2">
              <Button size="sm" onClick={() => setEditing(empty)}>
                <Plus className="w-4 h-4 mr-1" /> New template
              </Button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto space-y-2">
              {templates.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-8">No templates yet. Create one to reuse common replies.</p>
              ) : templates.map((t) => (
                <div key={t.id} className="border rounded-lg p-3 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-slate-900 truncate">{t.name}</div>
                      {t.subject && <div className="text-xs text-slate-500 truncate">Subject: {t.subject}</div>}
                      <div className="text-xs text-slate-400 line-clamp-2 mt-0.5">{t.body}</div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(t)} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete template "${t.name}"?`)) delMut.mutate(t.id); }} title="Delete" className="text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateForm({ initial, onCancel, onSave, saving }) {
  const [name, setName] = useState(initial.name || "");
  const [subject, setSubject] = useState(initial.subject || "");
  const [body, setBody] = useState(initial.body || "");
  const [category, setCategory] = useState(initial.category || "");

  const submit = () => {
    if (!name.trim() || !body.trim()) { toast.error("Name and body are required"); return; }
    onSave({ name: name.trim(), subject: subject.trim(), body, category: category.trim() });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-slate-500">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Build update" />
      </div>
      <div>
        <Label className="text-xs text-slate-500">Subject (optional)</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs text-slate-500">Category (optional)</Label>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Support" />
      </div>
      <div>
        <Label className="text-xs text-slate-500">Body</Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="resize-y" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Cancel</Button>
        <Button onClick={submit} disabled={saving}><Save className="w-4 h-4 mr-1" /> {saving ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}