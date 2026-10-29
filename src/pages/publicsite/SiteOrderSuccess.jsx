import React,{useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {base44Public} from '@/api/base44Client';
import {CheckCircle2,Clock,AlertTriangle} from 'lucide-react';
import {useCart} from './CartContext';
const usd=n=>Number(n||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
export default function SiteOrderSuccess(){
 const {clear}=useCart();
 const [order,setOrder]=useState(null),[state,setState]=useState('checking'),[message,setMessage]=useState('');
 const started=useRef(false);
 useEffect(()=>{
  if(started.current)return;started.current=true;
  const sessionId=new URLSearchParams(window.location.search).get('session_id');
  if(!sessionId){setState('error');setMessage('This link is missing its payment reference. If you completed a payment, check your email receipt.');return}
  base44Public.functions.invoke('completeWebsiteCartCheckout',{sessionId}).then(r=>{
   const data=r?.data||r;
   setOrder(data);
   if(data?.status==='pending'){setState('pending');return}
   setState('confirmed');clear();
  }).catch(e=>{setState('error');setMessage(e?.response?.data?.error||'We could not confirm this payment yet. If money left your account, contact Elite with your order number.')});
 },[]);
 return <main className="max-w-3xl mx-auto px-6 py-24 min-h-[70vh]">
  {state==='checking'&&<p className="text-zinc-400">Confirming your payment with Stripe…</p>}
  {state==='pending'&&<div className="border border-amber-500/40 bg-amber-500/10 p-8"><Clock className="text-amber-400" size={38}/><h1 className="text-3xl font-black uppercase mt-5">Payment clearing</h1><p className="text-amber-100 mt-4">{order?.message||'Your bank has not confirmed the payment yet.'}</p><p className="text-zinc-300 mt-3">Order reference: <strong>{order?.orderReference}</strong></p><button type="button" onClick={()=>window.location.reload()} className="mt-6 bg-white text-black px-6 py-3 text-xs font-bold uppercase tracking-widest">Check again</button></div>}
  {state==='error'&&<div className="border border-red-500/40 bg-red-500/10 p-8"><AlertTriangle className="text-red-400" size={38}/><h1 className="text-3xl font-black uppercase mt-5">Payment not confirmed</h1><p className="text-red-100 mt-4" role="alert">{message}</p><Link to="/site/cart" className="inline-block mt-6 bg-white text-black px-6 py-3 text-xs font-bold uppercase tracking-widest">Back to cart</Link></div>}
  {state==='confirmed'&&order&&<div>
   <CheckCircle2 className="text-emerald-400" size={44}/>
   <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mt-5">Order confirmed.</h1>
   <p className="text-zinc-400 mt-4">Thank you{order.buyerName?', '+order.buyerName.split(' ')[0]:''}. A receipt has been sent to {order.buyerEmail}. Keep your order reference for pickup or delivery questions.</p>
   <p className="mt-6 text-sm text-zinc-300">Order reference <strong className="text-white tracking-wider">{order.orderReference}</strong></p>
   <div className="border border-white/10 bg-[#181a1d] mt-8 p-6">
    <h2 className="font-black uppercase text-lg">What you ordered</h2>
    <ul className="mt-4 divide-y divide-white/10">{(order.items||[]).map((item,i)=><li key={i} className="py-3 flex justify-between gap-4 text-sm"><span>{item.quantity} × {item.name}</span><span className="text-zinc-400">{usd(item.totalCents/100)}</span></li>)}</ul>
    <div className="border-t border-white/10 mt-4 pt-4 space-y-2 text-sm">
     <p className="flex justify-between"><span className="text-zinc-400">Items</span><span>{usd(order.subtotalCents/100)}</span></p>
     <p className="flex justify-between"><span className="text-zinc-400">Shipping</span><span>{order.shippingCents?usd(order.shippingCents/100):'Free pickup'}</span></p>
     <p className="flex justify-between"><span className="text-zinc-400">Sales tax</span><span>{usd(order.taxCents/100)}</span></p>
     <p className="flex justify-between font-bold text-base"><span>Paid today</span><span>{usd(order.totalCents/100)}</span></p>
     {order.remainingEngineCents>0&&<p className="flex justify-between text-zinc-400"><span>Remaining engine balance</span><span>{usd(order.remainingEngineCents/100)}</span></p>}
    </div>
   </div>
   <p className="text-zinc-400 text-sm mt-6">{order.shippingMethod==='pickup'?'We will email you when your order is ready for local pickup.':'We will email tracking details once your parts ship. Engine builds are scheduled separately and freight is billed when the build is complete.'}</p>
   <div className="mt-8 flex flex-wrap gap-3"><Link to="/site/store" className="bg-white text-black px-6 py-3 text-xs font-bold uppercase tracking-widest">Keep shopping</Link><Link to="/site/builder" className="border border-white/25 px-6 py-3 text-xs font-bold uppercase tracking-widest">Build an engine</Link></div>
  </div>}
 </main>;
}