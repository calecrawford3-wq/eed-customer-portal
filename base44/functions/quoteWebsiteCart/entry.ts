import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import quoteEngine from '../quoteWebsiteEngineOrder/entry.ts';
const rows=(x:any):any[]=>Array.isArray(x)?x:x?.items||[];
const cents=(x:any)=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))&&Number(x)>=0?Math.round(Number(x)*100):null;
const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const body=await req.json();const cart=body?.items;
  if(!Array.isArray(cart)||cart.length<1||cart.length>40)return fail('Cart must contain 1 to 40 items');
  const sdk=createClientFromRequest(req),svc=sdk.asServiceRole;
  const parts=rows(await svc.entities.Part.list());const pm=new Map(parts.map((p:any)=>[p.id,p]));
  const requestedParts=new Map<string,number>();const lines:any[]=[];let subtotal=0,due=0,engineCount=0,partCount=0;
  for(const item of cart){if(!item||!['part','engine'].includes(item.type))return fail('Invalid cart item');
   if(item.type==='part'){
    const id=item.id,qty=item.quantity;
    if(typeof id!=='string'||!Number.isSafeInteger(qty)||qty<1||qty>99)return fail('Invalid part quantity');
    const p:any=pm.get(id),unit=cents(p?.sell_price);
    if(!p||p.website_published!==true||p.status==='discontinued'||unit===null)return fail('A part is no longer available',409);
    const totalQty=(requestedParts.get(id)||0)+qty;requestedParts.set(id,totalQty);
    if(p.status!=='special_order'&&Number(p.quantity_on_hand||0)<totalQty)return fail(`Insufficient inventory for ${String(p.name||'a part')}`,409);
    const amount=unit*qty;subtotal+=amount;due+=amount;partCount+=qty;
    lines.push({type:'part',partId:id,sku:String(p.part_number||''),name:String(p.name||''),quantity:qty,unitCents:unit,totalCents:amount,dueCents:amount});
   }else{
    if(item.quantity!==1||!Number.isInteger(item.stage)||!Array.isArray(item.addonIds))return fail('Invalid engine configuration');
    const config={platform:item.platform,stage:item.stage,core:item.core,addonIds:item.addonIds};
    const quoted=await quoteEngine(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(config)}));
    if(!quoted.ok)return fail('An engine configuration requires review or repricing',409);
    const q=await quoted.json();const amount=cents(q.subtotal),deposit=cents(q.depositDue);
    if(amount===null||deposit===null)return fail('Engine pricing unavailable',409);
    subtotal+=amount;due+=deposit;engineCount++;
    lines.push({type:'engine',platform:q.platform,stage:q.stage,core:q.core,addonIds:config.addonIds,quantity:1,name:`Stage ${q.stage} ${q.platform}`,totalCents:amount,dueCents:deposit,remainingCents:amount-deposit});
   }
  }
  if(!Number.isSafeInteger(subtotal)||!Number.isSafeInteger(due)||subtotal<=0)return fail('Invalid cart amount',409);
  return Response.json({lines,engineCount,partCount,subtotalCents:subtotal,dueTodayCents:due,remainingEngineCents:subtotal-due,shippingStatus:'not_calculated',taxStatus:'not_calculated',checkoutEnabled:false,pricedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch{return fail('Unable to verify cart pricing',503)}
}
