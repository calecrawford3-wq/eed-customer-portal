import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { exchangeZohoMailGrantToken } from '../../shared/zohoMail.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { code, redirectUri } = await req.json();
    if (!code) {
      return Response.json({ error: 'code (grant token) is required' }, { status: 400 });
    }
    const result = await exchangeZohoMailGrantToken(base44, { code, redirectUri });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}