import {createClientFromRequest} from 'npm:@base44/sdk';
const rows=(x:any)=>Array.isArray(x)?x:x?.items||[];
const safe=(e:any)=>String(e?.message||e||'Request failed').replace(/https?:\/\/[^\s]+/g,'[private URL]').slice(0,180);
Deno.serve(async req=>{
 try{
 const b=createClientFromRequest(req),me=await b.auth.me();
 if(me?.role!=='admin')return Response.json({error:'Admin only'},{status:403});
 const body=await req.json(),action=String(body.action||''),svc=b.asServiceRole;
 if(action==='connections'){
  const cs=rows(await svc.entities.SimpleFinCredential.list('-created_date',30));
  return Response.json({connections:cs.map((c:any)=>({id:c.id,label:c.label,status:c.status,last_synced_at:c.last_synced_at}))});
 }
 if(action==='connect'){
  const token=String(body.setup_token||'').trim();
  if(token.length<20||token.length>5000)throw Error('Invalid setup token');
  let decoded:string;
  try{decoded=atob(token);}catch{throw Error('Invalid setup token format');}
  const claim=new URL(decoded);
  if(claim.protocol!=='https:'||!['bridge.simplefin.org','beta-bridge.simplefin.org'].includes(claim.hostname)||!claim.pathname.startsWith('/simplefin/claim/'))throw Error('Setup token must come from SimpleFIN Bridge');
  const response=await fetch(claim.toString(),{method:'POST',headers:{'Content-Length':'0'},redirect:'error'});
  if(response.status===403)throw Error('Setup token was already used or revoked. Generate a new one in SimpleFIN.');
  if(!response.ok)throw Error('SimpleFIN rejected setup token');
  const access=(await response.text()).trim(),url=new URL(access);
  if(url.protocol!=='https:'||!['bridge.simplefin.org','beta-bridge.simplefin.org'].includes(url.hostname)||!url.username||!url.password)throw Error('Unexpected SimpleFIN access response');
  const cred=await svc.entities.SimpleFinCredential.create({access_url:access,label:'SimpleFIN Bridge',status:'active'});
  return Response.json({connection_id:cred.id});
 }
 if(action==='sync'){
  const con=rows(await svc.entities.SimpleFinCredential.filter({id:body.connection_id}))[0];
  if(!con)throw Error('Connection not found');
  const url=new URL(con.access_url);
  if(url.protocol!=='https:'||!['bridge.simplefin.org','beta-bridge.simplefin.org'].includes(url.hostname))throw Error('Invalid saved connection');
  const auth='Basic '+btoa(decodeURIComponent(url.username)+':'+decodeURIComponent(url.password));
  url.username='';url.password='';url.pathname=url.pathname.replace(/\/$/,'')+'/accounts';
  url.searchParams.set('version','2');
  // Fetch a rolling window to cover delayed posted transactions and corrections.
  url.searchParams.set('start-date',String(Math.floor(Date.now()/1000)-120*86400));
  const response=await fetch(url.toString(),{headers:{Authorization:auth},redirect:'error'});
  if(response.status===403)throw Error('SimpleFIN access expired or revoked. Reconnect.');
  if(!response.ok)throw Error('SimpleFIN sync failed (HTTP '+response.status+')');
  const data=await response.json();
  if(data.errors?.length)throw Error('SimpleFIN reported an account sync issue. Check the linked bank.');
  const old=rows(await svc.entities.BankTransaction.list('-created_date',5000));
  const existing=new Map(old.map((t:any)=>[t.plaid_transaction_id,t]));
  let added=0;
  for(const account of data.accounts||[]){
   if(account.currency&&account.currency!=='USD')continue;
   for(const t of account.transactions||[]){
    const key='simplefin:'+String(account.id)+':'+String(t.id);
    const amount=-Number(t.amount||0); // SimpleFIN positive = money entering account; expenses are negative bank movements.
    const date=new Date(Number(t.posted||t.transacted)*1000).toISOString().slice(0,10);
    const value={plaid_transaction_id:key,connection_id:con.id,account_id:String(account.id),merchant:String(t.payee||t.description||''),description:String(t.description||''),amount,date,pending:false};
    const found=existing.get(key);
    if(found){await svc.entities.BankTransaction.update(found.id,value);}
    else{const created=await svc.entities.BankTransaction.create({...value,status:'review'});existing.set(key,created);added++;}
   }
  }
  await svc.entities.SimpleFinCredential.update(con.id,{last_synced_at:new Date().toISOString(),status:'active'});
  return Response.json({added,accounts:(data.accounts||[]).map((a:any)=>({id:a.id,name:a.name,currency:a.currency}))});
 }
 if(action==='approve'){
  const tx=rows(await svc.entities.BankTransaction.filter({id:body.transaction_id}))[0];
  if(!tx||!String(tx.plaid_transaction_id||'').startsWith('simplefin:'))throw Error('Transaction not found');
  if(tx.expense_id)return Response.json({expense_id:tx.expense_id,already_matched:true});
  if(tx.amount<=0||tx.pending)throw Error('Only posted purchases can be expensed');
  if(body.expense_id){
   const expense=rows(await svc.entities.Expense.filter({id:body.expense_id}))[0];
   if(!expense)throw Error('Expense not found');
   await svc.entities.BankTransaction.update(tx.id,{expense_id:expense.id,status:'matched',receipt_url:expense.receipt_url||tx.receipt_url||''});
   return Response.json({expense_id:expense.id,matched:true});
  }
  const category=String(body.category||'other');
  if(!['parts_cogs','supplies','tools_equipment','shipping','utilities','rent','labor','marketing','insurance','taxes','warranty_repair','other'].includes(category))throw Error('Invalid category');
  const expense=await svc.entities.Expense.create({expense_number:'BANK-'+tx.id.slice(-12),description:tx.description||tx.merchant||'Card purchase',vendor:tx.merchant||'',amount:tx.amount,date:tx.date,category,payment_method:'card',is_deductible:!!body.is_deductible,source:'manual',receipt_url:tx.receipt_url||'',notes:'Imported from SimpleFIN transaction '+tx.plaid_transaction_id});
  await svc.entities.BankTransaction.update(tx.id,{expense_id:expense.id,status:'matched',category});
  return Response.json({expense_id:expense.id});
 }
 throw Error('Unknown action');
 }catch(e){return Response.json({error:safe(e)},{status:400});}
});