import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Package, Receipt, Settings2, ShoppingCart, Users } from 'lucide-react';
import StaffSignOut from '@/components/hr/StaffSignOut';
import QuickActions from '@/components/dashboard/QuickActions';
import TodayActionCenter from '@/components/dashboard/TodayActionCenter';
import ActiveJobsSnapshot from '@/components/dashboard/ActiveJobsSnapshot';
import EngineCheckInModal from '@/components/engines/EngineCheckInModal';
import { AppLauncher } from '@/components/navigation/AppLauncher';
import { formatMoney } from '@/lib/money';

export default function Dashboard() {
  const [checkInOpen, setCheckInOpen] = useState(false);
  const { data: customers = [] } = useQuery({ queryKey:['customers'], queryFn:()=>base44.entities.Customer.list('-created_date',200) });
  const { data: invoices = [] } = useQuery({ queryKey:['invoices'], queryFn:()=>base44.entities.Invoice.list('-created_date',200) });
  const { data: parts = [] } = useQuery({ queryKey:['parts'], queryFn:()=>base44.entities.Part.list('-created_date',250) });
  const { data: refreshRequests = [] } = useQuery({ queryKey:['refreshRequests'], queryFn:()=>base44.entities.RefreshRequest.list('-created_date',100) });
  const { data: purchaseOrders = [] } = useQuery({ queryKey:['purchaseOrders'], queryFn:()=>base44.entities.PurchaseOrder.list('-created_date',150), refetchInterval:30000 });

  const outstanding = invoices.filter(i=>['sent','partial','overdue'].includes(i.status)).reduce((sum,i)=>sum+Number(i.balance_due || 0),0);
  const lowStock = parts.filter(p=>Number(p.reorder_point)>0 && Number(p.quantity_on_hand)<=Number(p.reorder_point)).length;
  const readyPOs = purchaseOrders.filter(po=>['ready','partial'].includes(po.status)).length;
  const pendingRefresh = refreshRequests.filter(r=>r.status==='pending').length;
  const snapshot = [
    {label:'Outstanding', value:formatMoney(outstanding), icon:Receipt, to:'/Invoices'},
    {label:'Low stock', value:lowStock, icon:Package, to:'/Inventory'},
    {label:'POs ready', value:readyPOs, icon:ShoppingCart, to:'/PurchaseOrders'},
    {label:'Refresh requests', value:pendingRefresh, icon:Users, to:'/RefreshRequests'},
  ];

  return <div className="p-4 md:p-8 space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-slate-900">Today at Elite</h1><p className="text-sm text-slate-500">What needs attention and what is moving through the shop</p></div>
      <div className="flex gap-2 items-center"><Link to="/Settings" aria-label="Settings" title="Settings" className="inline-flex items-center justify-center h-11 w-11 rounded-xl border bg-white hover:bg-slate-100"><Settings2 className="h-5 w-5"/></Link><StaffSignOut/></div>
    </div>

    <TodayActionCenter invoices={invoices} purchaseOrders={purchaseOrders} parts={parts} refreshRequests={refreshRequests}/>
    <ActiveJobsSnapshot customers={customers}/>

    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3"><h2 className="font-bold text-slate-900">Quick Actions</h2><p className="text-sm text-slate-500">Start the most common shop tasks</p></div>
      <QuickActions onCheckIn={()=>setCheckInOpen(true)}/>
    </section>
    <EngineCheckInModal open={checkInOpen} onClose={()=>setCheckInOpen(false)}/>

    <details className="rounded-2xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold text-slate-800">Business snapshot & all tools</summary>
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {snapshot.map(card=><Link key={card.label} to={card.to} className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50"><card.icon className="h-5 w-5 text-[#e20404] mb-2"/><div className="text-xl font-bold text-slate-900">{card.value}</div><div className="text-xs text-slate-500">{card.label}</div></Link>)}
      </div>
      <div className="mt-6"><AppLauncher/></div>
    </details>
  </div>;
}
