import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { syncMachiningBilling } from '../../shared/syncMachiningBilling.ts';

export default async function(req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Staff access required' }, { status: 403 });
    const { job_id } = await req.json();
    if (typeof job_id !== 'string' || !job_id || job_id.length > 200) return Response.json({ error: 'Valid job_id required' }, { status: 400 });
    return await syncMachiningBilling(base44, job_id);
  } catch { return Response.json({ error: 'Unable to sync machining billing' }, { status: 500 }); }
}
