import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

/**
 * A prominent "Next Step" call-to-action banner shown at the top of entity detail
 * pages. Guides employees through the lifecycle by surfacing the single most
 * important next action for the current entity.
 *
 * Props:
 *  - icon: lucide icon component
 *  - message: the guidance text (required)
 *  - actionLabel: button label (omit for info-only banners with no action)
 *  - onAction: click handler (for action buttons)
 *  - to: route link (for navigation buttons) — used instead of onAction
 *  - disabled / disabledReason: disables the action button when applicable
 */
export default function NextStepBanner({ icon: Icon, message, actionLabel, onAction, to, disabled, disabledReason }) {
  if (!message) return null;
  const hasAction = actionLabel && (onAction || to);

  return (
    <div className="flex items-center gap-3 p-3 md:p-4 rounded-xl bg-gradient-to-r from-[#e20404]/5 to-amber-50 border border-[#e20404]/20 mb-4 print:hidden">
      <div className="w-9 h-9 rounded-lg bg-[#e20404]/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-[#e20404]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#e20404]">Next Step</p>
        <p className="text-sm text-slate-700 font-medium leading-snug">{message}</p>
      </div>
      {hasAction && (
        to ? (
          <Link to={to} className="shrink-0">
            <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white">
              {actionLabel} <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        ) : (
          <Button
            size="sm"
            className="bg-[#e20404] hover:bg-[#c00303] text-white shrink-0"
            onClick={onAction}
            disabled={disabled}
            title={disabledReason || ""}
          >
            {actionLabel} <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        )
      )}
    </div>
  );
}