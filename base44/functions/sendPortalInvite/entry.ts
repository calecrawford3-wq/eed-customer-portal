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
        const customerEmail = payload.customer_email || payload.customerEmail;

        if (!customerEmail) {
            console.error("sendPortalInvite: No email in payload", JSON.stringify(payload));
            return Response.json({ error: "No email provided" }, { status: 400 });
        }

        // Only admins may send portal invites
        if (user.role !== "admin") {
            return Response.json({ error: "Only admins can send portal invites" }, { status: 403 });
        }

        // Use service role so the invite has elevated permissions to create the user account
        await base44.asServiceRole.users.inviteUser(customerEmail, "user");

        console.log(`Portal invite sent to ${customerEmail}`);
        return Response.json({ message: "Portal invite sent successfully." });
    } catch (error) {
        console.error("Error sending portal invite:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});