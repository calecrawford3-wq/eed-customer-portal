import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
const rows=x=>Array.isArray(x)?x:(x?.items||[]);
const fail=(error,status=400)=>Response.json({error},{status});
export default async function(req){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const api=createClientFromRequest(req);
  const user=await api.auth.me().catch(()=>null);
  if(user?.role!=='admin')return fail('Owner access required',403);
  const body=await req.json().catch(()=>({}));
  if(typeof body.worker_id!=='string')return fail('Select an employee');
  const matches=rows(await api.asServiceRole.entities.HRWorker.filter({id:body.worker_id}));
  if(matches.length!==1)return fail('Employee not found',404);
  const worker=matches[0];
  if(worker.worker_type==='owner'||worker.access_level==='owner')return fail('Owners require the separate full-access owner invitation',409);
  const email=String(worker.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail('Employee needs a valid email');
  if(worker.status==='inactive')return fail('Activate the employee before sending an invite',409);
  const same=rows(await api.asServiceRole.entities.HRWorker.filter({email}));
  if(same.length!==1||same[0].id!==worker.id)return fail('Duplicate employee email; resolve before inviting',409);
  const invite=typeof api.asServiceRole?.users?.inviteUser==='function'?api.asServiceRole.users.inviteUser.bind(api.asServiceRole.users):typeof api.users?.inviteUser==='function'?api.users.inviteUser.bind(api.users):typeof api.auth?.inviteUser==='function'?api.auth.inviteUser.bind(api.auth):null;
  if(!invite)return fail('Base44 account invitation is unavailable. Configure user invitations in Base44.',502);
  try{await invite(email,'user')}catch(e){const status=e.status||e.response?.status;if(status!==409&&!(status===400&&/already (exists|invited|registered)/i.test(e.message||'')))return fail('Base44 user invitation failed. Check user invitations in Base44.',502)}
  const origin=new URL(Deno.env.get('PORTAL_BASE_URL')||'https://portal.eedpower.com');
  if(origin.protocol!=='https:')return fail('Portal URL must use HTTPS',503);
  const url=new URL('/PortalAccess',origin.origin);
  url.searchParams.set('mode','activate');
  url.searchParams.set('next','/StaffWorkspace');
  const name=[worker.first_name,worker.last_name].filter(Boolean).join(' ');
  const result=await api.functions.invoke('sendSmtpEmail',{
   to:email,subject:'Your Elite Employee Workspace Invitation',
   text:`Hello ${name},\n\nYou've been invited to the Elite Engine Development employee workspace.\n\nActivate your account: ${url.href}\n\nUse your invited email address (${email}), create a password and complete email verification. If you already have an Elite account, choose Sign In instead.\n\nYour access is limited to the permissions assigned by the owner. You can view your employee information and any approved shop tools.\n\nElite Engine Development`,
   html:`<p>Hello ${name.replace(/[&<>"]/g,'')},</p><p>You've been invited to the Elite Engine Development employee workspace.</p><p><a href="${url.href}">Activate Employee Account</a></p><p>Use your invited email, set a password, and verify your email. If you already have an account, choose Sign In.</p><p>Your access is limited to the permissions assigned by the owner.</p>`,usePOSmtp:false
  });
  if(result?.data?.error||result?.error||result?.data?.success!==true)return fail('Base44 invitation succeeded, but invitation email delivery was not confirmed',502);
  await api.asServiceRole.entities.HRWorker.update(worker.id,{portal_invite_sent_at:new Date().toISOString()});
  return Response.json({success:true,message:'Employee account invitation sent.'});
 }catch(e){console.error('[sendEmployeeInvite]',e?.message);return fail('Unable to send employee invitation',500)}
}
