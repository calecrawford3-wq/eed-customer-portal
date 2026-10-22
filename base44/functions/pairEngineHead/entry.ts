import {createClientFromRequest} from 'npm:@base44/sdk';
import {pairHead} from '../../shared/engineIdentity.ts';
import {invalidateEngineVerification,recordIdentityEvent,syncSerializedCoreQuantity} from '../../shared/identityAudit.ts';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
Deno.serve(async req=>{try{
 const base44=createClientFromRequest(req);const me=await base44.auth.me();if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});const body=await req.json();const service=base44.asServiceRole;
 if(body.action==='delete_auto_created'){
  const engine=rows(await service.entities.CustomerEngine.filter({id:body.customer_engine_id}))[0];if(!engine)return Response.json({error:'Engine not found'},{status:404});
  const headId=body.component_id||engine.current_head_component_id;if(!headId)return Response.json({error:'No head is currently assigned to this engine.'},{status:400});
  const head=rows(await service.entities.EngineComponent.filter({id:headId}))[0];if(!head||head.component_type!=='cylinder_head')return Response.json({error:'Cylinder head not found'},{status:404});
  if(head.origin_customer_engine_id!==engine.id)return Response.json({error:'Only the automatically created original head can be deleted here. Use the normal remove/unpair workflow for transferred or inventory heads.'},{status:400});
  if(head.engine_core_id||head.active_repair_ticket_id||head.acquired_job_id||head.acquired_from_customer_id)return Response.json({error:'This head has inventory, repair, or acquisition history and cannot be deleted. Remove it to inventory instead.'},{status:400});
  const pairings=rows(await service.entities.EngineComponentPairing.filter({component_id:head.id}));
  if(pairings.some((p:any)=>p.customer_engine_id!==engine.id||p.reason_code!=='initial'))return Response.json({error:'This head has pairing history beyond its initial automatic assignment and cannot be deleted.'},{status:400});
  const specs=rows(await service.entities.EngineComponentSpecSheet.filter({component_id:head.id}));
  if(specs.length)return Response.json({error:'This head already has a spec sheet and cannot be deleted. Unpair or remove it instead.'},{status:400});
  const tags=rows(await service.entities.IdentityTagVersion.filter({component_id:head.id}));
  await service.entities.CustomerEngine.update(engine.id,{current_head_component_id:''});
  for(const p of pairings)await service.entities.EngineComponentPairing.delete(p.id);
  for(const t of tags)await service.entities.IdentityTagVersion.delete(t.id);
  await service.entities.EngineComponent.delete(head.id);
  await recordIdentityEvent(service,{eventType:'pair_changed',engineId:engine.id,componentId:'',componentCode:head.component_code,jobId:body.job_id||'',eventKey:`delete-auto-head:${engine.id}:${head.id}`,details:{action:'delete_auto_created_head',reason:'Engine checked in without a cylinder head'},actor:me?.full_name||me?.email||'Admin',dedupeSeconds:0});
  return Response.json({success:true,deleted:true,component_code:head.component_code});
 }
 if(body.action==='unpair'){
  const engine=rows(await service.entities.CustomerEngine.filter({id:body.customer_engine_id}))[0];if(!engine)return Response.json({error:'Engine not found'},{status:404});const now=new Date().toISOString();
  if(engine.current_head_component_id){const head=rows(await service.entities.EngineComponent.filter({id:engine.current_head_component_id}))[0];const active=rows(await service.entities.EngineComponentPairing.filter({customer_engine_id:engine.id,status:'active',component_type:'cylinder_head'}));for(const p of active)await service.entities.EngineComponentPairing.update(p.id,{status:'historical',unpaired_at:now,reason_code:body.reason_code||'other',reason_note:body.reason||'Head unpaired'});await service.entities.EngineComponent.update(engine.current_head_component_id,{current_customer_engine_id:'',status:'unpaired',inventory_state:head?.engine_core_id?'in_stock':(head?.inventory_state||'not_inventory'),lifecycle_status:head?.engine_core_id?'spare':(head?.lifecycle_status||'active')});await service.entities.CustomerEngine.update(engine.id,{current_head_component_id:''});await invalidateEngineVerification(service,{engineId:engine.id,componentId:head?.id||'',jobId:body.job_id||'',reason:`Head unpaired: ${body.reason_code||'other'}`});await recordIdentityEvent(service,{eventType:'pair_changed',engineId:engine.id,componentId:head?.id||'',componentCode:head?.component_code||'',jobId:body.job_id||'',eventKey:`unpair:${engine.id}:${now}`,details:{action:'unpair',reason_code:body.reason_code||'other',reason:body.reason||''},dedupeSeconds:0});if(head?.engine_core_id)await syncSerializedCoreQuantity(service,head.engine_core_id);}
  return Response.json({success:true,unpaired:true});
 }
 if(!body.reason_code)return Response.json({error:'A re-pair reason is required.'},{status:400});
 const result=await pairHead(service,{componentId:body.component_id,engineId:body.customer_engine_id,jobId:body.job_id||'',reason:body.reason||'',reasonCode:body.reason_code,allowTransfer:!!body.allow_transfer,actor:me?.full_name||me?.email||'Admin'});return Response.json({success:true,...result});
}catch(e){return Response.json({error:e.message,code:e.code,current_engine:e.current_engine},{status:e.code==='PAIRING_CONFLICT'?409:400});}});
