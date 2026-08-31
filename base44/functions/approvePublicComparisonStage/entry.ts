import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { comparison_public_token, chosen_estimate_id } = body as { comparison_public_token: string; chosen_estimate_id: string };

    if (!comparison_public_token || !chosen_estimate_id) {
      return Response.json({ error: 'comparison_public_token and chosen_estimate_id are required' }, { status: 400 });
    }

    const estimates = await base44.asServiceRole.entities.Estimate.filter({ comparison_public_token });
    if (!estimates || estimates.length === 0) {
      return Response.json({ error: 'Comparison not found' }, { status: 404 });
    }

    const chosen = estimates.find(e => e.id === chosen_estimate_id);
    if (!chosen) {
      return Response.json({ error: 'Chosen estimate is not part of this comparison' }, { status: 400 });
    }

    // Validate all are still in "sent" status
    const notSent = estimates.filter(e => e.status !== 'sent');
    if (notSent.length > 0) {
      return Response.json({ error: 'This comparison has already been acted on' }, { status: 400 });
    }

    // Approve the chosen, decline the rest
    for (const est of estimates) {
      if (est.id === chosen_estimate_id) {
        await base44.asServiceRole.entities.Estimate.update(est.id, {
          status: 'approved',
          comparison_choice: 'chosen',
        });
      } else {
        await base44.asServiceRole.entities.Estimate.update(est.id, {
          status: 'declined',
          comparison_choice: 'declined_by_choice',
        });
      }
    }

    // Notify admin
    try {
      await base44.asServiceRole.functions.invoke('sendAdminNotification', {
        title: 'Stage Comparison — Stage Chosen',
        message: `Customer approved ${chosen.comparison_stage_label || chosen.estimate_number} from comparison group ${chosen.comparison_group_id}.`,
        type: 'estimate_accepted',
        link_url: `/EstimateDetail?id=${chosen.id}`,
      });
    } catch (e) {
      console.error('Notification failed:', e.message);
    }

    return Response.json({
      success: true,
      chosen_estimate: { id: chosen.id, estimate_number: chosen.estimate_number, stage_label: chosen.comparison_stage_label },
    });
  } catch (error) {
    console.error('Error approving comparison stage:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}