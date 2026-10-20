import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { readPortalFeeSettings } from '../../shared/portalFees.ts';

const fields = ['ach_enabled', 'affirm_enabled', 'ach_fee_approved', 'ach_fee_percent', 'ach_fee_fixed_cents', 'ach_fee_cap_cents'];
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
        if (field.endsWith('_enabled') || field === 'ach_fee_approved') {
          if (typeof value !== 'boolean') return Response.json({ error: 'Invalid switch' }, { status: 400 });
        } else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (field === 'ach_fee_percent' && value > 100) || (field.endsWith('_cents') && !Number.isSafeInteger(value))) {
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
    return Response.json({ settings: Object.fromEntries(fields.map(k => [k, settings[k] ?? (k.endsWith('_enabled') || k === 'ach_fee_approved' ? false : 0)])), provider_gates: { ach: Deno.env.get('PORTAL_ENABLE_ACH') === 'true', affirm: Deno.env.get('PORTAL_ENABLE_AFFIRM') === 'true' }, note: 'Settings do not activate Stripe provider capabilities. Card surcharges and Affirm surcharges remain disabled.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Unable to manage payment settings' }, { status: 500 }); }
}
