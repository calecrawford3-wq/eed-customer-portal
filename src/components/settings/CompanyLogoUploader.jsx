import React,{useRef,useState} from 'react';
import {base44} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {ImagePlus,Loader2,Trash2} from 'lucide-react';
import {toast} from 'sonner';

const ACCEPT='image/png,image/jpeg,image/webp,image/svg+xml';
const MAX_BYTES=5*1024*1024;

export default function CompanyLogoUploader({value='',onChange,label='Company Logo',disabled=false,dark=false}){
 const inputRef=useRef(null);
 const [uploading,setUploading]=useState(false);
 const upload=async file=>{
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type)){toast.error('Use a PNG, JPG, WebP, or SVG logo.');return;}
  if(file.size>MAX_BYTES){toast.error('Logo must be 5 MB or smaller.');return;}
  setUploading(true);
  try{
   const res=await base44.integrations.Core.UploadFile({file});
   if(!res?.file_url)throw Error('Upload did not return a file.');
   onChange(res.file_url);
   toast.success('Company logo uploaded');
  }catch(e){toast.error(e?.message||'Could not upload logo');}
  finally{setUploading(false);if(inputRef.current)inputRef.current.value='';}
 };
 return <div className="space-y-2">
  <Label className={dark?"text-white":""}>{label}</Label>
  <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" disabled={disabled||uploading} onChange={e=>upload(e.target.files?.[0])}/>
  <div className={`rounded-xl border border-dashed p-4 ${dark?"border-slate-700 bg-slate-900":"border-slate-300 bg-slate-50"}`}>
   {value?<div className="flex flex-col sm:flex-row sm:items-center gap-4">
    <div className={`h-20 w-44 rounded-lg border p-2 flex items-center justify-center ${dark?"border-slate-700 bg-slate-950":"bg-white"}`}><img src={value} alt="Company logo preview" className="max-h-full max-w-full object-contain"/></div>
    <div className="flex flex-wrap gap-2">
     <Button type="button" variant="outline" disabled={disabled||uploading} onClick={()=>inputRef.current?.click()}>{uploading?<Loader2 className="w-4 h-4 mr-1 animate-spin"/>:<ImagePlus className="w-4 h-4 mr-1"/>}Replace Logo</Button>
     <Button type="button" variant="ghost" className="text-red-600" disabled={disabled||uploading} onClick={()=>onChange('')}><Trash2 className="w-4 h-4 mr-1"/>Remove</Button>
    </div>
   </div>:<button type="button" disabled={disabled||uploading} onClick={()=>inputRef.current?.click()} className="w-full py-5 text-center disabled:opacity-50">
    {uploading?<Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-500"/>:<ImagePlus className="w-7 h-7 mx-auto text-slate-400"/>}
    <p className={`mt-2 text-sm font-semibold ${dark?"text-white":"text-slate-700"}`}>{uploading?'Uploading logo…':'Upload Company Logo'}</p>
    <p className={`text-xs mt-1 ${dark?"text-slate-400":"text-slate-500"}`}>PNG, JPG, WebP, or SVG · 5 MB max</p>
   </button>}
  </div>
 </div>;
}