import React from 'react';
import {ChevronDown} from 'lucide-react';

export default function ProductDetailSections({details}){
 const list=Array.isArray(details)?details.filter(d=>d?.label&&d?.content):[];
 if(!list.length)return null;
 return <div className="mt-6 border-t border-white/10">
  {list.map((d,i)=><details key={`${d.label}-${i}`} className="border-b border-white/10 py-3 group">
   <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-widest text-zinc-200 hover:text-white [&::-webkit-details-marker]:hidden">
    <span>{d.label}</span>
    <ChevronDown size={15} className="shrink-0 text-zinc-500 transition-transform group-open:rotate-180"/>
   </summary>
   <p className="text-zinc-400 text-sm mt-3 whitespace-pre-line">{d.content}</p>
  </details>)}
 </div>;
}