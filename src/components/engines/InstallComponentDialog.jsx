import React,{useMemo,useState} from 'react';
import {base44} from '@/api/base44Client';
import {useQuery} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {toast} from 'sonner';

const REASONS=[['core_install','Core install'],['replacement','Replacement'],['customer_swap','Customer swap'],['repair','Repair'],['testing','Testing'],['incorrect_previous_pairing','Incorrect previous pairing'],['other','Other']];

export default function InstallComponentDialog({open,onClose,component,onDone=(/** @type {any} */ _d)=>{}}){
 const [engineId,setEngineId]=useState(''),[reasonCode,setReasonCode]=useState('core_install'),[reason,setReason]=useState(''),[busy,setBusy]=useState(false);
 const {data:engines=[]}=useQuery({queryKey:['install-component-engines'],queryFn:()=>base44.entities.CustomerEngine.list('-created_date',1000),enabled:open});
 const current=useMemo(()=>engines.find(e=>e.id===component?.current_customer_engine_id)||null,[engines,component?.current_customer_engine_id]);
 const selected=engines.find(e=>e.id===engineId)||null;
 const install=async()=>{
  if(!component||!engineId)return;
  if(component.inventory_state==='in_repair'||component.active_repair_ticket_id){toast.error('Finish the active repair ticket before installing this component.');return;}
  if(reasonCode==='other'&&!reason.trim()){toast.error('Enter a short reason');return;}
  setBusy(true);
  try{
   const fn=component.component_type==='cylinder_head'?'pairEngineHead':'pairEngineCase';
   const res=await base44.functions.invoke(fn,{component_id:component.id,customer_engine_id:engineId,reason_code:reasonCode,reason:reason.trim(),allow_transfer:!!component.current_customer_engine_id&&component.current_customer_engine_id!==engineId});
   const d=res?.data||res;if(d?.error)throw Error(d.error);
   toast.success(`${component.component_code} installed on ${selected?.eed_id||'engine'}`);
   onDone(d);setEngineId('');setReasonCode('core_install');setReason('');onClose();
  }catch(e){const err=/** @type {any} */(e);toast.error(err?.response?.data?.error||err.message||'Could not install component');}
  finally{setBusy(false);}
 };
 if(!component)return null;
 return <Dialog open={open} onOpenChange={next=>!next&&!busy&&onClose()}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Install {component.component_code}</DialogTitle></DialogHeader><div className="space-y-4">
  {current&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Currently installed on <span className="font-mono font-semibold">{current.eed_id}</span>. Choosing another engine will transfer it and preserve the old pairing.</div>}
  <div><Label>Engine *</Label><Select value={engineId} onValueChange={setEngineId}><SelectTrigger><SelectValue placeholder="Choose EED engine..."/></SelectTrigger><SelectContent>{engines.filter(e=>e.id!==component.current_customer_engine_id).map(e=><SelectItem key={e.id} value={e.id}>{e.eed_id} · {e.engine_serial_number}</SelectItem>)}</SelectContent></Select></div>
  <div><Label>Reason *</Label><Select value={reasonCode} onValueChange={setReasonCode}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{REASONS.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
  <div><Label>Note {reasonCode==='other'?'*':'(optional)'}</Label><Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Short install / swap reason"/></div>
  <p className="text-xs text-slate-500">Elite updates pairing history, inventory state, location/lifecycle context, and invalidates old component verification automatically.</p>
 </div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-[#e20404] hover:bg-red-700" disabled={!engineId||busy||(reasonCode==='other'&&!reason.trim())} onClick={install}>{busy?'Installing…':'Install on Engine'}</Button></DialogFooter></DialogContent></Dialog>;
}