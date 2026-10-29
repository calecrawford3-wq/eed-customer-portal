import React,{useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Package} from 'lucide-react';
import ProductDetailSections from '@/components/store/ProductDetailSections';
const title=s=>String(s||'other').replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase());
export default function StoreProductDialog({product,onClose,onAdd}){
 const [active,setActive]=useState(0),[variantId,setVariantId]=useState(''),[personalization,setPersonalization]=useState(''),[quantity,setQuantity]=useState(1);
 if(!product)return null;
 const basePhotos=product.images?.length?product.images:(product.imageUrl?[product.imageUrl]:[]);
 const variants=product.variants||[];const selected=variants.find(v=>v.partId===variantId);const inStock=variants.length?!!selected?.inStock:product.inStock!==false;const custom=product.customization;const customValid=!custom?.enabled||((!custom.required||!!personalization.trim())&&personalization.trim().length<=(custom.maxLength||20));const add=()=>{if(!inStock||!customValid)return;onAdd({...product,id:selected?.partId||product.id,parentId:selected?product.id:undefined,sku:selected?.sku||product.sku,price:selected?.price??product.price,name:selected?product.name+' — '+selected.label:product.name,personalization:custom?.enabled?personalization.trim():'',variantLabel:selected?.label||'',quantity});setQuantity(1);setVariantId('');setPersonalization('')};
 const close=open=>{if(!open){setActive(0);onClose()}};
 return <Dialog open onOpenChange={close}>
  <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-[#141518] border-white/15 text-white">
   <DialogHeader><DialogTitle className="text-xl font-black uppercase tracking-tight">{product.name}</DialogTitle></DialogHeader>
   <div className="grid sm:grid-cols-2 gap-6">
    <div>
     <div className="aspect-square bg-[#22252a] flex items-center justify-center overflow-hidden border border-white/10">
      {photos[active]?<img src={photos[active]} alt={product.name} className="w-full h-full object-contain"/>:<Package size={60} className="text-zinc-600"/>}
     </div>
     {photos.length>1&&<div className="flex gap-2 mt-3 flex-wrap">{photos.map((url,i)=><button key={url} type="button" onClick={()=>setActive(i)} aria-label={'Photo '+(i+1)} className={i===active?'w-16 h-16 border border-red-500 overflow-hidden':'w-16 h-16 border border-white/15 overflow-hidden'}><img src={url} alt="" className="w-full h-full object-cover"/></button>)}</div>}
    </div>
    <div>
     <p className="text-red-500 text-[11px] tracking-[.2em] uppercase font-semibold">Elite Performance</p>
     <p className="text-zinc-500 text-xs mt-2">{selected?.sku||product.sku}</p>
     {product.description&&<p className="text-zinc-300 text-sm mt-4 whitespace-pre-line">{product.description}</p>}
     <p className={inStock?'text-zinc-500 text-xs mt-4':'text-red-400 text-xs mt-4 font-semibold uppercase tracking-wide'}>{product.availability}</p>
     <p className="text-3xl font-black mt-2">${Number(selected?.price??product.price??0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
     {variants.length>0&&<label className="block mt-4 text-sm font-semibold">Choose version<select value={variantId} onChange={e=>setVariantId(e.target.value)} className="block mt-2 w-full bg-[#22252a] text-white border border-white/30 p-3"><option value="">Select an option</option>{variants.map(v=><option key={v.partId} value={v.partId} disabled={!v.inStock}>{v.label} — {v.sku} — $ {Number(v.price).toFixed(2)}{v.inStock?'':' (Out of stock)'}</option>)}</select></label>}{custom?.enabled&&<label className="block mt-4 text-sm font-semibold">{custom.label||'Personalization'}{custom.required?' *':''}<input value={personalization} maxLength={custom.maxLength||20} onChange={e=>setPersonalization(e.target.value)} className="block mt-2 w-full bg-[#22252a] text-white border border-white/30 p-3" placeholder="Enter your customization"/></label>}<label className="block mt-4 text-sm font-semibold">Quantity<div className="flex items-center mt-2"><button type="button" aria-label="Decrease quantity" disabled={quantity<=1} onClick={()=>setQuantity(q=>Math.max(1,q-1))} className="border border-white/30 px-4 py-3 disabled:opacity-30">−</button><input type="number" min="1" max="99" value={quantity} onChange={e=>setQuantity(Math.max(1,Math.min(99,Math.trunc(Number(e.target.value)||1))))} className="w-20 text-center bg-[#22252a] border-y border-white/30 p-3" aria-label="Quantity"/><button type="button" aria-label="Increase quantity" disabled={quantity>=99} onClick={()=>setQuantity(q=>Math.min(99,q+1))} className="border border-white/30 px-4 py-3 disabled:opacity-30">+</button></div></label><button type="button" onClick={add} disabled={!inStock||!customValid} className="mt-5 w-full bg-white text-black text-xs font-bold uppercase tracking-widest px-4 py-3 hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed">{inStock?'Add to cart':'Out of stock'}</button>
     <ProductDetailSections details={product.details}/>
    </div>
   </div>
  </DialogContent>
 </Dialog>;
}