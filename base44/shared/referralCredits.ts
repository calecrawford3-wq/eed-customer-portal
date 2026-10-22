export const REFERRAL_CREDIT_AMOUNT = 200;
const dateOnly = (d = new Date()) => d.toISOString().slice(0, 10);
const dec31 = (d = new Date()) => `${d.getUTCFullYear()}-12-31`;
const rows = (v: any) => Array.isArray(v) ? v : v?.items || [];

export async function ensureReferralCredits(base44: any, referredCustomerId: string, referrerCustomerId: string, amount = REFERRAL_CREDIT_AMOUNT) {
  if (!referredCustomerId || !referrerCustomerId || referredCustomerId === referrerCustomerId) throw new Error('Referral customers must be different');
  const Customer = base44.asServiceRole.entities.Customer;
  const Credit = base44.asServiceRole.entities.AccountCredit;
  const referred = rows(await Customer.filter({ id: referredCustomerId }))[0];
  const referrer = rows(await Customer.filter({ id: referrerCustomerId }))[0];
  if (!referred || !referrer) throw new Error('Referral customer not found');
  const today = dateOnly();
  const referredName = `${referred.first_name || ''} ${referred.last_name || ''}`.trim();
  const referrerName = `${referrer.first_name || ''} ${referrer.last_name || ''}`.trim();
  const referredExisting = rows(await Credit.filter({ customer_id: referredCustomerId, type: 'referral', subtype: 'Referral Bonus (Referred)', source_reference: referrerCustomerId }));
  const referrerExisting = rows(await Credit.filter({ customer_id: referrerCustomerId, type: 'referral', subtype: 'Referral Bonus (Referrer)', source_reference: referredCustomerId }));
  let referredCredit = referredExisting[0];
  let referrerCredit = referrerExisting[0];
  if (!referredCredit) referredCredit = await Credit.create({ customer_id: referredCustomerId, amount, type:'referral', subtype:'Referral Bonus (Referred)', description:`Referral bonus — referred by ${referrerName}`, source_reference:referrerCustomerId, date:today, expires_on:dec31(), status:'active', activated_at:new Date().toISOString() });
  if (!referrerCredit) referrerCredit = await Credit.create({ customer_id: referrerCustomerId, amount, type:'referral', subtype:'Referral Bonus (Referrer)', description:`Referral bonus — referred ${referredName}`, source_reference:referredCustomerId, date:today, status:'pending', pending_reason:'Releases after the referred customer makes their first payment on an engine build.' });
  await Customer.update(referredCustomerId, { referred_by_customer_id: referrerCustomerId });
  return { referredCredit, referrerCredit, amount };
}

async function qualifiesAsEngineBuild(base44: any, document: any) {
  if (!document) return false;
  if (document.is_engine_build || document.build_id) return true;
  if (!document.estimate_id) return false;
  const estimate = rows(await base44.asServiceRole.entities.Estimate.filter({ id: document.estimate_id }))[0];
  return !!(estimate?.is_engine_build || estimate?.build_id);
}

export async function activateReferralCreditsForEnginePayment(base44: any, customerId: string, document: any) {
  if (!customerId || !(await qualifiesAsEngineBuild(base44, document))) return { activated: 0, reason: 'not_engine_build' };
  const Credit = base44.asServiceRole.entities.AccountCredit;
  const pending = rows(await Credit.filter({ type:'referral', status:'pending', source_reference:customerId }))
    .filter((c: any) => c.subtype === 'Referral Bonus (Referrer)');
  if (!pending.length) return { activated: 0, reason: 'none_pending' };
  const now = new Date();
  let activated = 0;
  for (const credit of pending) {
    const result = await Credit.updateMany({ id: credit.id, status:'pending' }, { $set:{ status:'active', pending_reason:'', activated_at:now.toISOString(), date:dateOnly(now), expires_on:dec31(now) } });
    if (result?.updated === 1) activated++;
    else {
      const fresh = rows(await Credit.filter({ id: credit.id }))[0];
      if (fresh?.status === 'active') activated++;
    }
  }
  if (activated) {
    try { await base44.asServiceRole.entities.Notification.create({ title:'Referral credit released', message:`${activated} referral credit${activated===1?'':'s'} released after the referred customer's first engine-build payment.`, type:'other', link_url:'/Credits', is_read:false }); } catch { /* never fail a payment */ }
  }
  return { activated };
}
