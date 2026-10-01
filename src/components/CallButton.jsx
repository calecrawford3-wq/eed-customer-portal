import React, { useState } from "react";
import ActiveCallModal from "./ActiveCallModal";
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Call button. Opens the ActiveCallModal with a timer, notes, outcome,
 * follow-up scheduling, create-estimate, and engine-record links.
 * On mobile, a tel: link is available inside the modal.
 *
 * Props:
 *  - customer: { id, name, phone }  (or pass customerId/customerName/customerPhone)
 *  - customerSuccessTask: optional CS task (CS mode = satisfaction entry)
 *  - builds: optional list of EngineBuild records (for "Open Engine Records")
 *  - size, className, label, iconOnly
 */
export default function CallButton({
  customer,
  customerId,
  customerName,
  customerPhone,
  customerSuccessTask,
  builds,
  onSaved,
  size = "sm",
  className,
  label,
  iconOnly = false,
}) {
  const [open, setOpen] = useState(false);

  const c = customer || { id: customerId, name: customerName, phone: customerPhone };
  const name = c.name || [c.first_name, c.last_name].filter(Boolean).join(" ");
  const phone = c.phone || customerPhone;
  if (!phone) return null;

  const fullCustomer = { id: c.id || customerId, name, phone };

  return (
    <>
      <button
        type="button"
        title={label || `Call ${name}`}
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center justify-center gap-1 rounded-lg text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-colors font-medium flex-shrink-0",
          iconOnly ? "w-8 h-8" : "px-2.5 py-1",
          size === "sm" && !iconOnly && "text-sm",
          className
        )}
      >
        <Phone className={cn(iconOnly ? "w-4 h-4" : "w-3.5 h-3.5")} />
        {!iconOnly && <span>{label || phone}</span>}
      </button>
      <ActiveCallModal
        open={open}
        onClose={() => setOpen(false)}
        customer={fullCustomer}
        customerSuccessTask={customerSuccessTask}
        builds={builds}
        onSaved={onSaved}
      />
    </>
  );
}