import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const fail=(error:string,status=400)=>Response.json({error},{status});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
 const sdk=createClientFromRequest(req),user=await sdk.auth.me();
 if(user?.role!=='admin')return fail('Admin access required',403);
 const body=await req.json();
 const name=String(body.name||'').trim(),email=String(body.email||'').trim(),method=body.method,notes=String(body.notes||'').slice(0,1000);
 if(!name||!['ship','pickup'].includes(method)||!['unpaid','external_paid','shipping_only'].includes(body.payment))return fail('Missing customer, shipping or payment details');
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail('Invalid email');
 const address=body.address||{};
 if(method==='ship'&&(!address.line1||!address.city||!address.state||!address.postal_code))return fail('Complete shipping address required');
 if(!Array.isArray(body.items)||body.items.length<1||body.items.length>60)return fail('Add at least one item');
 const svc=sdk.asServiceRole,parts=rows(await svc.entities.Part.list()),byId=new Map(parts.map((p:any)=>[String(p.id),p]));
 let subtotal=0;const lines:any[]=[];
 for(const item of body.items){
  const qty=Number(item.quantity),part=byId.get(String(item.partId));
  if(!Number.isInteger(qty)||qty<1||qty>500)return fail('Invalid item quantity');
  if(!part&&body.payment!=='shipping_only')return fail('Select valid inventory items');
  const price=body.payment==='shipping_only'?0:Number(part?.sell_price);
  if(!Number.isFinite(price)||price<0)return fail('Invalid catalog price');
  const cents=Math.round(price*100);subtotal+=cents*qty;
  lines.push({part_id:part?.id||'',sku:part?.part_number||'',name:part?.name||String(item.name||'Shipping item').slice(0,120),quantity:qty,unit_price_cents:cents,quantity_picked:0});
 }
 if(subtotal>100000000)return fail('Order exceeds limit');
 const verified=body.payment!=='unpaid',number='MAN-'+crypto.randomUUID().slice(0,12).toUpperCase();
 const record=await svc.entities.WebsitePartsFulfillment.create({purchase_id:number,order_number:number,status:verified?'ready_to_pick':'awaiting_payment',payment_verified:verified,recipient_name:name,recipient_email:email,shipping_method:method,shipping_address:JSON.stringify(address),line_items:lines,subtotal_cents:subtotal,shipping_cents:0,tax_cents:0,internal_notes:'Manual order. '+(body.payment==='external_paid'?'External payment confirmed by staff. ':body.payment==='shipping_only'?'Shipping-only / no sale. ':'Payment pending. ')+notes});
 return Response.json({id:record.id,orderNumber:number,status:record.status});
 }catch(e){console.error('Manual order creation failed',String(e));return fail('Unable to create manual order',503)}
}
