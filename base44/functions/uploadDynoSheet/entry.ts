import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { build_id, file_url, filename, file_type, notes } = await req.json().catch(() => ({}));
    if (!build_id || !file_url) return Response.json({ error: 'Missing build_id/file_url' }, { status: 400 });

    const role = user.role === 'admin' ? 'admin' : 'customer';
    const uploadedBy = role === 'admin'
      ? (user.full_name || user.email || 'Admin')
      : (user.full_name || user.email || 'Customer');

    const builds = await base44.asServiceRole.entities.EngineBuild.filter({ id: build_id });
    const build = builds?.[0];
    if (!build) return Response.json({ error: 'Build not found' }, { status: 404 });

    // Unmark any previously-current sheets for this build (kept for history, not deleted)
    try {
      await base44.asServiceRole.entities.DynoSheet.updateMany(
        { build_id, is_current: true },
        { $set: { is_current: false } }
      );
    } catch (_) {}

    const created = await base44.asServiceRole.entities.DynoSheet.create({
      build_id,
      customer_engine_id: build.customer_engine_id || '',
      customer_id: build.customer_id || '',
      engine_serial_number: build.engine_serial_number || '',
      eed_id: build.eed_id || '',
      file_url,
      filename: filename || '',
      file_type: file_type || 'image',
      uploaded_by: uploadedBy,
      uploaded_by_role: role,
      is_current: true,
      notes: notes || '',
    });

    return Response.json({ ok: true, sheet: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}