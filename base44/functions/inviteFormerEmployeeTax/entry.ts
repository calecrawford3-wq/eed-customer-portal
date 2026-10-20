import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
const rows=x=>Array.isArray(x)?x:(x?.items||[]);
const fail=(error,status=400)=>Response.json({error},{status});
export default async function(req){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const api=createClientFromRequest(req);
  const actor=await api.auth.me().catch(()=>null);
  if(actor?.role!=='admin')return fail('HR administrator required',403);
  const body=await req.json().catch(()=>({}));
  if(!body.confirm_company_account_disabled)return fail('Confirm the former employee company login is disabled in Base44 before inviting',409);
  if(typeof body.worker_id!=='string')return fail('Select a former employee');
  const found=rows(await api.asServiceRole.entities.HRWorker.filter({id:body.worker_id}));
  if(found.length!==1)return fail('Employee not found',404);
  const w=found[0];
  if(w.status!=='terminated'||w.worker_type==='owner')return fail('Only terminated non-owner employees can receive tax-only invitations',409);
  const email=String(w.personal_email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email===String(w.email||'').trim().toLowerCase())return fail('Valid distinct personal email required');
  const duplicate=rows(await api.asServiceRole.entities.HRWorker.filter({personal_email:email}));
  if(duplicate.length!==1||duplicate[0].id!==w.id)return fail('Personal email is shared by multiple HR profiles',409);
  const invite=typeof api.asServiceRole?.users?.inviteUser==='function'?api.asServiceRole.users.inviteUser.bind(api.asServiceRole.users):typeof api.users?.inviteUser==='function'?api.users.inviteUser.bind(api.users):typeof api.auth?.inviteUser==='function'?api.auth.inviteUser.bind(api.auth):null;
  if(!invite)return fail('Base44 user invitation unavailable',502);
  try{await invite(email,'user')}catch(e){
   const status=e.status||e.response?.status;
   if(status!==409&&!(status===400&&/already (exists|invited|registered)/i.test(e.message||'')))return fail('Personal email account invitation failed',502);
   return fail('Personal email account already exists or is invited. Verify it has only a user role in Base44 before granting access.',409);
  }
  const url=new URL('/PortalAccess','https://portal.eedpower.com');
  url.searchParams.set('mode','activate');url.searchParams.set('next','/FormerEmployeeTaxPortal');
  const result=await api.functions.invoke('sendSmtpEmail',{
   to:email,subject:'Elite Engine Development - Former Employee Tax Documents',
   text:`Hello ${w.first_name||''},\n\nYour former employee tax document portal is available using your PERSONAL email: ${email}. Activate your tax-only account: ${url.href}\n\nThis account does not provide access to company systems.\n\nElite Engine Development`,
   html:`<p>Your former employee tax-only account is available. Sign in with your personal email.</p><p><a href="${url.href}">Activate Tax Document Access</a></p><p>This account does not provide access to company systems.</p>`,
   usePOSmtp:false
  });
  if(result?.data?.error||result?.error||result?.data?.success!==true)return fail('Invitation requested, but delivery could not be confirmed',502);
  await api.asServiceRole.entities.HRWorker.update(w.id,{former_employee_invite_sent_at:new Date().toISOString()});
  return Response.json({success:true,message:'Personal email tax-only invitation sent. Verify the company login was disabled in Base44.'});
 }catch(e){console.error('[inviteFormerEmployeeTax]',e?.message);return fail('Unable to invite former employee',500)}
}
