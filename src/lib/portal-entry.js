// Login return links may lead only to explicitly approved portal routes on this origin.
export function portalDestination(value, origin) {
  try {
    const url = new URL(value || '/CustomerPortal', origin);
    if (url.origin !== origin || !['/CustomerPortal','/StaffWorkspace','/EmployeePortal','/OwnerEarnings','/FormerEmployeeTaxPortal'].includes(url.pathname)) return '/CustomerPortal';
    return url.pathname + url.search;
  } catch {
    return '/CustomerPortal';
  }
}
