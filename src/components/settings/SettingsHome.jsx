import React, {useState} from 'react';
import {Link} from 'react-router-dom';
import {Input} from '@/components/ui/input';
import {Search, Building2, Receipt, CreditCard, Users, Wrench, Workflow, Package, MonitorSmartphone, Mail, Shield, ChevronRight} from 'lucide-react';

export const SETTINGS_CATEGORIES = [
 {name:'Company',tab:'company',icon:Building2,description:'Business identity, contact details and branding'},
 {name:'Billing',tab:'billing',icon:Receipt,description:'Invoice, estimate and pricing defaults'},
 {name:'Payments',tab:'payments',icon:CreditCard,description:'Stripe, payment methods and reconciliation'},
 {name:'Employees',tab:'employees',icon:Users,description:'Staff records and individual page permissions'},
 {name:'Engines',tab:'engines',icon:Wrench,description:'Platforms, spec sheets and replacement rules'},
 {name:'Shop',tab:'shop',icon:Workflow,description:'Canned jobs, add-ons and workflow templates'},
 {name:'Inventory',tab:'inventory',icon:Package,description:'Storage locations and inventory administration'},
 {name:'Customer Portal',tab:'portal',icon:MonitorSmartphone,description:'Customer onboarding and portal tools'},
 {name:'Communications',tab:'communications',icon:Mail,description:'Email, phone and notifications'},
 {name:'System',tab:'system',icon:Shield,description:'Diagnostics, integrations and administration'},
];
export default function SettingsHome({open}){
 const [query,setQuery]=useState('');
 const shown=SETTINGS_CATEGORIES.filter(x=>(x.name+' '+x.description).toLowerCase().includes(query.trim().toLowerCase()));
 return <section className="space-y-5">
  <div><h2 className="text-xl font-bold text-slate-900">Control Center</h2><p className="text-sm text-slate-600">Choose an area to configure. Existing work pages remain available while configuration moves here.</p></div>
  <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><Input aria-label="Search settings" placeholder="Search settings…" className="pl-9" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{shown.map(({name,tab,icon:Icon,description})=><button key={tab} type="button" onClick={()=>open(tab)} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-red-300 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"><span className="rounded-lg bg-slate-100 p-3"><Icon className="h-5 w-5 text-slate-700"/></span><span className="flex-1"><span className="block font-semibold text-slate-900">{name}</span><span className="block text-xs text-slate-500 mt-1">{description}</span></span><ChevronRight className="h-4 w-4 text-slate-400"/></button>)}</div>
  {!shown.length&&<p className="text-slate-500">No settings match your search.</p>}
 </section>;
}
export function SettingsLinks({title,description,links}){
 return <section className="rounded-xl border bg-white p-5 space-y-3"><div><h3 className="font-semibold text-lg">{title}</h3>{description&&<p className="text-sm text-slate-600 mt-1">{description}</p>}</div><div className="grid gap-2 sm:grid-cols-2">{links.map(({label,to,detail})=><Link key={label} to={to} className="flex justify-between items-center rounded-lg border px-4 py-3 hover:bg-slate-50"><span><span className="block font-medium text-sm">{label}</span>{detail&&<span className="text-xs text-slate-500">{detail}</span>}</span><ChevronRight className="h-4 w-4 text-slate-400"/></Link>)}</div></section>;
}
