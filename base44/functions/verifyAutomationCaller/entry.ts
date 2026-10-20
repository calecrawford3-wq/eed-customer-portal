import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

export default async function(req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Staff access required' }, { status: 403 });
    try {
      const result = await base44.asServiceRole.functions.invoke('probeAutomationAccess', {});
      const authorized = result.data?.authorized === true;
      return Response.json({ authorized, message: authorized ? 'Backend caller permissions verified. Test scheduled workflow health separately.' : 'Backend caller access is not verified. Keep the app private.' },
        { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json({ authorized: false, message: 'The deployed backend caller check did not pass. Confirm both functions synced and keep the app private.' });
    }
  } catch { return Response.json({ error: 'Unable to check workflow access' }, { status: 500 }); }
}
