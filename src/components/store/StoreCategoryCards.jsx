import React from 'react';
import {Package} from 'lucide-react';
const card=c=>'relative overflow-hidden border text-left group aspect-[4/3] '+(c?'border-red-600':'border-white/10 hover:border-white/30');
function Card({imageUrl,label,count,active,onClick}){
 return <button type="button" onClick={onClick} className={card(active)}>
  {imageUrl?<img src={imageUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>:<span className="absolute inset-0 flex items-center justify-center bg-[#22252a]"><Package size={40} className="text-zinc-600"/></span>}
  <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10"/>
  <span className="absolute bottom-0 left-0 right-0 p-4">
   <span className={'block text-sm font-black uppercase tracking-wide leading-tight '+(active?'text-red-400':'text-white')}>{label}</span>
   <span className="block text-[11px] text-zinc-400 mt-1">{count} {count===1?'item':'items'}</span>
  </span>
 </button>;
}
export default function StoreCategoryCards({categories,products,active,onSelect}){
 const hero=(products.find(p=>p.featured&&p.imageUrl)||products.find(p=>p.imageUrl)||{}).imageUrl||'';
 const cards=[{key:'All',label:'Shop All',imageUrl:hero,count:products.length},...categories];
 return <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-8">{cards.map(c=><Card key={c.key} imageUrl={c.imageUrl} label={c.label} count={c.count} active={active===c.key} onClick={()=>onSelect(active===c.key&&c.key!=='All'?'All':c.key)}/>)}</div>;
}