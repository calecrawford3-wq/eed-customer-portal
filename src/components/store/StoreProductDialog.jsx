import React,{useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Package} from 'lucide-react';
const title=s=>String(s||'other').replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase());
export default function StoreProductDialog({product,onClose,onAdd}){
 const [active,setActive]=useState(0);
 if(!product)return null;
 const photos=product.images?.length?product.images:(product.imageUrl?[product.imageUrl]:[]);
 const close=open=>{if(!open){setActive(0);onClose()}};
 return <Dialog open onOpenChange={close}>
  <DialogContent className="max-w-3xl bg-[#141518] border-white/15 text-white">
   <DialogHeader><DialogTitle className="text-xl font-black uppercase tracking-tight">{product.name}</DialogTitle></DialogHeader>
   <div className="grid sm:grid-cols-2 gap-6">
    <div>
     <div className="aspect-square bg-[#22252a] flex items-center justify-center overflow-hidden border border-white/10">
      {photos[active]?<img src={photos[active]} alt={product.name} className="w-full h-full object-contain"/>:<Package size={60} className="text-zinc-600"/>}
     </div>
     {photos.length>1&&<div className="flex gap-2 mt-3 flex-wrap">{photos.map((url,i)=><button key={url} type="button" onClick={()=>setActive(i)} aria-label={'Photo '+(i+1)} className={i===active?'w-16 h-16 border border-red-500 overflow-hidden':'w-16 h-16 border border-white/15 overflow-hidden'}><img src={url} alt="" className="w-full h-full object-cover"/></button>)}</div>}
    </div>
    <div>
     <p className="text-red-500 text-[11px] tracking-[.2em] uppercase font-semibold">{title(product.category)}</p>
     <p className="text-zinc-500 text-xs mt-2">{product.sku}</p>
     {product.description&&<p className="text-zinc-300 text-sm mt-4 whitespace-pre-line">{product.description}</p>}
     <p className="text-zinc-500 text-xs mt-4">{product.availability}</p>
     <p className="text-3xl font-black mt-2">${Number(product.price||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
     <button type="button" onClick={()=>onAdd(product)} className="mt-5 w-full bg-white text-black text-xs font-bold uppercase tracking-widest px-4 py-3 hover:bg-zinc-200">Add to cart</button>
    </div>
   </div>
  </DialogContent>
 </Dialog>;
}