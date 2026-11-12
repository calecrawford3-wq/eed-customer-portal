import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {turn14Request,itemArray} from '../../shared/turn14.ts';
export default async function(req){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{
 const base44=createClientFromRequest(req);const user=await base44.auth.me().catch(()=>null);
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json();const action=body.action;
 if(action==='test'){const data=await turn14Request('/v1/brands');return Response.json({connected:true,brands:itemArray(data).length});}
 if(action==='brands'){const data=await turn14Request('/v1/brands');return Response.json({brands:itemArray(data).map(x=>({id:String(x.id),name:x.attributes?.name,dropship:!!x.attributes?.dropship}))});}
 if(action==='items')return Response.json({error:'Brand item browsing is paused until paginated feed validation is complete. Use the read-only feed diagnostics.'},{status:409});
 // Individual-item preview/import calls are intentionally blocked until the
 // paginated items/pricing/inventory feeds and durable item-ID mapping exist.
 // Turn 14 requires approval of the data integration before ordering work.
 if(action==='preview'||action==='import')return Response.json({error:'Individual-item imports are paused pending paginated feed synchronization and item-ID mapping required by Turn 14. No item was imported.'},{status:409});
 return Response.json({error:'Unknown action'},{status:400});
 }catch(e){console.error('[turn14Catalog]',e.message);return Response.json({error:e.message||'Turn 14 request failed'},{status:502});}
}
