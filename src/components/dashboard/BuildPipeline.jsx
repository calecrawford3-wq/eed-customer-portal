import React from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "lucide-react";

const PIPELINE_STAGES = [
  { key: "queued", label: "Queued", color: "bg-slate-400" },
  { key: "in_progress", label: "In Progress", color: "bg-blue-500" },
  { key: "assembly", label: "Assembly", color: "bg-amber-500" },
  { key: "testing", label: "Testing", color: "bg-purple-500" },
  { key: "complete", label: "Complete", color: "bg-emerald-500" },
  { key: "shipped", label: "Shipped", color: "bg-slate-300" },
];

export default function BuildPipeline({ builds, isLoading }) {
  const stages = PIPELINE_STAGES.map((s) => ({
    ...s,
    count: builds.filter((b) => b.status === s.key).length,
  }));
  const total = builds.length || 1;
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Build Pipeline</CardTitle>
          <Link to="/Jobs" className="text-sm text-[#e20404] hover:text-[#c00303] flex items-center gap-1">
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {stages.map((stage) => (
              <div key={stage.key} className="flex items-center gap-3">
                <div className="w-20 text-xs font-medium text-slate-500 text-right shrink-0">{stage.label}</div>
                <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden relative">
                  <div
                    className={`${stage.color} h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2`}
                    style={{ width: `${Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 12 : 0)}%` }}
                  >
                    {stage.count > 0 && (
                      <span className="text-xs font-bold text-white">{stage.count}</span>
                    )}
                  </div>
                </div>
                <div className="w-8 text-xs text-slate-400 text-right shrink-0">
                  {total > 0 ? `${Math.round((stage.count / total) * 100)}%` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}