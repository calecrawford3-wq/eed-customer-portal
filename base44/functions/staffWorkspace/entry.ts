import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
const rows=x=>Array.isArray(x)?x:(x?.items||[]);
const reply=(error,status)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
const normalize=e=>String(e||'').trim().toLowerCase();
export default async function(req){
 if(req.method!=='POST')return reply('Method not allowed',405);
 try{
  const api=createClientFromRequest(req);
  const user=await api.auth.me().catch(()=>null);
  if(!user?.email)return reply('Sign in required',401);
  const email=normalize(user.email);
  const body=await req.json().catch(()=>({}));
  const matches=rows(await api.asServiceRole.entities.HRWorker.filter({email}));
  if(matches.length>1)return reply('Duplicate employee accounts; contact owner',409);
  const worker=matches[0];
  if(worker?.status==='terminated')return reply('Former employees may only access tax documents using their personal email',403);
  const isOwner=user.role==='admin';
  if(!isOwner&&(!worker||worker.status!=='active'))return reply('Your employee account is not active',403);
  if(body.action==='identity'||!body.action){
   return Response.json({is_owner:isOwner,worker:worker?{id:worker.id,first_name:worker.first_name,last_name:worker.last_name,job_title:worker.job_title,access_level:worker.access_level,status:worker.status}:null,permissions:{view_jobs:isOwner||worker?.can_view_shop_jobs===true,view_profitability:isOwner,manage_hr:isOwner},workspace:isOwner?'/Dashboard':worker?.can_view_shop_jobs===true?'/StaffWorkspace':'/EmployeePortal'},{headers:{'Cache-Control':'no-store'}});
  }
  if(body.action==='jobs'){
   if(!isOwner&&worker?.can_view_shop_jobs!==true)return reply('Shop job access not granted',403);
   // Only an explicit operational allowlist is returned. NEVER send raw Job
   // entities, profitability snapshots, costs, financial fields or private notes.
   const records=rows(await api.asServiceRole.entities.Job.list('-created_date',150));
   return Response.json({jobs:records.map(j=>({id:j.id,job_number:j.job_number,stage:j.stage,blocking_condition:j.blocking_condition,secondary_tags:j.secondary_tags,service_package:j.service_package,is_engine_build:j.is_engine_build,customer_engine_id:j.customer_engine_id}))},{headers:{'Cache-Control':'no-store'}});
  }
  return reply('Unsupported action',400);
 }catch(e){console.error('[staffWorkspace]',e?.message);return reply('Unable to load staff workspace',500)}
}
