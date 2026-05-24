import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { estimateId } = await req.json();

        if (!estimateId) {
            return Response.json({ error: 'Estimate ID is required' }, { status: 400 });
        }

        const updatedEstimate = await base44.asServiceRole.entities.Estimate.update(estimateId, {
            status: "approved"
        });

        return Response.json({ success: true, estimate: updatedEstimate });
    } catch (error) {
        console.error("Error approving public estimate:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});