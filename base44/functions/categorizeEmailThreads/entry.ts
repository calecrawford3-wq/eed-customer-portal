import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { categorizeUncategorizedThreads } from '../../shared/categorizeThreads.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let body = {};
    try {
      body = typeof req.json === 'function' ? await req.json() : (req.body || {});
    } catch (_) { body = req.body || {}; }
    const forceAll = body?.forceAll === true || body?.force_all === true;

    const result = await categorizeUncategorizedThreads(base44, { forceAll });
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('categorizeEmailThreads error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}