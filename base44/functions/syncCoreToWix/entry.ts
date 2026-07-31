import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Sync a single EngineCore to the Wix Stores catalog (used parts section).
//
// Called when a core's `list_online` toggle changes, or manually from the
// inventory/core manager. Also usable from an entity automation.
//
// Payload:
//   core_id: string   — the EngineCore record to sync
//
// Logic:
//   list_online = true  + no wix_product_id  → CREATE product on Wix
//   list_online = true  + has wix_product_id → UPDATE product on Wix
//   list_online = false + has wix_product_id → DELETE product from Wix
//   list_online = false + no wix_product_id  → noop
//
// Uses Wix Stores Catalog V1 API (this site is on V1, not V3).

const WIX_API = "https://www.wixapis.com/stores/v1/products";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Auth — admin only
    let actor = "system";
    try {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      actor = user.email || user.full_name || "admin";
    } catch (_) {
      // Allow service-role calls (from automations)
    }

    const body = await req.json().catch(() => ({}));

    // ── Handle entity automation payload ────────────────────────────────
    let coreId = "";
    if (body.event && body.event.entity_id && body.event.entity_name === "EngineCore") {
      coreId = body.event.entity_id;
    } else {
      coreId = String(body.core_id || "");
    }

    if (!coreId) {
      return Response.json({ error: "core_id is required" }, { status: 400 });
    }

    // Load the core
    const core = await base44.asServiceRole.entities.EngineCore.get(coreId);
    if (!core) {
      return Response.json({ error: "Core not found" }, { status: 404 });
    }

    // Get Wix access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("wix");

    const listOnline = !!core.list_online;
    const wixProductId = core.wix_product_id || "";

    // ── DELIST: toggle off → remove from Wix ────────────────────────────
    if (!listOnline) {
      if (!wixProductId) {
        // Already not listed
        await updateCoreSyncFields(base44, coreId, {
          wix_listing_status: "not_listed",
          wix_sync_error: "",
        });
        return Response.json({ action: "noop", reason: "Core not listed online" });
      }

      try {
        const delRes = await fetch(`${WIX_API}/${wixProductId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });
        if (!delRes.ok && delRes.status !== 404) {
          const errText = await delRes.text();
          throw new Error(`Wix delete failed (${delRes.status}): ${errText}`);
        }
        await updateCoreSyncFields(base44, coreId, {
          wix_product_id: "",
          wix_listing_status: "removed",
          wix_listed_at: null,
          wix_sync_error: "",
        });
        return Response.json({ action: "removed", wix_product_id: wixProductId });
      } catch (e: any) {
        const errMsg = String(e?.message || e);
        await updateCoreSyncFields(base44, coreId, {
          wix_listing_status: "error",
          wix_sync_error: errMsg,
        });
        return Response.json({ action: "failed", error: errMsg }, { status: 500 });
      }
    }

    // ── LIST: toggle on → create or update on Wix ───────────────────────
    const title = (core.online_title || core.name || "").trim();
    const description = (core.online_description || core.description || "").trim();
    const price = core.online_price != null ? core.online_price : core.sell_price;
    const sku = core.core_number || "";

    if (!title) {
      return Response.json({ error: "Core needs a name or online_title to list" }, { status: 400 });
    }
    if (price == null || price <= 0) {
      return Response.json({ error: "Core needs a sell_price or online_price to list" }, { status: 400 });
    }

    // Mark as pending while we sync
    await updateCoreSyncFields(base44, coreId, {
      wix_listing_status: "pending",
      wix_sync_error: "",
    });

    try {
      // V1 product payload (simple — no variants needed for a single-SKU core)
      const productData: any = {
        name: title,
        productType: "physical",
        description: description || undefined,
        sku: sku || undefined,
        visible: true,
        priceData: {
          price: Number(Number(price).toFixed(2)),
        },
      };

      if (!wixProductId) {
        // ── CREATE new product ──────────────────────────────────────────
        const createRes = await fetch(WIX_API, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ product: productData }),
        });

        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Wix create failed (${createRes.status}): ${errText}`);
        }

        const createData = await createRes.json();
        const newProductId = createData?.product?.id;
        if (!newProductId) {
          throw new Error("Wix did not return a product ID");
        }

        await updateCoreSyncFields(base44, coreId, {
          wix_product_id: newProductId,
          wix_listing_status: "listed",
          wix_listed_at: new Date().toISOString(),
          wix_sync_error: "",
        });

        return Response.json({
          action: "created",
          wix_product_id: newProductId,
          title,
          price: Number(price).toFixed(2),
        });
      } else {
        // ── UPDATE existing product (V1 PATCH — no revision needed) ─────
        const updateRes = await fetch(`${WIX_API}/${wixProductId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ product: productData }),
        });

        if (!updateRes.ok) {
          // If 404, the product was deleted on Wix side — recreate
          if (updateRes.status === 404) {
            await updateCoreSyncFields(base44, coreId, { wix_product_id: "" });
            const createRes = await fetch(WIX_API, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ product: productData }),
            });
            if (!createRes.ok) {
              const errText = await createRes.text();
              throw new Error(`Wix recreate failed (${createRes.status}): ${errText}`);
            }
            const createData = await createRes.json();
            const newProductId = createData?.product?.id;
            if (!newProductId) throw new Error("Wix did not return a product ID on recreate");

            await updateCoreSyncFields(base44, coreId, {
              wix_product_id: newProductId,
              wix_listing_status: "listed",
              wix_listed_at: new Date().toISOString(),
              wix_sync_error: "",
            });
            return Response.json({ action: "recreated", wix_product_id: newProductId, title });
          }

          const errText = await updateRes.text();
          throw new Error(`Wix update failed (${updateRes.status}): ${errText}`);
        }

        await updateCoreSyncFields(base44, coreId, {
          wix_listing_status: "listed",
          wix_listed_at: new Date().toISOString(),
          wix_sync_error: "",
        });

        return Response.json({
          action: "updated",
          wix_product_id: wixProductId,
          title,
          price: Number(price).toFixed(2),
        });
      }
    } catch (e: any) {
      const errMsg = String(e?.message || e);
      await updateCoreSyncFields(base44, coreId, {
        wix_listing_status: "error",
        wix_sync_error: errMsg,
      });
      return Response.json({ action: "failed", error: errMsg }, { status: 500 });
    }
  } catch (e) {
    console.error("syncCoreToWix error:", e?.message || e);
    return Response.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

async function updateCoreSyncFields(base44: any, coreId: string, fields: Record<string, any>) {
  try {
    await base44.asServiceRole.entities.EngineCore.update(coreId, fields);
  } catch (_) {}
}