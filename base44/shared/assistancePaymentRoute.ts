// A durable compare-and-set reservation shared by all offer payment routes.
// Ambiguous provider responses retain the reservation; time never unlocks money.
const rows = (r: any) => Array.isArray(r) ? r : r?.items || [];
const entity = (b: any) => b.asServiceRole.entities.EngineAssistanceOffer;
export async function reserveRoute(b: any, offer: any, route: string) {
  const current = rows(await entity(b).filter({ id: offer.id }))[0];
  if (!current) throw new Error('Offer unavailable');
  if (current.payment_route_claim) {
    if (!['deposit_card', 'deposit_lender', 'pay_in_full', 'finance_full', 'remainder_affirm'].includes(route) || current.payment_route !== route) throw new Error('Finish or close the existing checkout before changing payment options.');
    return current;
  }
  const claim = crypto.randomUUID();
  await entity(b).updateMany({
    id: offer.id,
    payment_route_claim: current.payment_route_claim === undefined ? { $exists: false } : current.payment_route_claim,
  }, { $set: { payment_route_claim: claim, payment_route: route, payment_route_started_at: new Date().toISOString(), payment_route_session: '', payment_route_options: '' } });
  const saved = rows(await entity(b).filter({ id: offer.id }))[0];
  if (saved?.payment_route_claim !== claim) throw new Error('Another payment action is in progress. Reload your offer.');
  return saved;
}
export async function releaseRoute(b: any, offer: any) {
  await entity(b).updateMany({ id: offer.id, payment_route_claim: offer.payment_route_claim }, {
    $set: { payment_route_claim: '', payment_route: '', payment_route_session: '', payment_route_options: '' },
  });
}
// Retire every payable historical session before opening a new obligation.
// Also catches sessions created before this reservation system was introduced.
export async function retireOfferSessions(b: any, stripe: any, offer: any) {
  let cursor: string | undefined;
  const since = Math.floor(new Date(offer.created_date || '2020-01-01').getTime() / 1000);
  for (let page = 0; page < 100; page++) {
    const batch = await stripe.checkout.sessions.list({ limit: 100, created: { gte: since }, ...(cursor ? { starting_after: cursor } : {}) });
    for (const item of batch.data) {
      if (item.metadata?.source !== 'eed_engine_assistance_v1' || item.metadata?.offer_id !== offer.id) continue;
      if (offer.payment_route !== 'internal' && offer.payment_route !== 'closing' && item.metadata?.payment_route_claim === offer.payment_route_claim) continue;
      let session = await stripe.checkout.sessions.retrieve(item.id, { expand: ['payment_intent.latest_charge'] });
      if ((offer.payments || []).some((p: any) => p.stripe_session_id === session.id)) continue;
      if (session.status === 'open') {
        // If completion races expiry Stripe rejects expiry; we fail closed.
        session = await stripe.checkout.sessions.expire(session.id);
      }
      if (session.payment_status === 'paid' || session.status === 'complete') {
        throw new Error('Stripe is confirming an existing payment. Wait for confirmation before choosing another option.');
      }
      if (session.status !== 'expired') throw new Error('Existing checkout needs verification before continuing.');
    }
    if (!batch.has_more) return;
    cursor = batch.data[batch.data.length - 1]?.id;
  }
  throw new Error('Payment history needs staff verification.');
}

// Switch only a known checkout, never an ambiguous in-flight provider request.
// Lock the old route before contacting Stripe and retain it if verification fails.
export async function closeKnownCheckout(b: any, stripe: any, offer: any) {
  if (!offer.payment_route_claim) return;
  if (offer.payment_route === 'internal') throw new Error('Withdraw your in-house request first.');
  if (!offer.payment_route_session) throw new Error('The existing checkout is still being verified. Retry the same option before switching.');
  const current = rows(await entity(b).filter({id:offer.id}))[0];
  if (!current || current.payment_route_claim !== offer.payment_route_claim || current.payment_route_session !== offer.payment_route_session) throw new Error('Payment option changed. Reload your offer.');
  if (current.payment_route !== 'closing') {
    await entity(b).updateMany({id:offer.id,payment_route_claim:current.payment_route_claim,payment_route:current.payment_route,payment_route_session:current.payment_route_session},{$set:{payment_route:'closing'}});
  }
  const closing = rows(await entity(b).filter({id:offer.id}))[0];
  if (closing?.payment_route_claim !== current.payment_route_claim || closing.payment_route !== 'closing') throw new Error('Payment option changed. Reload your offer.');
  // Verify the specific known session even if the provider list is delayed.
  let session = await stripe.checkout.sessions.retrieve(closing.payment_route_session);
  if (session.metadata?.source !== 'eed_engine_assistance_v1' || session.metadata?.offer_id !== offer.id) throw new Error('Existing checkout requires staff verification.');
  if (session.status === 'open' && session.payment_status === 'unpaid') session = await stripe.checkout.sessions.expire(session.id);
  if (session.status !== 'expired' || session.payment_status !== 'unpaid') throw new Error('Stripe is confirming an existing payment. Wait for confirmation before choosing another option.');
  await retireOfferSessions(b,stripe,closing);
  await releaseRoute(b,closing);
}
