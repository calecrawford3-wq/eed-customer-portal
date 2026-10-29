import React,{useEffect,useState} from 'react';
import {base44} from '@/api/base44Client';
import {toast} from 'sonner';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Button} from '@/components/ui/button';
const rows=v=>Array.isArray(v)?v:v?.items||[];
const empty={key:'global',checkout_enabled:false,shipping_flat_cents:0,free_shipping_threshold_cents:0,pickup_instructions:''};
export default function StoreCheckoutSettings(){
 const [record,setRecord]=useState(null),[form,setForm]=useState(empty),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true);
 const dollars=cents=>(Number(cents||0)/100).toFixed(2);
 const [dollarDraft,setDollarDraft]=useState({});
 const dollarValue=key=>dollarDraft[key]??dollars(form[key]);
 const setDollarValue=(key,value)=>{if(value===''||/^\d*(\.\d{0,2})?$/.test(value))setDollarDraft(d=>({...d,[key]:value}))};
 useEffect(()=>{let active=true;base44.entities.WebsiteStoreSettings.filter({key:'global'}).then(r=>{if(!active)return;const found=rows(r)[0];if(found){setRecord(found);setForm({...empty,...found})}}).catch(()=>toast.error('Could not load store checkout settings')).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const set=(key,value)=>setForm(f=>({...f,[key]:value}));
 const save=async()=>{setSaving(true);try{const payload={key:'global',checkout_enabled:!!form.checkout_enabled,shipping_flat_cents:Math.max(0,Math.round(Number(dollarValue('shipping_flat_cents'))*100)||0),free_shipping_threshold_cents:Math.max(0,Math.round(Number(dollarValue('free_shipping_threshold_cents'))*100)||0),pickup_instructions:String(form.pickup_instructions||'').slice(0,400)};
  const saved=record?await base44.entities.WebsiteStoreSettings.update(record.id,payload):await base44.entities.WebsiteStoreSettings.create(payload);
  setRecord(saved);setForm(f=>({...f,...payload}));setDollarDraft({});toast.success('Store checkout settings saved');
 }catch{toast.error('Unable to save store checkout settings')}finally{setSaving(false)}};
 if(loading)return <p className="text-sm text-slate-500">Loading store checkout settings…</p>;
 return <section className="border rounded-xl bg-white p-5 mt-6">
  <h2 className="font-bold">Store checkout</h2>
  <p className="text-sm text-slate-600 mt-1">Card payments run through your connected Stripe account. Sales tax uses the Default Tax Rate in Settings → Billing Defaults and applies to parts picked up or shipped in Oklahoma.</p>
  <label className="flex items-start gap-3 mt-4 text-sm font-semibold"><input type="checkbox" className="mt-1" checked={!!form.checkout_enabled} onChange={e=>set('checkout_enabled',e.target.checked)}/><span>Accept online card payments<span className="block font-normal text-slate-500 text-xs mt-1">When off, the store stays browsing-only and the cart cannot be paid.</span></span></label>
  <div className="grid sm:grid-cols-2 gap-4 mt-5">
   <div><Label>Flat shipping charge ($)</Label><Input type="text" inputMode="decimal" value={dollarValue('shipping_flat_cents')} onChange={e=>setDollarValue('shipping_flat_cents',e.target.value)}/><p className="text-xs text-slate-500 mt-1">Charged per shipped parts order. 0 = free shipping.</p></div>
   <div><Label>Free shipping over ($)</Label><Input type="text" inputMode="decimal" value={dollarValue('free_shipping_threshold_cents')} onChange={e=>setDollarValue('free_shipping_threshold_cents',e.target.value)}/><p className="text-xs text-slate-500 mt-1">Parts subtotal that ships free. 0 disables the threshold.</p></div>
  </div>
  <div className="mt-4"><Label>Pickup instructions (optional)</Label><Input value={form.pickup_instructions||''} onChange={e=>set('pickup_instructions',e.target.value)} placeholder="Pickup at 123 Main St, Mon–Fri 9–5"/></div>
  <Button className="mt-5" onClick={save} disabled={saving}>{saving?'Saving…':'Save store checkout settings'}</Button>
 </section>;
}