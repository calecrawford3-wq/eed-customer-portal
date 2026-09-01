import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json();
    const { stages } = body as { stages: Array<{ estimate_id: string; stage_label: string; sort_order: number }> };

    if (!stages || !Array.isArray(stages) || stages.length < 2) {
      return Response.json({ error: 'At least 2 stages are required' }, { status: 400 });
    }

    // Fetch all estimates
    const estimateIds = stages.map(s => s.estimate_id);
    const estimates: any[] = [];
    for (const eid of estimateIds) {
      const found = await base44.asServiceRole.entities.Estimate.filter({ id: eid });
      if (!found || found.length === 0) {
        return Response.json({ error: `Estimate ${eid} not found` }, { status: 404 });
      }
      estimates.push(found[0]);
    }

    // Validate same customer
    const customerId = estimates[0].customer_id;
    if (!estimates.every(e => e.customer_id === customerId)) {
      return Response.json({ error: 'All estimates must belong to the same customer' }, { status: 400 });
    }

    // Generate shared group id + public token
    const groupId = `cmp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const publicToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    // Build stage data for AI summary
    const stageData = stages.map(s => {
      const est = estimates.find(e => e.id === s.estimate_id);
      return {
        label: s.stage_label || `Stage ${s.sort_order}`,
        line_items: (est.line_items || []).map((li: any) => ({ item_name: li.item_name, quantity: li.quantity })),
        labor_items: (est.labor_items || []).map((li: any) => ({ name: li.name })),
        machining_items: (est.machining_items || []).map((mi: any) => ({ name: mi.name })),
        total: est.total || 0,
      };
    });

    // Generate AI summary
    let aiSummary = '';
    try {
      const prompt = `You are helping a race engine shop explain build stage options to a customer in plain, friendly English.
Below are ${stageData.length} engine build stages. For each stage, here is what it includes (parts, labor, machining) and the total price.

${JSON.stringify(stageData, null, 2)}

Write a concise comparison summary (max ~250 words) that:
1. Briefly explains what each stage includes and its key benefit.
2. Highlights the main differences between consecutive stages (what you get by moving up).
3. Notes any trade-offs (e.g. higher cost, more frequent maintenance, reduced reliability).
Keep it customer-facing — no part numbers, no internal jargon beyond common engine terms. Use short paragraphs or bullet points.`;
      const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: { type: 'object', properties: { summary: { type: 'string' } } },
      });
      aiSummary = (llmRes as any)?.summary || (typeof llmRes === 'string' ? llmRes : '');
    } catch (e) {
      console.warn('AI summary generation failed:', e.message);
    }

    // Update each estimate and sync its snapshot to the public app
    const syncResults: Array<{ estimate_id: string; ok: boolean; error?: string }> = [];
    for (const s of stages) {
      const est = estimates.find(e => e.id === s.estimate_id);
      const update: any = {
        comparison_group_id: groupId,
        comparison_stage_label: s.stage_label || `Stage ${s.sort_order}`,
        comparison_sort_order: s.sort_order,
        comparison_public_token: publicToken,
        comparison_ai_summary: aiSummary,
        comparison_choice: 'none',
        comparison_interest: false,
        status: 'sent',
      };
      // Ensure each estimate has its own public_access_token for individual viewing
      let stageToken = est.public_access_token;
      if (!stageToken) {
        stageToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        update.public_access_token = stageToken;
      }
      await base44.asServiceRole.entities.Estimate.update(s.estimate_id, update);

      // Sync this stage's snapshot to the public app so /estimate/:token resolves after the customer picks a stage
      try {
        await base44.functions.invoke('syncEstimateSnapshot', {
          estimateId: s.estimate_id,
          publicAccessToken: stageToken,
        });
        syncResults.push({ estimate_id: s.estimate_id, ok: true });
      } catch (e) {
        console.warn(`[createComparisonGroup] syncEstimateSnapshot failed for ${s.estimate_id}:`, e.message);
        syncResults.push({ estimate_id: s.estimate_id, ok: false, error: e.message });
      }
    }

    return Response.json({
      success: true,
      comparison_group_id: groupId,
      comparison_public_token: publicToken,
      ai_summary: aiSummary,
      sync_results: syncResults,
    });
  } catch (error) {
    console.error('Error creating comparison group:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}