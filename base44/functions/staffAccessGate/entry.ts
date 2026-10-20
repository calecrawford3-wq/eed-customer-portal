import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
const rows=x=>Array.isArray(x)?x:(x?.items||[]);
export default async function(req){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{
  const api=createClientFromRequest(req),user=await api.auth.me().catch(()=>null);
  if(!user?.email)return Response.json({access:'unauthenticated'},{headers:{'Cache-Control':'no-store'}});
  const email=String(user.email).trim().toLowerCase();
  const [company,personal]=await Promise.all([api.asServiceRole.entities.HRWorker.filter({email}),api.asServiceRole.entities.HRWorker.filter({personal_email:email})]);
  const c=rows(company),p=rows(personal);
  // Deny ambiguous identities rather than granting any workspace access.
  let access='normal';
  if(c.length>1||p.length>1)access='blocked';
  else if(c.some(w=>w.status==='terminated'))access='blocked';
  else if(p.some(w=>w.status==='terminated'))access=user.role==='admin'?'blocked':'tax_only';
  else if(c.some(w=>w.worker_type==='owner'&&user.role!=='admin'))access='blocked';
  const activeCompany=c.length===1&&c[0].status==='active'?c[0]:null;
  const destination=access==='tax_only'?'/FormerEmployeeTaxPortal':access==='blocked'?'/PortalAccess?mode=signin':user.role==='admin'?'/Dashboard':activeCompany?'/EmployeePortal':'/CustomerPortal';
  const allowed_pages=access==='normal'&&activeCompany&&user.role!=='admin'&&activeCompany.worker_type!=='owner'?Array.isArray(activeCompany.allowed_pages)?activeCompany.allowed_pages.filter(p=>typeof p==='string'):[]:[];
  return Response.json({access,destination,allowed_pages},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('[staffAccessGate]',e?.message);return Response.json({access:'blocked'},{headers:{'Cache-Control':'no-store'}})}
}
