import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { serializePhotos } from '../../shared/findingPhotos.ts';

// Admin-only: returns ALL photos (shared + internal) for the given findings,
// with signed URLs. Used by the finding editor and card in the admin app.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { finding_ids } = body;
    const ids = Array.isArray(finding_ids) ? finding_ids.filter(Boolean) : [];
    if (ids.length === 0) return Response.json({ photos: [] });

    const res = await base44.asServiceRole.entities.FindingPhoto.filter(
      { finding_id: { $in: ids } },
      { limit: 500 }
    );
    const photos = res.items || res || [];
    const serialized = await serializePhotos(base44, photos, { shareOnly: false });

    return Response.json({ photos: serialized });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}