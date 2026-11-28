import {requireIncomeEvidence,IncomeError} from './assistanceFinancial.ts';
export const SUBMISSION_FEE_CENTS=2000;
export const SUBMISSION_FEE_SOURCE='eed_aef_submission_fee';
const rows=(r:any)=>Array.isArray(r)?r:r?.items||[];
// Only a retrieved Stripe session can move an application into review.
export async function applyVerifiedSubmissionFee(base44:any,session:any,live:boolean){
  const e=base44.asServiceRole.entities.EngineAssistanceApplication;
  if(session?.metadata?.source!==SUBMISSION_FEE_SOURCE||session.mode!=='payment'||session.currency!=='usd'||session.livemode!==live||session.amount_total!==SUBMISSION_FEE_CENTS||!session.metadata.application_id)throw new IncomeError('Submission deposit could not be verified.',409);
  const app=rows(await e.filter({id:session.metadata.application_id}))[0];
  if(!app||app.submission_fee_session_id!==session.id||app.submission_fee_cents!==SUBMISSION_FEE_CENTS)throw new IncomeError('Submission deposit does not match the saved application.',409);
  if(app.submission_fee_status==='paid'||['credited','refunded'].includes(app.submission_fee_status))return {paid:true,application_number:app.application_number};
  if(app.status!=='pending_payment')throw new IncomeError('Application is not awaiting payment.',409);
  if(session.payment_status!=='paid')return {paid:false,pending:true};
  const intent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
  if(!intent?.startsWith('pi_'))throw new IncomeError('Payment confirmation is incomplete.',409);
  await requireIncomeEvidence(base44,app,false);
  const now=new Date().toISOString();
  await e.updateMany({id:app.id,status:'pending_payment',submission_fee_session_id:session.id,submission_fee_status:app.submission_fee_status},{$set:{status:'submitted',income_request_pending:false,submission_fee_status:'paid',submission_fee_paid_at:now,submission_fee_payment_intent:intent,submitted_at:now,audit_trail:[...(app.audit_trail||[]),{at:now,by:'Stripe',action:'submission_deposit_verified',note:'$20 submission deposit verified through Stripe Checkout.'}]}});
  const saved=rows(await e.filter({id:app.id}))[0];
  if(saved?.submission_fee_status!=='paid'&& !['credited','refunded'].includes(saved?.submission_fee_status))throw new IncomeError('Payment confirmation requires retry.',409);
  return {paid:true,application_number:saved.application_number};
}
