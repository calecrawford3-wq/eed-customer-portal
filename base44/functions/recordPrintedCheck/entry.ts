import {createClientFromRequest} from 'npm:@base44/sdk';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
const asPositiveInt=(v:any,fallback=1001)=>{const n=Math.trunc(Number(v));return Number.isFinite(n)&&n>0?n:fallback;};
async function claimNextNumber(s:any,settingsId:string){
 for(let attempt=0;attempt<25;attempt++){
  const settings=rows(await s.entities.AppSettings.filter({id:settingsId}))[0];
  if(!settings)throw new Error('Check settings not found.');
  const raw=settings.check_next_number;
  const current=asPositiveInt(raw,1001);
  const num=String(current);
  // Self-heal forward if a legacy/stale sequence points to an already-used number.
  const used=rows(await s.entities.PrintedCheck.filter({check_number:num}))[0];
  const claim=await s.entities.AppSettings.updateMany({id:settings.id,check_next_number:raw},{$set:{check_next_number:current+1}});
  if(claim?.updated!==1)continue;
  if(used)continue;
  return {number:num,next:current+1};
 }
 throw new Error('Check number sequence is busy. Retry the check once.');
}
Deno.serve(async req=>{try{
 const base44=createClientFromRequest(req),me=await base44.auth.me();
 if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const b=await req.json(),s=base44.asServiceRole,payee=String(b.payee||'').trim(),amount=Number(b.amount)||0;
 if(!payee||amount<=0||!b.date)return Response.json({error:'Payee, amount, and date are required.'},{status:400});
 const settings=rows(await s.entities.AppSettings.filter({key:'global'}))[0];
 if(!settings?.id)return Response.json({error:'Global settings are missing, so Elite cannot safely assign a check number.'},{status:409});
 let expense:any=null;
 if(b.expense_id){expense=rows(await s.entities.Expense.filter({id:b.expense_id}))[0];if(!expense)return Response.json({error:'Expense not found. No check number was consumed.'},{status:404});}
 // Number is intentionally NOT accepted from the browser. The server sequence is the only authority.
 const claimed=await claimNextNumber(s,settings.id),num=claimed.number,now=new Date().toISOString();
 let record:any;
 try{
  record=await s.entities.PrintedCheck.create({check_number:num,payee,payee_address:String(b.payee_address||'').trim(),amount,date:b.date,memo:String(b.memo||'').trim(),expense_id:b.expense_id||'',source:b.expense_id?'expense':'manual',status:'printed',printed_at:now,reprint_count:0,stock_mode:settings.check_stock_mode||'preprinted_micr',logo_url:settings.company_logo_light_url||settings.company_logo_dark_url||settings.company_logo_url||'',layout_snapshot:{stock_mode:settings.check_stock_mode||'preprinted_micr',vertical_offset_mm:Number(settings.check_vertical_offset_mm)||0,horizontal_offset_mm:Number(settings.check_horizontal_offset_mm)||0,logo_width_mm:Number(settings.check_logo_width_mm)||32,bank_name:settings.check_bank_name||''},created_by:me?.full_name||me?.email||'Admin'});
 }catch(e){
  // The number was already claimed. Never roll the sequence backward or reuse it.
  // Best effort: leave an explicit voided register record so the consumed number is auditable.
  try{await s.entities.PrintedCheck.create({check_number:num,payee:'VOID - CHECK CREATION ERROR',amount:0,date:b.date||new Date().toISOString().slice(0,10),memo:'Automatically voided because check creation failed after the number was reserved.',expense_id:'',source:'manual',status:'voided',printed_at:now,voided_at:now,void_reason:'System-reserved check number could not be completed; number permanently consumed.',reprint_count:0,stock_mode:settings.check_stock_mode||'preprinted_micr',logo_url:settings.company_logo_light_url||settings.company_logo_dark_url||settings.company_logo_url||'',layout_snapshot:{},created_by:me?.full_name||me?.email||'Admin'});}catch{}
  throw e;
 }
 let warning='';
 if(expense){try{await s.entities.Expense.update(expense.id,{payment_method:'check',check_number:num,printed_check_id:record.id});}catch(e){warning='Check was created and its number is permanently consumed, but the linked expense could not be updated. Reconcile the expense link before closing the register.';console.error('[recordPrintedCheck] expense link failed',e);}}
 return Response.json({success:true,check:record,next_check_number:claimed.next,warning});
}catch(e){return Response.json({error:e.message},{status:400});}});
