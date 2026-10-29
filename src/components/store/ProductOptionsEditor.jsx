import React,{useEffect,useState} from 'react';
import {base44} from '@/api/base44Client';
import {toast} from 'sonner';
export default function ProductOptionsEditor({part,onSave,disabled}){
 const [config,setConfig]=useState(part.website_customization||{enabled:false,label:'Driver number',required:false,maxLength:20});
 const [variants,setVariants]=useState(part.website_variants||[]);
 const [catalog,setCatalog]=useState([]);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{setConfig(part.website_customization||{enabled:false,label:'Driver number',required:false,maxLength:20});setVariants(part.website_variants||[])},[part.id,part.website_customization,part.website_variants]);
 useEffect(()=>{base44.entities.Part.list().then(d=>setCatalog(Array.isArray(d)?d:d?.items||[])).catch(()=>{})},[]);
 const save=async()=>{if(variants.some(v=>!v.partId||!v.label?.trim())||new Set(variants.map(v=>v.partId)).size!==variants.length){toast.error('Every option needs a unique inventory part and a display label');return}setBusy(true);try{await onSave({website_customization:{...config,maxLength:Math.min(60,Math.max(1,Number(config.maxLength)||20))},website_variants:variants.map(v=>({label:v.label.trim(),partId:v.partId}))})}catch{}finally{setBusy(false)}};
 return <div className="mt-4 border-t pt-4 space-y-3">
  <h3 className="font-semibold text-sm">Customer product options</h3>
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!config.enabled} onChange={e=>setConfig(c=>({...c,enabled:e.target.checked}))}/>Allow customer personalization (e.g. driver number)</label>
  {config.enabled&&<div className="flex flex-wrap gap-3"><label className="text-xs">Field label<input className="block border p-2 rounded" value={config.label||''} onChange={e=>setConfig(c=>({...c,label:e.target.value}))}/></label><label className="text-xs">Max characters<input type="number" min="1" max="60" className="block border p-2 rounded w-24" value={config.maxLength||20} onChange={e=>setConfig(c=>({...c,maxLength:e.target.value}))}/></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!config.required} onChange={e=>setConfig(c=>({...c,required:e.target.checked}))}/>Required</label></div>}
  <p className="text-sm font-semibold">Selectable versions / variants</p>
  <p className="text-xs text-slate-500">Link each choice to its own inventory part. Its actual SKU, price and stock are used at checkout. Example: Suzuki cradle vs Yamaha cradle.</p>
  {variants.map((v,i)=><div key={i} className="flex flex-wrap gap-2 items-center"><input className="border rounded p-2 text-sm flex-1" placeholder="Choice label, e.g. Suzuki GSX-R600" value={v.label||''} onChange={e=>setVariants(all=>all.map((x,j)=>j===i?{...x,label:e.target.value}:x))}/><select className="border rounded p-2 text-sm max-w-72" value={v.partId||''} onChange={e=>setVariants(all=>all.map((x,j)=>j===i?{...x,partId:e.target.value}:x))}><option value="">Select inventory part / SKU</option>{catalog.filter(p=>p.id!==part.id&&p.status!=='discontinued').map(p=><option key={p.id} value={p.id}>{p.part_number} — {p.name} — ${Number(p.sell_price||0).toFixed(2)}</option>)}</select><button type="button" className="text-red-600 text-xs" onClick={()=>setVariants(v=>v.filter((_,j)=>j!==i))}>Remove</button></div>)}
  <div className="flex gap-2"><button type="button" className="border rounded px-3 py-2 text-xs" onClick={()=>setVariants(v=>[...v,{label:'',partId:''}])}>+ Add choice</button><button type="button" disabled={disabled||busy} onClick={save} className="bg-slate-900 text-white rounded px-3 py-2 text-xs">Save product options</button></div>
 </div>;
}