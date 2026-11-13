import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const fail=(message:string,status=400)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 if(user?.role!=='admin')return fail('Admin required',403);
 const b=await req.json(),svc=sdk.asServiceRole;
 if(typeof b.job_id!=='string'||b.job_id.length>150)return fail('Invalid job');
 const job=rows(await svc.entities.Job.filter({id:b.job_id}))[0];
 if(!job||job.job_type!=='machining'||job.is_engine_build)return fail('Machining-only job required',409);
 const existing=rows(await svc.entities.JobReturnShipment.filter({job_id:job.id}));
 const purchased=existing.find(x=>x.status==='purchased');
 const unresolved=existing.find(x=>['purchase_pending','purchase_review'].includes(x.status));
 if(b.action==='status')return Response.json({purchased:purchased||null,unresolved:unresolved||null,quotes:existing.filter(x=>x.status==='quoted').slice(-5)});
 if(purchased)return fail('A return label has already been purchased for this job. Use the existing label.',409);
 if(unresolved)return fail('A previous label purchase is pending or needs review. Check EasyPost before creating another label.',409);
 const key=Deno.env.get('EASYPOST_API_KEY');if(!key)return fail('EasyPost API key not configured',503);
 const headers={Authorization:'Basic '+btoa(key+':'),'Content-Type':'application/json'};
 if(b.action==='quote'){
  const origin=rows(await svc.entities.ShippingOrigin.list())[0];if(!origin)return fail('Configure Shipping Origin first',409);
  const customer=rows(await svc.entities.Customer.filter({id:job.customer_id}))[0];if(!customer)return fail('Customer missing',404);
  const dest=b.to_address||{};
  const from={name:origin.name,company:origin.company||'',street1:origin.street1,street2:origin.street2||'',city:origin.city,state:origin.state,zip:origin.zip,country:origin.country||'US',phone:origin.phone||''};
  const to={name:String(dest.name||`${customer.first_name||''} ${customer.last_name||''}`).trim(),street1:String(dest.street1||''),street2:String(dest.street2||''),city:String(dest.city||''),state:String(dest.state||''),zip:String(dest.zip||''),country:'US',phone:String(dest.phone||customer.phone||'')};
  if(!from.street1||!from.city||!from.state||!from.zip||!to.name||!to.street1||!to.city||!to.state||!/^\d{5}(-\d{4})?$/.test(to.zip))return fail('Complete shipping address and US ZIP required',400);
  const parcel={length:Number(b.length),width:Number(b.width),height:Number(b.height),weight:Number(b.weightOz)};
  if(!Object.values(parcel).every(x=>Number.isFinite(x)&&x>0&&x<=1000))return fail('Valid package dimensions (inches) and weight (ounces) required',400);
  const response=await fetch('https://api.easypost.com/v2/shipments',{method:'POST',headers,body:JSON.stringify({shipment:{from_address:from,to_address:to,parcel}})});
  const data=await response.json().catch(()=>({}));if(!response.ok)return fail('EasyPost rate request failed: '+String(data?.error?.message||response.status).slice(0,150),502);
  const record=await svc.entities.JobReturnShipment.create({job_id:job.id,customer_id:job.customer_id,shipment_id:data.id,status:'quoted',to_address:to,parcel});
  return Response.json({quote_id:record.id,rates:(data.rates||[]).map((r:any)=>({id:r.id,carrier:r.carrier,service:r.service,rate:r.rate,delivery_days:r.delivery_days}))});
 }
 if(b.action==='buy'){
  const quote=existing.find(x=>x.id===b.quote_id&&x.status==='quoted');if(!quote)return fail('Valid quote required',409);
  const rateId=String(b.rate_id||'');if(!/^rate_[a-zA-Z0-9]+$/.test(rateId))return fail('Invalid EasyPost rate',400);
  // A quote may be bought once only; mark processing before calling EasyPost.
  await svc.entities.JobReturnShipment.update(quote.id,{status:'purchase_pending',rate_id:rateId});
  const response=await fetch(`https://api.easypost.com/v2/shipments/${encodeURIComponent(quote.shipment_id)}/buy`,{method:'POST',headers,body:JSON.stringify({rate:{id:rateId}})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){await svc.entities.JobReturnShipment.update(quote.id,{status:'purchase_review',error:'Purchase response '+response.status});return fail('Label purchase not confirmed. Check EasyPost before retrying; no automatic retry.',502)}
  const label=data.postage_label?.label_url||data.postage_label?.label_pdf_url||'';
  const shippingAmount=Number(data.selected_rate?.rate||0);
  await svc.entities.JobReturnShipment.update(quote.id,{status:'purchased',carrier:data.selected_rate?.carrier||'',service:data.selected_rate?.service||'',rate_amount:shippingAmount,tracking_code:data.tracking_code||'',label_url:label,purchased_at:new Date().toISOString()});
  // A purchased label is the source of truth. Add its actual cost to the linked
  // estimate's shipping line exactly once, without resetting existing shipping.
  let estimateUpdated=false,estimateWarning='';
  if(job.estimate_id){
   try{
    const estimate=rows(await svc.entities.Estimate.filter({id:job.estimate_id}))[0];
    if(estimate){
     const marker='[EasyPost return label '+quote.id+']';
     if(!String(estimate.internal_notes||'').includes(marker)){
      const existingShipping=Number(estimate.shipping_cost)||0;
      const nextShipping=Math.round((existingShipping+shippingAmount)*100)/100;
      const existingTotal=Number(estimate.total);
      const nextTotal=Number.isFinite(existingTotal)?Math.round((existingTotal+shippingAmount)*100)/100:null;
      const tracking=data.tracking_code||'Pending';
      const note=marker+' '+(data.selected_rate?.carrier||'')+' '+(data.selected_rate?.service||'')+' | Tracking: '+tracking+' | Shipping: $'+shippingAmount.toFixed(2);
      const patch:any={shipping_cost:nextShipping,internal_notes:[estimate.internal_notes,note].filter(Boolean).join('\n')};
      if(nextTotal!==null){
       patch.total=nextTotal;
       const paid=Number(estimate.amount_paid)||0;
       patch.amount_due=Math.max(0,Math.round((nextTotal-paid)*100)/100);
      }
      await svc.entities.Estimate.update(estimate.id,patch);
     }
     estimateUpdated=true;
    }else estimateWarning='Linked estimate not found';
   }catch(error){console.error('[jobReturnShipping] Estimate shipping sync failed',error);estimateWarning='Shipping label purchased, but estimate shipping could not be updated';}
  }else estimateWarning='Job has no linked estimate';
  return Response.json({success:true,label_url:label,tracking_code:data.tracking_code||'',estimate_updated:estimateUpdated,estimate_warning:estimateWarning});
 }
 return fail('Invalid action');
 }catch(e){console.error('[jobReturnShipping]',String(e?.message||e));return fail('Shipping request failed; check shipping history before retrying',503)}
}
