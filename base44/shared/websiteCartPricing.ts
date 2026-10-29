// Shared pricing rules for the public Elite website store checkout.
// Every amount is computed on the server from catalog records and settings.
const rows = (value: any): any[] => Array.isArray(value) ? value : value?.items || [];
const cents = (value: any) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
};

export async function websiteStoreSettings(svc: any) {
  const store = rows(await svc.entities.WebsiteStoreSettings.filter({ key: 'global' }))[0] || {};
  const app = rows(await svc.entities.AppSettings.filter({ key: 'global' }))[0] || {};
  const taxRatePercent = Number(app.default_tax_rate);
  return {
    checkoutEnabled: store.checkout_enabled === true && !!Deno.env.get('PORTAL_STRIPE_SECRET_KEY'),
    flatShippingCents: cents(store.shipping_flat_cents),
    freeThresholdCents: cents(store.free_shipping_threshold_cents),
    pickupInstructions: String(store.pickup_instructions || ''),
    taxRatePercent: Number.isFinite(taxRatePercent) && taxRatePercent >= 0 ? taxRatePercent : 0,
  };
}

// Parts are paid in full and taxed; engine deposits are collected now and freight is billed later.
export function settleWebsiteCart(quote: any, method: 'ship' | 'pickup', state: string, settings: any) {
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const partsSubtotalCents = lines.filter((line: any) => line.type === 'part').reduce((sum: number, line: any) => sum + cents(line.totalCents), 0);
  const engineDueCents = lines.filter((line: any) => line.type === 'engine').reduce((sum: number, line: any) => sum + cents(line.dueCents), 0);
  let shippingCents = 0;
  if (method === 'ship' && partsSubtotalCents > 0) {
    const free = settings.freeThresholdCents > 0 && partsSubtotalCents >= settings.freeThresholdCents;
    shippingCents = free ? 0 : cents(settings.flatShippingCents);
  }
  // Elite collects Oklahoma sales tax on parts picked up or delivered in Oklahoma.
  const taxableCents = state === 'OK' ? partsSubtotalCents + shippingCents : 0;
  const taxCents = Math.round(taxableCents * (Number(settings.taxRatePercent) || 0) / 100);
  return {
    partsSubtotalCents,
    engineDueCents,
    shippingCents,
    taxCents,
    taxRate: settings.taxRatePercent,
    taxedState: state === 'OK' ? state : '',
    totalCents: partsSubtotalCents + engineDueCents + shippingCents + taxCents,
  };
}