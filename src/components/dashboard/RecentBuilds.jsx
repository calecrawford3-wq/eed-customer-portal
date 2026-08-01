import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Wrench, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors = {
  planning: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  assembly: "bg-[#e20404]/10 text-amber-700",
  testing: "bg-purple-100 text-purple-700",
  complete: "bg-emerald-100 text-emerald-700",
  shipped: "bg-slate-100 text-slate-500",
};

export default function RecentBuilds({ builds, platforms, isLoading }) {
  const recentBuilds = builds.slice(0, 5);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Builds</CardTitle>
          <Link to="/Builds" className="text-sm text-[#e20404] hover:text-[#c00303] flex items-center gap-1">
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : recentBuilds.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Wrench className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>No builds yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentBuilds.map((build) => {
              const platform = platforms.find((p) => p.id === build.platform_id);
              return (
                <Link
                  key={build.id}
                  to={`/BuildDetail?id=${build.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-slate-900">{build.build_number}</p>
                    <p className="text-sm text-slate-500">
                      {platform?.name || "Unknown Platform"} • {build.application || "No application"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {build.overrides?.length > 0 && <AlertCircle className="w-4 h-4 text-amber-500" />}
                    <Badge className={statusColors[build.status]}>{build.status?.replace("_", " ")}</Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}