import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Layers, Plus, Trash2, Copy, RefreshCw, Send, CheckCircle, Star, Link2, X, GripVertical,
} from "lucide-react";
import { toast } from "sonner";

const COMPARISON_VIEWER_BASE = "https://elite-viewer.base44.app/comparison";

export default function StageComparisonSection({ estimate, estimates, customer, onNavigateToEstimate }) {
  const qc = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const groupId = estimate?.comparison_group_id;
  const isGrouped = !!groupId;

  // Fetch all estimates in this group
  const { data: groupEstimates = [], isLoading } = useQuery({
    queryKey: ["comparisonGroup", groupId],
    queryFn: () => base44.entities.Estimate.filter({ comparison_group_id: groupId }),
    enabled: !!groupId,
  });

  const sortedGroup = groupEstimates.sort((a, b) => (a.comparison_sort_order || 0) - (b.comparison_sort_order || 0));

  // Other estimates for the same customer (candidates to add)
  const sameCustomerEstimates = (estimates || []).filter(
    e => e.customer_id === estimate?.customer_id && e.id !== estimate?.id && !e.comparison_group_id
  );

  const createGroup = useMutation({
    mutationFn: async (stages) => {
      return await base44.functions.invoke("createComparisonGroup", { stages });
    },
    onSuccess: (res) => {
      if (res?.data?.error) { toast.error(res.data.error); return; }
      qc.invalidateQueries({ queryKey: ["comparisonGroup"] });
      qc.invalidateQueries({ queryKey: ["estimate"] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
      toast.success("Stage comparison created — all stages set to Sent");
      setBuilderOpen(false);
    },
    onError: (e) => toast.error("Failed to create comparison: " + (e?.message || "error")),
  });

  const regenerateSummary = async () => {
    if (!groupId) return;
    setRegenerating(true);
    try {
      const res = await base44.functions.invoke("generateComparisonSummary", { comparison_group_id: groupId });
      if (res?.data?.error) { toast.error(res.data.error); return; }
      qc.invalidateQueries({ queryKey: ["comparisonGroup", groupId] });
      qc.invalidateQueries({ queryKey: ["estimate"] });
      toast.success("AI summary regenerated");
    } catch (e) {
      toast.error("Failed to regenerate: " + (e?.message || "error"));
    } finally {
      setRegenerating(false);
    }
  };

  const copyLink = () => {
    if (!estimate?.comparison_public_token) return;
    const url = `${COMPARISON_VIEWER_BASE}/${estimate.comparison_public_token}`;
    navigator.clipboard.writeText(url);
    toast.success("Comparison link copied");
  };

  const sendComparisonEmail = async () => {
    if (!customer?.email) { toast.error("Customer has no email"); return; }
    if (!estimate?.comparison_public_token) { toast.error("No comparison link available"); return; }
    setSending(true);
    try {
      const url = `${COMPARISON_VIEWER_BASE}/${estimate.comparison_public_token}`;
      const stageList = sortedGroup.map(s => `${s.comparison_stage_label}: $${Number(s.total || 0).toFixed(2)}`).join("\n");
      const html = `
        <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Your Engine Build Options</h2>
          <p>Hi ${customer.first_name},</p>
          <p>We've prepared ${sortedGroup.length} stage options for your engine build. Compare them side-by-side and choose the one that fits your goals and budget.</p>
          <pre style="background: #f8f8f8; padding: 16px; border-radius: 8px; font-size: 14px;">${stageList}</pre>
          <a href="${url}" style="display: inline-block; background: #e20404; color: #fff; padding: 14px 36px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 24px 0;">Compare Stages & Choose</a>
          <p style="color: #718096; font-size: 13px;">Can't click? Copy this link: ${url}</p>
        </div>`;
      const res = await base44.functions.invoke("sendSmtpEmail", {
        to: customer.email,
        subject: `Your Engine Build Stage Options — ${sortedGroup.length} Stages to Compare`,
        html,
        usePOSmtp: false,
      });
      if (res?.data?.error) { toast.error("Failed to send: " + res.data.error); return; }
      toast.success(`Comparison sent to ${customer.email}`);
    } catch (e) {
      toast.error("Failed to send: " + (e?.message || "error"));
    } finally {
      setSending(false);
    }
  };

  // Not grouped — show create button
  if (!isGrouped) {
    return (
      <>
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" /> Stage Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 mb-3">
              Group this estimate with other stages (e.g. Stage 1, 2, 3) so the customer can compare them side-by-side and pick one.
            </p>
            <Button variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50" onClick={() => setBuilderOpen(true)}>
              <Layers className="w-4 h-4 mr-2" /> Create Stage Comparison
            </Button>
          </CardContent>
        </Card>
        {builderOpen && (
          <ComparisonBuilderModal
            estimate={estimate}
            candidates={sameCustomerEstimates}
            onClose={() => setBuilderOpen(false)}
            onCreate={(stages) => createGroup.mutate(stages)}
            creating={createGroup.isPending}
          />
        )}
      </>
    );
  }

  // Grouped — show group details
  const chosenEstimate = sortedGroup.find(e => e.comparison_choice === 'chosen');
  const interestedEstimates = sortedGroup.filter(e => e.comparison_choice === 'interested');

  return (
    <>
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" /> Stage Comparison
            <Badge className="bg-purple-100 text-purple-700 border-0">{sortedGroup.length} stages</Badge>
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={copyLink}><Copy className="w-3.5 h-3.5 mr-1" /> Copy Link</Button>
            <Button size="sm" variant="outline" onClick={regenerateSummary} disabled={regenerating}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${regenerating ? "animate-spin" : ""}`} /> Regenerate Summary
            </Button>
            <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={sendComparisonEmail} disabled={sending}>
              <Send className="w-3.5 h-3.5 mr-1" /> {sending ? "Sending..." : "Send to Customer"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stages list */}
          <div className="space-y-2">
            {isLoading ? (
              <p className="text-sm text-slate-400">Loading stages...</p>
            ) : sortedGroup.map((est, idx) => {
              const isThis = est.id === estimate?.id;
              return (
                <div key={est.id} className={`flex items-center gap-3 p-3 rounded-lg border ${isThis ? "border-purple-300 bg-purple-50" : "border-slate-200"}`}>
                  <GripVertical className="w-4 h-4 text-slate-300" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-purple-100 text-purple-700 border-0">{est.comparison_stage_label || `Stage ${est.comparison_sort_order}`}</Badge>
                      <span className="text-sm font-mono font-medium text-[#e20404]">{est.estimate_number}</span>
                      <span className="text-sm font-semibold text-slate-900">${Number(est.total || 0).toFixed(2)}</span>
                      {est.comparison_choice === 'chosen' && <Badge className="bg-emerald-100 text-emerald-700 border-0"><CheckCircle className="w-3 h-3 mr-1" />Chosen</Badge>}
                      {est.comparison_choice === 'interested' && <Badge className="bg-amber-100 text-amber-700 border-0"><Star className="w-3 h-3 mr-1" />Interested</Badge>}
                      {est.comparison_choice === 'declined_by_choice' && <Badge className="bg-slate-100 text-slate-500 border-0">Declined</Badge>}
                    </div>
                  </div>
                  {!isThis && (
                    <Button size="sm" variant="ghost" className="text-slate-400 hover:text-[#e20404]" onClick={() => onNavigateToEstimate?.(est.id)}>
                      Open
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Customer choice summary */}
          {(chosenEstimate || interestedEstimates.length > 0) && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              {chosenEstimate && (
                <p className="text-sm text-emerald-700 font-medium flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" /> Customer chose {chosenEstimate.comparison_stage_label} ({chosenEstimate.estimate_number})
                </p>
              )}
              {interestedEstimates.length > 0 && (
                <p className="text-sm text-amber-700 font-medium flex items-center gap-1.5 mt-1">
                  <Star className="w-4 h-4" /> Customer interested in {interestedEstimates.map(e => e.comparison_stage_label).join(' & ')} — follow up to discuss
                </p>
              )}
            </div>
          )}

          {/* AI Summary */}
          {estimate?.comparison_ai_summary && (
            <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3" /> AI Comparison Summary
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{estimate.comparison_ai_summary}</p>
            </div>
          )}

          {/* Comparison link */}
          {estimate?.comparison_public_token && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
              <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
              <code className="text-xs text-slate-500 truncate flex-1">{COMPARISON_VIEWER_BASE}/{estimate.comparison_public_token}</code>
              <Button size="sm" variant="ghost" className="text-slate-400 hover:text-[#e20404] shrink-0" onClick={copyLink}><Copy className="w-3.5 h-3.5" /></Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// --- Builder Modal ---
function ComparisonBuilderModal({ estimate, candidates, onClose, onCreate, creating }) {
  const [selected, setSelected] = useState({}); // estimateId -> { stage_label, sort_order }
  const [stageCounter, setStageCounter] = useState(2); // current estimate is Stage 1

  // Current estimate is always Stage 1
  const stages = [
    { estimate_id: estimate.id, stage_label: selected[estimate.id]?.stage_label || "Stage 1", sort_order: 1 },
    ...Object.entries(selected)
      .filter(([id]) => id !== estimate.id)
      .map(([id, v]) => ({ estimate_id: id, stage_label: v.stage_label, sort_order: v.sort_order })),
  ].sort((a, b) => a.sort_order - b.sort_order);

  const toggleEstimate = (est) => {
    setSelected(prev => {
      const next = { ...prev };
      if (next[est.id]) {
        delete next[est.id];
      } else {
        next[est.id] = { stage_label: `Stage ${stageCounter}`, sort_order: stageCounter };
        setStageCounter(c => c + 1);
      }
      return next;
    });
  };

  const updateLabel = (id, label) => {
    setSelected(prev => ({ ...prev, [id]: { ...prev[id], stage_label: label } }));
  };

  const handleCreate = () => {
    if (stages.length < 2) { toast.error("Select at least one more estimate to compare"); return; }
    onCreate(stages);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Create Stage Comparison</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Current estimate (Stage 1) */}
          <div className="p-3 rounded-lg border border-purple-300 bg-purple-50">
            <div className="flex items-center gap-3">
              <Badge className="bg-purple-600 text-white border-0">Stage 1</Badge>
              <div className="flex-1">
                <p className="font-mono font-medium text-[#e20404] text-sm">{estimate.estimate_number}</p>
                <p className="text-xs text-slate-500">This estimate · ${Number(estimate.total || 0).toFixed(2)}</p>
              </div>
              <Input
                value={selected[estimate.id]?.stage_label || "Stage 1"}
                onChange={(e) => updateLabel(estimate.id, e.target.value)}
                className="w-32 text-sm"
                placeholder="Stage 1"
              />
            </div>
          </div>

          {/* Candidate estimates */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Add other estimates for this customer:</p>
            {candidates.length === 0 ? (
              <p className="text-sm text-slate-400 p-4 text-center bg-slate-50 rounded-lg">
                No other draft estimates for this customer. Create additional estimates first, then group them.
              </p>
            ) : (
              <div className="space-y-2">
                {candidates.map(est => {
                  const isSelected = !!selected[est.id];
                  return (
                    <div key={est.id} className={`p-3 rounded-lg border ${isSelected ? "border-purple-300 bg-purple-50" : "border-slate-200"}`}>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleEstimate(est)}
                          className="w-4 h-4 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-mono font-medium text-[#e20404] text-sm">{est.estimate_number}</p>
                          <p className="text-xs text-slate-500">${Number(est.total || 0).toFixed(2)} · {est.status}</p>
                        </div>
                        {isSelected && (
                          <Input
                            value={selected[est.id]?.stage_label || ""}
                            onChange={(e) => updateLabel(est.id, e.target.value)}
                            className="w-32 text-sm"
                            placeholder={`Stage ${selected[est.id]?.sort_order}`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-700">
              All selected estimates will be set to <strong>Sent</strong> status and share one comparison link. The customer can compare stages side-by-side and either approve one or mark interest in multiple.
            </p>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={handleCreate} disabled={creating || stages.length < 2}>
            {creating ? "Creating..." : `Create ${stages.length}-Stage Comparison`}
          </Button>
        </div>
      </div>
    </div>
  );
}