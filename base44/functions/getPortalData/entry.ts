import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  allowlistCustomer, allowlistCustomerSummary, allowlistEstimate, allowlistInvoice,
  allowlistBuild, allowlistEngine, allowlistCredit, allowlistLegalDoc,
  allowlistDynoSheet, allowlistRefreshRequest, allowlistPlatform, allowlistSpecSheet,
} from "../../shared/portalAllowlists.ts";

/**
 * Returns all customer-safe portal data for the authenticated user.
 *
 * - Customer (non-admin): returns their own data, anchored on user.data.customer_id.
 *   Unlinked users (no customer_id) get { not_linked: true } and no records.
 * - Admin without customer_id: returns a list of active customers for the picker.
 * - Admin with customer_id: returns that customer's full portal data.
 *
 * All records are allowlisted to exclude internal costs, margins, private notes,
 * credentials, and approval/payment tokens. Direct SDK reads are blocked by
 * admin-only RLS on the source entities, so this function is the only path.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const isAdmin = user.role === "admin";

    // ── Admin picker mode: return customer list ──
    if (isAdmin && !body.customer_id) {
      const custRes = await base44.asServiceRole.entities.Customer.filter(
        { status: "active" },
        { sort: "last_name", limit: 500, fields: ["first_name", "last_name", "company_name", "email", "status"] }
      );
      const customers = (custRes.items || custRes || []).map(allowlistCustomerSummary);
      return Response.json({ customers, data: null });
    }

    // ── Determine target customer ──
    let targetCustomerId: string | null = null;
    let customerRecord: any = null;

    if (isAdmin) {
      targetCustomerId = body.customer_id;
    } else {
      targetCustomerId = user.data?.customer_id || null;
    }

    if (!targetCustomerId) {
      return Response.json({ not_linked: true, data: null });
    }

    // Fetch customer record
    const custRes = await base44.asServiceRole.entities.Customer.filter(
      { id: targetCustomerId },
      { limit: 1 }
    );
    customerRecord = (custRes.items || custRes || [])[0] || null;
    if (!customerRecord) {
      return Response.json({ not_linked: true, data: null });
    }

    // Fetch all portal data in parallel
    const [
      estimatesRes, invoicesRes, buildsRes, enginesRes,
      creditsRes, legalDocsRes, dynoSheetsRes, refreshRes,
      platformsRes, specSheetsRes,
    ] = await Promise.all([
      base44.asServiceRole.entities.Estimate.filter(
        { customer_id: targetCustomerId, archived: { $ne: true } },
        { sort: "-created_date", limit: 500 }
      ),
      base44.asServiceRole.entities.Invoice.filter(
        { customer_id: targetCustomerId },
        { sort: "-created_date", limit: 500 }
      ),
      base44.asServiceRole.entities.EngineBuild.filter(
        { customer_id: targetCustomerId },
        { sort: "-created_date", limit: 500 }
      ),
      base44.asServiceRole.entities.CustomerEngine.filter(
        { customer_id: targetCustomerId },
        { sort: "-created_date", limit: 500 }
      ),
      base44.asServiceRole.entities.AccountCredit.filter(
        { customer_id: targetCustomerId },
        { sort: "-created_date", limit: 500 }
      ),
      base44.asServiceRole.entities.LegalDocument.filter(
        { customer_id: targetCustomerId },
        { sort: "-created_date", limit: 500 }
      ),
      base44.asServiceRole.entities.DynoSheet.filter(
        { customer_id: targetCustomerId, is_current: true },
        { sort: "-created_date", limit: 200 }
      ),
      base44.asServiceRole.entities.RefreshRequest.filter(
        { customer_id: targetCustomerId },
        { sort: "-created_date", limit: 500 }
      ),
      base44.asServiceRole.entities.EnginePlatform.list(
        "-created_date", 100
      ),
      base44.asServiceRole.entities.SpecSheet.list(
        "-created_date", 100
      ),
    ]);

    const items = (r: any) => r.items || r || [];

    return Response.json({
      data: {
        customer: allowlistCustomer(customerRecord),
        estimates: items(estimatesRes).map(allowlistEstimate),
        invoices: items(invoicesRes).map(allowlistInvoice),
        builds: items(buildsRes).map(allowlistBuild),
        engines: items(enginesRes).map(allowlistEngine),
        credits: items(creditsRes).map(allowlistCredit),
        legalDocs: items(legalDocsRes).map(allowlistLegalDoc),
        dynoSheets: items(dynoSheetsRes).map(allowlistDynoSheet),
        refreshRequests: items(refreshRes).map(allowlistRefreshRequest),
        platforms: items(platformsRes).map(allowlistPlatform),
        specSheets: items(specSheetsRes).map(allowlistSpecSheet),
      },
    });
  } catch (error) {
    console.error("[getPortalData] error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}