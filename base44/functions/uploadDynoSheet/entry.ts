import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { build_id, spec_sheet_id, file_url, filename, file_type, notes } = await req.json().catch(() => ({}));
    if (!file_url) return Response.json({ error: 'Missing file_url' }, { status: 400 });
    if (!build_id && !spec_sheet_id) return Response.json({ error: 'Missing build_id or spec_sheet_id' }, { status: 400 });

    const role = user.role === 'admin' ? 'admin' : 'customer';
    const uploadedBy = role === 'admin'
      ? (user.full_name || user.email || 'Admin')
      : (user.full_name || user.email || 'Customer');

    let sheetFields = {
      file_url,
      filename: filename || '',
      file_type: file_type || 'image',
      uploaded_by: uploadedBy,
      uploaded_by_role: role,
      is_current: true,
      notes: notes || '',
    };

    if (spec_sheet_id) {
      const sheets = await base44.asServiceRole.entities.SpecSheet.filter({ id: spec_sheet_id });
      const spec = sheets?.[0];
      if (!spec) return Response.json({ error: 'Spec sheet not found' }, { status: 404 });
      // Unmark previously-current dyno sheets for this spec sheet
      try {
        await base44.asServiceRole.entities.DynoSheet.updateMany(
          { spec_sheet_id, is_current: true },
          { $set: { is_current: false } }
        );
      } catch (_) {}
      sheetFields = {
        ...sheetFields,
        build_id: '',
        spec_sheet_id,
        customer_engine_id: '',
        customer_id: '',
        engine_serial_number: '',
        eed_id: '',
      };
    } else {
      const builds = await base44.asServiceRole.entities.EngineBuild.filter({ id: build_id });
      const build = builds?.[0];
      if (!build) return Response.json({ error: 'Build not found' }, { status: 404 });
      try {
        await base44.asServiceRole.entities.DynoSheet.updateMany(
          { build_id, is_current: true },
          { $set: { is_current: false } }
        );
      } catch (_) {}
      sheetFields = {
        ...sheetFields,
        build_id,
        spec_sheet_id: '',
        customer_engine_id: build.customer_engine_id || '',
        customer_id: build.customer_id || '',
        engine_serial_number: build.engine_serial_number || '',
        eed_id: build.eed_id || '',
      };
    }

    const created = await base44.asServiceRole.entities.DynoSheet.create(sheetFields);
    return Response.json({ ok: true, sheet: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}