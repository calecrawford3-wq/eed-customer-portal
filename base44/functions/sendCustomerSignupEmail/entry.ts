import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, customerName } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const signupUrl = `${new URL(req.url).origin}/`;

    await base44.integrations.Core.SendEmail({
      to: email,
      subject: 'Your Customer Portal Access',
      body: `Hello ${customerName || 'Valued Customer'},\n\nWelcome! You can now access your customer portal by visiting the link below and signing up with this email address:\n\n${signupUrl}\n\nOnce you create your account using this email, you'll automatically have access to your engine builds, invoices, estimates, and more.\n\nIf you have any questions, please let us know.\n\nBest regards,\nElite Engine Development`
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});