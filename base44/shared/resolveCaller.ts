// Resolve an inbound phone number to a Customer / CustomerContact / Supplier (vendor).
// Used by receiveVoipSms and fetchVoipCdr to resolve inbound caller IDs to customers.
//
// Returns: { customer_id, customer_name, contact_name, contact_id, relationship,
//            supplier_id, supplier_name, match_type }
// Match order: CustomerContact (specific person) → Customer (primary) → Supplier/Vendor.

function norm(p: string): string {
  if (!p) return "";
  let d = p.replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return d;
}

const EMPTY = {
  customer_id: "", customer_name: "", contact_name: "", contact_id: "", relationship: "",
  supplier_id: "", supplier_name: "", match_type: "none",
};

function phoneMatches(c: any, target: string): boolean {
  const cp = norm(c.phone || "");
  return !!cp && (cp === target || cp.endsWith(target) || target.endsWith(cp));
}

export async function resolveCaller(base44: any, rawPhone: string) {
  const target = norm(rawPhone);
  if (!target) return { ...EMPTY };

  // 1) Additional contacts (driver's dad, crew chief, etc.)
  try {
    const contacts = await base44.asServiceRole.entities.CustomerContact.list("-created_date", 1000);
    const ct = (contacts || []).find((c: any) => phoneMatches(c, target));
    if (ct) {
      let custName = "";
      try {
        const cust = await base44.asServiceRole.entities.Customer.get(ct.customer_id);
        custName = `${cust.first_name || ""} ${cust.last_name || ""}`.trim();
      } catch (_) { /* parent customer may have been deleted */ }
      return {
        ...EMPTY,
        customer_id: ct.customer_id || "",
        customer_name: custName,
        contact_name: `${ct.first_name || ""} ${ct.last_name || ""}`.trim(),
        contact_id: ct.id || "",
        relationship: ct.relationship || "",
        match_type: "contact",
      };
    }
  } catch (e) {
    console.warn("resolveCaller: contact lookup failed:", e?.message || e);
  }

  // 2) Customer primary phone
  try {
    const customers = await base44.asServiceRole.entities.Customer.list("-created_date", 1000);
    const m = (customers || []).find((c: any) => phoneMatches(c, target));
    if (m) {
      return {
        ...EMPTY,
        customer_id: m.id || "",
        customer_name: `${m.first_name || ""} ${m.last_name || ""}`.trim(),
        match_type: "customer",
      };
    }
  } catch (e) {
    console.warn("resolveCaller: customer lookup failed:", e?.message || e);
  }

  // 3) Supplier / vendor
  try {
    const suppliers = await base44.asServiceRole.entities.Supplier.list("-created_date", 1000);
    const s = (suppliers || []).find((c: any) => phoneMatches(c, target));
    if (s) {
      return {
        ...EMPTY,
        supplier_id: s.id || "",
        supplier_name: s.name || "",
        contact_name: s.contact_name || "",
        match_type: "supplier",
      };
    }
  } catch (e) {
    console.warn("resolveCaller: supplier lookup failed:", e?.message || e);
  }

  return { ...EMPTY };
}