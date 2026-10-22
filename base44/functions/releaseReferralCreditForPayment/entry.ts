import { createClientFromRequest } from "npm:@base44/sdk";
import { activateReferralCreditsForEnginePayment } from "../../shared/referralCredits.ts";
Deno.serve(async req => {
  if(req.method!=="POST") return Response.json({error:"Method not allowed"},{status:405});
  try {
    const base44=createClientFromRequest(req); const me=await base44.auth.me();
    if(me?.role!=="admin") return Response.json({error:"Admin access required"},{status:403});
    const {invoice_id}=await req.json();
    const invoice=(await base44.asServiceRole.entities.Invoice.filter({id:invoice_id}))?.[0];
    if(!invoice) return Response.json({error:"Invoice not found"},{status:404});
    if(Number(invoice.amount_paid||0)<=0) return Response.json({success:true,activated:0});
    const result=await activateReferralCreditsForEnginePayment(base44,invoice.customer_id,invoice);
    return Response.json({success:true,...result});
  }catch(e){return Response.json({error:e.message},{status:400});}
});
