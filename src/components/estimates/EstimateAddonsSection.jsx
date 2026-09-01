import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Trash2, Check, UserCheck } from "lucide-react";

export default function EstimateAddonsSection({ addons = [], onTogglePreselected, onRemove }) {
  if (!addons || addons.length === 0) return null;

  const selectedTotal = addons
    .filter(a => a.selection_state === "preselected" || a.selection_state === "customer_selected")
    .reduce((s, a) => s + (Number(a.price) || 0), 0);

  return (
    <Card className="border-0 shadow-sm mb-6 border-l-4 border-l-amber-400">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" /> Addons
          <Badge className="bg-amber-100 text-amber-700 border-0">{addons.length}</Badge>
          {selectedTotal > 0 && <span className="text-sm font-normal text-slate-500 ml-auto">Selected: ${selectedTotal.toFixed(2)}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {addons.map((addon, idx) => {
          const isSelected = addon.selection_state === "preselected" || addon.selection_state === "customer_selected";
          const isCustomerChosen = addon.selection_state === "customer_selected";
          return (
            <div key={addon.uid || idx} className={`flex items-center gap-3 p-3 rounded-lg border ${isSelected ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-slate-900 text-sm">{addon.name}</p>
                  {addon.category_name && <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">{addon.category_name}</Badge>}
                  {isCustomerChosen && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]"><UserCheck className="w-3 h-3 mr-0.5" />Customer selected</Badge>}
                </div>
                {addon.description && <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{addon.description}</p>}
                <p className="text-xs text-slate-400 mt-0.5">
                  {(addon.line_items || []).length} part{(addon.line_items || []).length === 1 ? "" : "s"} · {(addon.labor_items || []).length} labor · {(addon.machining_items || []).length} machining
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-slate-900">${Number(addon.price || 0).toFixed(2)}</p>
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <Switch
                  checked={addon.selection_state === "preselected"}
                  onCheckedChange={(v) => onTogglePreselected(addon.uid, v)}
                  disabled={isCustomerChosen}
                />
                <span className="text-[10px] text-slate-400">{isCustomerChosen ? "customer" : addon.selection_state === "preselected" ? "included" : "optional"}</span>
              </div>
              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 shrink-0" onClick={() => onRemove(addon.uid)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        })}
        <p className="text-xs text-slate-400 pt-1">
          <strong>Preselect</strong> = included in the total now (toggle on). <strong>Optional</strong> = the customer sees these in the portal and can add them themselves. Customer-chosen addons are locked here and counted in the total.
        </p>
      </CardContent>
    </Card>
  );
}