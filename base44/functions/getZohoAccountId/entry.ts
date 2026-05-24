import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get a fresh access token
    const tokenResponse = await fetch('https://accounts.zoho.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: Deno.env.get('ZOHO_CLIENT_ID'),
        client_secret: Deno.env.get('ZOHO_CLIENT_SECRET'),
        refresh_token: Deno.env.get('ZOHO_REFRESH_TOKEN'),
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return Response.json({ error: 'Failed to get access token', details: tokenData }, { status: 500 });
    }

    // Fetch accounts list
    const accountsResponse = await fetch('https://mail.zoho.com/api/accounts', {
      headers: { 'Authorization': `Zoho-oauthtoken ${tokenData.access_token}` },
    });

    const accountsData = await accountsResponse.json();
    return Response.json(accountsData);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});