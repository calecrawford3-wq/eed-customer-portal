import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CustomerSearchSelect({ customers = [], value, onValueChange, placeholder = "Search customer..." }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  const selected = customers.find(c => c.id === value);

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return (
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.company_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    );
  });

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (customer) => {
    onValueChange(customer.id);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onValueChange("");
  };

  return (
    <div ref={ref} className="relative">
      <div
        onClick={handleOpen}
        className={cn(
          "flex items-center gap-2 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm cursor-pointer",
          "hover:border-slate-400 transition-colors",
          open && "ring-1 ring-ring border-ring"
        )}
      >
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className={cn("flex-1 truncate", !selected && "text-muted-foreground")}>
          {selected
            ? `${selected.first_name} ${selected.last_name}${selected.company_name ? ` (${selected.company_name})` : ""}`
            : placeholder}
        </span>
        {selected ? (
          <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 shrink-0" onClick={handleClear} />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type to search..."
              className="w-full text-sm outline-none bg-transparent placeholder:text-slate-400"
              onClick={e => e.stopPropagation()}
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400 text-center">No customers found</li>
            ) : (
              filtered.map(c => (
                <li
                  key={c.id}
                  onClick={() => handleSelect(c)}
                  className={cn(
                    "px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 flex flex-col",
                    c.id === value && "bg-red-50 text-[#e20404]"
                  )}
                >
                  <span className="font-medium">{c.first_name} {c.last_name}{c.company_name ? ` — ${c.company_name}` : ""}</span>
                  {c.email && <span className="text-xs text-slate-400">{c.email}{c.phone ? ` · ${c.phone}` : ""}</span>}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}