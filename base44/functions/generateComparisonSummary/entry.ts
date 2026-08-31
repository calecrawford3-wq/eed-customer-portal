import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json();
    const { comparison_group_id } = body as { comparison_group_id: string };

    if (!comparison_group_id) {
      return Response.json({ error: 'comparison_group_id is required' }, { status: 400 });
    }

    const estimates = await base44.asServiceRole.entities.Estimate.filter({ comparison_group_id });
    if (!estimates || estimates.length === 0) {
      return Response.json({ error: 'Comparison group not found' }, { status: 404 });
    }

    const sorted = estimates.sort((a, b) => (a.comparison_sort_order || 0) - (b.comparison_sort_order || 0));

    const stageData = sorted.map(est => ({
      label: est.comparison_stage_label || `Stage ${est.comparison_sort_order}`,
      line_items: (est.line_items || []).map((li: any) => ({ item_name: li.item_name, quantity: li.quantity })),
      labor_items: (est.labor_items || []).map((li: any) => ({ name: li.name })),
      machining_items: (est.machining_items || []).map((mi: any) => ({ name: mi.name })),
      total: est.total || 0,
    }));

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
      return Response.json({ error: 'AI summary generation failed: ' + e.message }, { status: 500 });
    }

    // Store on every estimate in the group
    for (const est of sorted) {
      await base44.asServiceRole.entities.Estimate.update(est.id, { comparison_ai_summary: aiSummary });
    }

    return Response.json({ success: true, ai_summary: aiSummary });
  } catch (error) {
    console.error('Error generating comparison summary:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}