import React,{useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {Search,Package,ArrowUpRight,Images} from 'lucide-react';
import {base44Public} from '@/api/base44Client';
import {useCart} from './CartContext';
import StoreProductDialog from '@/components/store/StoreProductDialog';
const title=s=>String(s||'other').replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase());
export default function SiteStore(){
 const {addPart}=useCart();
 const [products,setProducts]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(false),[query,setQuery]=useState(''),[category,setCategory]=useState('All'),[checkoutEnabled,setCheckoutEnabled]=useState(false),[active,setActive]=useState(null);
 useEffect(()=>{let alive=true;base44Public.functions.invoke('getPublicStoreCatalog',{}).then(r=>{const data=r?.data||r;if(!alive)return;setProducts(data?.products||[]);setCheckoutEnabled(data?.checkoutEnabled===true)}).catch(()=>{if(alive)setError(true)}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[]);
 const categories=useMemo(()=>['All',...new Set(products.map(p=>p.category))], [products]);
 const shown=products.filter(p=>(category==='All'||p.category===category)&&[p.name,p.sku,p.description].join(' ').toLowerCase().includes(query.toLowerCase()));
 return <main className="max-w-7xl mx-auto px-6 lg:px-10 py-24 min-h-[70vh]">
  <p className="text-red-500 uppercase tracking-[.3em] text-xs font-bold">Elite parts &amp; equipment</p>
  <h1 className="text-6xl md:text-8xl font-black tracking-[-.07em] uppercase mt-5">THE STORE.</h1>
  <p className="text-zinc-400 text-lg max-w-2xl mt-8">Performance components, precision service parts, and race-ready essentials. Product prices are connected to Elite's inventory catalog.</p>
  <div className="mt-8 border-l-2 border-red-600 pl-5 text-zinc-400 text-sm">{checkoutEnabled?'Secure card checkout is live. Parts ship from our Oklahoma shop or can be picked up locally.':'Online checkout is opening soon. Browse the catalog and contact Elite to order today.'}</div>
  <div className="mt-14 flex flex-col sm:flex-row gap-3">
   <label className="flex flex-1 items-center gap-3 border border-white/20 bg-[#191b1e] px-4 py-3"><Search size={18} className="text-zinc-500"/><input className="w-full bg-transparent outline-none text-sm placeholder:text-zinc-500" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search parts or part numbers" aria-label="Search products"/></label>
   <select className="bg-[#191b1e] border border-white/20 p-3 text-sm" value={category} onChange={e=>setCategory(e.target.value)} aria-label="Filter by category">{categories.map(c=><option key={c} value={c}>{c==='All'?c:title(c)}</option>)}</select>
  </div>
  {loading?<p className="text-zinc-400 mt-12">Loading Elite catalog…</p>:error?<p className="mt-12 text-zinc-400">The catalog is temporarily unavailable. Please check back soon.</p>:shown.length?<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">{shown.map(p=><article key={p.id} className="border border-white/10 bg-[#181a1d] overflow-hidden">
   <button type="button" onClick={()=>setActive(p)} aria-label={`View ${p.name}`} className="block w-full aspect-[4/3] bg-[#22252a] flex items-center justify-center overflow-hidden relative group">{p.imageUrl?<img src={p.imageUrl} alt={p.name} loading="lazy" className="w-full h-full object-contain"/>:<Package size={58} className="text-zinc-600"/>}{p.images?.length>1&&<span className="absolute bottom-3 right-3 inline-flex items-center gap-1 bg-black/70 text-[10px] uppercase tracking-widest px-2 py-1"><Images size={12}/>{p.images.length}</span>}</button>
   <div className="p-6"><p className="text-red-500 text-[11px] tracking-[.2em] uppercase font-semibold">{title(p.category)}</p><h2 className="text-xl font-bold mt-3"><button type="button" onClick={()=>setActive(p)} className="text-left hover:text-red-400">{p.name}</button></h2><p className="text-zinc-500 text-xs mt-1">{p.sku}</p>{p.description&&<p className="text-zinc-400 text-sm mt-4 line-clamp-3">{p.description}</p>}<div className="flex justify-between items-end gap-4 mt-8"><div><p className="text-zinc-500 text-xs">{p.availability}</p><p className="text-2xl font-black mt-1">${p.price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</p></div><button type="button" onClick={()=>addPart(p)} className="bg-white text-black text-xs font-bold uppercase tracking-widest px-4 py-3 hover:bg-zinc-200">Add to cart</button></div></div>
  </article>)}</div>:<div className="border border-white/10 bg-[#181a1d] mt-8 p-12 text-center"><Package className="mx-auto text-zinc-500" size={42}/><h2 className="text-xl font-bold mt-5">{products.length?'No matching products':'The catalog is being prepared'}</h2><p className="text-zinc-400 mt-2">{products.length?'Try another search or category.':'Elite will publish selected inventory items here as they become available.'}</p></div>}
  <div className="border-t border-white/10 mt-20 pt-10 flex flex-wrap items-center justify-between gap-6"><div><h2 className="text-2xl font-black uppercase">Looking for a complete engine?</h2><p className="text-zinc-400 mt-2">Explore a custom Elite engine build and select your upgrades.</p></div><Link to="/site/builder" className="bg-white text-black px-6 py-4 text-xs font-bold uppercase tracking-widest flex items-center gap-3">Build an engine <ArrowUpRight size={16}/></Link></div>
  <StoreProductDialog product={active} onClose={()=>setActive(null)} onAdd={p=>{addPart(p);setActive(null)}}/>
 </main>;
}