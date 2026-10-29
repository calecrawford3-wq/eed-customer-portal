import React,{useState} from 'react';
import {base44} from '@/api/base44Client';
import {toast} from 'sonner';
import {ImagePlus,Trash2} from 'lucide-react';
const MAX=6;
export default function ProductPhotoManager({part,disabled,onSave}){
 const [busy,setBusy]=useState(false);
 const photos=[part.website_image_url,...(Array.isArray(part.website_images)?part.website_images:[])].filter(Boolean);
 const persist=async(list)=>{const clean=[...new Set(list.filter(Boolean))].slice(0,MAX);await onSave({website_images:clean,website_image_url:clean[0]||''});};
 const upload=async(files)=>{if(!files?.length)return;const room=MAX-photos.length;if(room<=0){toast.error(`Up to ${MAX} photos per product`);return}
  setBusy(true);try{const added=[];for(const file of Array.from(files).slice(0,room)){if(!file.type.startsWith('image/')||file.size>12*1024*1024){toast.error(`${file.name} must be an image under 12 MB`);continue}const uploaded=await base44.integrations.Core.UploadPublicFile({file});if(!uploaded?.file_url||!/^https:\/\//.test(uploaded.file_url))throw Error('upload failed');added.push(uploaded.file_url)}
   if(added.length)await persist([...photos,...added]);
  }catch{toast.error('Unable to upload product photos')}finally{setBusy(false)}};
 const remove=async(url)=>{setBusy(true);try{await persist(photos.filter(u=>u!==url))}catch{toast.error('Unable to remove photo')}finally{setBusy(false)}};
 const offline=disabled||busy;
 return <div className="min-w-[220px]">
  <p className="text-sm font-semibold">Product photos</p>
  <div className="flex flex-wrap gap-3 mt-2">
   {photos.map((url,i)=><div key={url} className="relative w-24 h-24 border rounded bg-slate-100 overflow-hidden">
    <img src={url} alt={`${part.name} photo ${i+1}`} className="w-full h-full object-contain"/>
    <button type="button" aria-label="Remove photo" disabled={offline} onClick={()=>remove(url)} className="absolute top-1 right-1 bg-white/90 border rounded p-1 text-red-700 disabled:opacity-40"><Trash2 size={12}/></button>
   </div>)}
   {photos.length<MAX&&<label className={`w-24 h-24 border-2 border-dashed rounded flex flex-col items-center justify-center text-xs text-slate-500 ${offline?'opacity-50':'cursor-pointer hover:border-slate-400'}`}>
    <ImagePlus size={18}/><span className="mt-1">{busy?'Uploading…':'Add photo'}</span>
    <input type="file" accept="image/*" multiple disabled={offline} className="hidden" onChange={e=>{upload(e.target.files);e.target.value=''}}/>
   </label>}
  </div>
  <p className="text-[11px] text-slate-500 mt-2">JPG, PNG, or WebP, up to 12 MB each. The first photo is the listing image; the rest appear in the product gallery. Up to {MAX} photos.</p>
 </div>;
}