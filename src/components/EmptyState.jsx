import React from "react";
import { cn } from "@/lib/utils";

export default function EmptyState({ icon: Icon, title, message, actionLabel, onAction, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
      {Icon && <Icon className="w-12 h-12 text-slate-300 mb-3" />}
      <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
      {message && <p className="text-sm text-slate-400 max-w-sm">{message}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 bg-[#e20404] text-white text-sm rounded-lg hover:bg-[#c00303] transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}