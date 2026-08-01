import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Users,
  Wrench,
  Receipt,
  ClipboardList,
  ShoppingCart,
  Package,
  Cpu,
  FileText,
} from "lucide-react";

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const { data: customers = [] } = useQuery({
    queryKey: ["gs-customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
    staleTime: 60000,
  });
  const { data: builds = [] } = useQuery({
    queryKey: ["gs-builds"],
    queryFn: () => base44.entities.EngineBuild.list("-created_date", 100),
    staleTime: 60000,
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["gs-invoices"],
    queryFn: () => base44.entities.Invoice.list("-created_date", 100),
    staleTime: 60000,
  });
  const { data: estimates = [] } = useQuery({
    queryKey: ["gs-estimates"],
    queryFn: () => base44.entities.Estimate.list("-created_date", 100),
    staleTime: 60000,
  });
  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["gs-pos"],
    queryFn: () => base44.entities.PurchaseOrder.list("-created_date", 100),
    staleTime: 60000,
  });
  const { data: parts = [] } = useQuery({
    queryKey: ["gs-parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 200),
    staleTime: 60000,
  });
  const { data: engines = [] } = useQuery({
    queryKey: ["gs-engines"],
    queryFn: () => base44.entities.CustomerEngine.list("-created_date", 200),
    staleTime: 60000,
  });

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  const match = (text, q) => text?.toLowerCase().includes(q.toLowerCase());

  const filterResults = (q) => {
    if (!q) return {};
    return {
      customers: customers.filter((c) => match(`${c.first_name} ${c.last_name} ${c.company_name || ""} ${c.email || ""}`, q)).slice(0, 5),
      builds: builds.filter((b) => match(`${b.engine_serial_number} ${b.build_number} ${b.eed_id}`, q)).slice(0, 5),
      invoices: invoices.filter((i) => match(`${i.invoice_number}`, q)).slice(0, 5),
      estimates: estimates.filter((e) => match(`${e.estimate_number}`, q)).slice(0, 5),
      pos: purchaseOrders.filter((p) => match(`${p.po_number}`, q)).slice(0, 5),
      parts: parts.filter((p) => match(`${p.name} ${p.part_number}`, q)).slice(0, 5),
      engines: engines.filter((e) => match(`${e.engine_serial_number} ${e.eed_id}`, q)).slice(0, 5),
    };
  };

  const [query, setQuery] = useState("");
  const results = filterResults(query);
  const hasResults = Object.values(results).some((arr) => arr.length > 0);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search customers, builds, invoices, parts…" value={query} onValueChange={setQuery} />
      <CommandList>
        {query && !hasResults && <CommandEmpty>No results found.</CommandEmpty>}
        {!query && (
          <CommandGroup heading="Quick Navigate">
            <CommandItem onSelect={() => go("/Dashboard")}>
              <FileText className="w-4 h-4" /> Dashboard
            </CommandItem>
            <CommandItem onSelect={() => go("/Customers")}>
              <Users className="w-4 h-4" /> Customers
            </CommandItem>
            <CommandItem onSelect={() => go("/Builds")}>
              <Wrench className="w-4 h-4" /> Builds
            </CommandItem>
            <CommandItem onSelect={() => go("/Inventory")}>
              <Package className="w-4 h-4" /> Inventory
            </CommandItem>
          </CommandGroup>
        )}
        {results.customers?.length > 0 && (
          <CommandGroup heading="Customers">
            {results.customers.map((c) => (
              <CommandItem key={c.id} onSelect={() => go(`/CustomerDetail?id=${c.id}`)}>
                <Users className="w-4 h-4" /> {c.first_name} {c.last_name}{c.company_name ? ` · ${c.company_name}` : ""}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.builds?.length > 0 && (
          <CommandGroup heading="Builds">
            {results.builds.map((b) => (
              <CommandItem key={b.id} onSelect={() => go(`/BuildDetail?id=${b.id}`)}>
                <Wrench className="w-4 h-4" /> {b.eed_id || b.engine_serial_number || b.build_number}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.invoices?.length > 0 && (
          <CommandGroup heading="Invoices">
            {results.invoices.map((i) => (
              <CommandItem key={i.id} onSelect={() => go(`/InvoiceDetail?id=${i.id}`)}>
                <Receipt className="w-4 h-4" /> {i.invoice_number}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.estimates?.length > 0 && (
          <CommandGroup heading="Estimates">
            {results.estimates.map((e) => (
              <CommandItem key={e.id} onSelect={() => go(`/EstimateDetail?id=${e.id}`)}>
                <ClipboardList className="w-4 h-4" /> {e.estimate_number}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.pos?.length > 0 && (
          <CommandGroup heading="Purchase Orders">
            {results.pos.map((p) => (
              <CommandItem key={p.id} onSelect={() => go(`/PurchaseOrderDetail?id=${p.id}`)}>
                <ShoppingCart className="w-4 h-4" /> {p.po_number}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.parts?.length > 0 && (
          <CommandGroup heading="Parts">
            {results.parts.map((p) => (
              <CommandItem key={p.id} onSelect={() => go(`/Inventory`)}>
                <Package className="w-4 h-4" /> {p.name}{p.part_number ? ` · ${p.part_number}` : ""}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.engines?.length > 0 && (
          <CommandGroup heading="Customer Engines">
            {results.engines.map((e) => (
              <CommandItem key={e.id} onSelect={() => go(`/CustomerDetail?id=${e.customer_id}`)}>
                <Cpu className="w-4 h-4" /> {e.eed_id} · {e.engine_serial_number}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}