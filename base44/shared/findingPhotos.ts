/**
 * Shared helpers for finding photos.
 * Photos are stored as PRIVATE file_uris (UploadPrivateFile). A signed URL is
 * issued only after the caller is authorized AND (for customers) the photo is
 * marked share_with_customer. Hiding a photo in the UI is not enough — the
 * backend never returns a signed URL for a non-shared photo to a customer.
 */

export interface FindingPhotoLite {
  id: string;
  finding_id: string;
  caption: string;
  is_cover: boolean;
  share_with_customer: boolean;
  sort_order: number;
  signed_url: string;
}

/**
 * Returns signed URLs for a list of FindingPhoto records.
 * @param shareOnly  when true, non-shared photos are dropped entirely
 *                   (used for customer / public-access callers)
 */
export async function serializePhotos(
  base44: any,
  photos: any[],
  opts: { shareOnly?: boolean } = {}
): Promise<FindingPhotoLite[]> {
  const shareOnly = opts.shareOnly ?? false;
  const list = shareOnly ? photos.filter((p) => p.share_with_customer) : photos;

  const out: FindingPhotoLite[] = [];
  for (const p of list) {
    let signed_url = "";
    try {
      const res = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: p.file_uri,
        expires_in: 600,
      });
      signed_url = res?.signed_url || "";
    } catch (e) {
      console.error("[findingPhotos] signed url failed:", e?.message || e);
    }
    out.push({
      id: p.id,
      finding_id: p.finding_id,
      caption: p.caption || "",
      is_cover: !!p.is_cover,
      share_with_customer: !!p.share_with_customer,
      sort_order: Number(p.sort_order) || 0,
      signed_url,
    });
  }

  // Cover first, then sort_order
  out.sort(
    (a, b) => (b.is_cover ? 1 : 0) - (a.is_cover ? 1 : 0) || a.sort_order - b.sort_order
  );
  return out;
}

/** Customer-safe finding fields (no private notes / measurements). */
export function publicFinding(f: any) {
  return {
    id: f.id,
    component: f.component || "",
    condition: f.condition || "",
    customer_description: f.customer_description || "",
    recommended_action: f.recommended_action || "none",
    estimated_customer_charge: Number(f.estimated_customer_charge) || 0,
    status: f.status || "open",
  };
}

/**
 * Serialize one AdditionalWork record with its customer-safe findings and
 * SHARED photos (signed URLs). Reused by the public additional-work viewer
 * and the public invoice viewer so both surface the same shared photos.
 */
export async function serializeAdditionalWorkWithPhotos(base44: any, aw: any) {
  const findingIds = (aw.finding_ids || []).filter(Boolean);
  let findings: any[] = [];
  let photosByFinding: Record<string, any[]> = {};
  if (findingIds.length > 0) {
    const fRes = await base44.asServiceRole.entities.TeardownFinding.filter(
      { id: { $in: findingIds } },
      { limit: 200 }
    );
    findings = (fRes.items || fRes || []).map((f: any) => publicFinding(f));
    const pRes = await base44.asServiceRole.entities.FindingPhoto.filter(
      { finding_id: { $in: findingIds }, share_with_customer: true },
      { limit: 1000 }
    );
    const photos = pRes.items || pRes || [];
    const serialized = await serializePhotos(base44, photos, { shareOnly: true });
    for (const p of serialized) {
      (photosByFinding[p.finding_id] ||= []).push(p);
    }
  }
  const findingsOut = findings.map((f: any) => ({
    ...f,
    photos: photosByFinding[f.id] || [],
  }));
  return { ...publicAdditionalWork(aw), findings: findingsOut };
}

/** Customer-safe additional-work fields (no part_numbers, no internal fields). */
export function publicAdditionalWork(aw: any) {
  return {
    id: aw.id,
    work_number: aw.work_number || "",
    title: aw.title || "",
    description: aw.description || "",
    status: aw.status || "pending",
    customer_response: aw.customer_response || "pending",
    customer_note: aw.customer_note || "",
    subtotal: Number(aw.subtotal) || 0,
    tax_amount: Number(aw.tax_amount) || 0,
    total: Number(aw.total) || 0,
    line_items: (aw.line_items || []).map((li: any) => ({
      item_name: li.item_name || "",
      quantity: Number(li.quantity) || 0,
      unit_price: Number(li.unit_price) || 0,
      total: Number(li.total) || 0,
    })),
    labor_items: (aw.labor_items || []).map((l: any) => ({
      name: l.name || "",
      description: l.description || "",
      price: Number(l.price) || 0,
    })),
    machining_items: (aw.machining_items || []).map((m: any) => ({
      name: m.name || "",
      description: m.description || "",
      price: Number(m.price) || 0,
    })),
    outsourced_services: (aw.outsourced_services || []).map((o: any) => ({
      name: o.name || "",
      description: o.description || "",
      price: Number(o.price) || 0,
    })),
  };
}