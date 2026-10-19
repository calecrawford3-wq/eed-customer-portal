import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Returns customer-safe Build Book data (tasks, findings, replacements, job) for a
// given build, after verifying the calling user owns that build. Customers never
// read BuildTask / TeardownFinding / ComponentReplacement directly — those are
// admin-only under RLS — so the portal fetches them through this function.
// Admins may preview any build (portal admin preview mode).

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { build_id } = body || {};
    if (!build_id) return Response.json({ error: 'build_id required' }, { status: 400 });

    // Load the build and verify ownership (admins preview any customer).
    const build = await base44.asServiceRole.entities.EngineBuild.get(build_id).catch(() => null);
    if (!build) return Response.json({ error: 'Build not found' }, { status: 404 });

    if (user.role !== 'admin') {
      const cid = user.data?.customer_id;
      if (!cid || build.customer_id !== cid) {
        return Response.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Job for this build (customer-safe: stage + identifiers only).
    const jobPage = await base44.asServiceRole.entities.Job.filter({ build_id }, { limit: 5 });
    const job = (jobPage.items || jobPage || [])[0] || null;
    const jobSafe = job
      ? {
          id: job.id,
          job_number: job.job_number,
          stage: job.stage,
          is_active: job.is_active,
          service_package: job.service_package,
          platform_id: job.platform_id,
        }
      : null;

    // Build tasks (customer-safe: name, stage, status, order — no measurements/photos/notes).
    const taskPage = await base44.asServiceRole.entities.BuildTask.filter(
      { build_id },
      { sort: 'sort_order', limit: 500 }
    );
    const tasks = (taskPage.items || taskPage || []).map((t) => ({
      id: t.id,
      name: t.name,
      stage: t.stage,
      status: t.status,
      sort_order: t.sort_order,
      is_required: t.is_required,
      completed_at: t.completed_at,
    }));

    // Teardown findings (customer-safe: strip private measurements/notes/part ids).
    let findings = [];
    if (job?.id) {
      const fPage = await base44.asServiceRole.entities.TeardownFinding.filter(
        { job_id: job.id },
        { limit: 200 }
      );
      findings = (fPage.items || fPage || []).map((f) => ({
        id: f.id,
        component: f.component,
        condition: f.condition,
        customer_description: f.customer_description,
        recommended_action: f.recommended_action,
        status: f.status,
        photos: f.photos || [],
      }));
    }

    // Component replacements (customer-safe: component + when + notes, no internal ids).
    const rPage = await base44.asServiceRole.entities.ComponentReplacement.filter(
      { build_id },
      { limit: 100 }
    );
    const replacements = (rPage.items || rPage || []).map((r) => ({
      id: r.id,
      component: r.component,
      replaced_at: r.replaced_at,
    }));

    return Response.json({ job: jobSafe, tasks, findings, replacements });
  } catch (error) {
    console.error('[getPortalBuildBook] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}