import React from "react";
import { cn } from "@/lib/utils";

export default function LoadingState({ rows = 3, variant = "list", className }) {
  if (variant === "cards") {
    return (
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2"></div>
            <div className="h-8 bg-slate-200 rounded animate-pulse w-1/3"></div>
            <div className="h-3 bg-slate-200 rounded animate-pulse w-2/3"></div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "rows") {
    return (
      <div className={cn("p-4 space-y-3", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-200 rounded-full animate-pulse shrink-0"></div>
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-slate-200 rounded animate-pulse w-1/3"></div>
              <div className="h-3 bg-slate-200 rounded animate-pulse w-2/3"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2 py-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className="h-4 bg-slate-200 rounded animate-pulse"
            style={{ width: `${50 + ((i * 13) % 40)}%` }}
          ></div>
          <div className="h-4 bg-slate-200 rounded animate-pulse w-16 shrink-0"></div>
        </div>
      ))}
    </div>
  );
}