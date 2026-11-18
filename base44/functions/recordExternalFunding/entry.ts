import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';

const kinds=['owner_contribution','owner_loan','business_transfer','other'];
const list=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];

export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
 const sdk=createClientFromRequest(req);
 const user=await sdk.auth.me();
 if(!user||user.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 let body:any;
 try{body=await req.json()}catch{return Response.json({error:'Invalid request'},{status:400})}
 const {account_id,funding_type,funding_date,source_description,reference,memo,request_id}=body||{};
 const amount=Number(body?.amount);
 const cents=Math.round(amount*100);
 if(!account_id||!kinds.includes(funding_type)||!Number.isSafeInteger(cents)||cents<=0||!Number.isFinite(amount)||!/^\d{4}-\d{2}-\d{2}$/.test(funding_date||'')||!Number.isFinite(Date.parse(funding_date)))
  return Response.json({error:'Valid account, funding type, date and positive amount required'},{status:400});
 if(!request_id||typeof request_id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(request_id))
  return Response.json({error:'Valid request ID required'},{status:400});
 const entities=sdk.asServiceRole.entities;
 const accounts=list(await entities.VirtualAccount.list('-created_date',500));
 const account=accounts.find((a:any)=>a.id===account_id&&a.active!==false);
 if(!account)return Response.json({error:'Account not found or inactive'},{status:404});
 const key='external-funding:'+request_id;
 const existing=list(await entities.VirtualLedgerEntry.filter({transaction_key:key},'-created_date',1));
 if(existing.length)return Response.json({ok:true,duplicate:true,ledger_key:key});
 const funding=await entities.ExternalFunding.create({
  account_id,amount_cents:cents,funding_type,funding_date,
  source_description:String(source_description||'').slice(0,250),
  reference:String(reference||'').slice(0,120),memo:String(memo||'').slice(0,1000),
  status:'recorded',ledger_key:key,recorded_by:user.email||user.id,recorded_at:new Date().toISOString()
 });
 try{
  await entities.VirtualLedgerEntry.create({
   transaction_key:key,account_id,amount_cents:cents,
   occurred_at:funding_date+'T12:00:00.000Z',
   memo:'External funding: '+funding_type.replaceAll('_',' ')+(memo?' — '+String(memo).slice(0,200):''),
   source_type:funding_type,source_id:funding.id,transfer_group:key,created_by:user.email||user.id
  });
 }catch(error){
  // Record is retained for investigation/retry; never silently report a funded balance.
  return Response.json({error:'Funding record saved but ledger posting failed. Contact administrator before retrying.',funding_id:funding.id},{status:500});
 }
 return Response.json({ok:true,funding_id:funding.id,ledger_key:key,amount_cents:cents});
}
