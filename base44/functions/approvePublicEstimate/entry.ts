import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { publicAccessToken } = await req.json();

        if (!publicAccessToken) {
            return Response.json({ error: 'publicAccessToken is required' }, { status: 400 });
        }

        // Fetch estimate by token (service role—no user auth needed)
        const estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token: publicAccessToken });

        if (!estimates || estimates.length === 0) {
            return Response.json({ error: 'Estimate not found' }, { status: 404 });
        }

        const estimate = estimates[0];

        // Only allow approval if status is "sent"
        if (estimate.status !== "sent") {
            return Response.json({ error: `Estimate cannot be approved from status "${estimate.status}"` }, { status: 400 });
        }

        // Update status to approved only
        const updatedEstimate = await base44.asServiceRole.entities.Estimate.update(estimate.id, {
            status: "approved"
        });

        // Notify admin
        try {
            await base44.asServiceRole.functions.invoke("sendAdminNotification", {
                title: "Estimate Accepted",
                message: `Estimate ${estimate.estimate_number || estimate.id} was accepted by the customer via portal.`,
                type: "estimate_accepted",
                link_url: `/EstimateDetail?id=${estimate.id}`,
            });
        } catch (e) {
            console.error("Notification failed:", e.message);
        }

        // Return only safe public fields
        const safeEstimate = {
            id: updatedEstimate.id,
            estimate_number: updatedEstimate.estimate_number,
            status: updatedEstimate.status,
            total: updatedEstimate.total,
        };

        return Response.json({ success: true, estimate: safeEstimate });
    } catch (error) {
        console.error("Error approving public estimate:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});