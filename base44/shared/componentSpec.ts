const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
const cleanArray=(value:any)=>{if(Array.isArray(value))return value.map(String).map(v=>v.trim()).filter(Boolean);return String(value||'').split(/[,;\n]+/).map(v=>v.trim()).filter(Boolean);};
const uniq=(a:any[]=[])=>[...new Set(a.filter(Boolean).map(String))];
export async function getOrCreateComponentSpec(service:any,component:any){
 const existing=rows(await service.entities.EngineComponentSpecSheet.filter({component_id:component.id}))[0];if(existing)return existing;
 return service.entities.EngineComponentSpecSheet.create({component_id:component.id,component_code:component.component_code,component_type:component.component_type,platform_id:component.platform_id||'',valve_job_type:'unknown',valve_seats_replaced:[],valve_guides_replaced:[],updated_at:new Date().toISOString(),updated_by:'Elite'});
}
export async function patchComponentSpec(service:any,component:any,patch:any,user='Elite'){
 const spec=await getOrCreateComponentSpec(service,component),now=new Date().toISOString();
 const next={...patch,component_code:component.component_code,component_type:component.component_type,platform_id:component.platform_id||spec.platform_id||'',updated_at:now,updated_by:user};
 if(patch.valve_seats_replaced)next.valve_seats_replaced=uniq([...(spec.valve_seats_replaced||[]),...cleanArray(patch.valve_seats_replaced)]);
 if(patch.valve_guides_replaced)next.valve_guides_replaced=uniq([...(spec.valve_guides_replaced||[]),...cleanArray(patch.valve_guides_replaced)]);
 return service.entities.EngineComponentSpecSheet.update(spec.id,next);
}
export async function syncSpecFromMachining(service:any,task:any,measurements:any,user='Elite'){
 if(!task.component_id)return null;const component=rows(await service.entities.EngineComponent.filter({id:task.component_id}))[0];if(!component)return null;const now=new Date().toISOString(),m=measurements||{},patch:any={last_job_id:task.job_id||'',last_build_id:task.build_id||''};
 if(component.component_type==='cylinder_head'){
  if(task.task_type==='shave_head'){
   if(m.starting_head_height)patch.head_original_height_in=m.starting_head_height;
   if(m.final_head_height){patch.head_current_height_in=m.final_head_height;patch.head_height_updated_at=now;}
  }
  if(task.task_type==='valve_work'){
   const ops=m.operations||[];
   if(ops.includes('valve_job')){patch.valve_job_type=m.valve_job_type||'unknown';patch.valve_job_notes=m.valve_job_notes||m.completion_notes||'';patch.valve_job_updated_at=now;}
   if(ops.includes('seat_replacement'))patch.valve_seats_replaced=m.seat_replacement_positions||m.affected_positions||[];
   if(ops.includes('guide_replacement'))patch.valve_guides_replaced=m.guide_replacement_positions||m.affected_positions||[];
   if(ops.includes('lash_setup')&&m.lash_measurements){if(m.side==='exhaust')patch.last_valve_lash_exhaust=m.lash_measurements;else if(m.side==='both'){patch.last_valve_lash_intake=m.lash_measurements;patch.last_valve_lash_exhaust=m.lash_measurements;}else patch.last_valve_lash_intake=m.lash_measurements;patch.last_valve_lash_at=now;patch.last_valve_lash_build_id=task.build_id||'';patch.last_valve_lash_job_id=task.job_id||'';}
  }
 } else if(component.component_type==='engine_case'&&task.task_type==='deck_case'){
  if(m.starting_measurement)patch.case_starting_deck_measurement_in=m.starting_measurement;
  if(m.final_measurement)patch.case_current_deck_measurement_in=m.final_measurement;
  patch.case_deck_measurement_reference=m.measurement_reference||'';patch.case_deck_updated_at=now;
 }
 return patchComponentSpec(service,component,patch,user);
}
export async function syncSpecsFromBuild(service:any,build:any,jobId='',user='Elite'){
 if(!build?.customer_engine_id)return {head:null,case:null};const engine=rows(await service.entities.CustomerEngine.filter({id:build.customer_engine_id}))[0];if(!engine)return {head:null,case:null};const now=new Date().toISOString();let headSpec=null,caseSpec=null;
 if(engine.current_head_component_id){const head=rows(await service.entities.EngineComponent.filter({id:engine.current_head_component_id}))[0];if(head){const patch:any={last_build_id:build.id,last_job_id:jobId};if(build.valve_lash_intake&&Object.keys(build.valve_lash_intake).length){patch.last_valve_lash_intake=build.valve_lash_intake;patch.last_valve_lash_at=now;patch.last_valve_lash_build_id=build.id;patch.last_valve_lash_job_id=jobId;}if(build.valve_lash_exhaust&&Object.keys(build.valve_lash_exhaust).length){patch.last_valve_lash_exhaust=build.valve_lash_exhaust;patch.last_valve_lash_at=now;patch.last_valve_lash_build_id=build.id;patch.last_valve_lash_job_id=jobId;}const im=build.internal_measurements||{};if(im.head_original_height_in)patch.head_original_height_in=im.head_original_height_in;if(im.head_shaved_height_in){patch.head_current_height_in=im.head_shaved_height_in;patch.head_height_updated_at=now;}headSpec=await patchComponentSpec(service,head,patch,user);}}
 if(engine.current_case_component_id){const c=rows(await service.entities.EngineComponent.filter({id:engine.current_case_component_id}))[0];if(c){caseSpec=await patchComponentSpec(service,c,{last_build_internal_measurements:build.internal_measurements||{},last_build_measurements_at:now,last_build_id:build.id,last_job_id:jobId},user);}}
 return {head:headSpec,case:caseSpec};
}
