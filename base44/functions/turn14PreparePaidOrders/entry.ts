import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
import {staffOrAutomation} from '../../shared/staffOrAutomation.ts';
import {turn14Availability} from '../../shared/turn14Availability.ts';
import {turn14Request} from '../../shared/turn14.ts';
const rows=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 const sdk=createClientFromRequest(req);
 if(!await staffOrAutomation(sdk))return Response.json({error:'Admin or verified automation required'},{status:403});
 const svc=sdk.asServiceRole.entities,settings=rows(await svc.AppSettings.filter({key:'global'}))[0]||{};
 const all=rows(await svc.WebsitePartsFulfillment.list('-created_date',150)),results:any[]=[];
 for(const order of all){
  if(results.length>=15)break;
  if(!order.payment_verified||order.shipping_method!=='ship'||order.status==='cancelled'||order.order_payment_review_required||Number(order.order_adjustment_due_cents||0)>0||Number(order.order_adjustment_refund_cents||0)>0||order.turn14_supplier_order_reference||order.turn14_submission_reconciliation_required||order.turn14_quote_id||!['not_requested','',null,undefined].includes(order.turn14_dropship_status))continue;
  const lines:any[]=[];let failure='';
  for(const l of rows(order.line_items)){
   const part=l.part_id?await svc.Part.get(l.part_id).catch(()=>null):null;
   if(!part?.turn14_item_id||!part?.turn14_dropship_enabled)continue;
   const availability=turn14Availability(part,Number(l.quantity));
   if(!availability.eligible){failure=String(l.sku||part.part_number)+': '+availability.reason;break}
   lines.push({part_id:part.id,sku:part.part_number,supplier_sku:part.turn14_supplier_sku||part.part_number,supplier_name:part.supplier_product_name||part.name,turn14_item_id:part.turn14_item_id,quantity:Number(l.quantity),unit_cost:Number(part.turn14_purchase_cost)});
  }
  if(failure||!lines.length){if(failure)results.push({order:order.order_number,status:'held',reason:failure});continue}
  let addr:any={};try{addr=typeof order.shipping_address==='string'?JSON.parse(order.shipping_address):order.shipping_address||{}}catch{}
  const state=String(addr.state||'').trim().toUpperCase(),zip=String(addr.postal_code||addr.zip||'').trim();
  if(!addr.line1||!addr.city||!/^[A-Z]{2}$/.test(state)||!/^[0-9]{5}(-[0-9]{4})?$/.test(zip)){results.push({order:order.order_number,status:'held',reason:'Incomplete shipping address'});continue}
  const grouped=new Map<string,any>();
  for(const l of lines){const key=String(l.turn14_item_id);if(!grouped.has(key))grouped.set(key,{item_identifier:key,item_identifier_type:'item_id',quantity:0});grouped.get(key).quantity+=l.quantity}
  const items=[...grouped.values()].sort((a,b)=>a.item_identifier.localeCompare(b.item_identifier));
  const fingerprint=JSON.stringify({order_number:order.order_number,shipping_address:order.shipping_address,items});
  try{
   const response=await turn14Request('/v1/quote','POST',{data:{environment:'testing',po_number:String(order.order_number),sales_source:2,locations:[{location:'default',combine_in_out_stock:false,items}],recipient:{company:'',name:String(order.recipient_name||''),address:String(addr.line1),address_2:String(addr.line2||''),city:String(addr.city),state,country:'US',zip,email_address:String(settings.turn14_receiving_email||'******'),phone_number:String(settings.turn14_receiving_phone||'918-310-8532'),is_shop_address:false}}});
   const quoteId=String(response?.data?.id||'');if(!quoteId)throw Error('Supplier returned no quote ID');
   await svc.WebsitePartsFulfillment.update(order.id,{turn14_dropship_lines:lines,turn14_dropship_status:'ready_for_submission',turn14_quote_id:quoteId,turn14_quote_response:response,turn14_quote_fingerprint:fingerprint,turn14_quote_created_at:new Date().toISOString(),turn14_dropship_reviewed_at:new Date().toISOString()});
   results.push({order:order.order_number,status:'ready_for_approval',quote_id:quoteId});
  }catch(e){results.push({order:order.order_number,status:'quote_failed',reason:String(e instanceof Error?e.message:e).slice(0,180)})}
 }
 return Response.json({checked:all.length,processed:results.length,results,submitted_orders:0,environment:'testing'});
}
