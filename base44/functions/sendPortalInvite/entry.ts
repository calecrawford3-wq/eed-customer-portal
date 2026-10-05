import { createClientFromRequest } from "npm:@base44/sdk@0.8.35";

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
        const customerName = payload.customerName || payload.customer_name || "Valued Customer";

        if (!customerEmail) {
            console.error("sendPortalInvite: No email in payload", JSON.stringify(payload));
            return Response.json({ error: "No email provided" }, { status: 400 });
        }

        // Only admins may send portal invites
        if (user.role !== "admin") {
            return Response.json({ error: "Only admins can send portal invites" }, { status: 403 });
        }

        // Send a custom portal invite email linking to the custom domain.
        // We do NOT use base44.users.inviteUser here because the platform's built-in
        // invite email links to the default base44.app domain, not the custom domain.
        // The customer self-registers at the portal login page (same flow as sendCustomerSignupEmail).
        const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
        const settings = settingsList?.[0];
        const signature = settings?.email_signature || "Elite Engine Development\nYour High-Performance Engine Specialists";
        const companyName = settings?.company_name || "Elite Engine Development";

        const signupUrl = `https://portal.eedpower.com/login`;

        const text = `Hello ${customerName},\n\nYou've been invited to access the ${companyName} customer portal. Visit the link below and sign up using this email address (${customerEmail}):\n\n${signupUrl}\n\nOnce you create your account, you'll automatically have access to your engine builds, invoices, estimates, and more.\n\nIf you have any questions, please let us know.\n\n${signature}`;

        const html = `
          <p>Hello ${customerName},</p>
          <p>You've been invited to access the ${companyName} customer portal. Visit the link below and sign up using this email address (<strong>${customerEmail}</strong>):</p>
          <p><a href="${signupUrl}">${signupUrl}</a></p>
          <p>Once you create your account, you'll automatically have access to your engine builds, invoices, estimates, and more.</p>
          <p>If you have any questions, please let us know.</p>
          <p>${signature.replace(/\n/g, "<br/>")}</p>
        `;

        const result = await base44.functions.invoke("sendSmtpEmail", {
            to: customerEmail,
            subject: `Your Customer Portal Access — ${companyName}`,
            text,
            html,
            usePOSmtp: false,
        });

        if (result?.data?.error) {
            console.error("sendPortalInvite: SMTP send failed:", result.data.error);
            return Response.json({ error: result.data.error }, { status: 500 });
        }

        console.log(`Portal invite sent to ${customerEmail}`);
        return Response.json({ message: "Portal invite sent successfully." });
    } catch (error) {
        console.error("Error sending portal invite:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});