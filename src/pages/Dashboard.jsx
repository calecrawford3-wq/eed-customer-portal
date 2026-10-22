import React,{useState} from 'react';
import {base44} from '@/api/base44Client';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {Settings2,AlertTriangle,ChevronRight} from 'lucide-react';
import StaffSignOut from '@/components/hr/StaffSignOut';
import EngineCheckInModal from '@/components/engines/EngineCheckInModal';
import HomeStartBar from '@/components/dashboard/HomeStartBar';
import HomeActiveJobsRow from '@/components/dashboard/HomeActiveJobsRow';
import TodayActionCenter from '@/components/dashboard/TodayActionCenter';
import {AppLauncher} from '@/components/navigation/AppLauncher';

export default function Dashboard(){
 const [checkInOpen,setCheckInOpen]=useState(false);
 const {data:customers=[]}=useQuery({queryKey:['customers'],queryFn:()=>base44.entities.Customer.list('-created_date',200)});
 const {data:invoices=[]}=useQuery({queryKey:['invoices'],queryFn:()=>base44.entities.Invoice.list('-created_date',200)});
 const {data:parts=[]}=useQuery({queryKey:['parts'],queryFn:()=>base44.entities.Part.list('-created_date',250)});
 const {data:refreshRequests=[]}=useQuery({queryKey:['refreshRequests'],queryFn:()=>base44.entities.RefreshRequest.list('-created_date',100)});
 const {data:purchaseOrders=[]}=useQuery({queryKey:['purchaseOrders'],queryFn:()=>base44.entities.PurchaseOrder.list('-created_date',150),refetchInterval:30000});
 const {data:jobs=[]}=useQuery({queryKey:['home-jobs'],queryFn:()=>base44.entities.Job.filter({archived:false},'-created_date',150),staleTime:15000});
 const {data:unreadMessages=0}=useQuery({queryKey:['home-unread'],queryFn:()=>base44.entities.Message.count({is_read:false,direction:'inbound'}),refetchInterval:30000});
 const {data:exceptions=0}=useQuery({queryKey:['home-exceptions'],queryFn:()=>base44.entities.ExceptionAlert.count({status:'active'}),refetchInterval:30000});
 const {data:pendingEstimates=0}=useQuery({queryKey:['home-pending-estimates'],queryFn:()=>base44.entities.Estimate.count({status:'sent'}),refetchInterval:30000});

 const activeJobs=jobs.filter(j=>['queued','teardown','machining','assembly','testing','ready_for_pickup'].includes(j.stage));
 const lowStock=parts.filter(p=>Number(p.reorder_point)>0&&Number(p.quantity_on_hand)<=Number(p.reorder_point)).length;
 const readyPOs=purchaseOrders.filter(po=>['ready','partial'].includes(po.status)).length;
 const pendingRefresh=refreshRequests.filter(r=>r.status==='pending').length;
 const openInvoices=invoices.filter(i=>['sent','partial','overdue'].includes(i.status)&&Number(i.balance_due||0)>0).length;
 const attentionCount=Number(exceptions||0)+pendingEstimates+openInvoices+lowStock+readyPOs+pendingRefresh;
 const badges={
   Jobs:{value:activeJobs.length,label:`${activeJobs.length} active`,alert:false},
   Customers:{value:pendingRefresh,label:pendingRefresh?'refresh requests':'up to date',alert:pendingRefresh>0},
   Billing:{value:pendingEstimates+openInvoices,label:`${pendingEstimates} approval${pendingEstimates===1?'':'s'} · ${openInvoices} unpaid`,alert:openInvoices>0||pendingEstimates>0},
   Inventory:{value:lowStock,label:lowStock?'low stock':'stock okay',alert:lowStock>0},
   Purchasing:{value:readyPOs,label:readyPOs?'ready to receive':'no ready POs',alert:readyPOs>0},
   Inbox:{value:Number(unreadMessages||0),label:unreadMessages?'unread':'caught up',alert:Number(unreadMessages||0)>0},
   Reports:{value:Number(exceptions||0),label:exceptions?'exceptions':'clear',alert:Number(exceptions||0)>0},
 };

 return <div className="p-4 md:p-8 space-y-5">
   <div className="flex items-center justify-between gap-3">
     <div><h1 className="text-2xl md:text-3xl font-bold text-slate-900">Elite</h1><p className="text-sm text-slate-500">Choose an app or start something new</p></div>
     <div className="flex gap-2 items-center"><Link to="/Settings" aria-label="Settings" title="Settings" className="inline-flex items-center justify-center h-11 w-11 rounded-xl border bg-white hover:bg-slate-100"><Settings2 className="h-5 w-5"/></Link><StaffSignOut/></div>
   </div>

   <HomeStartBar onCheckIn={()=>setCheckInOpen(true)}/>
   <EngineCheckInModal open={checkInOpen} onClose={()=>setCheckInOpen(false)}/>

   <AppLauncher badges={badges}/>

   <HomeActiveJobsRow jobs={jobs} customers={customers}/>

   <details className="rounded-2xl border border-slate-200 bg-white overflow-hidden" open={attentionCount>0&&attentionCount<=3}>
     <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3 hover:bg-slate-50">
       <span className={`h-9 w-9 rounded-xl flex items-center justify-center ${attentionCount?'bg-red-50 text-red-600':'bg-emerald-50 text-emerald-600'}`}><AlertTriangle className="h-4 w-4"/></span>
       <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">Needs Attention</span><span className="block text-xs text-slate-500">{attentionCount?`${attentionCount} item${attentionCount===1?'':'s'} across the shop`:'Nothing urgent right now'}</span></span>
       {attentionCount>0&&<span className="min-w-6 h-6 px-2 rounded-full bg-[#e20404] text-white text-xs font-bold flex items-center justify-center">{attentionCount>99?'99+':attentionCount}</span>}<ChevronRight className="h-4 w-4 text-slate-300"/>
     </summary>
     <div className="border-t border-slate-100"><TodayActionCenter invoices={invoices} purchaseOrders={purchaseOrders} parts={parts} refreshRequests={refreshRequests}/></div>
   </details>
 </div>;
}
