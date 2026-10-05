import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { serializePhotos, publicFinding, publicAdditionalWork } from '../../shared/findingPhotos.ts';

// Authenticated customer portal: returns the logged-in customer's findings
// (customer-safe fields only) with SHARED photos + signed URLs, plus any
// additional-work approvals for those findings. Access is enforced on the
// backend: only the customer's own findings are returned, and only
// share_with_customer photos get signed URLs.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Resolve the customer by email (non-admin) or allow admin to pass a customer_id
    let customerId = '';
    if (user.role === 'admin') {
      const body = await req.json().catch(() => ({}));
      customerId = body?.customer_id || '';
    }
    if (!customerId) {
      const custRes = await base44.asServiceRole.entities.Customer.filter({ email: user.email });
      const cust = (custRes.items || custRes || [])[0];
      if (!cust) return Response.json({ error: 'No customer account' }, { status: 403 });
      customerId = cust.id;
    }

    // Customer's jobs (findings always carry job_id, so this is the most reliable link)
    const customerJobRes = await base44.asServiceRole.entities.Job.filter(
      { customer_id: customerId },
      { limit: 500, fields: ['id', 'customer_engine_id', 'estimate_id', 'invoice_ids'] }
    );
    const customerJobs = (customerJobRes.items || customerJobRes || []);
    const customerJobIds = customerJobs.map((j: any) => j.id);
    if (customerJobIds.length === 0) return Response.json({ findings: [], approvals: [], engines: [], estimates: [], invoices: [] });

    // Build job lookup for engine/estimate/invoice context
    const jobMap: Record<string, any> = {};
    for (const j of customerJobs) jobMap[j.id] = j;

    // Fetch engines, estimates, invoices for grouping context
    const engineIds = [...new Set(customerJobs.map((j: any) => j.customer_engine_id).filter(Boolean))];
    const estimateIds = [...new Set(customerJobs.map((j: any) => j.estimate_id).filter(Boolean))];
    const invoiceIds = [...new Set(customerJobs.flatMap((j: any) => j.invoice_ids || []).filter(Boolean))];

    let engines: any[] = [];
    let estimates: any[] = [];
    let invoices: any[] = [];

    if (engineIds.length > 0) {
      const eRes = await base44.asServiceRole.entities.CustomerEngine.filter(
        { id: { $in: engineIds } },
        { limit: 500, fields: ['id', 'eed_id', 'engine_serial_number', 'platform_id'] }
      );
      engines = (eRes.items || eRes || []).map((e: any) => ({
        id: e.id, eed_id: e.eed_id || '', engine_serial_number: e.engine_serial_number || '', platform_id: e.platform_id || '',
      }));
    }
    if (estimateIds.length > 0) {
      const estRes = await base44.asServiceRole.entities.Estimate.filter(
        { id: { $in: estimateIds } },
        { limit: 500, fields: ['id', 'estimate_number', 'issue_date'] }
      );
      estimates = (estRes.items || estRes || []).map((e: any) => ({
        id: e.id, estimate_number: e.estimate_number || '', issue_date: e.issue_date || '',
      }));
    }
    if (invoiceIds.length > 0) {
      const invRes = await base44.asServiceRole.entities.Invoice.filter(
        { id: { $in: invoiceIds } },
        { limit: 500, fields: ['id', 'invoice_number', 'issue_date'] }
      );
      invoices = (invRes.items || invRes || []).map((i: any) => ({
        id: i.id, invoice_number: i.invoice_number || '', issue_date: i.issue_date || '',
      }));
    }

    // Findings for those jobs
    const fRes = await base44.asServiceRole.entities.TeardownFinding.filter(
      { job_id: { $in: customerJobIds } },
      { limit: 500 }
    );
    const findings = (fRes.items || fRes || []).filter((f: any) => f.status !== 'canceled' && f.status !== 'declined');
    const findingIds = findings.map((f: any) => f.id);

    // Shared photos for those findings
    let photosByFinding: Record<string, any[]> = {};
    if (findingIds.length > 0) {
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

    // Approvals for the jobs of these findings
    const jobIds = [...new Set(findings.map((f: any) => f.job_id).filter(Boolean))];
    let approvals: any[] = [];
    if (jobIds.length > 0) {
      const awRes = await base44.asServiceRole.entities.AdditionalWork.filter(
        { job_id: { $in: jobIds } },
        { limit: 200 }
      );
      approvals = (awRes.items || awRes || []).map((aw: any) => publicAdditionalWork(aw));
    }

    const findingsOut = findings.map((f: any) => ({
      ...publicFinding(f),
      job_id: f.job_id || '',
      photos: photosByFinding[f.id] || [],
    }));

    // Return job context so the portal can group findings by engine → estimate/invoice
    const jobsOut = customerJobs.map((j: any) => ({
      id: j.id,
      customer_engine_id: j.customer_engine_id || '',
      estimate_id: j.estimate_id || '',
      invoice_ids: j.invoice_ids || [],
    }));

    return Response.json({ findings: findingsOut, approvals, engines, estimates, invoices, jobs: jobsOut });
  } catch (error) {
    console.error('[getPortalFindings] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}