import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
const rows=x=>Array.isArray(x)?x:(x?.items||[]);
const fail=(error,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
const cents=n=>Math.round(Number(n)*100);
const money=n=>Math.round(n)/100;
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'')&&!Number.isNaN(Date.parse(x+'T12:00:00Z'));
export default async function(req){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const api=createClientFromRequest(req),user=await api.auth.me().catch(()=>null);
  if(!user?.email)return fail('Sign in required',401);
  const email=String(user.email).trim().toLowerCase();
  const profiles=rows(await api.asServiceRole.entities.HRWorker.filter({email}));
  if(profiles.length>1)return fail('Duplicate owner identity',409);
  const mine=profiles[0];
  const owner=mine?.worker_type==='owner'&&mine?.access_level==='owner'&&mine?.status==='active';
  const admin=user.role==='admin';
  if(!owner)return fail('Active owner profile required',403);
  const body=await req.json().catch(()=>({}));
  if(body.action==='record'){
   if(!admin)return fail('Administrator required to record distributions',403);
   if(!['declaration','payment'].includes(body.kind))return fail('Invalid entry type');
   const id=String(body.owner_id||'');
   const selected=rows(await api.asServiceRole.entities.HRWorker.filter({id}));
   if(selected.length!==1||selected[0].worker_type!=='owner'||selected[0].access_level!=='owner'||selected[0].status!=='active')return fail('Active owner not found',404);
   const amount=Number(body.amount),date=String(body.date||'');
   if(!Number.isFinite(amount)||amount<=0||cents(amount)!==amount*100||amount>100000000||!validDate(date))return fail('Valid date and positive dollar amount (two decimals maximum) required');
   const notes=String(body.notes||'').slice(0,500);
   if(body.kind==='declaration'){
    const pct=Number(selected[0].ownership_percentage);
    if(!Number.isFinite(pct)||pct<0||pct>100)return fail('Set a valid ownership percentage first');
    await api.asServiceRole.entities.HROwnerDistribution.create({owner_id:id,declaration_date:date,amount,ownership_percentage_at_declaration:pct,notes});
   }else{
    await api.asServiceRole.entities.HROwnerPayout.create({owner_id:id,paid_date:date,amount,method:String(body.method||'').slice(0,80),reference:String(body.reference||'').slice(0,120),notes});
   }
   return Response.json({success:true},{headers:{'Cache-Control':'no-store'}});
  }
  if(body.action!=='dashboard')return fail('Invalid action');
  // Owners see their own data, never records for other owners.
  const [declarations,payments]=await Promise.all([
   api.asServiceRole.entities.HROwnerDistribution.filter({owner_id:mine.id}),
   api.asServiceRole.entities.HROwnerPayout.filter({owner_id:mine.id})
  ]);
  const declared=rows(declarations).map(d=>({id:d.id,date:d.declaration_date,amount:Number(d.amount)||0,notes:d.notes||'',ownership_percentage_at_declaration:d.ownership_percentage_at_declaration}));
  const paid=rows(payments).map(p=>({id:p.id,date:p.paid_date,amount:Number(p.amount)||0,method:p.method||'',reference:p.reference||'',notes:p.notes||''}));
  const total=items=>money(items.reduce((sum,x)=>sum+cents(x.amount),0));
  const years=[...new Set([...declared,...paid].map(x=>String(x.date||'').slice(0,4)))].sort().reverse();
  const yearly=years.map(year=>({year,declared:total(declared.filter(x=>x.date?.startsWith(year))),received:total(paid.filter(x=>x.date?.startsWith(year)))}));
  const result={owner:{name:[mine.first_name,mine.last_name].filter(Boolean).join(' '),ownership_percentage:mine.ownership_percentage??null},total_declared:total(declared),total_received:total(paid),yearly,declared:declared.sort((a,b)=>b.date.localeCompare(a.date)),payments:paid.sort((a,b)=>b.date.localeCompare(a.date))};
  if(admin){
   const all=rows(await api.asServiceRole.entities.HRWorker.filter({worker_type:'owner'}));
   result.owners=all.filter(w=>w.status==='active').map(w=>({id:w.id,name:[w.first_name,w.last_name].filter(Boolean).join(' '),ownership_percentage:w.ownership_percentage??null}));
  }
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('[ownerEarnings]',e?.message);return fail('Unable to process owner earnings',500)}
}
