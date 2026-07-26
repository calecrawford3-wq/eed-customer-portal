import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getZohoMailAccessToken, downloadAttachment } from '../../shared/zohoMail.ts';

/**
 * Proxies an authenticated Zoho Mail attachment download for the frontend.
 * Admin-only. Returns { data: base64, content_type } so the client can build
 * a Blob and trigger a download (functions.invoke returns JSON, not a stream).
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { account_id, folder_id, message_id, attachment_id } = body || {};
    if (!account_id || !folder_id || !message_id || !attachment_id) {
      return Response.json({ error: 'Missing account_id/folder_id/message_id/attachment_id' }, { status: 400 });
    }

    const token = await getZohoMailAccessToken(base44);
    const resp = await downloadAttachment(token, account_id, folder_id, message_id, attachment_id);
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);

    // base64-encode in chunks to avoid call-stack overflow on large files
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const data = btoa(binary);
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';

    return Response.json({ data, content_type: contentType });
  } catch (error) {
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}