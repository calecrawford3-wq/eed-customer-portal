import {createClientFromRequest} from 'npm:@base44/sdk';
import {newHeadCode,newCaseCode,newTagCode,createInitialTagVersion} from '../../shared/engineIdentity.ts';
import {recordIdentityEvent,syncSerializedCoreQuantity} from '../../shared/identityAudit.ts';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
Deno.serve(async req=>{try{
 const base44=createClientFromRequest(req);const me=await base44.auth.me();if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});const body=await req.json(),service=base44.asServiceRole,raw=String(body.code||'').trim().toUpperCase();if(!raw)return Response.json({error:'Tag/identity code required'},{status:400});
 const [eTag,eId,cTag,cId,tags]=await Promise.all([service.entities.CustomerEngine.filter({tag_code:raw}),service.entities.CustomerEngine.filter({eed_id:raw}),service.entities.EngineComponent.filter({tag_code:raw}),service.entities.EngineComponent.filter({component_code:raw}),service.entities.IdentityTagVersion.filter({tag_code:raw})]);
 if(rows(eTag).length||rows(eId).length||rows(cTag).length||rows(cId).length||rows(tags).length)return Response.json({error:'That identity or tag token already exists in Elite.'},{status:409});
 const type=body.component_type;if(!['cylinder_head','engine_case'].includes(type))return Response.json({error:'Choose cylinder head or engine case.'},{status:400});
 let componentCode='',tagCode='';
 if(type==='cylinder_head'){componentCode=/^HD-\d{6}$/.test(raw)?raw:await newHeadCode(service);tagCode=/^HEAD-[A-Z0-9-]+$/.test(raw)?raw:await newTagCode(service,'HEAD');}
 else {componentCode=/^CS-\d{6}$/.test(raw)?raw:await newCaseCode(service);tagCode=/^CASE-[A-Z0-9-]+$/.test(raw)?raw:await newTagCode(service,'CASE');}
 const component=await service.entities.EngineComponent.create({component_code:componentCode,component_type:type,tag_code:tagCode,physical_serial_number:body.physical_serial_number||'',platform_id:body.platform_id||'',current_customer_engine_id:'',origin_customer_engine_id:'',status:'unpaired',lifecycle_status:'spare',engine_core_id:body.engine_core_id||'',inventory_state:body.engine_core_id?'in_stock':'not_inventory',core_credit_value:Number(body.core_credit_value)||0,storage_location:body.storage_location||'',notes:body.notes||'Created from unknown Elite tag scan'});
 const tag=await createInitialTagVersion(service,{component});const updated=await service.entities.EngineComponent.update(component.id,{current_tag_version_id:tag.id});if(body.engine_core_id)await syncSerializedCoreQuantity(service,body.engine_core_id);
 await recordIdentityEvent(service,{eventType:'unknown_tag_created',componentId:component.id,componentCode:component.component_code,eventKey:`unknown_created:${component.id}`,details:{scanned_code:raw,component_type:type},actor:me?.full_name||me?.email||'Admin',dedupeSeconds:0});
 return Response.json({success:true,component:updated,tag_version:tag});
}catch(e){return Response.json({error:e.message},{status:400});}});
