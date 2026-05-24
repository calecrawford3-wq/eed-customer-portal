import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();

        // Support both direct calls and entity automation payloads
        let customerEmail, customerFirstName;

        if (payload.data) {
            // Called from entity automation
            customerEmail = payload.data.email;
            customerFirstName = payload.data.first_name;
        } else {
            customerEmail = payload.customer_email;
            customerFirstName = payload.customer_first_name || "Valued Customer";
        }

        if (!customerEmail) {
            return Response.json({ message: "No email provided, skipping invite." });
        }

        const appUrl = Deno.env.get("BASE44_APP_URL") || "https://app.base44.com";
        const loginLink = `${appUrl}/CustomerPortal`;

        const subject = "Welcome to Elite Engine Development - Access Your Customer Portal";
        const body = `
<p>Hi ${customerFirstName},</p>

<p>Welcome to <strong>Elite Engine Development</strong>! Your customer account has been created and your portal is ready.</p>

<p>You can log in to view your engine builds, invoices, estimates, and request service using the link below:</p>

<p><a href="${loginLink}" style="background-color:#e20404;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">Access Your Customer Portal</a></p>

<p>When you log in for the first time, you'll be asked to set a password for your account.</p>

<p>If you have any questions, feel free to reply to this email or give us a call.</p>

<p>— Elite Engine Development Team</p>
        `.trim();

        await base44.asServiceRole.integrations.Core.SendEmail({
            to: customerEmail,
            from_name: "Elite Engine Development",
            subject,
            body,
        });

        console.log(`Portal invite sent to ${customerEmail}`);
        return Response.json({ message: "Portal invite sent successfully." });
    } catch (error) {
        console.error("Error sending portal invite:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});