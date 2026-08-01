import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { refreshPageTokenFromAppUser } from '../../shared/facebookPages.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));

    // Use explicitly provided page_id, or the one saved in settings
    let preferredPageId = body.page_id;
    if (!preferredPageId) {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
      preferredPageId = settings?.[0]?.facebook_page_id;
    }

    const result = await refreshPageTokenFromAppUser(base44, preferredPageId);

    return Response.json({
      success: true,
      pageId: result.pageId,
      pageName: result.pageName,
      pages: result.pages,
    });
  } catch (error) {
    const msg = error.message || String(error);
    if (msg === "FACEBOOK_NOT_CONNECTED") {
      return Response.json(
        { error: "Facebook is not connected. Click 'Connect Facebook' first.", notConnected: true },
        { status: 400 }
      );
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}