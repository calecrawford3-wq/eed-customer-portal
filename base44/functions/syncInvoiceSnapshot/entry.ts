import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
// Compatibility endpoint for existing staff actions. Data already lives in this app.
export default async function(req:Request) {
  try {
    if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    if(user?.role!=='admin')return Response.json({error:'Admin only'},{status:403});
    const {invoiceId,publicAccessToken}=await req.json();
    if(!invoiceId||!publicAccessToken)return Response.json({error:'Invoice ID and token required'},{status:400});
    const res=await base44.asServiceRole.entities.Invoice.filter({id:invoiceId});
    const doc=(res?.items||res||[])[0];
    if(!doc||doc.public_access_token!==publicAccessToken)return Response.json({error:'Invoice token does not match'},{status:404});
    return Response.json({success:true,viewerLink:'https://portal.eedpower.com/invoice/'+encodeURIComponent(publicAccessToken)});
  }catch{return Response.json({error:'Unable to prepare invoice viewer'},{status:500});}
}
