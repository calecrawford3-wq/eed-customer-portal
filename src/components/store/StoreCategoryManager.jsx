import React,{useState} from 'react';
import {base44} from '@/api/base44Client';
import {toast} from 'sonner';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Image as ImageIcon,Upload,Trash2} from 'lucide-react';
const makeKey=()=> 'store_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
export default function StoreCategoryManager({categories=[],onChange}){
 const [name,setName]=useState(''),[busy,setBusy]=useState('');
 const persist=async(row,patch)=>{
  setBusy(row.id);
  try{await base44.entities.StoreCategory.update(row.id,patch);await onChange?.();toast.success('Category saved')}
  catch(e){toast.error('Unable to save category')}finally{setBusy('')}
 };
 const create=async()=>{
  const label=name.trim();if(!label)return;
  setBusy('create');try{await base44.entities.StoreCategory.create({category_key:makeKey(),label,visible:true,sort_order:categories.length+1});setName('');await onChange?.();toast.success('Category created')}catch(e){toast.error('Unable to create category')}finally{setBusy('')}
 };
 const upload=async(row,file)=>{
  if(!file)return;if(!file.type.startsWith('image/')||file.size>8*1024*1024){toast.error('Choose an image under 8 MB');return}
  setBusy(row.id);try{const result=await base44.integrations.Core.UploadPublicFile({file});await base44.entities.StoreCategory.update(row.id,{image_url:result.file_url});await onChange?.()}catch(e){toast.error('Image upload failed')}finally{setBusy('')}
 };
 const remove=async(row)=>{
  if(!window.confirm('Delete this storefront category? Products will remain published under Shop All.'))return;
  setBusy(row.id);try{await base44.entities.StoreCategory.delete(row.id);await onChange?.();toast.success('Category deleted')}catch(e){toast.error('Unable to delete category')}finally{setBusy('')}
 };
 return <div className="space-y-4">
  <div className="rounded-xl bg-white border p-4 flex gap-3 items-center"><div className="h-14 w-20 bg-slate-100 rounded flex items-center justify-center"><ImageIcon size={22} className="text-slate-400"/></div><div><strong>Shop All</strong><p className="text-xs text-slate-500">Permanent first card · Every published product · No assignment needed</p></div></div>
  <div className="flex gap-2"><Input value={name} onChange={e=>setName(e.target.value)} placeholder="New storefront category name" aria-label="New category name"/><Button type="button" disabled={!!busy||!name.trim()} onClick={create}>Add category</Button></div>
  <div className="grid sm:grid-cols-2 gap-3">{categories.filter(c=>c.category_key!=='All').sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(row=><div key={row.id} className="border rounded-xl p-4 bg-white flex gap-4">
   <div className="w-20 h-20 shrink-0 bg-slate-100 border rounded overflow-hidden flex items-center justify-center">{row.image_url?<img src={row.image_url} alt="" className="w-full h-full object-cover"/>:<ImageIcon className="text-slate-400" size={24}/>}</div>
   <div className="min-w-0 flex-1 space-y-2">
    <Input key={row.id+row.label} defaultValue={row.label||''} disabled={busy===row.id} onBlur={e=>{const label=e.target.value.trim();if(label&&label!==row.label)persist(row,{label})}} aria-label="Category display name" className="h-8"/>
    <div className="flex flex-wrap items-center gap-2">
     <label className="text-xs cursor-pointer inline-flex items-center gap-1 rounded border px-2 py-1"><Upload size={12}/> {row.image_url?'Replace image':'Add image'}<input type="file" accept="image/*" className="hidden" disabled={busy===row.id} onChange={e=>upload(row,e.target.files?.[0])}/></label>
     <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={row.visible!==false} disabled={busy===row.id} onChange={e=>persist(row,{visible:e.target.checked})}/>Show</label>
     <label className="flex items-center gap-1 text-xs">Order <Input type="number" key={row.id+row.sort_order} defaultValue={row.sort_order||0} className="w-16 h-7" onBlur={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n!==Number(row.sort_order||0))persist(row,{sort_order:n})}}/></label>
     <button type="button" aria-label="Delete category" title="Delete category" onClick={()=>remove(row)} className="text-red-600"><Trash2 size={16}/></button>
    </div>
   </div>
  </div>)}</div>
 </div>;
}