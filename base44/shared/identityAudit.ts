const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
export async function recordIdentityEvent(service:any,{eventType,engineId='',componentId='',componentCode='',jobId='',eventKey='',details={},actor='Admin',dedupeSeconds=45}:any){
 const occurred_at=new Date().toISOString();
 const key=eventKey||[eventType,engineId,componentId,jobId,JSON.stringify(details||{})].join(':');
 if(dedupeSeconds>0){
  const prior=rows(await service.entities.EngineIdentityEvent.filter({event_key:key},'-occurred_at',5))[0];
  if(prior?.occurred_at&&Date.now()-new Date(prior.occurred_at).getTime()<dedupeSeconds*1000)return prior;
 }
 return service.entities.EngineIdentityEvent.create({event_type:eventType,customer_engine_id:engineId,component_id:componentId,component_code:componentCode,job_id:jobId,event_key:key,occurred_at,actor,details});
}
export async function invalidateEngineVerification(service:any,{engineId,componentId='',jobId='',reason,actor='Admin'}:any){
 if(!engineId)return;
 const now=new Date().toISOString();
 await service.entities.CustomerEngine.update(engineId,{verification_invalidated_at:now,verification_invalidation_reason:reason});
 if(componentId){try{await service.entities.EngineComponent.update(componentId,{verification_invalidated_at:now,verification_invalidation_reason:reason});}catch{}}
 const verifications=rows(await service.entities.JobComponentVerification.filter({customer_engine_id:engineId},'-verified_at',100));
 for(const v of verifications.filter((x:any)=>!x.invalidated_at&&(x.status==='passed'||x.status==='head_repaired'))){
  await service.entities.JobComponentVerification.update(v.id,{invalidated_at:now,invalidation_reason:reason});
 }
 await recordIdentityEvent(service,{eventType:'verification_invalidated',engineId,componentId,jobId,eventKey:`verification_invalidated:${engineId}:${now}`,details:{reason},actor,dedupeSeconds:0});
}
export async function syncSerializedCoreQuantity(service:any,coreId:string){
 if(!coreId)return 0;
 const units=rows(await service.entities.EngineComponent.filter({engine_core_id:coreId}));
 const count=units.filter((u:any)=>u.inventory_state==='in_stock'&&!['retired','scrapped'].includes(u.lifecycle_status||'')).length;
 const core=rows(await service.entities.EngineCore.filter({id:coreId}))[0];
 if(core?.serialized_tracking_enabled)await service.entities.EngineCore.update(coreId,{quantity_on_hand:count});
 return count;
}
