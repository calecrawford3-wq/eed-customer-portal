import React,{useState} from 'react';
import {base44} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
export default function Turn14ApiSettings({form,set}){
 const [busy,setBusy]=useState(''),[result,setResult]=useState(null),[orderId,setOrderId]=useState('');
 const run=async(name,fn)=>{
  setBusy(name);setResult(null);
  try{const r=await fn();setResult({name,data:r.data||r})}
  catch(e){setResult({name,error:e?.response?.data?.error||e.message||'Request failed'})}
  finally{setBusy('')}
 };
 const tests=[
  ['Connection / authentication',()=>base44.functions.invoke('turn14Catalog',{action:'test'})],
  ['Sync supplier inventory',()=>base44.functions.invoke('turn14SyncLinked',{mode:'inventory'})],
  ['Sync supplier pricing / MAP',()=>base44.functions.invoke('turn14SyncLinked',{mode:'pricing'})],
  ['Refresh submitted order tracking',()=>base44.functions.invoke('turn14SyncOrderTracking',{limit:60})],
  ['Prepare paid website orders',()=>base44.functions.invoke('turn14PreparePaidOrders',{})],
 ];
 return <section className="rounded-xl border bg-white p-5 space-y-4">
 <div><h3 className="text-xl font-bold">Turn 14 Distribution</h3><p className="text-sm text-slate-600">API diagnostics and supplier synchronization. The integration currently uses Turn 14's testing environment; live purchasing is not enabled.</p></div>
 <div className="grid sm:grid-cols-2 gap-3">{[
 ['turn14_inventory_sync','Automatically synchronize supplier inventory'],
 ['turn14_dealer_cost_map_sync','Automatically synchronize dealer costs and MAP'],
 ['turn14_auto_import','Automatically import supplier catalog items (catalog-wide automation not yet enabled)'],
 ['turn14_hide_supplier_identity','Hide supplier identity from customers'],
 ].map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm border rounded-lg p-3"><input type="checkbox" checked={!!form[key]} onChange={e=>set(key,e.target.checked)}/>{label}</label>)}</div>
 <p className="text-xs text-amber-700">Paid website orders may be prepared automatically, but final supplier submission remains an explicit staff action. Turning on a preference does not activate production purchasing.</p>
 <h4 className="font-semibold border-t pt-4">API test controls</h4>
 <div className="flex flex-wrap gap-2">{tests.map(([name,fn])=><Button key={name} variant="outline" disabled={!!busy} onClick={()=>run(name,fn)}>{busy===name?'Running…':name}</Button>)}</div>
 <div className="rounded-lg border p-3 space-y-2"><label className="text-sm font-semibold" htmlFor="api-test-fulfillment">Rejection simulation — website fulfillment ID</label><input id="api-test-fulfillment" value={orderId} onChange={e=>setOrderId(e.target.value)} placeholder="Paste website fulfillment record ID" className="w-full border rounded p-2 text-sm"/><Button variant="outline" disabled={!!busy||!orderId.trim()} onClick={()=>run('Simulated rejection tests',()=>base44.functions.invoke('turn14RejectionTest',{fulfillment_id:orderId.trim(),scenario:'all'}))}>Run all rejection tests</Button><p className="text-xs text-slate-500">Read-only simulation; never submits an order.</p></div>
 {result&&<div role="status" className="border rounded-lg bg-slate-50 p-4"><p className="font-bold text-sm">{result.name}</p>{result.error?<p className="text-red-700 text-sm mt-2">{result.error}</p>:<><p className="text-sm mt-2">{result.data?.results?result.data.results.filter(x=>x.passed).length+' / '+result.data.results.length+' scenarios passed':result.data?.errors?.length?'Completed with '+result.data.errors.length+' errors':'API action completed'}</p><details className="mt-2"><summary className="text-xs cursor-pointer">Technical response</summary><pre className="text-xs whitespace-pre-wrap break-all max-h-72 overflow-auto">{JSON.stringify(result.data,null,2)}</pre></details></>}</div>}
 </section>;
}
