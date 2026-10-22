import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Wrench } from 'lucide-react';

const LABELS={queued:'Queued',teardown:'Teardown',machining:'Machining',assembly:'Assembly',testing:'Testing',ready_for_pickup:'Ready'};
export default function HomeActiveJobsRow({jobs=[],customers=[]}){
 const active=jobs.filter(j=>!j.archived&&['queued','teardown','machining','assembly','testing','ready_for_pickup'].includes(j.stage)).slice(0,4);
 const customerName=id=>{const c=customers.find(x=>x.id===id);return c?`${c.first_name||''} ${c.last_name||''}`.trim()||c.company_name||'Customer':'Customer';};
 if(!active.length)return null;
 return <section className="space-y-2">
   <div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-900">Continue Work</h2><p className="text-xs text-slate-500">Active jobs you are most likely to open next</p></div><Link to="/Jobs?tab=active" className="text-xs font-semibold text-[#e20404]">All jobs</Link></div>
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
     {active.map(j=><Link key={j.id} to={`/JobCard?id=${j.id}`} className="rounded-xl border border-slate-200 bg-white p-3 hover:border-red-200 hover:shadow-sm transition-all min-w-0">
       <div className="flex items-center justify-between gap-2"><span className="h-8 w-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0"><Wrench className="h-4 w-4"/></span><ArrowRight className="h-4 w-4 text-slate-300"/></div>
       <p className="mt-2 text-sm font-bold text-slate-900 truncate">{j.job_number||'Job'}</p><p className="text-[11px] text-slate-500 truncate">{customerName(j.customer_id)}</p><p className="text-[10px] font-medium text-red-600 mt-1">{LABELS[j.stage]||String(j.stage||'Active').replaceAll('_',' ')}</p>
     </Link>)}
   </div>
 </section>;
}
