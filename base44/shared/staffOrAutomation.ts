// Authorization uses Base44's API, never a request-body role, decoded JWT,
// header presence, or the availability of asServiceRole.
export async function staffOrAutomation(base44: any): Promise<boolean> {
  try {
    const user = await base44.auth.me();
    if (user) return user.role === 'admin';
  } catch { /* A service caller may not have a User identity. Verify below. */ }
  try {
    // IMPORTANT: ordinary caller-scoped client, NOT asServiceRole.
    // AppSettings is admin-only under deployed RLS. The Base44 API validates
    // the incoming token. A backend service token can read it; an anonymous
    // caller cannot. No settings contents leave this helper.
    const result = await base44.entities.AppSettings.filter({ key: 'global' });
    const rows = result?.items || result || [];
    return rows.some(row => row.key === 'global' && typeof row.id === 'string' && !!row.id);
  } catch { return false; }
}
