import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";

// Extract proposed receipt data from an uploaded packing slip or supplier
// invoice, match to existing POs and catalog records, and return a review
// screen payload highlighting unmatched items, ambiguous matches,
// discrepancies, and low-confidence extraction.
//
// Does NOT post any receipts or change any costs — that requires a separate
// confirmation call to receiveByPackingSlip. Prevents duplicate receiving of
// the same document via file_hash.
//
// POST { file_uri, file_name, file_hash, po_id? }
// Returns { extracted, matched_po, items: [...], unmatched, ambiguous, discrepancies, low_confidence, packing_slip_id }

export default async function(req) {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin required" }, { status: 403 });
    }

    const body = await req.json();
    const { file_uri, file_name, file_hash, po_id } = body;
    if (!file_uri) return Response.json({ error: "file_uri required" }, { status: 400 });
    if (!file_hash) return Response.json({ error: "file_hash required" }, { status: 400 });

    // Prevent duplicate receiving of the same document
    const dupRes = await base44.asServiceRole.entities.PackingSlip.filter({ file_hash, status: { $in: ["pending_review", "confirmed"] } });
    const dup = (dupRes.items || dupRes || [])[0];
    if (dup) {
      return Response.json({ error: "This document has already been uploaded and is " + (dup.status === "confirmed" ? "already received" : "pending review") + ".", duplicate: true, packing_slip_id: dup.id }, { status: 409 });
    }

    // Create a signed URL so the extraction service can fetch the private file
    const signedRes = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 600 });
    const signedUrl = signedRes?.data?.signed_url || signedRes?.signed_url;
    if (!signedUrl) return Response.json({ error: "Failed to create accessible URL for extraction" }, { status: 500 });

    // Extract structured data from the packing slip
    const extractRes = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
      file_url: signedUrl,
      json_schema: {
        type: "object",
        properties: {
          supplier_name: { type: "string" },
          po_reference: { type: "string" },
          invoice_number: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                part_number: { type: "string" },
                description: { type: "string" },
                quantity_shipped: { type: "number" },
                unit_cost: { type: "number" },
                backordered_qty: { type: "number" },
              },
            },
          },
        },
      },
    });

    const extracted = extractRes?.data?.output || extractRes?.output || extractRes?.data || extractRes;
    if (!extracted || (extractRes?.data?.status === "error") || (extractRes?.status === "error")) {
      const details = extractRes?.data?.details || extractRes?.details || "Extraction returned no data";
      return Response.json({ error: "Extraction failed", details }, { status: 422 });
    }

    // Load the PO (if provided) for matching
    let po = null;
    if (po_id) {
      const poRes = await base44.asServiceRole.entities.PurchaseOrder.filter({ id: po_id });
      po = (poRes.items || poRes || [])[0];
    }

    // Load all parts for catalog matching
    const partsRes = await base44.asServiceRole.entities.Part.list("-created_date", 1000);
    const allParts = partsRes.items || partsRes || [];

    // Match each extracted item to catalog + PO lines
    const items = [];
    const unmatched = [];
    const ambiguous = [];
    const discrepancies = [];
    const lowConfidence = [];

    const extractedItems = extracted.items || [];
    for (let i = 0; i < extractedItems.length; i++) {
      const ext = extractedItems[i];
      const partNumber = (ext.part_number || "").trim();
      const qty = Number(ext.quantity_shipped) || 0;
      const unitCost = ext.unit_cost != null ? Number(ext.unit_cost) : null;
      const backordered = Number(ext.backordered_qty) || 0;

      // Match to catalog by part_number (case-insensitive)
      let matchedParts = [];
      if (partNumber) {
        const lower = partNumber.toLowerCase();
        matchedParts = allParts.filter(p => p.part_number && p.part_number.toLowerCase() === lower);
      }

      let matchStatus = "unmatched";
      let matchedPartId = null;
      let poLineIdx = null;
      let discrepancy = null;

      if (matchedParts.length === 1) {
        matchStatus = "matched";
        matchedPartId = matchedParts[0].id;
        // Find the PO line for this part
        if (po) {
          const poLine = (po.line_items || []).find((l, idx) => l.part_id === matchedPartId || (l.part_number && l.part_number.toLowerCase() === partNumber.toLowerCase()));
          if (poLine) {
            poLineIdx = (po.line_items || []).indexOf(poLine);
            // Check for discrepancies
            const ordered = Number(poLine.quantity) || 0;
            const alreadyReceived = Number(poLine.received_qty) || 0;
            const remaining = ordered - alreadyReceived;
            if (qty > remaining) {
              discrepancies.push({ item_idx: i, type: "qty_exceeds_remaining", message: `Shipped ${qty} but only ${remaining} remaining on PO line (ordered ${ordered}, already received ${alreadyReceived}).` });
            }
            if (unitCost != null && poLine.unit_cost != null && Math.abs(unitCost - Number(poLine.unit_cost)) > 0.01) {
              discrepancies.push({ item_idx: i, type: "cost_mismatch", message: `Slip unit cost $${unitCost.toFixed(2)} differs from PO unit cost $${Number(poLine.unit_cost).toFixed(2)}.` });
            }
          }
        }
      } else if (matchedParts.length > 1) {
        matchStatus = "ambiguous";
        ambiguous.push({ item_idx: i, part_number: partNumber, candidates: matchedParts.map(p => ({ id: p.id, part_number: p.part_number, name: p.name })) });
      } else {
        unmatched.push({ item_idx: i, part_number: partNumber, description: ext.description });
      }

      // Low confidence: no part number, or qty is 0, or extraction seems incomplete
      if (!partNumber || qty <= 0) {
        lowConfidence.push({ item_idx: i, reason: !partNumber ? "No part number extracted" : "Zero quantity" });
      }

      items.push({
        item_idx: i,
        part_number: partNumber,
        description: ext.description || "",
        quantity_shipped: qty,
        unit_cost: unitCost,
        backordered_qty: backordered,
        match_status: matchStatus,
        matched_part_id: matchedPartId,
        po_line_idx: poLineIdx,
      });
    }

    // Create the PackingSlip record (pending_review)
    const slipRes = await base44.asServiceRole.entities.PackingSlip.create({
      po_id: po_id || "",
      supplier_id: po?.supplier_id || "",
      file_uri,
      file_name: file_name || "",
      file_hash,
      extracted_data: JSON.stringify(extracted),
      match_results: JSON.stringify({ items, unmatched, ambiguous, discrepancies, low_confidence }),
      status: "pending_review",
    });

    return Response.json({
      success: true,
      packing_slip_id: slipRes?.id,
      extracted: {
        supplier_name: extracted.supplier_name || "",
        po_reference: extracted.po_reference || "",
        invoice_number: extracted.invoice_number || "",
      },
      matched_po: po ? { id: po.id, po_number: po.po_number, supplier_id: po.supplier_id } : null,
      items,
      unmatched,
      ambiguous,
      discrepancies,
      low_confidence: lowConfidence,
    });
  } catch (error) {
    console.error("[extractPackingSlip] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}