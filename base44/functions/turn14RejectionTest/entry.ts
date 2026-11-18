import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {rejectionCases,simulateTurn14Rejection} from '../../shared/turn14SubmissionSafety.ts';
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json().catch(()=>({}));
 const id=String(body.fulfillment_id||'');
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))return Response.json({error:'Select an existing website order'},{status:400});
 const order=await sdk.asServiceRole.entities.WebsitePartsFulfillment.get(id).catch(()=>null);
 if(!order)return Response.json({error:'Website order not found'},{status:404});
 // Deliberately no supplier calls, writes, notifications or payments in this endpoint.
 const selected=String(body.scenario||'all');
 if(selected!=='all'&&!rejectionCases.some(c=>c.id===selected))return Response.json({error:'Invalid test scenario'},{status:400});
 const results=(selected==='all'?rejectionCases:rejectionCases.filter(c=>c.id===selected)).map(c=>simulateTurn14Rejection(c.id));
 return Response.json({order_number:order.order_number,simulated:true,read_only:true,passed:results.every(x=>x.passed),results,warning:'These tests validate simulated rejection decisions, not live Turn 14 responses.'});
}
