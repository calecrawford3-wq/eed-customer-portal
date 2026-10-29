import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {base44} from '@/api/base44Client';
import {ShoppingBag,Package,Truck,ChartNoAxesCombined,MessageSquare,Settings,Globe,RefreshCw,Image,FileText,Tag} from 'lucide-react';
const rows=v=>Array.isArray(v)?v:v?.items||[];
const sections=[
 {title:'Products',desc:'Create listings, link inventory, edit photos and variants',to:'/WebsiteStoreCatalog',icon:Package},
 {title:'Orders',desc:'Review purchases, payments and order allocation',to:'/WebsiteCartOrders',icon:ShoppingBag},
 {title:'Fulfillment',desc:'Pick, pack, track and ship orders',to:'/WebsiteOrderFulfillment',icon:Truck},
 {title:'Boxes & Packaging',desc:'Stocked boxes, inside dimensions and weights',to:'/WebsiteShippingBoxes',icon:Package},
 {title:'Shipping settings',desc:'Checkout shipping prices and carrier configuration',to:'/Settings?tab=shipping',icon:Settings},
 {title:'Website analytics',desc:'Traffic, engagement and conversions',to:'/WebsiteAnalytics',icon:ChartNoAxesCombined},
 {title:'Customer inquiries',desc:'New website leads and requests',to:'/WebsiteInquiries',icon:MessageSquare},
 {title:'Machining requests',desc:'Requests submitted from the machining page',to:'/WebsiteMachiningRequests',icon:FileText},
 {title:'Engine pricing',desc:'Website engine package pricing',to:'/WebsiteEnginePricing',icon:Tag},
 {title:'Media library',desc:'Manage website images and media',to:'/WebsiteMediaManager',icon:Image},
 {title:'SEO and content',desc:'Search content and page visibility',to:'/WebsiteSEOManager',icon:Globe},
 {title:'Testimonials',desc:'Customer feedback and reviews',to:'/WebsiteTestimonials',icon:MessageSquare}
];
export default function WebsiteManager(){
 const [stats,setStats]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const refresh=async()=>{setLoading(true);setError('');const names=['Part','WebsiteCartOrder','WebsitePartsFulfillment','WebsiteInquiry'];const results=await Promise.allSettled(names.map(n=>base44.entities[n].list()));const [parts,orders,fulfillments,inquiries]=results.map(r=>r.status==='fulfilled'?rows(r.value):[]);setStats({products:parts.filter(p=>p.website_published||p.website_store_name).length,published:parts.filter(p=>p.website_published).length,orders:orders.length+fulfillments.filter(o=>String(o.order_number||'').startsWith('MAN-')).length,attention:orders.filter(o=>['needs_review','awaiting_payment'].includes(o.status)).length+fulfillments.filter(o=>String(o.order_number||'').startsWith('MAN-')&&!o.payment_verified&&o.status!=='cancelled').length,toShip:fulfillments.filter(o=>!['shipped','delivered','cancelled'].includes(o.status)&&o.payment_verified).length,inquiries:inquiries.length});if(results.some(r=>r.status==='rejected'))setError('Some totals could not be loaded. Open the relevant page for full details.');setLoading(false)};
 useEffect(()=>{refresh()},[]);
 return <main className="max-w-7xl mx-auto p-5 lg:p-10 space-y-7">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-red-700">Elite Engine Development</p><h1 className="text-3xl font-bold mt-1">Website Manager</h1><p className="text-slate-500 mt-2">Manage your store, orders, fulfillment and website in one place.</p></div><div className="flex gap-2"><a href="https://eliteenginedevelopment.com/" target="_blank" rel="noopener noreferrer" className="border rounded-lg px-4 py-2 text-sm font-semibold">View website ↗</a><button onClick={refresh} disabled={loading} className="border rounded-lg px-4 py-2 text-sm flex gap-2 items-center"><RefreshCw size={16}/>Refresh</button></div></div>
  {error&&<p role="alert" className="text-amber-700 text-sm">{error}</p>}
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{[['Store products','products'],['Published','published'],['Orders','orders'],['Orders to review','attention'],['Ready to fulfill','toShip'],['Inquiries','inquiries']].map(([label,key])=><div key={key} className="rounded-xl bg-white border p-4"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold mt-2">{loading?'…':stats?.[key]??'—'}</p></div>)}</div>
  <section><div className="flex justify-between items-center gap-3 mb-3"><h2 className="font-bold text-xl">Quick actions</h2></div><div className="grid sm:grid-cols-3 gap-3"><Link to="/WebsiteStoreCatalog" className="bg-slate-900 text-white rounded-xl p-5 font-semibold hover:bg-slate-800">+ Add a store product <p className="font-normal text-xs text-slate-300 mt-2">Open Products and select Add Product</p></Link><Link to="/WebsiteManualOrder" className="bg-white border rounded-xl p-5 font-semibold hover:border-slate-400">+ Create manual order<p className="font-normal text-xs text-slate-500 mt-2">Phone, walk-in or shipping-only order</p></Link><Link to="/WebsiteOrderFulfillment" className="bg-white border rounded-xl p-5 font-semibold hover:border-slate-400">Pack and ship<p className="font-normal text-xs text-slate-500 mt-2">Current fulfillment queue</p></Link></div></section>
  <section><h2 className="font-bold text-xl mb-3">Manage website</h2><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{sections.map(s=>{const Icon=s.icon;return <Link key={s.title} to={s.to} className="bg-white border rounded-xl p-5 flex gap-3 hover:border-slate-400 hover:shadow-sm"><span className="rounded-lg bg-slate-100 p-3 h-fit"><Icon size={20}/></span><span><span className="font-semibold block">{s.title}</span><span className="text-sm text-slate-500 block mt-1">{s.desc}</span></span></Link>})}</div></section>
  <p className="text-xs text-slate-500">Manual orders and packing recommendations are available. Live rate quotes are available for eligible paid orders; carrier label purchasing is not yet enabled.</p>
 </main>;
}