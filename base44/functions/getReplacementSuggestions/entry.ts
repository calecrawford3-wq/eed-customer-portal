import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { computeRebuildCount, evaluateRules } from '../../shared/replacementHistory.ts';

// Returns replacement suggestions for an engine based on active rules and
// recorded replacement history. Admin-only.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { customer_engine_id, service_package } = body;
    if (!customer_engine_id) return Response.json({ error: 'customer_engine_id required' }, { status: 400 });

    const engRes = await base44.asServiceRole.entities.CustomerEngine.filter({ id: customer_engine_id });
    const engine = (engRes.items || engRes || [])[0];
    if (!engine) return Response.json({ error: 'Engine not found' }, { status: 404 });

    const rebuildCount = await computeRebuildCount(base44.asServiceRole, customer_engine_id);

    const ruleRes = await base44.asServiceRole.entities.ReplacementRule.filter({ status: 'active' });
    const allRules = ruleRes.items || ruleRes || [];
    const rules = allRules.filter(r =>
      (!r.platform_id || r.platform_id === engine.platform_id) &&
      (!r.service_package || r.service_package === '' || !service_package || r.service_package === service_package)
    );

    const repRes = await base44.asServiceRole.entities.ComponentReplacement.filter({ customer_engine_id });
    const replacements = repRes.items || repRes || [];

    const suggestions = evaluateRules(rules, replacements, rebuildCount);
    return Response.json({ rebuild_count: rebuildCount, platform_id: engine.platform_id, suggestions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}