import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Requires an authenticated user context (called from frontend)
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const payload = await req.json();
        const customerEmail = payload.customer_email;

        if (!customerEmail) {
            return Response.json({ error: "No email provided" }, { status: 400 });
        }

        // Invite the user — creates their Base44 account and sends an invite email
        await base44.auth.inviteUser(customerEmail, "user");

        console.log(`Portal invite sent to ${customerEmail}`);
        return Response.json({ message: "Portal invite sent successfully." });
    } catch (error) {
        console.error("Error sending portal invite:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});