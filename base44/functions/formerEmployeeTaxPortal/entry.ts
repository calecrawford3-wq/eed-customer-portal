import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
const rows=x=>Array.isArray(x)?x:(x?.items||[]);
const fail=(error,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const api=createClientFromRequest(req);
  const user=await api.auth.me().catch(()=>null);
  if(!user?.email)return fail('Sign in required',401);
  const email=String(user.email).trim().toLowerCase();
  const matches=rows(await api.asServiceRole.entities.HRWorker.filter({personal_email:email}));
  if(matches.length!==1)return fail('No unique former employee profile for this email',403);
  const worker=matches[0];
  if(worker.status!=='terminated'||worker.worker_type==='owner')return fail('Former employee tax-only access is not available',403);
  if(email===String(worker.email||'').trim().toLowerCase())return fail('Use your personal email, not company login',403);
  const body=await req.json().catch(()=>({}));
  if(body.action!=='documents'&&body.action!=='identity'&&body.action!==undefined)return fail('Unsupported action',400);
  const tax=body.action==='identity'?[]:rows(await api.asServiceRole.entities.HRTaxDocument.filter({worker_id:worker.id}));
  return Response.json({former_employee:true,worker:{first_name:worker.first_name,last_name:worker.last_name,personal_email:email},tax:tax.filter(t=>t.status==='issued'||t.status==='received').map(t=>({id:t.id,tax_year:t.tax_year,document_type:t.document_type,status:t.status,document_url:t.document_url||''}))},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('[formerEmployeeTaxPortal]',e?.message);return fail('Tax documents unavailable',500)}
}
