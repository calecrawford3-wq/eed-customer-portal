import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
// Legal documents are stored in this app and fetched directly by its public/legal viewer.
export default async function(req:Request) {
  try {
    if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    if(user?.role!=='admin')return Response.json({error:'Admin only'},{status:403});
    const {legalDocumentId}=await req.json();
    if(!legalDocumentId)return Response.json({error:'Legal document ID required'},{status:400});
    const res=await base44.asServiceRole.entities.LegalDocument.filter({id:legalDocumentId});
    const doc=(res?.items||res||[])[0];
    if(!doc)return Response.json({error:'Legal document not found'},{status:404});
    return Response.json({success:true,local:true});
  }catch{return Response.json({error:'Unable to prepare legal document'},{status:500});}
}
