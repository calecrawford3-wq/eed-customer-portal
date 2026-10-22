import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Returns ONLY the customer-facing display fields from AppSettings (company
// name, logo, phone, address). AppSettings itself is admin-only under RLS
// (it holds SMTP passwords and other secrets), so the portal and public
// views must use this endpoint instead of reading AppSettings directly.
// No secrets are returned.

const SAFE_FIELDS = [
  'company_name', 'company_address', 'company_city', 'company_state',
  'company_zip', 'company_phone', 'company_email', 'company_website',
  'company_logo_url', 'company_logo_light_url', 'company_logo_dark_url',
];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const res = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
    const settings = (res.items || res || [])[0] || {};
    const safe: Record<string, any> = {};
    for (const f of SAFE_FIELDS) {
      if (settings[f] !== undefined) safe[f] = settings[f];
    }
    return Response.json({ settings: safe });
  } catch (error) {
    console.error('[getPublicSettings] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}