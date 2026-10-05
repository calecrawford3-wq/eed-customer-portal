import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { serializeAdditionalWorkWithPhotos } from '../../shared/findingPhotos.ts';

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

    const approval = await serializeAdditionalWorkWithPhotos(base44, aw);
    return Response.json({
      approval,
      findings: approval.findings,
    });
  } catch (error) {
    console.error('[getPublicAdditionalWork] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}