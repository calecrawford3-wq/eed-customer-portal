import React,{useState,useEffect} from 'react';
import {base44} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';

export default function CardOnFileSettings(){
 const [status,setStatus]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [save,setSave]=useState(false),[auto,setAuto]=useState(false);
 const refresh=async()=>{try{const r=await base44.functions.invoke('manageCardOnFile',{action:'status'});if(r.data?.error)throw Error(r.data.error);setStatus(r.data);}catch(e){setError(e.message||'Could not load saved cards');}};
 useEffect(()=>{refresh();},[]);
 const act=async(payload)=>{setBusy(true);setError('');try{const r=await base44.functions.invoke('manageCardOnFile',payload);if(r.data?.error)throw Error(r.data.error);if(r.data?.checkout_url){window.location.assign(r.data.checkout_url);return;}await refresh();}catch(e){setError(e.message||'Could not update card');}finally{setBusy(false);}};
 return <section className="rounded-xl border bg-white p-4 space-y-3">
  <h3 className="font-semibold">Saved cards and payment authorization</h3>
  <p className="text-sm text-slate-600">Your card is securely stored by Stripe, not Elite. No automatic overdue charges are active while setup and testing are incomplete.</p>
  {status?.cards?.map(card=><div key={card.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm"><span>{card.brand} ending {card.last4} · expires {card.exp_month}/{card.exp_year}</span><Button disabled={busy} size="sm" variant="outline" onClick={()=>act({action:'revoke',remove_card_id:card.id})}>Remove</Button></div>)}
  {status?.auto_authorized&&<div className="rounded border p-3 text-sm"><p>You have authorized future overdue collection, but automatic charging is not active.</p><Button disabled={busy} variant="outline" size="sm" onClick={()=>act({action:'revoke'})}>Revoke automatic-charge authorization</Button></div>}
  <label className="flex gap-2 items-start text-sm"><Checkbox checked={save} onCheckedChange={v=>setSave(v===true)}/><span>I agree to securely save my payment card with Stripe for future payments. I can remove it at any time.</span></label>
  <label className="flex gap-2 items-start text-sm"><Checkbox checked={auto} onCheckedChange={v=>setAuto(v===true)}/><span><strong>Optional:</strong> I authorize Elite Engine Development to charge my saved card for the unpaid, undisputed invoice balance 3 calendar days after its due date, with an advance reminder before charging. I can revoke this authorization before a charge. This feature is not active yet.</span></label>
  <Button disabled={busy||!save} onClick={()=>act({action:'setup',save_card_consent:save,auto_collect_consent:auto})}>Continue to Stripe to save card</Button>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
