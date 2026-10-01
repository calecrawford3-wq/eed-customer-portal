import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, ListChecks, Layers } from "lucide-react";
import { toast } from "sonner";
import WorkflowTemplateEditor from "@/components/workflow/WorkflowTemplateEditor";

export default function WorkflowTemplatesPanel() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // null | {} (new) | existing template
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["workflow-templates"],
    queryFn: () => base44.entities.WorkflowTemplate.filter({ status: "active" }, "name", 100),
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 200),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.WorkflowTemplate.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflow-templates"] });
      toast.success("Template deleted");
      setConfirmDelete(null);
    },
  });

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="w-4 h-4" /> Build Workflow Templates
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Define ordered action items grouped into stages. These templates are applied to engine builds to create a check-off workflow.
              </p>
            </div>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => setEditing({})}>
              <Plus className="w-4 h-4 mr-1" /> New Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <Layers className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500 mb-3">No workflow templates yet.</p>
              <Button variant="outline" onClick={() => setEditing({})}>
                <Plus className="w-4 h-4 mr-1" /> Create your first template
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => {
                const stageCount = (t.stages || []).length;
                const itemCount = (t.items || []).length;
                return (
                  <div key={t.id} className="border border-slate-200 rounded-lg p-4 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-slate-800">{t.name}</h4>
                        <Badge variant="secondary">{stageCount} stages</Badge>
                        <Badge variant="secondary">{itemCount} tasks</Badge>
                        {t.is_default && <Badge className="bg-blue-100 text-blue-700">Default</Badge>}
                      </div>
                      {t.description && <p className="text-sm text-slate-500">{t.description}</p>}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {t.platform_id && <Badge variant="outline" className="text-xs">Platform: {(platforms.find(p => p.id === t.platform_id) || {}).name || "—"}</Badge>}
                        {t.service_package && <Badge variant="outline" className="text-xs">{t.service_package.replace("_", " ")}</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(t.stages || []).slice(0, 6).map((s, i) => (
                          <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            {s.name}
                          </span>
                        ))}
                        {(t.stages || []).length > 6 && (
                          <span className="text-xs text-slate-400">+{(t.stages || []).length - 6} more</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(t)}>
                        <Pencil className="w-4 h-4 text-slate-500" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setConfirmDelete(t)}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <WorkflowTemplateEditor
          open={true}
          onClose={() => setEditing(null)}
          template={editing.id ? editing : null}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-2">Delete template?</h3>
            <p className="text-sm text-slate-500 mb-4">
              "{confirmDelete.name}" will be removed. Builds already using it keep their task lists.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteMutation.mutate(confirmDelete.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}