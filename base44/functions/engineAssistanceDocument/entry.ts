import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Admin-only signed access to private assistance documents. Files are stored
// with UploadPrivateFile, so a short-lived signed URL is the only way to read
// them and only a signed-in admin can mint one.

export default async function (req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin access is required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const fileUri = typeof body.file_uri === 'string' ? body.file_uri.trim() : '';
    if (!fileUri || fileUri.length > 1000 || /^https?:/i.test(fileUri)) {
      return Response.json({ error: 'A private file reference is required' }, { status: 400 });
    }
    const expiresIn = Math.min(900, Math.max(60, Number(body.expires_in) || 300));
    const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: expiresIn });
    return Response.json({ signed_url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    console.error('[engineAssistanceDocument]', error?.message);
    return Response.json({ error: 'The document could not be opened.' }, { status: 500 });
  }
}