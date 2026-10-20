import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { staffOrAutomation } from '../../shared/staffOrAutomation.ts';

export default async function(req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    if (!await staffOrAutomation(base44)) return Response.json({ error: 'Caller access could not be verified' }, { status: 403 });
    return Response.json({ authorized: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Caller check unavailable' }, { status: 503 }); }
}
