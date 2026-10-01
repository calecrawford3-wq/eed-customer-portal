// Shared workflow template assignment logic.
// Used by handleBuildLifecycle (auto-assign on build create) and the frontend
// BuildWorkflow assign dialog (manual assign / change) so both share one code path.
//
// Matching priority (most specific → least specific):
//   1. platform_id + service_package both match
//   2. platform_id matches, template service_package is empty (any package)
//   3. template is_default === true (fallback)
// If no match, no template is applied (build keeps whatever tasks it has).

export async function findTemplateForBuild(base44, platformId, servicePackage) {
  const res = await base44.entities.WorkflowTemplate.filter({ status: "active" }, "name", 500);
  const templates = res?.items || res || [];
  if (templates.length === 0) return null;

  const active = templates.filter((t) => t.status !== "archived");

  // 1. Exact platform + package match
  let match = active.find(
    (t) => t.platform_id && t.platform_id === platformId && t.service_package && t.service_package === servicePackage
  );
  if (match) return match;

  // 2. Platform match, any package
  match = active.find(
    (t) => t.platform_id && t.platform_id === platformId && !t.service_package
  );
  if (match) return match;

  // 3. Default fallback
  match = active.find((t) => t.is_default);
  if (match) return match;

  return null;
}

// Apply a template to a build, preserving completed/skipped tasks and their history.
// Matching key: name + uid (uid defaults to "" so tasks without uid match by name alone,
// which prevents accidental duplicates while allowing intentional ones via distinct uids).
//
// Returns { added, updated, removed, preserved } counts.
export async function applyTemplateToBuild(base44, buildId, template) {
  if (!buildId || !template) throw new Error("Missing build or template");

  const existingRes = await base44.entities.BuildTask.filter({ build_id: buildId }, "sort_order", 500);
  const existingTasks = existingRes?.items || existingRes || [];

  const taskKey = (t) => `${t.name || ""}|||${t.uid || ""}`;
  const existingByKey = {};
  existingTasks.forEach((t) => { existingByKey[taskKey(t)] = t; });

  const templateKeys = new Set((template.items || []).map((i) => taskKey(i)));

  // Delete tasks no longer in the template — but only if they haven't been completed/skipped (preserve history)
  const toDelete = existingTasks.filter(
    (t) => !templateKeys.has(taskKey(t)) && !["complete", "skipped"].includes(t.status)
  );
  if (toDelete.length > 0) {
    await base44.entities.BuildTask.deleteMany({ id: { $in: toDelete.map((t) => t.id) } });
  }

  const toUpdate = [];
  const toCreate = [];
  (template.items || []).forEach((item, idx) => {
    const key = taskKey(item);
    const existing = existingByKey[key];
    const stage = item.stage || "Unstaged";
    if (existing) {
      // Update sort/stage/template refs + is_required, preserve status/history
      if (
        existing.sort_order !== idx ||
        existing.stage !== stage ||
        existing.template_id !== template.id ||
        existing.template_name !== template.name ||
        !!existing.is_required !== !!item.is_required
      ) {
        toUpdate.push({
          id: existing.id,
          sort_order: idx,
          stage,
          template_id: template.id,
          template_name: template.name,
          is_required: !!item.is_required,
        });
      }
    } else {
      toCreate.push({
        build_id: buildId,
        template_id: template.id,
        template_name: template.name,
        name: item.name,
        uid: item.uid || "",
        stage,
        sort_order: idx,
        status: "pending",
        is_required: !!item.is_required,
      });
    }
  });

  if (toUpdate.length > 0) await base44.entities.BuildTask.bulkUpdate(toUpdate);
  if (toCreate.length > 0) await base44.entities.BuildTask.bulkCreate(toCreate);

  return {
    added: toCreate.length,
    updated: toUpdate.length,
    removed: toDelete.length,
    preserved: existingTasks.filter((t) => ["complete", "skipped"].includes(t.status)).length,
  };
}

// Check whether a build has incomplete required tasks that should block completion.
// Returns { blocked, incomplete_required } where incomplete_required is a list of task names.
export async function checkRequiredTasks(base44, buildId) {
  const res = await base44.entities.BuildTask.filter({ build_id: buildId, is_required: true }, "sort_order", 500);
  const tasks = res?.items || res || [];
  const incomplete = tasks.filter(
    (t) => t.is_required && t.status !== "complete" && t.status !== "skipped" && !t.override_authorized_by
  );
  return {
    blocked: incomplete.length > 0,
    incomplete_required: incomplete.map((t) => ({ id: t.id, name: t.name, stage: t.stage })),
  };
}