import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { comparison_public_token, interested_estimate_ids, note } = body as {
      comparison_public_token: string;
      interested_estimate_ids: string[];
      note?: string;
    };

    if (!comparison_public_token) {
      return Response.json({ error: 'comparison_public_token is required' }, { status: 400 });
    }
    if (!interested_estimate_ids || !Array.isArray(interested_estimate_ids) || interested_estimate_ids.length === 0) {
      return Response.json({ error: 'Select at least one stage to express interest in' }, { status: 400 });
    }

    const estimates = await base44.asServiceRole.entities.Estimate.filter({ comparison_public_token });
    if (!estimates || estimates.length === 0) {
      return Response.json({ error: 'Comparison not found' }, { status: 404 });
    }

    // Validate all are still in "sent" status
    const notSent = estimates.filter(e => e.status !== 'sent');
    if (notSent.length > 0) {
      return Response.json({ error: 'This comparison has already been acted on' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const interestedLabels: string[] = [];

    for (const est of estimates) {
      if (interested_estimate_ids.includes(est.id)) {
        await base44.asServiceRole.entities.Estimate.update(est.id, {
          comparison_interest: true,
          comparison_choice: 'interested',
          comparison_interest_at: now,
          comparison_interest_note: note || '',
        });
        interestedLabels.push(est.comparison_stage_label || est.estimate_number);
      } else {
        await base44.asServiceRole.entities.Estimate.update(est.id, {
          comparison_interest: false,
          comparison_choice: 'none',
          comparison_interest_note: '',
        });
      }
    }

    // Notify admin
    try {
      const first = estimates[0];
      await base44.asServiceRole.functions.invoke('sendAdminNotification', {
        title: 'Stage Comparison — Customer Interested',
        message: `Customer is interested in ${interestedLabels.join(' & ')} from comparison group ${first.comparison_group_id}.${note ? ` Note: ${note}` : ''} — follow up to discuss.`,
        type: 'estimate_accepted',
        link_url: `/EstimateDetail?id=${first.id}`,
      });
    } catch (e) {
      console.error('Notification failed:', e.message);
    }

    return Response.json({
      success: true,
      interested_labels: interestedLabels,
    });
  } catch (error) {
    console.error('Error expressing comparison interest:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}