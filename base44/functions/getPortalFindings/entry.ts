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
    const customerJobRes = await base44.asServiceRole.entities.Job.filter({ customer_id: customerId }, { limit: 500, fields: ['id'] });
    const customerJobIds = (customerJobRes.items || customerJobRes || []).map((j: any) => j.id);
    if (customerJobIds.length === 0) return Response.json({ findings: [], approvals: [] });

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

    return Response.json({ findings: findingsOut, approvals });
  } catch (error) {
    console.error('[getPortalFindings] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}