import React, {useEffect,useRef,useState} from 'react';
import {useParams} from 'react-router-dom';
import {base44Public} from '@/api/base44Client';
import {Button} from '@/components/ui/button';

export default function PublicLegalViewer(){
  const {token}=useParams();
  const [doc,setDoc]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [signature,setSignature]=useState('');
  const canvas=useRef(null);
  const drawing=useRef(false);
  useEffect(()=>{
    let active=true;
    base44Public.functions.invoke('getPublicLegalDocument',{publicAccessToken:token})
      .then(r=>{if(r.data?.error)throw Error(r.data.error);if(active)setDoc(r.data?.legal_documents?.[0]||null);})
      .catch(()=>{if(active)setError('This agreement link is unavailable.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false};
  },[token]);
  const pos=e=>{const rect=canvas.current.getBoundingClientRect();return {x:(e.clientX-rect.left)*canvas.current.width/rect.width,y:(e.clientY-rect.top)*canvas.current.height/rect.height};};
  function drawStart(e){e.preventDefault();drawing.current=true;canvas.current.setPointerCapture(e.pointerId);const p=pos(e);const ctx=canvas.current.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#0f172a';ctx.beginPath();ctx.moveTo(p.x,p.y);}
  function drawMove(e){if(!drawing.current)return;e.preventDefault();const p=pos(e);const ctx=canvas.current.getContext('2d');ctx.lineTo(p.x,p.y);ctx.stroke();}
  function drawStop(){if(!drawing.current)return;drawing.current=false;setSignature(canvas.current.toDataURL('image/png'));}
  async function sign(){
    if(!signature||busy)return;
    setBusy(true);setError('');
    try{const r=await base44Public.functions.invoke('signLegalDocument',{publicAccessToken:token,customerSignature:signature});if(r.data?.error||!r.data?.success)throw Error(r.data?.error||'Unable to sign');setDoc(d=>({...d,status:'fully_signed',customer_signature:signature}));}
    catch(e){setError(e.message||'Unable to sign agreement');}
    finally{setBusy(false);}
  }
  const ready=doc && doc.status!=='fully_signed' && doc.status!=='void' && doc.status!=='pending_admin' && (doc.document_type!=='contract_engine'||!!doc.admin_signature);
  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900"><div className="mx-auto max-w-2xl space-y-4">
    <header className="rounded-xl bg-white p-5"><p className="text-sm font-bold text-red-700">ELITE ENGINE DEVELOPMENT</p><h1 className="mt-1 text-2xl font-bold">Customer Agreement</h1></header>
    {loading&&<p role="status">Loading agreement…</p>}
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
    {doc&&<section className="space-y-4 rounded-xl bg-white p-5">
      <h2 className="text-xl font-bold">{doc.title||'Agreement'}</h2><p className="text-sm text-slate-500">Status: {doc.status?.replaceAll('_',' ')}</p>
      <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 font-sans text-sm leading-relaxed">{doc.body}</pre>
      {doc.seal_tag_numbers&&<p className="text-sm">Seal tags: {doc.seal_tag_numbers}</p>}
      {(doc.seal_tag_photos||[]).map((src,i)=><img key={i} src={src} alt={'Seal tag '+(i+1)} className="max-h-48 rounded-lg object-contain"/>)}
      {ready&&<div className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">Sign agreement</h3>
        <p className="text-xs text-slate-600">Read the complete agreement above before signing. Your electronic signature will be saved to this document.</p>
        <canvas ref={canvas} width={700} height={210} className="w-full touch-none rounded-lg border-2 border-dashed bg-white" style={{height:150}} onPointerDown={drawStart} onPointerMove={drawMove} onPointerUp={drawStop} onPointerCancel={drawStop}/>
        <Button variant="outline" onClick={()=>{canvas.current?.getContext('2d').clearRect(0,0,700,210);setSignature('');}}>Clear signature</Button>
        <Button className="ml-2 bg-red-600 hover:bg-red-700" disabled={!signature||busy} onClick={sign}>{busy?'Saving…':'Agree & Sign'}</Button>
      </div>}
      {doc.status==='fully_signed'&&<p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">Agreement signed successfully.</p>}
      {doc.status==='pending_admin'&&<p className="text-sm text-amber-800">Waiting for Elite to sign before you can sign.</p>}
    </section>}
  </div></main>;
}
