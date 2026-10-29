import React,{useEffect,useState} from 'react';
import {base44} from '@/api/base44Client';
import {toast} from 'sonner';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Image as ImageIcon,Upload} from 'lucide-react';
const pretty=s=>String(s||'other').replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase());
export default function StoreCategoryManager({categories}){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState('');
 useEffect(()=>{base44.entities.StoreCategory.list().then(list=>setRows(Array.isArray(list)?list:list?.items||[])).catch(()=>toast.error('Could not load store categories')).finally(()=>setLoading(false))},[]);
 const persist=async(key,patch)=>{
  const existing=rows.find(r=>r.category_key===key);
  setBusy(key);
  try{
   if(existing){await base44.entities.StoreCategory.update(existing.id,patch);setRows(all=>all.map(r=>r.id===existing.id?{...r,...patch}:r));}
   else{const created=await base44.entities.StoreCategory.create({category_key:key,visible:true,sort_order:0,...patch});setRows(all=>[...all,created]);}
  }catch(e){toast.error('Unable to save category card')}finally{setBusy('')}
 };
 const upload=async(key,file)=>{
  if(!file)return;
  if(!file.type.startsWith('image/')){toast.error('Choose an image file');return}
  if(file.size>8*1024*1024){toast.error('Image must be under 8 MB');return}
  setBusy(key);
  try{const {file_url}=await base44.integrations.Core.UploadPublicFile({file});await persist(key,{image_url:file_url})}
  catch(e){toast.error('Image upload failed')}
  finally{setBusy('')}
 };
 if(loading)return <p className="text-sm text-slate-500">Loading category cards…</p>;
 if(!categories.length)return <p className="text-sm text-slate-500">Categories appear here once inventory parts exist.</p>;
 return <div className="grid sm:grid-cols-2 gap-3">{categories.map(({key,count})=>{
  const row=rows.find(r=>r.category_key===key)||{};
  const busyRow=busy===key;
  return <div key={key} className="border rounded-xl p-4 bg-white flex gap-4">
   <div className="w-20 h-20 shrink-0 bg-slate-100 border rounded overflow-hidden flex items-center justify-center">{row.image_url?<img src={row.image_url} alt="" className="w-full h-full object-cover"/>:<ImageIcon className="text-slate-400" size={24}/>}</div>
   <div className="min-w-0 flex-1 space-y-2">
    <p className="text-xs text-slate-500 uppercase tracking-wide">{pretty(key)} · {count} {count===1?'part':'parts'}</p>
    <Input defaultValue={row.label||''} placeholder={pretty(key)} disabled={busyRow} aria-label={`Card name for ${pretty(key)}`} onBlur={e=>{const v=e.target.value.trim();if(v!==(row.label||''))persist(key,{label:v})}} className="h-8"/>
    <div className="flex items-center gap-3 flex-wrap">
     <label className={'text-xs cursor-pointer inline-flex items-center gap-1 rounded border px-2 py-1 '+(busyRow?'opacity-50':'')}><Upload size={12}/> {row.image_url?'Replace image':'Add image'}<input type="file" accept="image/*" className="hidden" disabled={busyRow} onChange={e=>upload(key,e.target.files?.[0])}/></label>
     <label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={busyRow} checked={row.visible!==false} onChange={e=>persist(key,{visible:e.target.checked})}/>Show on store</label>
     <label className="flex items-center gap-1 text-xs text-slate-600">Order<Input type="number" defaultValue={row.sort_order||0} disabled={busyRow} onBlur={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n!==Number(row.sort_order||0))persist(key,{sort_order:n})}} className="h-7 w-16 ml-1"/></label>
     {row.image_url&&<Button type="button" variant="ghost" size="sm" className="text-xs h-7" disabled={busyRow} onClick={()=>persist(key,{image_url:''})}>Remove</Button>}
    </div>
   </div>
  </div>;
 })}</div>;
}