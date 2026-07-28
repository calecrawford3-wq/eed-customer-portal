// Resolve an inbound phone number to a Customer (and which additional contact, if any).
// Used by receiveVoipSms and fetchVoipCdr so calls/texts from a driver's dad, crew chief,
// etc. link to the parent customer and surface the specific person's name.
//
// Returns: { customer_id, customer_name, contact_name, contact_id, relationship }
// Match order: CustomerContact.phone first, then Customer.phone.

function norm(p: string): string {
  if (!p) return "";
  let d = p.replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return d;
}

const EMPTY = { customer_id: "", customer_name: "", contact_name: "", contact_id: "", relationship: "" };

export async function resolveCaller(base44: any, rawPhone: string) {
  const target = norm(rawPhone);
  if (!target) return { ...EMPTY };

  // 1) Additional contacts (driver's dad, crew chief, etc.)
  try {
    const contacts = await base44.asServiceRole.entities.CustomerContact.list("-created_date", 1000);
    const ct = (contacts || []).find((c: any) => {
      const cp = norm(c.phone || "");
      return !!cp && (cp === target || cp.endsWith(target) || target.endsWith(cp));
    });
    if (ct) {
      let custName = "";
      try {
        const cust = await base44.asServiceRole.entities.Customer.get(ct.customer_id);
        custName = `${cust.first_name || ""} ${cust.last_name || ""}`.trim();
      } catch (_) { /* parent customer may have been deleted */ }
      return {
        customer_id: ct.customer_id || "",
        customer_name: custName,
        contact_name: `${ct.first_name || ""} ${ct.last_name || ""}`.trim(),
        contact_id: ct.id || "",
        relationship: ct.relationship || "",
      };
    }
  } catch (e) {
    console.warn("resolveCaller: contact lookup failed:", e?.message || e);
  }

  // 2) Customer primary phone
  try {
    const customers = await base44.asServiceRole.entities.Customer.list("-created_date", 1000);
    const m = (customers || []).find((c: any) => {
      const cp = norm(c.phone || "");
      return !!cp && (cp === target || cp.endsWith(target) || target.endsWith(cp));
    });
    if (m) {
      return {
        customer_id: m.id || "",
        customer_name: `${m.first_name || ""} ${m.last_name || ""}`.trim(),
        contact_name: "",
        contact_id: "",
        relationship: "",
      };
    }
  } catch (e) {
    console.warn("resolveCaller: customer lookup failed:", e?.message || e);
  }

  return { ...EMPTY };
}