import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { readPortalFeeSettings } from '../../shared/portalFees.ts';

const fields = ['affirm_enabled', 'international_allowance_enabled', 'international_allowance_percent', 'card_processing_percent', 'card_processing_fixed_cents', 'affirm_processing_percent', 'affirm_processing_fixed_cents'];
export default async function(req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin required' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const entity = base44.asServiceRole.entities.AppSettings;
    if (body.action === 'save') {
      const incoming = body.settings || {};
      if (Object.keys(incoming).some(k => !fields.includes(k))) return Response.json({ error: 'Unsupported setting' }, { status: 400 });
      const update: any = {};
      for (const field of fields) {
        const value = incoming[field];
        if (value === undefined) continue;
        if (field.endsWith('_enabled')) {
          if (typeof value !== 'boolean') return Response.json({ error: 'Invalid switch' }, { status: 400 });
        } else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (field.endsWith('_percent') && value > 100) || (field.endsWith('_cents') && !Number.isSafeInteger(value))) {
          return Response.json({ error: 'Invalid fee rate or amount' }, { status: 400 });
        }
        update[field] = value;
      }
      const rows = await entity.filter({ key: 'portal_payment_fees' });
      const existing = Array.isArray(rows) ? rows[0] : rows?.data?.[0];
      if (existing) await entity.update(existing.id, update);
      else await entity.create({ key: 'portal_payment_fees', ...update });
    } else if (body.action !== 'read') return Response.json({ error: 'Invalid action' }, { status: 400 });
    const settings = await readPortalFeeSettings(base44);
    return Response.json({ settings: Object.fromEntries(fields.map(k => [k, settings[k] ?? (k.endsWith('_enabled') ? false : 0)])), provider_gates: { affirm: Deno.env.get('PORTAL_ENABLE_AFFIRM') === 'true' }, note: 'Card and Affirm processing rates are merchant cost estimates only. They do not charge customers or create expense records. Customer surcharges remain disabled.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Unable to manage payment settings' }, { status: 500 }); }
}
