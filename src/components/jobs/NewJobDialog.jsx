import React,{useMemo,useState} from 'react';
import {base44} from '@/api/base44Client';
import {useNavigate} from 'react-router-dom';
import {Briefcase, Cpu} from 'lucide-react';
import {Dialog,DialogContent,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import CustomerSearchSelect from '@/components/CustomerSearchSelect';
import {toast} from 'sonner';

export default function NewJobDialog({open,onClose,customers=[],engines=[]}){
 const navigate=useNavigate();
 const [customerId,setCustomerId]=useState('');
 const [engineId,setEngineId]=useState('none');
 const [saving,setSaving]=useState(false);
 const customerEngines=useMemo(()=>engines.filter(e=>e.customer_id===customerId),[engines,customerId]);
 const close=()=>{if(saving)return;setCustomerId('');setEngineId('none');onClose();};
 const start=async()=>{
  if(!customerId){toast.error('Select a customer');return;}
  setSaving(true);
  try{
   const selectedEngineId=engineId==='none'?'':engineId;
   const res=await base44.functions.invoke('createDraftJob',{customer_id:customerId,customer_engine_id:selectedEngineId});
   const data=res?.data||res;
   if(data?.existing_job_id){onClose();navigate(`/JobCard?id=${data.existing_job_id}`);toast.info('That engine already has an open job.');return;}
   if(data?.error)throw new Error(data.error);
   const job=data?.job;
   if(!job?.id)throw new Error('Job could not be created');
   const params=new URLSearchParams({new:'1',customer_id:customerId,job_id:job.id,return_job:'1'});
   if(selectedEngineId)params.set('customer_engine_id',selectedEngineId);
   onClose();
   navigate(`/EstimateDetail?${params.toString()}`);
  }catch(e){toast.error(e?.message||'Could not start job');}
  finally{setSaving(false);}
 };
 return <Dialog open={open} onOpenChange={next=>!next&&close()}><DialogContent className="sm:max-w-lg">
  <DialogHeader><DialogTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5 text-[#e20404]"/>Start New Job</DialogTitle></DialogHeader>
  <div className="space-y-4 py-2">
   <div><Label>Customer *</Label><CustomerSearchSelect customers={customers} value={customerId} onValueChange={v=>{setCustomerId(v);setEngineId('none');}} placeholder="Select customer..."/></div>
   <div><Label>Engine</Label><Select value={engineId} onValueChange={setEngineId} disabled={!customerId}><SelectTrigger><SelectValue placeholder="Link an engine now or later"/></SelectTrigger><SelectContent><SelectItem value="none">No engine yet / link later</SelectItem>{customerEngines.map(e=><SelectItem key={e.id} value={e.id}>{e.eed_id || e.engine_serial_number} · {e.engine_serial_number}</SelectItem>)}</SelectContent></Select><p className="text-xs text-slate-500 mt-1">You can start the estimate before the engine arrives. Check-in can be completed later.</p></div>
   <div className="rounded-xl border border-red-100 bg-red-50 p-3 flex gap-3"><Cpu className="h-5 w-5 text-[#e20404] shrink-0 mt-0.5"/><div><p className="text-sm font-semibold text-slate-900">This creates the Job first</p><p className="text-xs text-slate-600 mt-0.5">Next you will build this Job's estimate. Approval, deposit, findings, build work, invoice/payment and pickup all stay tied to the same Job.</p></div></div>
  </div>
  <DialogFooter><Button variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button className="bg-[#e20404] hover:bg-red-700" disabled={saving||!customerId} onClick={start}>{saving?'Starting…':'Start Job & Build Estimate'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
