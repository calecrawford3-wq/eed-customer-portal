import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { publicAccessToken } = await req.json();

        if (!publicAccessToken) {
            return Response.json({ error: 'publicAccessToken is required' }, { status: 400 });
        }

        // Fetch estimate by token
        const estimates = await base44.asServiceRole.entities.Estimate.filter({ public_access_token: publicAccessToken });

        if (!estimates || estimates.length === 0) {
            return Response.json({ error: 'Estimate not found' }, { status: 404 });
        }

        const estimate = estimates[0];

        // Update status to approved
        const updatedEstimate = await base44.asServiceRole.entities.Estimate.update(estimate.id, {
            status: "approved"
        });

        return Response.json({ success: true, estimate: updatedEstimate });
    } catch (error) {
        console.error("Error approving public estimate:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});