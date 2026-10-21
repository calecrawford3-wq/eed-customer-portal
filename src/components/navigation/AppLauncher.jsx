import React from 'react';
import {Link} from 'react-router-dom';
import {Briefcase,Users,Package,ShoppingCart,Receipt,MessageSquare,Wrench,ClipboardList,Calendar,ChartNoAxesCombined,FlaskConical,ShieldCheck,FolderOpen,ScanLine,Monitor,LifeBuoy,Settings,ArrowRight,Home,Clock} from 'lucide-react';

export const APP_AREAS=[
 {name:'Jobs & Builds',icon:Briefcase,tone:'bg-red-50 text-red-700',description:'Jobs, engines and build progress',pages:[['Jobs','All Jobs'],['Builds','Engine Builds'],['BuildWorkflow','Build Workflow'],['MachiningStation','Machining'],['ShopDisplay','Shop Display'],['BarcodeScan','Scan Engine']]},
 {name:'Customers',icon:Users,tone:'bg-blue-50 text-blue-700',description:'Customer records and requests',pages:[['Customers','Customers'],['CustomerSuccess','Follow-ups'],['RefreshRequests','Refresh Requests']]},
 {name:'Inventory',icon:Package,tone:'bg-amber-50 text-amber-700',description:'Parts and stock levels',pages:[['Inventory','Parts Inventory']]},
 {name:'Purchasing',icon:ShoppingCart,tone:'bg-teal-50 text-teal-700',description:'Purchase orders and suppliers',pages:[['PurchaseOrders','Purchase Orders'],['Suppliers','Suppliers']]},
 {name:'Billing',icon:Receipt,tone:'bg-emerald-50 text-emerald-700',description:'Estimates, invoices and payments',pages:[['Estimates','Estimates'],['Invoices','Invoices'],['Approvals','Approvals'],['Payments','Payments'],['Credits','Credits'],['Expenses','Expenses']]},
 {name:'Inbox',icon:MessageSquare,tone:'bg-indigo-50 text-indigo-700',description:'Messages and customer communication',pages:[['Communications','Inbox']]},
 {name:'Schedule',icon:Calendar,tone:'bg-violet-50 text-violet-700',description:'Calendar and upcoming work',pages:[['Calendar','Calendar']]},
 {name:'Reports',icon:ChartNoAxesCombined,tone:'bg-cyan-50 text-cyan-700',description:'Business reports and exceptions',pages:[['Reports','Reports'],['ExceptionDashboard','Exceptions']]},
 {name:'Team',icon:ShieldCheck,tone:'bg-orange-50 text-orange-700',description:'Employees, time clock and HR',pages:[['HRAdmin','HR Administration'],['EmployeePortal','Time Clock'],['StaffWorkspace','Staff Workspace'],['OwnerEarnings','Owner Earnings']]},
 {name:'Engineering',icon:FlaskConical,tone:'bg-slate-100 text-slate-700',description:'Research and technical documents',pages:[['RnDEngineDeveloper','R&D Developer'],['Documents','Document Library'],['DevelopmentData','Development Data']]},
];
export const findArea=page=>APP_AREAS.find(a=>a.pages.some(([key])=>key===page));
export function AppLauncher({allowedPages=null}){
 const visible=APP_AREAS.map(a=>({...a,pages:a.pages.filter(([key])=>allowedPages===null||allowedPages.includes(key))})).filter(a=>a.pages.length);
 return <section aria-label="Elite apps" className="space-y-4">
  <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold text-slate-900">Your Apps</h2><p className="text-sm text-slate-500">Choose an area to get to work</p></div></div>
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
   {visible.map(area=>{const Icon=area.icon;return <Link key={area.name} to={'/'+area.pages[0][0]} className="group flex flex-col items-center text-center gap-2 rounded-2xl bg-white border border-slate-200 px-3 py-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500">
    <span className={'h-16 w-16 rounded-2xl flex items-center justify-center '+area.tone}><Icon className="h-8 w-8" strokeWidth={1.8}/></span>
    <span className="font-semibold text-sm text-slate-900">{area.name}</span><span className="text-xs text-slate-500 leading-snug hidden sm:block">{area.description}</span>
   </Link>})}
  </div>
 </section>;
}
export function AppSectionNav({page,allowedPages=null}){
 const area=findArea(page);
 if(!area)return null;
 const Icon=area.icon;
 const pages=area.pages.filter(([key])=>allowedPages===null||allowedPages.includes(key));
 return <nav aria-label={area.name+' navigation'} className="bg-white border-b border-slate-200 px-4 md:px-8 py-3">
   <div className="flex gap-2 items-center mb-3"><span className={'p-2 rounded-lg '+area.tone}><Icon className="h-4 w-4"/></span><strong className="text-sm">{area.name}</strong></div>
   <div className="flex gap-2 overflow-x-auto pb-1">{pages.map(([key,label])=><Link key={key} to={'/'+key} className={'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium '+(key===page?'bg-slate-900 border-slate-900 text-white':'bg-white border-slate-200 text-slate-600 hover:bg-slate-50')}>{label}</Link>)}</div>
 </nav>;
}
