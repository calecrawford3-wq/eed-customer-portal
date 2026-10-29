import React,{useEffect,useState} from 'react';
import {toast} from 'sonner';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
import {Plus,Trash2} from 'lucide-react';

const cleanRows=list=>(Array.isArray(list)?list:[])
 .map(r=>({label:String(r?.label||'').trim(),content:String(r?.content||'').trim()}))
 .filter(r=>r.label&&r.content);

export default function ProductListingContentEditor({part,disabled,onSave}){
 const [description,setDescription]=useState(part.website_description||'');
 const [rows,setRows]=useState(cleanRows(part.website_details));
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setDescription(part.website_description||'');setRows(cleanRows(part.website_details))},[part.id,part.website_description,part.website_details]);

 const update=(i,patch)=>setRows(r=>r.map((row,idx)=>idx===i?{...row,...patch}:row));
 const add=()=>setRows(r=>[...r,{label:'',content:''}]);
 const remove=i=>setRows(r=>r.filter((_,idx)=>idx!==i));

 const save=async()=>{
  const cleaned=cleanRows(rows);
  if(cleaned.length!==rows.filter(r=>r.label||r.content).length){toast.error('Each dropdown needs both a heading and content');return}
  setSaving(true);
  try{
   await onSave({website_description:description.trim(),website_details:cleaned});
   setRows(cleaned);
  }catch{toast.error('Unable to save listing details')}finally{setSaving(false)}
 };

 const offline=disabled||saving;
 return <div className="mt-4 border-t pt-4">
  <label className="text-sm font-semibold" htmlFor={`desc-${part.id}`}>Listing description</label>
  <Textarea id={`desc-${part.id}`} rows={3} value={description} disabled={offline} onChange={e=>setDescription(e.target.value)} placeholder="Customer-facing description shown on the website listing" className="mt-1"/>

  <div className="flex items-center justify-between mt-5">
   <div>
    <p className="text-sm font-semibold">Expandable info sections</p>
    <p className="text-[11px] text-slate-500">Each one appears as a dropdown on the listing with your own heading.</p>
   </div>
   <Button type="button" size="sm" variant="outline" disabled={offline} onClick={add}><Plus size={14} className="mr-1"/>Add section</Button>
  </div>

  <div className="space-y-3 mt-3">
   {rows.map((row,i)=><div key={i} className="border rounded-lg p-3 bg-slate-50">
    <div className="flex items-center gap-2">
     <Input value={row.label} disabled={offline} maxLength={80} placeholder="Dropdown heading (e.g. Fitment)" onChange={e=>update(i,{label:e.target.value})} className="bg-white"/>
     <button type="button" aria-label="Remove section" disabled={offline} onClick={()=>remove(i)} className="text-red-700 p-1 disabled:opacity-40"><Trash2 size={16}/></button>
    </div>
    <Textarea rows={2} value={row.content} disabled={offline} maxLength={2000} placeholder="What the customer sees when they open it" onChange={e=>update(i,{content:e.target.value})} className="mt-2 bg-white"/>
   </div>)}
   {!rows.length&&<p className="text-xs text-slate-500">No dropdowns yet. Add one for fitment notes, what's included, install specs, and so on.</p>}
  </div>

  <Button type="button" size="sm" disabled={offline} onClick={save} className="mt-3 bg-slate-900 text-white">{saving?'Saving…':'Save listing content'}</Button>
 </div>;
}