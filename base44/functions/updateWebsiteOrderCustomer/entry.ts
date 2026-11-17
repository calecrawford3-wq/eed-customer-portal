import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const sdk=createClientFromRequest(req),user=await sdk.auth.me().catch(()=>null);
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 try{
 const b=await req.json(),svc=sdk.asServiceRole.entities;
 const order=await svc.WebsitePartsFulfillment.get(String(b.fulfillment_id||'')).catch(()=>null);
 if(!order)return Response.json({error:'Order not found'},{status:404});
 if(['shipped','delivered','cancelled'].includes(order.status)||order.turn14_supplier_order_reference)return Response.json({error:'Order already shipped, cancelled or submitted to supplier; customer details cannot be changed here'},{status:409});
 const name=String(b.name||'').trim(),email=String(b.email||'').trim(),phone=String(b.phone||'').replace(/[^0-9+() .-]/g,'').trim();
 const a=b.address||{},address={line1:String(a.line1||'').trim(),line2:String(a.line2||'').trim(),city:String(a.city||'').trim(),state:String(a.state||'').trim(),postal_code:String(a.postal_code||'').trim(),country:String(a.country||'US').trim(),phone};
 if(!name||!/^\S+@\S+\.\S+$/.test(email)||phone.replace(/\D/g,'').length<10||!address.line1||!address.city||!address.state||!address.postal_code)return Response.json({error:'Enter valid name, email, phone, street, city, state and ZIP'},{status:400});
 if(order.turn14_quote_id)return Response.json({error:'Supplier quote already exists. Customer details cannot be changed until the quote is invalidated.'},{status:409});
 await svc.WebsitePartsFulfillment.update(order.id,{recipient_name:name,recipient_email:email,recipient_phone:phone,shipping_address:JSON.stringify(address),order_revision_history:[...(order.order_revision_history||[]),{at:new Date().toISOString(),by:user.email||user.id,action:'customer_details_updated'}]});
 return Response.json({success:true});
 }catch(e){return Response.json({error:String(e.message||e)},{status:500})}
}
