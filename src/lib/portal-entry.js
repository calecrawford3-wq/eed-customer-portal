// Login return links may only lead into the customer portal on this origin.
export function portalDestination(value, origin) {
  try {
    const url = new URL(value || '/CustomerPortal', origin);
    if (url.origin !== origin || url.pathname !== '/CustomerPortal') return '/CustomerPortal';
    return url.pathname + url.search;
  } catch {
    return '/CustomerPortal';
  }
}
