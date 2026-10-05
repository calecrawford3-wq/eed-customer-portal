import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { serializePhotos, publicFinding, publicAdditionalWork } from '../../shared/findingPhotos.ts';

// Public (token-based) additional-work approval viewer. Returns the approval,
// its findings (customer-safe fields), and SHARED photos with signed URLs.
// No account required — the public_access_token authorizes the request.
// Non-shared photos are never returned, so private/internal photos stay private.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { publicAccessToken } = body;
    if (!publicAccessToken) return Response.json({ error: 'publicAccessToken is required' }, { status: 400 });

    const awRes = await base44.asServiceRole.entities.AdditionalWork.filter({ public_access_token: publicAccessToken });
    const aw = (awRes.items || awRes || [])[0];
    if (!aw) return Response.json({ error: 'Approval not found' }, { status: 404 });

    // Findings
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

    return Response.json({
      approval: publicAdditionalWork(aw),
      findings: findingsOut,
    });
  } catch (error) {
    console.error('[getPublicAdditionalWork] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}