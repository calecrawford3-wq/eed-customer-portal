import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {turn14Request,itemArray} from '../../shared/turn14.ts';
const allowed=new Set(['items','pricing','inventory']);
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const sdk=createClientFromRequest(req);
 const user=await sdk.auth.me().catch(()=>null);
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json().catch(()=>({}));
 const feed=String(body.feed||'');const page=Number(body.page||1);
 if(!allowed.has(feed)||!Number.isInteger(page)||page<1||page>100000)return Response.json({error:'Invalid feed or page'},{status:400});
 // Read-only, single-page bounded diagnostic. No background loops, purchases or mass imports.
 const run=await sdk.asServiceRole.entities.Turn14FeedRun.create({feed,mode:'manual_page_preview',status:'running',page,started_at:new Date().toISOString(),requested_by:user.email||'',test_environment:true});
 try{
  const result=await turn14Request(`/v1/${feed}?page=${page}`);
  const rows=itemArray(result);
  const sample=rows.slice(0,5).map((x:any)=>({id:String(x.id||''),part_number:String(x.attributes?.part_number||''),brand_id:String(x.attributes?.brand_id||'')}));
  await sdk.asServiceRole.entities.Turn14FeedRun.update(run.id,{status:'success',rows_received:rows.length,total_pages:Number(result.meta?.total_pages||0),finished_at:new Date().toISOString()});
  return Response.json({success:true,feed,page,rows_received:rows.length,total_pages:Number(result.meta?.total_pages||0),sample,test_environment:true});
 }catch(e){
  const message=String(e?.message||'Feed failed').slice(0,250);
  await sdk.asServiceRole.entities.Turn14FeedRun.update(run.id,{status:'failed',error:message,finished_at:new Date().toISOString()});
  return Response.json({error:message,feed,page,stopped:true},{status:502});
 }
}
