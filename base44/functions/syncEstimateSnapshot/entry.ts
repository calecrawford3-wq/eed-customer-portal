import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== "admin") {
      return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { estimateId, publicAccessToken } = await req.json();

    console.log(`[syncEstimateSnapshot] Starting sync for estimate ${estimateId} with token ${publicAccessToken}`);

    if (!estimateId || !publicAccessToken) {
      return Response.json({ error: "Missing estimateId or publicAccessToken" }, { status: 400 });
    }

    // Fetch estimate and related data
    const estimates = await base44.entities.Estimate.filter({ id: estimateId });
    if (!estimates || estimates.length === 0) {
      console.error(`[syncEstimateSnapshot] Estimate not found: ${estimateId}`);
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = estimates[0];
    console.log(`[syncEstimateSnapshot] Fetched estimate: ${estimate.estimate_number}`);

    // Fetch customer
    const customers = await base44.entities.Customer.filter({ id: estimate.customer_id });
    const customer = customers?.[0];
    console.log(`[syncEstimateSnapshot] Fetched customer: ${customer?.first_name} ${customer?.last_name}`);

    // Fetch app settings
    const settings = await base44.entities.AppSettings.filter({ key: "global" });
    const appSettings = settings?.[0] || {};
    console.log(`[syncEstimateSnapshot] Fetched app settings`);

    // Fetch engine details if linked
    let engineSerial = null;
    let enginePlatform = null;
    let eedEngineId = null;
    let buildStage = null;
    let specSheetName = null;

    const STAGE_LABELS = { stock: "Stock", stage_1: "Stage 1", stage_2: "Stage 2", stage_3: "Stage 3", contract: "Contract", custom: "Custom" };

    if (estimate.customer_engine_id) {
      try {
        const engines = await base44.entities.CustomerEngine.filter({ id: estimate.customer_engine_id });
        const engine = engines?.[0];
        if (engine) {
          engineSerial = engine.engine_serial_number || null;
          eedEngineId = engine.eed_id || null;
          buildStage = engine.current_stage || null;

          if (engine.platform_id) {
            const platforms = await base44.entities.EnginePlatform.filter({ id: engine.platform_id });
            const platform = platforms?.[0];
            if (platform) {
              enginePlatform = `${platform.manufacturer} ${platform.name}${platform.year_range_start ? ` (${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"})` : ""}`;
            }
          }

          // If no stage set on engine, check most recent build's spec sheet
          if (!buildStage && engine.engine_serial_number) {
            try {
              const builds = await base44.entities.EngineBuild.filter({ 
                engine_serial_number: engine.engine_serial_number 
              });
              if (builds && builds.length > 0) {
                const mostRecentBuild = builds.sort((a, b) => 
                  new Date(b.created_date || 0) - new Date(a.created_date || 0)
                )[0];
                if (mostRecentBuild?.spec_sheet_id) {
                  const specs = await base44.entities.SpecSheet.filter({ id: mostRecentBuild.spec_sheet_id });
                  if (specs?.[0]?.spec_type) {
                    buildStage = specs[0].spec_type;
                  }
                }
              }
            } catch (e) {
              console.warn(`[syncEstimateSnapshot] Could not fetch stage from recent build: ${e.message}`);
            }
          }
        }
      } catch (e) {
        console.warn(`[syncEstimateSnapshot] Could not fetch engine details: ${e.message}`);
      }
    }

    // If build is linked, get stage and spec sheet from build
    if (estimate.build_id) {
      try {
        const builds = await base44.entities.EngineBuild.filter({ id: estimate.build_id });
        const build = builds?.[0];
        if (build) {
          if (!engineSerial) engineSerial = build.engine_serial_number || null;
          if (!eedEngineId) eedEngineId = build.eed_id || null;
          if (build.spec_sheet_id) {
            const specs = await base44.entities.SpecSheet.filter({ id: build.spec_sheet_id });
            const spec = specs?.[0];
            if (spec) {
              if (spec.spec_type) buildStage = spec.spec_type;
              // Name without version (customer-facing)
              specSheetName = spec.custom_name || STAGE_LABELS[spec.spec_type] || spec.spec_type;
            }
          }
        }
      } catch (e) {
        console.warn(`[syncEstimateSnapshot] Could not fetch build details: ${e.message}`);
      }
    }

    // Also check if estimate itself has a spec sheet linked (via spec_sheet_id on estimate, fallback)
    if (!specSheetName && estimate.spec_sheet_id) {
      try {
        const specs = await base44.entities.SpecSheet.filter({ id: estimate.spec_sheet_id });
        const spec = specs?.[0];
        if (spec) {
          if (!buildStage && spec.spec_type) buildStage = spec.spec_type;
          specSheetName = spec.custom_name || STAGE_LABELS[spec.spec_type] || spec.spec_type;
        }
      } catch (e) {
        console.warn(`[syncEstimateSnapshot] Could not fetch estimate spec sheet: ${e.message}`);
      }
    }

    console.log(`[syncEstimateSnapshot] Engine data - Serial: ${engineSerial}, EED: ${eedEngineId}, Stage: ${buildStage}, Spec: ${specSheetName}`);

    // Build snapshot payload
    const snapshot = {
      public_access_token: publicAccessToken,
      estimate_number: estimate.estimate_number,
      customer_name: customer ? `${customer.first_name} ${customer.last_name}` : "",
      customer_email: customer?.email || "",
      status: estimate.status,
      issue_date: estimate.issue_date,
      expiry_date: estimate.expiry_date,
      line_items: estimate.line_items || [],
      labor_items: estimate.labor_items || [],
      machining_items: estimate.machining_items || [],
      machining_items: estimate.machining_items || [],
      subtotal: estimate.subtotal,
      tax_amount: estimate.tax_amount,
      tax_rate: estimate.tax_rate,
      total: estimate.total,
      amount_paid: estimate.amount_paid || 0,
      amount_due: estimate.amount_due || 0,
      deposit_required: estimate.deposit_required || false,
      deposit_amount: estimate.deposit_amount ?? null,
      deposit_paid: estimate.deposit_paid || false,
      notes: estimate.notes || "",
      stripe_checkout_url: estimate.stripe_checkout_url,
      company_name: appSettings.company_name,
      company_logo_url: appSettings.company_logo_url,
      company_phone: appSettings.company_phone,
      company_address: appSettings.company_address,
      // Engine fields - sent to viewer (no spec version)
      engine_serial_number: engineSerial || null,
      engine_platform: enginePlatform || null,
      eed_engine_id: eedEngineId || null,
      eed_id: eedEngineId || null,
      build_stage: buildStage ? (STAGE_LABELS[buildStage] || buildStage) : null,
      spec_sheet_name: specSheetName || null,
    };

    // Validate payload
    const hasPublicToken = !!snapshot.public_access_token;
    const hasEstimateNumber = !!snapshot.estimate_number;
    const hasTotal = snapshot.total !== undefined && snapshot.total !== null;
    console.log(`[syncEstimateSnapshot] Payload validation - public_access_token: ${hasPublicToken}, estimate_number: ${hasEstimateNumber}, total: ${hasTotal}`);

    // Get sync credentials
    const syncSecret = Deno.env.get("SYNC_SECRET");
    const syncApiKey = Deno.env.get("SYNC_API_KEY");
    const destinationUrl = "https://race-engine-specs.base44.app/api/functions/syncEstimateSnapshot";

    // Verify secrets exist
    console.log("SYNC_SECRET exists:", !!syncSecret);
    console.log("SYNC_API_KEY exists:", !!syncApiKey);
    console.log("Destination URL:", destinationUrl);

    if (!syncSecret || !syncApiKey) {
      console.error("Missing SYNC_SECRET or SYNC_API_KEY");
      return Response.json({ 
        error: "Missing SYNC_SECRET or SYNC_API_KEY"
      }, { status: 500 });
    }

    try {
      console.log("Starting fetch to:", destinationUrl);
      const response = await fetch(destinationUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${syncApiKey}`,
          "x-sync-secret": syncSecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(snapshot),
      });

      const responseBody = await response.text();
      
      console.log("Response status:", response.status);
      console.log("Response body:", responseBody);

      if (!response.ok) {
        console.error("SYNC ERROR STATUS:", response.status);
        console.error("SYNC ERROR BODY:", responseBody);
        
        return Response.json({ 
          error: `Public app sync failed - Status ${response.status}`,
          details: {
            destination_url: destinationUrl,
            response_status: response.status,
            response_body: responseBody,
          }
        }, { status: 500 });
      }

      // Build viewer app link
      const estimateViewerLink = `https://race-engine-specs.base44.app/estimate/${publicAccessToken}`;
      console.log("Snapshot synced successfully");
      console.log("Viewer link:", estimateViewerLink);
      
      return Response.json({ 
        success: true, 
        viewerLink: estimateViewerLink 
      });
    } catch (fetchError) {
      console.error("SYNC ERROR MESSAGE:", fetchError.message);
      console.error("SYNC ERROR TYPE:", fetchError.constructor?.name);
      console.error("Full error:", fetchError);
      throw fetchError;
    }
  } catch (error) {
    console.error("CAUGHT ERROR MESSAGE:", error.message);
    console.error("CAUGHT ERROR TYPE:", error.constructor?.name);
    return Response.json({ 
      error: `Snapshot sync error: ${error.message}`
    }, { status: 500 });
  }
});