const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomChars(n:number){const bytes=new Uint8Array(n);crypto.getRandomValues(bytes);return Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');}
async function uniqueValue(entity:any, field:string, make:()=>string){for(let i=0;i<30;i++){const value=make();const found=rows(await entity.filter({[field]:value}));if(!found.length)return value;}throw new Error(`Could not allocate unique ${field}`);}
function randomDigits(n:number){const bytes=new Uint32Array(n);crypto.getRandomValues(bytes);return Array.from(bytes,b=>String(b%10)).join('');}
export async function newTagCode(service:any,prefix:string){
 const engineEntity=service.entities.CustomerEngine; const componentEntity=service.entities.EngineComponent;
 for(let i=0;i<30;i++){const code=`${prefix}-${randomChars(12)}`;const [e,c]=await Promise.all([engineEntity.filter({tag_code:code}),componentEntity.filter({tag_code:code})]);if(!rows(e).length&&!rows(c).length)return code;}throw new Error('Could not allocate unique scan tag');
}
export async function newHeadCode(service:any){return uniqueValue(service.entities.EngineComponent,'component_code',()=>`HD-${randomDigits(6)}`);}
export async function pairHead(service:any,{componentId,engineId,jobId='',reason=''}:{componentId:string,engineId:string,jobId?:string,reason?:string}){
 const Component=service.entities.EngineComponent, Engine=service.entities.CustomerEngine, Pairing=service.entities.EngineComponentPairing;
 const component=rows(await Component.filter({id:componentId}))[0]; const engine=rows(await Engine.filter({id:engineId}))[0];
 if(!component||component.component_type!=='cylinder_head')throw new Error('Cylinder head not found'); if(!engine)throw new Error('Engine not found');
 if(component.current_customer_engine_id===engineId&&engine.current_head_component_id===componentId){const existing=rows(await Pairing.filter({component_id:componentId,customer_engine_id:engineId,status:'active'}))[0]||null;return {pairing:existing,component,engine,no_op:true};}
 const now=new Date().toISOString();
 // Close any active history rows involving either this head or this bottom end.
 const [byHead,byEngine]=await Promise.all([Pairing.filter({component_id:componentId,status:'active'}),Pairing.filter({customer_engine_id:engineId,status:'active'})]);
 const active=[...rows(byHead),...rows(byEngine)].filter((x:any,i:number,a:any[])=>a.findIndex(y=>y.id===x.id)===i);
 for(const p of active){await Pairing.update(p.id,{status:'historical',unpaired_at:now});if(p.component_id!==componentId){await Component.update(p.component_id,{current_customer_engine_id:'',status:'unpaired'});}if(p.customer_engine_id!==engineId){await Engine.update(p.customer_engine_id,{current_head_component_id:''});}}
 // Also clear stale direct pointers if history was incomplete.
 if(component.current_customer_engine_id&&component.current_customer_engine_id!==engineId)await Engine.update(component.current_customer_engine_id,{current_head_component_id:''});
 if(engine.current_head_component_id&&engine.current_head_component_id!==componentId)await Component.update(engine.current_head_component_id,{current_customer_engine_id:'',status:'unpaired'});
 await Component.update(componentId,{current_customer_engine_id:engineId,status:'paired',platform_id:component.platform_id||engine.platform_id||''});
 await Engine.update(engineId,{current_head_component_id:componentId});
 const pairing=await Pairing.create({component_id:componentId,component_code:component.component_code,customer_engine_id:engineId,engine_eed_id:engine.eed_id||'',job_id:jobId,paired_at:now,status:'active',reason});
 return {pairing,component:{...component,current_customer_engine_id:engineId,status:'paired'},engine:{...engine,current_head_component_id:componentId}};
}
export async function createHead(service:any,{engineId='',platformId='',notes='',pair=true,jobId='',reason='Initial engine identity'}:any={}){
 const Component=service.entities.EngineComponent;
 const component_code=await newHeadCode(service); const tag_code=await newTagCode(service,'HEAD');
 let engine:any=null;if(engineId)engine=rows(await service.entities.CustomerEngine.filter({id:engineId}))[0]||null;
 const head=await Component.create({component_code,component_type:'cylinder_head',tag_code,platform_id:platformId||engine?.platform_id||'',origin_customer_engine_id:engineId||'',current_customer_engine_id:'',status:'unpaired',notes});
 if(pair&&engineId)return {...await pairHead(service,{componentId:head.id,engineId,jobId,reason}),head:{...head,current_customer_engine_id:engineId,status:'paired'}};
 return {head};
}
