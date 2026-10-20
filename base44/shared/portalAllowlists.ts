/**
 * Allowlist helpers for customer-portal reads.
 * Each function strips internal-only fields (costs, margins, private notes,
 * credentials, tokens) from a full entity record, returning only customer-safe
 * fields. Used by getPortalData so the portal never receives internal data.
 */

export function allowlistCustomer(c: any): any {
  if (!c) return null;
  return {
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    company_name: c.company_name,
    email: c.email,
    additional_emails: c.additional_emails,
    phone: c.phone,
    additional_phones: c.additional_phones,
    address_line1: c.address_line1,
    address_line2: c.address_line2,
    city: c.city,
    state: c.state,
    zip: c.zip,
    country: c.country,
    shipping_address_line1: c.shipping_address_line1,
    shipping_address_line2: c.shipping_address_line2,
    shipping_city: c.shipping_city,
    shipping_state: c.shipping_state,
    shipping_zip: c.shipping_zip,
    shipping_country: c.shipping_country,
    preferred_contact_method: c.preferred_contact_method,
    onboarding_contact_confirmed: c.onboarding_contact_confirmed,
    onboarding_racing_skipped: c.onboarding_racing_skipped,
    onboarding_cars_skipped: c.onboarding_cars_skipped,
    onboarding_garage_completed: c.onboarding_garage_completed,
    onboarding_tour_completed: c.onboarding_tour_completed,
    onboarding_tour_skipped: c.onboarding_tour_skipped,
    racing_role: c.racing_role,
    racing_classes: c.racing_classes,
    racing_tracks: c.racing_tracks,
    racing_primary_track: c.racing_primary_track,
    racing_notes_public: c.racing_notes_public,
    sms_consent: c.sms_consent,
    notification_estimates: c.notification_estimates,
    notification_build_updates: c.notification_build_updates,
    notification_invoices: c.notification_invoices,
    status: c.status,
    tax_exempt: c.tax_exempt,
    sms_opt_out: c.sms_opt_out,
    created_date: c.created_date,
  };
}

export function allowlistCustomerSummary(c: any): any {
  if (!c) return null;
  return {
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    company_name: c.company_name,
    email: c.email,
    status: c.status,
  };
}

function allowlistLineItem(l: any): any {
  if (!l) return null;
  return {
    item_name: l.item_name,
    quantity: l.quantity,
    unit_price: l.unit_price,
    total: l.total,
    is_kit: l.is_kit,
    is_core_credit: l.is_core_credit,
    engine_section: l.engine_section,
  };
}

function allowlistLaborItem(l: any): any {
  if (!l) return null;
  return { name: l.name, description: l.description, price: l.price, engine_section: l.engine_section };
}

function allowlistMachiningItem(m: any): any {
  if (!m) return null;
  return {
    name: m.name,
    description: m.description,
    price: m.price,
    quantity: m.quantity,
    engine_section: m.engine_section,
  };
}

function allowlistPayment(p: any): any {
  if (!p) return null;
  return { amount: p.amount, method: p.method, date: p.date };
}

function allowlistAddon(a: any): any {
  if (!a) return null;
  return {
    uid: a.uid,
    name: a.name,
    description: a.description,
    category_name: a.category_name,
    price: a.price,
    line_items: (a.line_items || []).map(allowlistLineItem),
    labor_items: (a.labor_items || []).map(allowlistLaborItem),
    machining_items: (a.machining_items || []).map(allowlistMachiningItem),
    selection_state: a.selection_state,
  };
}

export function allowlistEstimate(e: any): any {
  if (!e) return null;
  return {
    id: e.id,
    estimate_number: e.estimate_number,
    customer_id: e.customer_id,
    customer_engine_id: e.customer_engine_id,
    build_id: e.build_id,
    is_engine_build: e.is_engine_build,
    contains_illegal_parts: e.contains_illegal_parts,
    contains_contract_engine: e.contains_contract_engine,
    status: e.status,
    archived: e.archived,
    issue_date: e.issue_date,
    expiry_date: e.expiry_date,
    deposit_required: e.deposit_required,
    deposit_amount: e.deposit_amount,
    deposit_paid: e.deposit_paid,
    line_items: (e.line_items || []).map(allowlistLineItem),
    labor_items: (e.labor_items || []).map(allowlistLaborItem),
    machining_items: (e.machining_items || []).map(allowlistMachiningItem),
    addons: (e.addons || []).map(allowlistAddon),
    payments: (e.payments || []).map(allowlistPayment),
    subtotal: e.subtotal,
    tax_rate: e.tax_rate,
    tax_amount: e.tax_amount,
    total: e.total,
    discount_type: e.discount_type,
    discount_value: e.discount_value,
    discount_amount: e.discount_amount,
    shipping_cost: e.shipping_cost,
    applied_credits: e.applied_credits,
    amount_paid: e.amount_paid,
    amount_due: e.amount_due,
    notes: e.notes,
    created_date: e.created_date,
  };
}

export function allowlistInvoice(inv: any): any {
  if (!inv) return null;
  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    customer_id: inv.customer_id,
    customer_engine_id: inv.customer_engine_id,
    build_id: inv.build_id,
    is_legacy: inv.is_legacy,
    legacy_pdf_url: inv.legacy_pdf_url,
    is_combined: inv.is_combined,
    member_invoice_ids: inv.member_invoice_ids,
    combined_parent_id: inv.combined_parent_id,
    status: inv.status,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    due_on_completion: inv.due_on_completion,
    line_items: (inv.line_items || []).map(allowlistLineItem),
    labor_items: (inv.labor_items || []).map(allowlistLaborItem),
    machining_items: (inv.machining_items || []).map(allowlistMachiningItem),
    payments: (inv.payments || []).map(allowlistPayment),
    subtotal: inv.subtotal,
    tax_rate: inv.tax_rate,
    tax_amount: inv.tax_amount,
    total: inv.total,
    discount_type: inv.discount_type,
    discount_value: inv.discount_value,
    discount_amount: inv.discount_amount,
    shipping_cost: inv.shipping_cost,
    applied_credits: inv.applied_credits,
    amount_paid: inv.amount_paid,
    amount_due: inv.amount_due,
    balance_due: inv.balance_due,
    notes: inv.notes,
    created_date: inv.created_date,
  };
}

export function allowlistBuild(b: any): any {
  if (!b) return null;
  return {
    id: b.id,
    engine_serial_number: b.engine_serial_number,
    eed_id: b.eed_id,
    build_number: b.build_number,
    platform_id: b.platform_id,
    customer_id: b.customer_id,
    customer_name: b.customer_name,
    spec_sheet_id: b.spec_sheet_id,
    spec_sheet_version: b.spec_sheet_version,
    status: b.status,
    completion_date: b.completion_date,
    max_rpm: b.max_rpm,
    refresh_interval: b.refresh_interval,
    oil_recommendation: b.oil_recommendation,
    oil_change_interval: b.oil_change_interval,
    spark_plug_recommendation: b.spark_plug_recommendation,
    application: b.application,
    transmission_type: b.transmission_type,
    invoice_number: b.invoice_number,
    valve_lash_intake: b.valve_lash_intake,
    valve_lash_exhaust: b.valve_lash_exhaust,
    cam_info: b.cam_info,
    start_date: b.start_date,
    created_date: b.created_date,
  };
}

export function allowlistEngine(e: any): any {
  if (!e) return null;
  return {
    id: e.id,
    eed_id: e.eed_id,
    engine_serial_number: e.engine_serial_number,
    customer_id: e.customer_id,
    platform_id: e.platform_id,
    current_stage: e.current_stage,
    check_in_status: e.check_in_status,
    check_in_date: e.check_in_date,
    created_date: e.created_date,
  };
}

export function allowlistCredit(c: any): any {
  if (!c) return null;
  return {
    id: c.id,
    customer_id: c.customer_id,
    amount: c.amount,
    type: c.type,
    subtype: c.subtype,
    description: c.description,
    date: c.date,
    expires_on: c.expires_on,
    status: c.status,
    created_date: c.created_date,
  };
}

export function allowlistLegalDoc(d: any): any {
  if (!d) return null;
  return {
    id: d.id,
    document_type: d.document_type,
    title: d.title,
    body: d.body,
    customer_id: d.customer_id,
    estimate_id: d.estimate_id,
    invoice_id: d.invoice_id,
    build_id: d.build_id,
    customer_engine_id: d.customer_engine_id,
    seal_tag_numbers: d.seal_tag_numbers,
    seal_tag_photos: d.seal_tag_photos,
    admin_signature: d.admin_signature,
    admin_signed_by: d.admin_signed_by,
    admin_signed_at: d.admin_signed_at,
    customer_signature: d.customer_signature,
    customer_signed_at: d.customer_signed_at,
    status: d.status,
    created_date: d.created_date,
  };
}

export function allowlistDynoSheet(d: any): any {
  if (!d) return null;
  return {
    id: d.id,
    build_id: d.build_id,
    spec_sheet_id: d.spec_sheet_id,
    customer_engine_id: d.customer_engine_id,
    customer_id: d.customer_id,
    engine_serial_number: d.engine_serial_number,
    eed_id: d.eed_id,
    file_url: d.file_url,
    filename: d.filename,
    file_type: d.file_type,
    uploaded_by: d.uploaded_by,
    uploaded_by_role: d.uploaded_by_role,
    is_current: d.is_current,
    created_date: d.created_date,
  };
}

export function allowlistRefreshRequest(r: any): any {
  if (!r) return null;
  return {
    id: r.id,
    customer_id: r.customer_id,
    build_id: r.build_id,
    customer_name: r.customer_name,
    build_serial: r.build_serial,
    message: r.message,
    status: r.status,
    requested_date: r.requested_date,
    created_date: r.created_date,
  };
}

export function allowlistPlatform(p: any): any {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    manufacturer: p.manufacturer,
    year_range_start: p.year_range_start,
    year_range_end: p.year_range_end,
    displacement_cc: p.displacement_cc,
    configuration: p.configuration,
    valve_count: p.valve_count,
    cylinder_count: p.cylinder_count,
    status: p.status,
    created_date: p.created_date,
  };
}

export function allowlistSpecSheet(s: any): any {
  if (!s) return null;
  return {
    id: s.id,
    platform_id: s.platform_id,
    spec_type: s.spec_type,
    custom_name: s.custom_name,
    version: s.version,
    is_current: s.is_current,
    status: s.status,
    // Only the dimensions already shown on the customer's printable sheets.
    // Never send the full shop specification or its free-form notes.
    specs: {
      block: { bore_diameter_mm: s.specs?.block?.bore_diameter_mm },
      rotating_assembly: { stroke_mm: s.specs?.rotating_assembly?.stroke_mm },
    },
    created_date: s.created_date,
  };
}
