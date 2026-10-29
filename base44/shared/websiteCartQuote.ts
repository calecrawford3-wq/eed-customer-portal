// Server-side cart pricing. Catalog prices, stock and core availability are read here,
// never trusted from the browser.
import {quoteEngineConfiguration} from './websiteEngineQuote.ts';
const rows=(x:any):any[]=>Array.isArray(x)?x:x?.items||[];
const cents=(x:any)=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))&&Number(x)>=0?Math.round(Number(x)*100):null;

export async function quoteWebsiteCart(svc:any,cart:any){
 if(!Array.isArray(cart)||cart.length<1||cart.length>40)return {error:'Cart must contain 1 to 40 items',status:400};
 const parts=rows(await svc.entities.Part.list());
 const pm=new Map(parts.map((p:any)=>[p.id,p]));
 const requestedParts=new Map<string,number>();const lines:any[]=[];
 let subtotal=0,due=0,engineCount=0,partCount=0,eliteCoreCount=0;
 const missingShipping:string[]=[];
 for(const item of cart){
  if(!item||!['part','engine'].includes(item.type))return {error:'Invalid cart item',status:400};
  if(item.type==='part'){
   const id=item.id,qty=item.quantity;
   const parentId=typeof item.parentId==='string'?item.parentId:'';
   const parent:any=parentId?pm.get(parentId):null;
   if(parentId&&(!parent||parent.website_published!==true||!Array.isArray(parent.website_variants)||!parent.website_variants.some((v:any)=>v.partId===id)))return {error:'Invalid product selection',status:409};
   const custom=typeof item.personalization==='string'?item.personalization.trim():'';
   const config:any=parentId?parent?.website_customization:pm.get(id)?.website_customization;
   if(custom.length>60||(!config?.enabled&&custom)||(config?.enabled&&config.required&&!custom)||(config?.enabled&&custom.length>Math.min(60,Math.max(1,Number(config.maxLength)||20))))return {error:'Invalid personalization for selected product',status:400};
   if(typeof id!=='string'||!Number.isSafeInteger(qty)||qty<1||qty>99)return {error:'Invalid part quantity',status:400};
   const p:any=pm.get(id),unit=cents(p?.sell_price);
   if(!p||(!parentId&&p.website_published!==true)||p.status==='discontinued'||unit===null)return {error:'A part is no longer available',status:409};
   const totalQty=(requestedParts.get(id)||0)+qty;requestedParts.set(id,totalQty);
   if(Number(p.quantity_on_hand||0)<totalQty)return {error:`Insufficient inventory for ${String(p.name||'a part')}`,status:409};
   const amount=unit*qty;subtotal+=amount;due+=amount;partCount+=qty;
   // Store shipping is a flat rate; oversized or special-handling parts need a staff quote.
   if(p.website_shipping_requires_quote===true)missingShipping.push(String(p.part_number||p.name||id));
   lines.push({type:'part',partId:id,parentId:parentId||undefined,personalization:custom||undefined,sku:String(p.part_number||''),name:parentId?String(parent.name||'')+' — '+String(p.name||''):String(p.name||''),quantity:qty,unitCents:unit,totalCents:amount,dueCents:amount});
  }else{
   if(item.quantity!==1||!Number.isInteger(item.stage)||!Array.isArray(item.addonIds))return {error:'Invalid engine configuration',status:400};
   const priced=await quoteEngineConfiguration(svc,{platform:item.platform,stage:item.stage,core:item.core,addonIds:item.addonIds});
   if(priced.error)return {error:'An engine configuration requires review or repricing',status:409};
   const q:any=priced.quote,amount=cents(q.subtotal),deposit=cents(q.depositDue);
   if(amount===null||deposit===null)return {error:'Engine pricing unavailable',status:409};
   if(q.core==='Elite-supplied')eliteCoreCount++;
   subtotal+=amount;due+=deposit;engineCount++;
   lines.push({type:'engine',platform:q.platform,stage:q.stage,core:q.core,addonIds:item.addonIds,quantity:1,name:`Stage ${q.stage} ${q.platform}`,totalCents:amount,dueCents:deposit,remainingCents:amount-deposit});
  }
 }
 if(eliteCoreCount>0){
  const offerings=rows(await svc.entities.WebsiteEngineOffering.list()),cores=rows(await svc.entities.EngineCore.list());
  const coreMap=new Map(cores.map((c:any)=>[c.id,c]));const demand=new Map<string,number>();
  for(const line of lines){
   if(line.type!=='engine'||line.core!=='Elite-supplied')continue;
   const offering=offerings.find((o:any)=>o.is_published===true&&o.platform===line.platform&&Number(o.stage)===line.stage);
   if(!offering?.core_id)return {error:'Engine core is no longer available',status:409};
   demand.set(offering.core_id,(demand.get(offering.core_id)||0)+1);
  }
  for(const [id,qty] of demand){const core:any=coreMap.get(id);if(!core||core.status!=='active'||Number(core.quantity_on_hand||0)<qty)return {error:'Insufficient Elite engine cores for this cart',status:409};}
 }
 if(!Number.isSafeInteger(subtotal)||!Number.isSafeInteger(due)||subtotal<=0)return {error:'Invalid cart amount',status:409};
 return {quote:{lines,engineCount,partCount,subtotalCents:subtotal,dueTodayCents:due,remainingEngineCents:subtotal-due,shippingStatus:partCount===0?'engine_shipping_invoiced_separately':missingShipping.length?'manual_quote_required':'flat_rate',missingShippingItems:missingShipping,taxStatus:'calculated_at_checkout',pricedAt:new Date().toISOString()}};
}