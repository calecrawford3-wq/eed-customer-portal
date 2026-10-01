import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

const STAGE_LABELS: Record<string, string> = {
  stock: "Stock",
  stage_1: "Stage 1",
  stage_2: "Stage 2",
  stage_3: "Stage 3",
  contract: "Contract",
  custom: "Custom",
};

const PUBLIC_APP_SYNC_URL = "https://billing.eedpower.com/api/functions/syncEstimateSnapshot";

/**
 * Core snapshot-build + push logic shared by the syncEstimateSnapshot backend function
 * and createComparisonGroup (so every stage estimate is synced upfront with the same
 * token and status the customer will later be redirected to).
 *
 * Uses asServiceRole for all entity reads so it works reliably regardless of the
 * calling user's context (admin function vs. comparison group creator).
 */
export async function buildAndPushEstimateSnapshot(
  base44: any,
  estimateId: string,
  publicAccessToken: string,
): Promise<{ success: boolean; viewerLink: string; error?: string }> {
  // Fetch estimate
  const estimates = await base44.asServiceRole.entities.Estimate.filter({ id: estimateId });
  if (!estimates || estimates.length === 0) {
    return { success: false, viewerLink: "", error: `Estimate not found: ${estimateId}` };
  }
  const estimate = estimates[0];

  // Fetch customer
  const customers = await base44.asServiceRole.entities.Customer.filter({ id: estimate.customer_id });
  const customer = customers?.[0];

  // Fetch app settings
  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
  const appSettings = settings?.[0] || {};

  // Fetch engine details if linked
  let engineSerial: string | null = null;
  let enginePlatform: string | null = null;
  let eedEngineId: string | null = null;
  let buildStage: string | null = null;
  let specSheetName: string | null = null;

  if (estimate.customer_engine_id) {
    try {
      const engines = await base44.asServiceRole.entities.CustomerEngine.filter({ id: estimate.customer_engine_id });
      const engine = engines?.[0];
      if (engine) {
        engineSerial = engine.engine_serial_number || null;
        eedEngineId = engine.eed_id || null;
        buildStage = engine.current_stage || null;

        if (engine.platform_id) {
          const platforms = await base44.asServiceRole.entities.EnginePlatform.filter({ id: engine.platform_id });
          const platform = platforms?.[0];
          if (platform) {
            enginePlatform = `${platform.manufacturer} ${platform.name}${platform.year_range_start ? ` (${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"})` : ""}`;
          }
        }

        if (!buildStage && engine.engine_serial_number) {
          try {
            const builds = await base44.asServiceRole.entities.EngineBuild.filter({
              engine_serial_number: engine.engine_serial_number,
            });
            if (builds && builds.length > 0) {
              const mostRecentBuild = builds.sort(
                (a: any, b: any) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime(),
              )[0];
              if (mostRecentBuild?.spec_sheet_id) {
                const specs = await base44.asServiceRole.entities.SpecSheet.filter({ id: mostRecentBuild.spec_sheet_id });
                if (specs?.[0]?.spec_type) {
                  buildStage = specs[0].spec_type;
                }
              }
            }
          } catch (e) {
            console.warn(`[syncEstimateSnapshot] Could not fetch stage from recent build: ${(e as Error).message}`);
          }
        }
      }
    } catch (e) {
      console.warn(`[syncEstimateSnapshot] Could not fetch engine details: ${(e as Error).message}`);
    }
  }

  // If build is linked, get stage and spec sheet from build
  if (estimate.build_id) {
    try {
      const builds = await base44.asServiceRole.entities.EngineBuild.filter({ id: estimate.build_id });
      const build = builds?.[0];
      if (build) {
        if (!engineSerial) engineSerial = build.engine_serial_number || null;
        if (!eedEngineId) eedEngineId = build.eed_id || null;
        if (build.spec_sheet_id) {
          const specs = await base44.asServiceRole.entities.SpecSheet.filter({ id: build.spec_sheet_id });
          const spec = specs?.[0];
          if (spec) {
            if (spec.spec_type) buildStage = spec.spec_type;
            specSheetName = spec.custom_name || STAGE_LABELS[spec.spec_type] || spec.spec_type;
          }
        }
      }
    } catch (e) {
      console.warn(`[syncEstimateSnapshot] Could not fetch build details: ${(e as Error).message}`);
    }
  }

  // Also check if estimate itself has a spec sheet linked
  if (!specSheetName && estimate.spec_sheet_id) {
    try {
      const specs = await base44.asServiceRole.entities.SpecSheet.filter({ id: estimate.spec_sheet_id });
      const spec = specs?.[0];
      if (spec) {
        if (!buildStage && spec.spec_type) buildStage = spec.spec_type;
        specSheetName = spec.custom_name || STAGE_LABELS[spec.spec_type] || spec.spec_type;
      }
    } catch (e) {
      console.warn(`[syncEstimateSnapshot] Could not fetch estimate spec sheet: ${(e as Error).message}`);
    }
  }

  // Fetch linked illegal parts legal document (if flagged)
  let legalDocPublicToken: string | null = null;
  if (estimate.contains_illegal_parts) {
    try {
      const docs = await base44.asServiceRole.entities.LegalDocument.filter({
        estimate_id: estimateId,
        document_type: "illegal_parts",
      });
      const activeDoc = (docs || []).find((d: any) => d.status !== "void") || null;
      if (activeDoc) {
        legalDocPublicToken = activeDoc.public_access_token || null;
      }
    } catch (e) {
      console.warn(`[syncEstimateSnapshot] Could not fetch illegal parts legal document: ${(e as Error).message}`);
    }
  }

  // Fetch linked contract engine legal document (if flagged)
  let contractDocPublicToken: string | null = null;
  if (estimate.contains_contract_engine) {
    try {
      const docs = await base44.asServiceRole.entities.LegalDocument.filter({
        estimate_id: estimateId,
        document_type: "contract_engine",
      });
      const activeDoc = (docs || []).find((d: any) => d.status !== "void") || null;
      if (activeDoc) {
        contractDocPublicToken = activeDoc.public_access_token || null;
      }
    } catch (e) {
      console.warn(`[syncEstimateSnapshot] Could not fetch contract engine legal document: ${(e as Error).message}`);
    }
  }

  // Build snapshot payload
  const snapshot = {
    public_access_token: publicAccessToken,
    estimate_number: estimate.estimate_number,
    customer_name: customer ? `${customer.first_name} ${customer.last_name}` : "",
    customer_email: customer?.email || "",
    customer_country: customer?.country || "US",
    status: estimate.status,
    issue_date: estimate.issue_date,
    expiry_date: estimate.expiry_date,
    line_items: estimate.line_items || [],
    labor_items: estimate.labor_items || [],
    machining_items: estimate.machining_items || [],
    addons: estimate.addons || [],
    subtotal: estimate.subtotal,
    tax_amount: estimate.tax_amount,
    tax_rate: estimate.tax_rate,
    total: estimate.total,
    deposit_required: estimate.deposit_required || false,
    deposit_amount: estimate.deposit_amount ?? null,
    deposit_paid: estimate.deposit_paid || false,
    notes: estimate.notes || "",
    stripe_checkout_url: estimate.stripe_checkout_url,
    contains_illegal_parts: estimate.contains_illegal_parts || false,
    contains_contract_engine: estimate.contains_contract_engine || false,
    legal_document_public_access_token: legalDocPublicToken,
    contract_legal_document_public_access_token: contractDocPublicToken,
    company_name: appSettings.company_name,
    company_logo_url: appSettings.company_logo_url,
    company_phone: appSettings.company_phone,
    company_address: appSettings.company_address,
    engine_serial_number: engineSerial || null,
    engine_platform: enginePlatform || null,
    eed_engine_id: eedEngineId || null,
    eed_id: eedEngineId || null,
    build_stage: buildStage ? (STAGE_LABELS[buildStage] || buildStage) : null,
    spec_sheet_name: specSheetName || null,
  };

  // Get sync credentials
  const syncSecret = Deno.env.get("SYNC_SECRET");
  const syncApiKey = Deno.env.get("SYNC_API_KEY");

  if (!syncSecret || !syncApiKey) {
    return { success: false, viewerLink: "", error: "Missing SYNC_SECRET or SYNC_API_KEY" };
  }

  const response = await fetch(PUBLIC_APP_SYNC_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${syncApiKey}`,
      "x-sync-secret": syncSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(snapshot),
  });

  const responseBody = await response.text();

  if (!response.ok) {
    return {
      success: false,
      viewerLink: "",
      error: `Public app sync failed - Status ${response.status}: ${responseBody}`,
    };
  }

  // Sync linked legal documents to the public app
  for (const [docToken, docType] of [
    [legalDocPublicToken, "illegal_parts"],
    [contractDocPublicToken, "contract_engine"],
  ] as const) {
    if (!docToken) continue;
    try {
      const docs = await base44.asServiceRole.entities.LegalDocument.filter({
        estimate_id: estimateId,
        document_type: docType,
      });
      const activeDoc = (docs || []).find((d: any) => d.status !== "void" && d.public_access_token === docToken);
      if (activeDoc) {
        await base44.asServiceRole.functions.invoke("syncLegalDocument", { legalDocumentId: activeDoc.id });
      }
    } catch (e) {
      console.warn(`[syncEstimateSnapshot] Failed to sync ${docType} legal document: ${(e as Error).message}`);
    }
  }

  const viewerLink = `https://billing.eedpower.com/estimate/${publicAccessToken}`;
  return { success: true, viewerLink };
}