import {createClientFromRequest} from 'npm:@base44/sdk';
const rows=(x:any)=>Array.isArray(x)?x:x?.items||[];
Deno.serve(async(req)=>{
 try{
  const base44=createClientFromRequest(req),me=await base44.auth.me();
  if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
  const body=await req.json(),action=String(body.action||'');
  const clientId=Deno.env.get('PLAID_CLIENT_ID'),secret=Deno.env.get('PLAID_SECRET');
  const env=Deno.env.get('PLAID_ENV')||'sandbox';
  if(!['sandbox','development','production'].includes(env))throw Error('Invalid Plaid environment');
  if(!clientId||!secret)return Response.json({error:'Plaid credentials not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to Base44 secrets.'},{status:503});
  const endpoint='https://'+env+'.plaid.com';
  async function plaid(path:string,params:any){
   const res=await fetch(endpoint+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:clientId,secret,...params})});
   const data=await res.json();if(!res.ok)throw Error(data.error_message||data.error_code||'Plaid request failed');return data;
  }
  const svc=base44.asServiceRole;
  if(action==='link_token'){
   const data=await plaid('/link/token/create',{client_name:'Elite Engine Development',country_codes:['US'],language:'en',products:['transactions'],user:{client_user_id:me.id},transactions:{days_requested:730}});
   return Response.json({link_token:data.link_token});
  }
  if(action==='exchange'){
   if(!body.public_token)throw Error('Missing public token');
   const data=await plaid('/item/public_token/exchange',{public_token:body.public_token});
   const prior=rows(await svc.entities.BankConnection.filter({item_id:data.item_id}));
   if(prior.length)return Response.json({connection_id:prior[0].id,already_connected:true});
   const connection=await svc.entities.BankConnection.create({item_id:data.item_id,access_token:data.access_token,cursor:'',institution_name:String(body.institution_name||'Bank account'),status:'active',connected_at:new Date().toISOString()});
   return Response.json({connection_id:connection.id});
  }
  if(action==='connections'){
   const list=rows(await svc.entities.BankConnection.list('-created_date',100));
   return Response.json({connections:list.map(({id,institution_name,status,last_synced_at})=>({id,institution_name,status,last_synced_at}))});
  }
  if(action==='sync'){
   const con=rows(await svc.entities.BankConnection.filter({id:body.connection_id}))[0];if(!con)throw Error('Connection not found');
   let cursor=con.cursor||undefined,more=true,count=0,loops=0;
   const all=rows(await svc.entities.BankTransaction.filter({connection_id:con.id},'-created_date',5000));
   const existing=new Map(all.map((t:any)=>[t.plaid_transaction_id,t]));
   while(more&&loops++<20){
    const data=await plaid('/transactions/sync',{access_token:con.access_token,cursor,count:500});
    for(const item of [...(data.added||[]),...(data.modified||[])]){
     const value={plaid_transaction_id:item.transaction_id,connection_id:con.id,account_id:item.account_id,merchant:item.merchant_name||item.name||'',description:item.name||'',amount:Number(item.amount)||0,date:item.date||'',pending:!!item.pending};
     const old=existing.get(item.transaction_id);
     if(old)await svc.entities.BankTransaction.update(old.id,value);
     else{const created=await svc.entities.BankTransaction.create({...value,status:'review'});existing.set(item.transaction_id,created);count++;}
    }
    for(const item of data.removed||[]){const old=existing.get(item.transaction_id);if(old)await svc.entities.BankTransaction.update(old.id,{status:'removed'});}
    cursor=data.next_cursor;more=!!data.has_more;
   }
   if(more)throw Error('Sync incomplete. Retry to continue.');
   await svc.entities.BankConnection.update(con.id,{cursor,last_synced_at:new Date().toISOString()});
   return Response.json({added:count});
  }
  if(action==='approve'){
   const tx=rows(await svc.entities.BankTransaction.filter({id:body.transaction_id}))[0];if(!tx)throw Error('Transaction not found');
   if(tx.expense_id)return Response.json({expense_id:tx.expense_id,already_matched:true});
   if(tx.amount<=0||tx.pending)throw Error('Only posted purchases can be expensed');
   const category=String(body.category||'other'),allowed=['parts_cogs','supplies','tools_equipment','shipping','utilities','rent','labor','marketing','insurance','taxes','warranty_repair','other'];
   if(!allowed.includes(category))throw Error('Invalid expense category');
   if(body.expense_id){
    const expense=rows(await svc.entities.Expense.filter({id:body.expense_id}))[0];
    if(!expense)throw Error('Expense not found');
    await svc.entities.BankTransaction.update(tx.id,{expense_id:expense.id,status:'matched',receipt_url:expense.receipt_url||tx.receipt_url||''});
    return Response.json({expense_id:expense.id,matched:true});
   }
   const expense=await svc.entities.Expense.create({expense_number:'BANK-'+tx.plaid_transaction_id.slice(-12),description:tx.description||tx.merchant||'Card purchase',vendor:tx.merchant||'',amount:tx.amount,date:tx.date,category,payment_method:'card',is_deductible:!!body.is_deductible,source:'manual',receipt_url:tx.receipt_url||'',notes:'Imported from linked bank transaction '+tx.plaid_transaction_id});
   await svc.entities.BankTransaction.update(tx.id,{expense_id:expense.id,status:'matched',category});
   return Response.json({expense_id:expense.id});
  }
  throw Error('Unknown action');
 }catch(e){return Response.json({error:e.message||String(e)},{status:400});}
});