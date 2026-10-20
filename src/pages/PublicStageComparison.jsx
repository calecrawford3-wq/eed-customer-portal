import React, {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {base44Public} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
import {formatMoney} from '@/lib/money';

export default function PublicStageComparison() {
  const {token}=useParams();
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [chosen,setChosen]=useState('');
  const [interest,setInterest]=useState([]);
  const [note,setNote]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let active=true;
    base44Public.functions.invoke('getPublicComparison',{comparison_public_token:token})
      .then(r=>{if(r.data?.error)throw Error(r.data.error);if(active)setData(r.data);})
      .catch(()=>{if(active)setError('Comparison link is unavailable. Please contact Elite.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false};
  },[token]);
  const stages=data?.stages||[];
  const canChoose=stages.length>=2&&stages.every(s=>s.status==='sent');
  async function act(type){
    if(busy)return;
    setBusy(true);setError('');
    try {
      const name=type==='choose'?'approvePublicComparisonStage':'expressComparisonInterest';
      const payload=type==='choose'?{comparison_public_token:token,chosen_estimate_id:chosen}:{comparison_public_token:token,interested_estimate_ids:interest,note};
      const r=await base44Public.functions.invoke(name,payload);
      if(r.data?.error||!r.data?.success)throw Error(r.data?.error||'Unable to save response');
      setMessage(type==='choose'?'Your stage choice has been submitted to Elite.':'Your interests have been sent to Elite.');
      setData(d=>({...d,stages:d.stages.map(s=>({...s,status:type==='choose'?(s.id===chosen?'approved':'declined'):s.status}))}));
    }catch(e){setError(e.message||'Unable to save your response.');}
    finally{setBusy(false);}
  }
  return <main className="min-h-screen bg-slate-50 px-4 py-7 text-slate-900">
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="rounded-xl bg-white p-5 shadow-sm">
        <p className="text-sm font-bold text-red-700">ELITE ENGINE DEVELOPMENT</p>
        <h1 className="mt-1 text-2xl font-bold">Compare Your Engine Build Options</h1>
        <p className="text-sm text-slate-500">Compare stages and choose the option that fits your racing needs.</p>
      </header>
      {loading&&<p role="status">Loading comparison…</p>}
      {error&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
      {message&&<p role="status" className="rounded-lg bg-green-50 p-4 text-green-800">{message}</p>}
      {data&&<>
        {data.ai_summary&&<section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="font-bold">Comparison overview</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{data.ai_summary}</p></section>}
        <div className="grid gap-4 md:grid-cols-3">{stages.map(s=><article key={s.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">{s.comparison_stage_label||s.estimate_number}</h2>
          <p className="mt-1 text-xs text-slate-500">{s.estimate_number} · {s.status}</p>
          <p className="my-4 text-3xl font-bold">{formatMoney(s.total)}</p>
          <ul className="space-y-2 text-sm">{[...(s.line_items||[]).map(i=>i.item_name),...(s.labor_items||[]).map(i=>i.name),...(s.machining_items||[]).map(i=>i.name)].map((label,i)=><li key={i} className="border-b pb-2">{label}</li>)}</ul>
          <a className="mt-4 inline-block text-sm font-semibold text-red-700 underline" href={'/estimate/'+encodeURIComponent(s.public_access_token)}>View full estimate</a>
          {canChoose&&<div className="mt-4 space-y-3 border-t pt-3">
            <label className="flex cursor-pointer gap-2 text-sm"><input type="radio" name="chosen" checked={chosen===s.id} onChange={()=>setChosen(s.id)}/>Choose this stage</label>
            <label className="flex cursor-pointer gap-2 text-sm"><input type="checkbox" checked={interest.includes(s.id)} onChange={e=>setInterest(v=>e.target.checked?[...v,s.id]:v.filter(id=>id!==s.id))}/>Interested in this stage</label>
          </div>}
        </article>)}</div>
        {canChoose&&<section className="rounded-xl bg-white p-5 shadow-sm space-y-3">
          <h2 className="font-bold">Submit your decision</h2>
          <Button className="w-full bg-red-600 hover:bg-red-700" disabled={!chosen||busy} onClick={()=>act('choose')}>Approve Selected Stage</Button>
          <p className="text-center text-sm text-slate-500">Or ask Elite to discuss multiple options with you</p>
          <textarea className="min-h-20 w-full rounded-lg border p-3 text-sm" value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} placeholder="Optional questions or comments"/>
          <Button variant="outline" className="w-full" disabled={!interest.length||busy} onClick={()=>act('interest')}>Send My Interests</Button>
        </section>}
      </>}
    </div>
  </main>;
}
