import React,{useEffect,useState} from 'react';
import {base44} from '@/api/base44Client';
import {Package,Truck,MapPin,CheckCircle2,Clock,ChevronDown,ChevronUp} from 'lucide-react';

const stages=['Shipped','In transit','Out for delivery','Delivered'];
function progress(status){
 const s=String(status||'').toLowerCase().replaceAll('_',' ');
 if(s.includes('deliver')&&!s.includes('out for'))return 4;
 if(s.includes('out for'))return 3;
 if(s.includes('transit'))return 2;
 if(s.includes('ship')||s.includes('pre transit'))return 1;
 return 0;
}
const fmt=d=>{if(!d)return '';const date=new Date(d);return Number.isNaN(date.getTime())?'':date.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});};
function Shipment({t,index}){
 const [details,setDetails]=useState(true);
 const p=progress(t.status);
 return <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
 <div className="bg-slate-50 px-4 sm:px-6 py-5">
 <div className="flex flex-wrap justify-between gap-3 items-start"><div><p className="text-xs font-bold tracking-widest text-red-700 uppercase">Shipment {index+1}</p><h3 className="mt-1 text-xl font-extrabold text-slate-900">{p===4?'Delivered':p===3?'Out for delivery':p===2?'On the way':p===1?'Shipped':'Tracking created'}</h3><p className="mt-1 text-sm text-slate-500">{t.carrier||'Shipping carrier'}{t.estimatedDelivery?' · Estimated delivery '+fmt(t.estimatedDelivery):''}</p></div><Truck className="text-red-600" size={26}/></div>
 <div className="grid grid-cols-4 gap-1 mt-5">{stages.map((s,i)=><div key={s}><div className={'h-1.5 rounded-sm '+(p>i?'bg-red-600':'bg-slate-200')}/><p className={'mt-2 text-[10px] sm:text-xs font-bold uppercase tracking-tight '+(p>i?'text-slate-900':'text-slate-400')}>{s}</p></div>)}</div>
 </div>
 <div className="px-4 sm:px-6 py-4 flex flex-wrap gap-3 justify-between items-center border-t border-slate-200"><div><p className="text-xs uppercase tracking-wider text-slate-500">Tracking number</p><p className="font-mono font-semibold text-sm sm:text-base break-all">{t.trackingNumber}</p><p className="text-sm text-slate-500">{t.carrier||'Carrier'}</p></div><span className="text-xs font-semibold rounded-full bg-slate-100 px-3 py-2 text-slate-700">Tracked by Elite</span></div>
 <button type="button" onClick={()=>setDetails(v=>!v)} className="w-full flex items-center justify-between px-4 sm:px-6 py-3 border-t border-slate-200 text-left text-sm font-bold text-slate-900">Shipment updates {details?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>
 {details&&<div className="px-4 sm:px-6 pb-5">{(t.events||[]).length? [...t.events].sort((a,b)=>new Date(b.datetime||0)-new Date(a.datetime||0)).map((e,i)=><div key={i} className="flex gap-3 border-l-2 border-slate-200 pl-4 py-3 relative"><span className="absolute -left-[6px] top-4 h-2.5 w-2.5 rounded-full bg-red-600"/><div><p className="font-semibold text-sm capitalize">{String(e.status||'Carrier update').replaceAll('_',' ')}</p><p className="text-sm text-slate-600">{e.message||''}</p><p className="text-xs text-slate-500 mt-1">{fmt(e.datetime)}{e.location?.city?' · '+e.location.city:''}{e.location?.state?', '+e.location.state:''}</p></div></div>):<div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600"><Clock size={17} className="inline mr-2"/>Carrier scan details are not available yet. Tracking updates will appear here once received.</div>}</div>}
 </div>;
}
export default function PortalWebsiteOrders(){
 const [orders,setOrders]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const selectedOrder=new URLSearchParams(window.location.search).get('order');
 useEffect(()=>{let live=true;base44.functions.invoke('manageWebsiteShopperAccount',{action:'get'}).then(r=>{if(live)setOrders((r.data||r).orders||[])}).catch(e=>{if(live)setError(e?.response?.data?.error||'Unable to load website orders')}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 const visible=orders.filter(o=>!selectedOrder||o.reference===selectedOrder);
 return <section className="space-y-5"><div className="rounded-xl bg-slate-950 px-5 sm:px-7 py-6 text-white"><p className="text-xs font-bold tracking-[.2em] text-red-400">ELITE ENGINE DEVELOPMENT</p><h2 className="mt-2 text-2xl sm:text-3xl font-black">Order tracking</h2><p className="text-sm text-slate-300 mt-2">Your shipment status, delivery progress and tracking updates — all in My Elite.</p></div>
 {loading?<p className="p-5">Loading your orders…</p>:error?<p role="alert" className="text-red-600">{error}</p>:visible.length===0?<div className="rounded-xl border p-6 text-slate-600">{selectedOrder?'This order is not associated with your signed-in account.':'No website orders associated with your account yet.'}</div>:visible.map(o=><article key={o.reference} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
 <div className="p-5 sm:p-7 border-b border-slate-200"><p className="text-xs font-bold tracking-widest uppercase text-red-700">Your order</p><div className="flex flex-wrap items-start justify-between gap-3 mt-1"><div><h3 className="text-xl sm:text-2xl font-black text-slate-900 break-all">{o.reference}</h3><p className="text-sm text-slate-500 mt-1">Placed {o.createdAt?fmt(o.createdAt):'—'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold capitalize text-slate-800">{String(o.fulfillment?.status||o.status||'pending').replaceAll('_',' ')}</span></div></div>
 <div className="px-4 sm:px-7 pb-6">{(o.fulfillment?.tracking||[]).length?(o.fulfillment.tracking||[]).map((t,i)=><Shipment key={t.trackingNumber||i} t={t} index={i}/>):o.fulfillment?.trackingNumber?<Shipment t={{trackingNumber:o.fulfillment.trackingNumber,carrier:o.fulfillment.carrier,status:o.fulfillment.status,events:[]}} index={0}/>:<div className="rounded-xl bg-slate-50 p-5 mt-5 text-sm text-slate-600"><Package size={20} className="inline mr-2"/>Tracking details will appear here once your shipment is prepared.</div>}
 <div className="mt-6 border-t border-slate-200 pt-5"><h4 className="text-xs uppercase tracking-[.17em] text-red-700 font-extrabold">What's in this order</h4><div className="divide-y divide-slate-100 mt-3">{(o.items||[]).map((item,i)=><div key={i} className="py-3 flex justify-between gap-3 text-sm"><span className="font-semibold text-slate-900">{item.name||'Item'}</span><span className="text-slate-500 shrink-0">Qty {item.quantity||1}</span></div>)}</div></div></div></article>)}
 </section>;
}
