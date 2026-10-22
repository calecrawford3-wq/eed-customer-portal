import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowRight, Briefcase } from 'lucide-react';

const LABELS = {queued:'Queued',teardown:'Teardown',machining:'Machining',assembly:'Assembly',testing:'Testing',ready_for_pickup:'Ready for Pickup'};
export default function ActiveJobsSnapshot({ customers = [] }) {
  const { data: jobs = [] } = useQuery({ queryKey:['dashboard-active-jobs'], queryFn:()=>base44.entities.Job.filter({ archived:false }, '-created_date', 150), staleTime:15000 });
  const active = jobs.filter(j => ['queued','teardown','machining','assembly','testing','ready_for_pickup'].includes(j.stage)).slice(0,6);
  const nameFor = id => { const c=customers.find(x=>x.id===id); return c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name : ''; };
  return <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
    <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Active Jobs</h2><p className="text-sm text-slate-500">What is physically moving through the shop</p></div><Link to="/Jobs?tab=active" className="text-xs font-semibold text-[#e20404]">Open board</Link></div>
    {active.length===0 ? <div className="p-6 text-center text-sm text-slate-500">No active shop jobs.</div> : <div className="divide-y divide-slate-100">{active.map(j=><Link key={j.id} to={`/JobCard?id=${j.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"><span className="h-9 w-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center"><Briefcase className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{j.job_number || 'Job'}</span><span className="block text-xs text-slate-500 truncate">{nameFor(j.customer_id) || 'Customer'} · {LABELS[j.stage] || j.stage}</span></span><ArrowRight className="h-4 w-4 text-slate-300"/></Link>)}</div>}
  </section>;
}
