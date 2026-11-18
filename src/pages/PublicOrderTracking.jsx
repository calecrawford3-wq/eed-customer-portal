import React from 'react';
import {useParams} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {base44Public} from '@/api/base44Client';
import {PackageCheck,Truck,Clock,AlertCircle,ChevronDown,MapPin,CheckCircle2} from 'lucide-react';
const pretty=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const formatDate=s=>{if(!s)return null;const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toLocaleString('en-US',{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})};
const steps=['Ordered','Shipped','In transit','Out for delivery','Delivered'];
function progress(s,order){
 const v=String(s||'').toLowerCase().replaceAll(' ','_');
 if(v==='delivered')return 4;
 if(v==='out_for_delivery')return 3;
 if(['in_transit','transit','available_for_pickup','return_to_sender'].includes(v))return 2;
 if(['pre_transit','label_created','unknown','pending','tracking_issued'].includes(v))return 1;
 if(String(order).toLowerCase()==='shipped')return 1;
 return 0;
}
export default function PublicOrderTracking(){
 const {token}=useParams();
 const {data,isLoading,error}=useQuery({queryKey:['public-order-tracking',token],enabled:!!token,
 queryFn:async()=>{const r=await base44Public.functions.invoke('getPublicOrderTracking',{token});if(r.data?.error)throw Error(r.data.error);return r.data},refetchInterval:300000});
 React.useEffect(()=>{if(window.location.hostname.toLowerCase()==='portal.eedpower.com')window.location.replace('https://eliteenginedevelopment.com/track/'+encodeURIComponent(token));},[token]);
 const shipments=data?.shipments||[];
 const furthest=shipments.length?Math.min(...shipments.map(s=>progress(s.status,data.status))):0;
 return <main className="min-h-[70vh] bg-[#f5f6f8] text-slate-900">
 <div className="max-w-3xl mx-auto p-4 sm:p-8">
 {isLoading?<p className="py-20 text-center">Loading live shipment tracking…</p>:error||!data?<div className="bg-white rounded-xl p-8 text-center"><AlertCircle className="mx-auto mb-3 text-red-600"/><h1 className="text-xl font-bold">Tracking unavailable</h1><p className="mt-2 text-slate-600">This tracking link is invalid or shipment details are temporarily unavailable.</p></div>:<>
 <p className="text-xs font-bold tracking-[.18em] text-red-700">ELITE ORDER TRACKING</p>
 <h1 className="text-2xl sm:text-3xl font-extrabold mt-2 break-words">Order {data.order_number}</h1>
 <p className="text-slate-600 mt-2">Order status: <strong>{pretty(data.status)}</strong></p>
 <section className="bg-white rounded-xl border shadow-sm p-5 sm:p-7 mt-6">
 <div className="flex items-center gap-2 mb-5"><Truck className="text-red-600"/><h2 className="text-lg font-bold">Shipment progress</h2></div>
 <div className="grid grid-cols-5 gap-1 sm:gap-2">{steps.map((step,i)=><div key={step} className="min-w-0"><div className={'h-2 rounded-full '+(i<=furthest?'bg-[#d71920]':'bg-slate-200')}/><div className="flex flex-col items-center mt-3 gap-1">{i<=furthest?<CheckCircle2 size={18} className="text-red-600"/>:<span className="rounded-full border-2 border-slate-300 w-[18px] h-[18px]"/>}<span className={'text-[10px] sm:text-xs text-center leading-tight '+(i<=furthest?'font-bold text-slate-900':'text-slate-500')}>{step}</span></div></div>)}</div>
 {shipments.length>1&&<p className="text-xs text-slate-500 mt-5">Progress shows the least advanced package. Each package has its own status below.</p>}
 </section>
 {!shipments.length?<section className="bg-white rounded-xl border p-6 mt-5"><Clock className="text-red-600 mb-3"/><h2 className="font-bold text-lg">Preparing your order</h2><p className="text-slate-600 mt-2">Tracking information will appear when a shipment is created.</p></section>:shipments.map((s,i)=>{
 const stage=progress(s.status,data.status);
 const recent=[...(s.events||[])].sort((a,b)=>new Date(b.datetime||0)-new Date(a.datetime||0))[0];
 return <section key={s.tracking_number||i} className="bg-white rounded-xl border shadow-sm p-5 sm:p-7 mt-5">
 <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-red-700 tracking-widest">PACKAGE {i+1} OF {shipments.length}</p><h2 className="text-xl sm:text-2xl font-extrabold mt-1">{stage===4?'Delivered':stage===3?'Out for delivery':stage===2?'On the way':stage===1?'Shipment created':'Preparing shipment'}</h2></div><Truck className="text-red-600 shrink-0" size={27}/></div>
 <div className="rounded-lg bg-slate-50 p-4 mt-5"><p className="text-xs text-slate-500 uppercase tracking-wide">Estimated delivery</p><p className="font-bold text-lg mt-1">{s.estimated_delivery?formatDate(s.estimated_delivery):'Awaiting carrier estimate'}</p>{recent?.location&&<p className="flex items-start gap-2 text-sm text-slate-600 mt-3"><MapPin size={17} className="shrink-0 text-red-600"/>{recent.location}</p>}</div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5"><div><p className="text-xs text-slate-500 uppercase">Carrier</p><p className="font-semibold">{s.carrier||'Pending'}</p></div><div><p className="text-xs text-slate-500 uppercase">Tracking number</p><p className="font-semibold break-all">{s.tracking_number}</p></div><div><p className="text-xs text-slate-500 uppercase">Carrier status</p><p className="font-semibold">{pretty(s.status)}</p></div><div><p className="text-xs text-slate-500 uppercase">Last checked</p><p className="font-semibold text-sm">{formatDate(s.tracking_checked_at)||'Not yet available'}</p></div></div>
 <details className="mt-6 border-t pt-4 group"><summary className="flex justify-between items-center cursor-pointer font-bold list-none">View tracking history <ChevronDown size={20} className="group-open:rotate-180 transition-transform"/></summary>
 <div className="mt-5">{s.events?.length?<ol className="border-l-2 border-red-600 ml-2 pl-5 space-y-5">{[...s.events].sort((a,b)=>new Date(b.datetime||0)-new Date(a.datetime||0)).map((e,j)=><li key={j}><p className="font-semibold">{e.message||pretty(e.status)}</p><p className="text-sm text-slate-500 mt-1">{formatDate(e.datetime)||''}{e.location?' · '+e.location:''}</p></li>)}</ol>:<p className="text-slate-600 text-sm">No carrier scan history available yet. Updates will appear when the carrier supplies them.</p>}{s.tracking_error&&<p className="text-amber-700 text-sm mt-3">Live carrier updates are temporarily unavailable.</p>}</div></details>
 </section>})}
 <section className="bg-white rounded-xl border shadow-sm p-5 sm:p-7 mt-5"><details className="group" open><summary className="flex justify-between items-center cursor-pointer list-none"><span className="flex items-center gap-2 font-bold text-lg"><PackageCheck className="text-red-600"/>Order items</span><ChevronDown size={20} className="group-open:rotate-180 transition-transform"/></summary><ul className="divide-y mt-4">{(data.items||[]).map((item,i)=><li className="py-3 flex justify-between gap-4 text-sm" key={i}><span>{item.name}</span><strong className="shrink-0">Qty {item.quantity}</strong></li>)}</ul></details></section>
 <p className="text-center text-sm text-slate-500 mt-8">Elite Engine Development · Carrier estimates and scan events may change.</p>
 </>}
 </div></main>;
}