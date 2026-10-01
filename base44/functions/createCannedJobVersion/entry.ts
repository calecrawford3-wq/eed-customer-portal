import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * Creates a new version of a canned job package.
 * The existing version is preserved (marked is_latest=false), and a new CannedJob record
 * is created with the updated content, linked via version_group_id.
 *
 * Input: { canned_job_id, version_notes, line_items, labor_items, machining_items, name, description }
 * Returns: the new version record
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json();
    const { canned_job_id, version_notes, line_items, labor_items, machining_items, name, description } = body;

    if (!canned_job_id) return Response.json({ error: 'canned_job_id is required' }, { status: 400 });

    // Load the existing version
    const existingRes = await base44.entities.CannedJob.filter({ id: canned_job_id });
    const existing = (existingRes.items || existingRes)[0];
    if (!existing) return Response.json({ error: 'Canned job not found' }, { status: 404 });

    // Determine the version group
    const versionGroupId = existing.version_group_id || existing.id;

    // Mark all existing versions in this group as not latest
    const groupRes = await base44.entities.CannedJob.filter({ version_group_id: versionGroupId });
    const groupItems = groupRes.items || groupRes;
    const maxVersion = groupItems.reduce((max, j) => Math.max(max, j.version || 1), 0);

    for (const item of groupItems) {
      if (item.is_latest) {
        await base44.entities.CannedJob.update(item.id, { is_latest: false });
      }
    }

    // Also mark the original (if it had no version_group_id) as not latest
    if (!existing.version_group_id && existing.is_latest) {
      await base44.entities.CannedJob.update(existing.id, { is_latest: false, version_group_id: versionGroupId });
    }

    // Create the new version
    const newVersion = await base44.entities.CannedJob.create({
      name: name || existing.name,
      description: description !== undefined ? description : existing.description,
      line_items: line_items || existing.line_items || [],
      labor_items: labor_items || existing.labor_items || [],
      machining_items: machining_items || existing.machining_items || [],
      status: 'active',
      notes: existing.notes || '',
      version: maxVersion + 1,
      version_group_id: versionGroupId,
      is_latest: true,
      version_notes: version_notes || '',
      parent_version_id: existing.id,
    });

    return Response.json({ success: true, new_version: newVersion });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}