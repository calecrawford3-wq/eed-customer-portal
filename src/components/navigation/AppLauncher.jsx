import React from 'react';
import {Link} from 'react-router-dom';
import {Briefcase,Users,Package,ShoppingCart,Receipt,MessageSquare,Calendar,ChartNoAxesCombined,FlaskConical,ShieldCheck,ChevronRight,ClipboardList,Globe} from 'lucide-react';

export const APP_AREAS=[
 {name:'Jobs',icon:Briefcase,tone:'bg-red-50 text-red-700',description:'Every engine visit and its progress',pages:[['Jobs','All Jobs'],['Builds','Build History']]},
 {name:'Customers',icon:Users,tone:'bg-blue-50 text-blue-700',description:'Customer records and requests',pages:[['Customers','Customers'],['CustomerSuccess','Follow-ups'],['RefreshRequests','Refresh Requests']]},
 {name:'Estimates',icon:ClipboardList,tone:'bg-fuchsia-50 text-fuchsia-700',description:'Standalone quotes only',pages:[['Estimates','Standalone Estimates']]},
 {name:'Billing',icon:Receipt,tone:'bg-emerald-50 text-emerald-700',description:'Invoices, payments, credits and expenses',pages:[['Invoices','Invoices'],['Payments','Payments'],['Credits','Credits'],['Expenses','Expenses'],['CheckPrinting','Check Printing']]},
 {name:'Inventory',icon:Package,tone:'bg-amber-50 text-amber-700',description:'Parts and stock levels',pages:[['Inventory','Parts Inventory']]},
 {name:'Purchasing',icon:ShoppingCart,tone:'bg-teal-50 text-teal-700',description:'Purchase orders and suppliers',pages:[['PurchaseOrders','Purchase Orders'],['Suppliers','Suppliers']]},
 {name:'Inbox',icon:MessageSquare,tone:'bg-indigo-50 text-indigo-700',description:'Messages and customer communication',pages:[['Communications','Inbox']]},
 {name:'Schedule',icon:Calendar,tone:'bg-violet-50 text-violet-700',description:'Calendar and upcoming work',pages:[['Calendar','Calendar']]},
 {name:'Reports',icon:ChartNoAxesCombined,tone:'bg-cyan-50 text-cyan-700',description:'Business reports and exceptions',pages:[['Reports','Reports'],['ExceptionDashboard','Exceptions']]},
 {name:'Engineering',icon:FlaskConical,tone:'bg-slate-100 text-slate-700',description:'Research and technical documents',pages:[['RnDEngineDeveloper','R&D Developer'],['Documents','Document Library'],['DevelopmentData','Development Data']]},
 {name:'Website',icon:Globe,tone:'bg-red-50 text-red-700',description:'Store, engine packages, orders and fulfillment',pages:[['WebsiteCartOrders','Website Orders'],['WebsiteInquiries','Website Inquiries'],['WebsiteTestimonials','Testimonials'],['WebsiteMachiningRequests','Machining Requests'],['WebsiteStoreCatalog','Store Catalog'],['WebsiteEnginePricing','Engine Pricing'],['WebsiteOrderFulfillment','Order Fulfillment'],['WebsiteMediaManager','Website Media']]},
 {name:'Team',icon:ShieldCheck,tone:'bg-orange-50 text-orange-700',description:'Employees, time clock and HR',pages:[['HRAdmin','HR Administration'],['EmployeePortal','Time Clock'],['StaffWorkspace','Staff Workspace'],['OwnerEarnings','Owner Earnings']]},
];
export const findArea=page=>APP_AREAS.find(a=>a.pages.some(([key])=>key===page));

export function AppLauncher({allowedPages=null,badges={}}){
 const visible=APP_AREAS.map(a=>({...a,pages:a.pages.filter(([key])=>allowedPages===null||allowedPages.includes(key))})).filter(a=>a.pages.length);
 return <section aria-label="Elite apps" className="space-y-3">
  <div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Apps</h2><p className="text-xs sm:text-sm text-slate-500">Everything in Elite, organized by what you are doing</p></div></div>
  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 md:gap-4">
   {visible.map(area=>{const Icon=area.icon;const badge=badges?.[area.name];return <Link key={area.name} to={'/'+area.pages[0][0]} className="group relative flex min-w-0 flex-col items-center text-center rounded-2xl bg-white border border-slate-200 px-2 py-4 md:py-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500">
    {badge?.value ? <span className={`absolute right-2 top-2 z-10 min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${badge.alert ? 'bg-[#e20404] text-white' : 'bg-slate-900 text-white'}`}>{badge.value>99?'99+':badge.value}</span>:null}
    <span className={'h-13 w-13 md:h-16 md:w-16 rounded-2xl flex items-center justify-center '+area.tone}><Icon className="h-6 w-6 md:h-8 md:w-8" strokeWidth={1.8}/></span>
    <span className="font-semibold text-xs sm:text-sm text-slate-900 mt-2 truncate max-w-full">{area.name}</span>
    {badge?.label ? <span className={`text-[10px] leading-tight mt-0.5 truncate max-w-full ${badge.alert?'text-red-600 font-medium':'text-slate-400'}`}>{badge.label}</span> : <span className="text-[10px] text-slate-400 leading-tight mt-0.5 hidden sm:block">{area.description}</span>}
   </Link>})}
  </div>
 </section>;
}

export function AppSectionNav({page,allowedPages=null}){
 const area=findArea(page);
 if(!area)return null;
 const Icon=area.icon;
 const pages=area.pages.filter(([key])=>allowedPages===null||allowedPages.includes(key));
 return <nav aria-label={area.name+' navigation'} className="bg-white border-b border-slate-200 px-4 md:px-8 py-2.5">
   <div className="mx-auto max-w-screen-2xl flex items-center gap-2 overflow-x-auto">
     <Link to="/Dashboard" className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 shrink-0"><span className={'p-1.5 rounded-lg '+area.tone}><Icon className="h-3.5 w-3.5"/></span>{area.name}<ChevronRight className="h-3.5 w-3.5"/></Link>
     <div className="flex gap-1.5">{pages.map(([key,label])=><Link key={key} to={'/'+key} className={'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium '+(key===page?'bg-slate-900 border-slate-900 text-white':'bg-white border-slate-200 text-slate-600 hover:bg-slate-50')}>{label}</Link>)}</div>
   </div>
 </nav>;
}
