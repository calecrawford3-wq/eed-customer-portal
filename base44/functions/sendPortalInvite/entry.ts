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

        // Invite the user through the platform so they are pre-registered and do not
        // require manual approval when they sign in. The platform's built-in invite
        // email links to the default base44.app domain, so we ALSO send a custom
        // email with the correct portal.eedpower.com link for the customer to use.
        try {
            await base44.users.inviteUser(customerEmail, "user");
            console.log(`sendPortalInvite: invited user ${customerEmail} via platform`);
        } catch (inviteError) {
            // 409 / "already invited" is expected if the customer was invited before — not fatal.
            console.log(`sendPortalInvite: inviteUser result for ${customerEmail}:`, inviteError?.message || inviteError);
        }

        const settingsList = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
        const settings = settingsList?.[0];
        const signature = settings?.email_signature || "Elite Engine Development\nYour High-Performance Engine Specialists";
        const companyName = settings?.company_name || "Elite Engine Development";

        const signupUrl = `https://portal.eedpower.com/login`;

        const text = `Hello ${customerName},\n\nYou've been invited to access the ${companyName} customer portal. Follow these steps to create your account and log in:\n\n1. Go to the login page: ${signupUrl}\n\n2. Click "Sign up" (or "Create account") — you don't have an account yet.\n\n3. Enter this email address (${customerEmail}) and choose a password.\n\n4. Check your inbox for a verification email and click the link inside to verify your address.\n\n5. Once verified, sign in at ${signupUrl} using your email and password.\n\nYou'll then see your engine builds, invoices, estimates, inspection findings, and documents — all tied to this email address automatically.\n\nIf you have any questions, please let us know.\n\n${signature}`;

        const html = `
          <p>Hello ${customerName},</p>
          <p>You've been invited to access the ${companyName} customer portal. Follow these steps to create your account and log in:</p>
          <ol style="margin:0 0 16px 0;padding-left:20px;line-height:1.7;">
            <li>Go to the login page: <a href="${signupUrl}">${signupUrl}</a></li>
            <li>Click <strong>"Sign up"</strong> (or "Create account") — you don't have an account yet.</li>
            <li>Enter this email address (<strong>${customerEmail}</strong>) and choose a password.</li>
            <li>Check your inbox for a verification email and click the link inside to verify your address.</li>
            <li>Once verified, sign in at <a href="${signupUrl}">${signupUrl}</a> using your email and password.</li>
          </ol>
          <p>You'll then see your engine builds, invoices, estimates, inspection findings, and documents — all tied to this email address automatically.</p>
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