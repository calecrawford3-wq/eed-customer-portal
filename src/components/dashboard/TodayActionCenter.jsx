import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, ClipboardList, DollarSign, Package, ShoppingCart, RefreshCw, ArrowRight, CheckCircle2 } from 'lucide-react';

const priorityOrder = { critical: 0, high: 1, normal: 2 };

export default function TodayActionCenter({ invoices = [], purchaseOrders = [], parts = [], refreshRequests = [] }) {
  const { data: jobs = [] } = useQuery({ queryKey: ['today-action-jobs'], queryFn: () => base44.entities.Job.filter({ archived: false }, '-created_date', 250), staleTime: 15000 });
  const { data: estimates = [] } = useQuery({ queryKey: ['today-action-estimates'], queryFn: () => base44.entities.Estimate.filter({ status: 'sent', archived: { $ne: true } }, '-issue_date', 100), staleTime: 15000 });
  const { data: exceptions = [] } = useQuery({ queryKey: ['today-action-exceptions'], queryFn: () => base44.entities.ExceptionAlert.filter({ status: 'active' }, '-created_date', 100), staleTime: 15000 });

  const lowStock = parts.filter(p => Number(p.reorder_point) > 0 && Number(p.quantity_on_hand) <= Number(p.reorder_point));
  const unpaid = invoices.filter(i => ['sent','partial','overdue'].includes(i.status) && Number(i.balance_due || 0) > 0);
  const poAction = purchaseOrders.filter(po => ['ready','partial'].includes(po.status));
  const refresh = refreshRequests.filter(r => r.status === 'pending');
  const needsEstimate = jobs.filter(j => j.customer_engine_id && !j.estimate_id && !j.archived);
  const needsDeposit = jobs.filter(j => j.stage === 'awaiting_deposit' && !j.archived);

  const items = [
    ...exceptions.slice(0,3).map(a => ({priority:'critical', icon:AlertTriangle, title:a.title || 'Shop exception needs attention', detail:a.message || a.exception_type || 'Review this exception', to:a.job_id ? `/JobCard?id=${a.job_id}` : '/ExceptionDashboard'})),
    ...needsEstimate.slice(0,3).map(j => ({priority:'high', icon:ClipboardList, title:`${j.job_number || 'Checked-in engine'} needs an estimate`, detail:'Create or link the estimate so the job can move forward.', to:`/JobCard?id=${j.id}`})),
    ...needsDeposit.slice(0,3).map(j => ({priority:'high', icon:DollarSign, title:`${j.job_number || 'Job'} is waiting on deposit`, detail:'Review billing and payment status.', to:`/JobCard?id=${j.id}&tab=billing`})),
    ...estimates.slice(0,3).map(e => ({priority:'normal', icon:ClipboardList, title:`Estimate ${e.estimate_number || ''} is awaiting approval`, detail:'Customer decision is still pending.', to:`/EstimateDetail?id=${e.id}`})),
    ...(unpaid.length ? [{priority:'normal', icon:DollarSign, title:`${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'} need payment`, detail:'Review open balances and overdue invoices.', to:'/Invoices'}] : []),
    ...(lowStock.length ? [{priority:'normal', icon:Package, title:`${lowStock.length} part${lowStock.length === 1 ? '' : 's'} at or below reorder level`, detail:'Review stock before it blocks active work.', to:'/Inventory'}] : []),
    ...(poAction.length ? [{priority:'normal', icon:ShoppingCart, title:`${poAction.length} purchase order${poAction.length === 1 ? '' : 's'} ready for action`, detail:'Receive parts or finish the PO workflow.', to:'/PurchaseOrders'}] : []),
    ...(refresh.length ? [{priority:'normal', icon:RefreshCw, title:`${refresh.length} refresh request${refresh.length === 1 ? '' : 's'} waiting`, detail:'Review customer refresh requests.', to:'/RefreshRequests'}] : []),
  ].sort((a,b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0,8);

  return <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
    <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
      <div><h2 className="font-bold text-slate-900">Needs Attention</h2><p className="text-sm text-slate-500">The next things most likely to hold up the shop</p></div>
      <Link to="/ExceptionDashboard" className="text-xs font-semibold text-[#e20404]">All exceptions</Link>
    </div>
    {items.length === 0 ? <div className="p-6 text-center text-slate-500"><CheckCircle2 className="h-7 w-7 mx-auto mb-2 text-emerald-500"/><p className="font-medium text-slate-800">Nothing urgent right now</p><p className="text-sm">Active work is clear to keep moving.</p></div> : <div className="divide-y divide-slate-100">
      {items.map((item, i) => <Link key={`${item.title}-${i}`} to={item.to} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
        <span className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${item.priority === 'critical' ? 'bg-red-50 text-red-600' : item.priority === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}><item.icon className="h-4 w-4"/></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900 truncate">{item.title}</span><span className="block text-xs text-slate-500 truncate">{item.detail}</span></span>
        <ArrowRight className="h-4 w-4 text-slate-300 shrink-0"/>
      </Link>)}
    </div>}
  </section>;
}
