import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const rows=(x:any):any[]=>Array.isArray(x)?x:x?.items||[];
const cents=(x:any)=>Math.round(Number(x||0)*100);
const norm=(s:any)=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
 try{
  const sdk=createClientFromRequest(req),user=await sdk.auth.me();
  if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
  const {transaction_id,action,expense_id,po_id,category,notes}=await req.json();
  const e=sdk.asServiceRole.entities;
  const tx=rows(await e.BankTransaction.filter({id:transaction_id}))[0];
  if(!tx||tx.status==='removed')throw Error('Bank transaction not found');
  if(tx.expense_id||tx.status==='matched')throw Error('This bank transaction has already been reconciled');
  if(tx.pending||Number(tx.amount)<=0)throw Error('Only posted purchases can be reconciled');
  if(action==='ignore'){
   await e.BankTransaction.update(tx.id,{status:'ignored',review_note:String(notes||'Not a business expense').slice(0,500),reviewed_at:new Date().toISOString()});
   return Response.json({ok:true,status:'ignored'});
  }
  if(!['match_expense','match_po','finalize'].includes(action))throw Error('Invalid review action');
  const all=rows(await e.BankTransaction.list('-date',5000));
  const used=all.filter((t:any)=>t.id!==tx.id&&t.status==='matched');
  const expenses=rows(await e.Expense.list('-date',5000));
  let expense:any=null,po:any=null;
  if(action==='match_expense'){
   expense=expenses.find((x:any)=>x.id===expense_id);
   if(!expense)throw Error('Expense not found');
   if(used.some((t:any)=>t.expense_id===expense.id))throw Error('Expense is already linked to another bank transaction');
   if(Math.abs(cents(expense.amount)+(expense.tax_included_in_amount===false?cents(expense.tax_amount):0)-cents(tx.amount))>1)throw Error('Bank and expense totals differ; resolve before matching');
  }else if(action==='match_po'){
   po=rows(await e.PurchaseOrder.filter({id:po_id}))[0];
   if(!po)throw Error('Purchase order not found');
   if(used.some((t:any)=>t.po_id===po.id))throw Error('This PO already has a matched bank purchase. Review split or multiple payments manually.');
   const poExpense=expenses.find((x:any)=>x.po_id===po.id);
   if(poExpense){
    const total=cents(poExpense.amount)+(poExpense.tax_included_in_amount===false?cents(poExpense.tax_amount):0);
    if(Math.abs(total-cents(tx.amount))>1)throw Error('Existing PO expense and bank amount differ. Reconcile the PO first.');
    if(used.some((t:any)=>t.expense_id===poExpense.id))throw Error('PO expense already bank-matched');
    expense=poExpense;
   }else{
    const total=cents(po.total||Number(po.subtotal||0)+Number(po.shipping_cost||0)+Number(po.tax_amount||0));
    if(Math.abs(total-cents(tx.amount))>1)throw Error('PO and bank totals differ. Update the PO first; no expense created.');
    // A bank match is evidence of payment, NOT receipt. Keep as pending until PO is received.
    if(po.status!=='received'){
     await e.BankTransaction.update(tx.id,{po_id:po.id,status:'pending_po',review_note:'Awaiting PO receipt; no expense created',reviewed_at:new Date().toISOString()});
     return Response.json({ok:true,status:'pending_po',po_id:po.id});
    }
    expense=await e.Expense.create({expense_number:'PO-BANK-'+tx.id.slice(-10),po_id:po.id,description:'Supplier PO '+(po.po_number||''),vendor:tx.merchant||'Supplier',amount:Number(tx.amount),date:tx.date,category:'parts_cogs',payment_method:'card',is_deductible:true,source:'purchase_order',tax_included_in_amount:true,notes:'Bank-matched purchase '+tx.plaid_transaction_id});
   }
  }else{
   if(used.some((t:any)=>t.plaid_transaction_id===tx.plaid_transaction_id))throw Error('Duplicate bank transaction');
   const candidates=expenses.filter((x:any)=>Math.abs(cents(x.amount)+(x.tax_included_in_amount===false?cents(x.tax_amount):0)-cents(tx.amount))<=1&&Math.abs(Date.parse(x.date)-Date.parse(tx.date))<=7*86400000&&(norm(x.vendor).includes(norm(tx.merchant))||norm(tx.merchant).includes(norm(x.vendor)))&&norm(x.vendor).length>3);
   if(candidates.length)throw Error('Possible existing expense found. Match it first instead of creating another.');
   const allowed=['parts_cogs','supplies','tools_equipment','shipping','utilities','rent','labor','marketing','insurance','taxes','warranty_repair','other'];
   if(!allowed.includes(category))throw Error('Select a valid expense category');
   expense=await e.Expense.create({expense_number:'BANK-'+tx.id.slice(-12),description:tx.description||tx.merchant||'Bank purchase',vendor:tx.merchant||'',amount:Number(tx.amount),date:tx.date,category,payment_method:'card',is_deductible:true,source:'manual',tax_included_in_amount:true,notes:'Verified against bank transaction '+tx.plaid_transaction_id});
  }
  await e.BankTransaction.update(tx.id,{status:'matched',expense_id:expense?.id||'',po_id:po?.id||'',review_note:String(notes||'Bank purchase reconciled').slice(0,500),reviewed_at:new Date().toISOString()});
  return Response.json({ok:true,status:'matched',expense_id:expense?.id||null,po_id:po?.id||null});
 }catch(err){return Response.json({error:String(err?.message||err)},{status:400});}
}
