// Never pass JSON objects from a request into a capability-token query.
// An object such as {$ne:null} is a query operator, not a bearer credential.
export function publicCapability(value: any): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value && !/\s/.test(value);
}
export const publicCompanySettings = (s: any) => s ? Object.fromEntries([
  'company_name', 'company_address', 'company_city', 'company_state',
  'company_zip', 'company_phone', 'company_email', 'company_website', 'company_logo_url', 'company_logo_light_url', 'company_logo_dark_url',
].filter(key => s[key] !== undefined).map(key => [key, s[key]])) : null;
