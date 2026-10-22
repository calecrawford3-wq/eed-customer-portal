export function parseMyRacePassDriverId(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!/(^|\.)myracepass\.com$/i.test(url.hostname)) return '';
    return url.searchParams.get('r') || url.searchParams.get('driver') || '';
  } catch { return ''; }
}
