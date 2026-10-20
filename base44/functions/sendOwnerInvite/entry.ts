import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
const rows=x=>Array.isArray(x)?x:(x?.items||[]);
const fail=(error,status=400)=>Response.json({error},{status});
export default async function(req){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const api=createClientFromRequest(req);
  const actor=await api.auth.me().catch(()=>null);
  if(actor?.role!=='admin')return fail('Existing administrator required',403);
  const body=await req.json().catch(()=>({}));
  if(body.confirm_full_owner_access!==true)return fail('Explicit confirmation of unrestricted owner access required');
  if(typeof body.worker_id!=='string')return fail('Select an owner');
  const owners=rows(await api.asServiceRole.entities.HRWorker.filter({worker_type:'owner'}));
  // Once a designated owner is present, only a matching ACTIVE owner with a
  // platform admin account can grant another owner unrestricted access.
  const actorEmail=String(actor.email||'').trim().toLowerCase();
  const authorized=owners.length===0||owners.some(w=>w.status==='active'&&String(w.email||'').trim().toLowerCase()===actorEmail);
  if(!authorized)return fail('Only a designated owner can invite another owner',403);
  const found=rows(await api.asServiceRole.entities.HRWorker.filter({id:body.worker_id}));
  if(found.length!==1)return fail('Owner profile not found',404);
  const owner=found[0];
  if(owner.worker_type!=='owner'||owner.access_level!=='owner'||owner.status!=='active')return fail('Owner profile must be active and designated as owner',409);
  const email=String(owner.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail('Owner email is invalid');
  const matches=rows(await api.asServiceRole.entities.HRWorker.filter({email}));
  if(matches.length!==1||matches[0].id!==owner.id)return fail('Duplicate owner email',409);
  const invite=typeof api.asServiceRole?.users?.inviteUser==='function'?api.asServiceRole.users.inviteUser.bind(api.asServiceRole.users):typeof api.users?.inviteUser==='function'?api.users.inviteUser.bind(api.users):typeof api.auth?.inviteUser==='function'?api.auth.inviteUser.bind(api.auth):null;
  if(!invite)return fail('Base44 administrator invitations are not available. Configure manually in Base44.',502);
  try{await invite(email,'admin')}catch(e){
   const status=e.status||e.response?.status;
   if(status!==409&&!(status===400&&/already (exists|invited|registered)/i.test(e.message||'')))return fail('Base44 did not confirm an administrator invitation. Check Base44 user management.',502);
   return fail('This account already exists or was invited. Verify or promote its administrator role in Base44 user management; do not assume full access.',409);
  }
  const origin=new URL(Deno.env.get('PORTAL_BASE_URL')||'https://portal.eedpower.com');
  if(origin.protocol!=='https:')return fail('Invalid portal origin',503);
  const url=new URL('/PortalAccess',origin.origin);
  url.searchParams.set('mode','activate');url.searchParams.set('next','/StaffWorkspace');
  const result=await api.functions.invoke('sendSmtpEmail',{
   to:email,subject:'Elite Engine Development Owner Access Invitation',
   text:`You have been invited as an owner with unrestricted administrative access to Elite Engine Development. This includes financials, employee information, settings, and build profitability.\n\nActivate your account using your invited email: ${url.href}\n\nVerify your email and sign in. If you already have an account, confirm your administrator role in Base44.\n\nIf you did not expect this invitation, contact the current owner.`,
   html:`<p>You have been invited as an Elite Engine Development owner with unrestricted administrative access, including HR, finances, and build profitability.</p><p><a href="${url.href}">Activate Owner Account</a></p><p>Verify your email and sign in. If you did not expect this invitation, contact the current owner.</p>`,
   usePOSmtp:false
  });
  if(result?.data?.error||result?.error||result?.data?.success!==true)return fail('Administrator invitation was requested, but email delivery was not confirmed. Check Base44 user management.',502);
  await api.asServiceRole.entities.HRWorker.update(owner.id,{portal_invite_sent_at:new Date().toISOString()});
  return Response.json({success:true,message:'Owner administrator invitation sent. Verify the admin role in Base44 before treating access as active.'});
 }catch(e){console.error('[sendOwnerInvite]',e?.message);return fail('Owner invitation failed',500)}
}
