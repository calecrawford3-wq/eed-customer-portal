import React,{useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {ShoppingCart,Truck,Package,Plus,ChevronRight,Box,Settings2} from 'lucide-react';
import WebsiteCartOrders from './WebsiteCartOrders';
import WebsiteOrderBoard from './WebsiteOrderBoard';
import WebsiteOrderCard from './WebsiteOrderCard';
import WebsiteOrderFulfillment from './WebsiteOrderFulfillment';
import WebsiteManualOrder from './WebsiteManualOrder';
import WebsiteShippingBoxes from './WebsiteShippingBoxes';
const tabs=[{id:'orders',title:'All orders',hint:'Review payments and order details',icon:ShoppingCart},{id:'fulfillment',title:'Pick, pack & ship',hint:'Prepare shipments and dropships',icon:Truck},{id:'new',title:'Create order',hint:'Phone, walk-in or shipping-only',icon:Plus},{id:'packaging',title:'Boxes & shipping',hint:'Manage packaging dimensions',icon:Box}];
export default function WebsiteOperations(){
 const [params,setParams]=useSearchParams();
 const [opened,setOpened]=useState(null);
 const current=tabs.some(t=>t.id===params.get('view'))?params.get('view'):'orders';
 const change=id=>{setOpened(null);setParams({view:id})};
 return <main className="min-h-screen bg-[#f5f7fb]">
 <div className="bg-white border-b px-4 sm:px-8 py-6"><div className="max-w-7xl mx-auto">
 <p className="text-xs uppercase font-bold tracking-[.18em] text-red-700">Website / Operations</p>
 <div className="flex flex-wrap justify-between items-center gap-3 mt-1"><div><h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Orders & Fulfillment</h1><p className="text-slate-500 text-sm mt-1">From checkout to delivery, manage everything in one place.</p></div><button onClick={()=>change('new')} className="bg-slate-900 hover:bg-slate-800 text-white rounded-lg px-4 py-2.5 text-sm font-semibold flex items-center gap-2"><Plus size={17}/> New order</button></div>
 <div className="flex overflow-x-auto gap-2 mt-6 pb-1" role="tablist" aria-label="Order management">{tabs.map(t=><button key={t.id} role="tab" aria-selected={current===t.id} onClick={()=>change(t.id)} className={'shrink-0 rounded-xl border px-4 py-3 text-left transition-colors '+(current===t.id?'border-slate-900 bg-slate-900 text-white shadow-sm':'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}><span className="flex items-center gap-2 text-sm font-bold"><t.icon size={17}/>{t.title}</span><span className={'block text-[11px] mt-1 '+(current===t.id?'text-slate-300':'text-slate-500')}>{t.hint}</span></button>)}</div>
 </div></div>
 <div className="max-w-7xl mx-auto"><div className="px-4 sm:px-8 pt-4 flex flex-wrap gap-3 text-sm"><Link className="text-slate-600 hover:text-red-700 underline" to="/WebsiteStoreCatalog">Manage store products</Link><Link className="text-slate-600 hover:text-red-700 underline" to="/Settings?tab=shipping">Shipping settings</Link><Link className="text-slate-600 hover:text-red-700 underline" to="/WebsiteManager">Website overview</Link></div>
 <div key={current}>{current==='orders'?(opened?<WebsiteOrderCard order={opened} onBack={()=>setOpened(null)}/>:<WebsiteOrderBoard onOpen={setOpened}/>):current==='fulfillment'?<WebsiteOrderFulfillment/>:current==='new'?<WebsiteManualOrder/>:<WebsiteShippingBoxes/>}</div></div>
 </main>;
}
