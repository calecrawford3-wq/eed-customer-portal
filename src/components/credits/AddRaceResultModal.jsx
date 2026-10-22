import React,{useState} from 'react';
import {base44} from '@/api/base44Client';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from '@/components/ui/dialog';
import CustomerSearchSelect from '@/components/CustomerSearchSelect';
import {toast} from 'sonner';

const blank=()=>({customer_id:'',event_date:new Date().toISOString().slice(0,10),event_name:'',track_name:'',class_name:'',finish_position:'',heat_finish_position:'',b_feature_finish_position:'',feature_started:true,source:'manual'});
export default function AddRaceResultModal({open,onClose,customers}){
 const [form,setForm]=useState(blank()); const qc=useQueryClient();
 const mutation=useMutation({mutationFn:async data=>{const r=await base44.functions.invoke('recordRaceResult',data);if(r?.data?.error)throw Error(r.data.error);return r.data;},onSuccess:r=>{qc.invalidateQueries({queryKey:['raceResults']});qc.invalidateQueries({queryKey:['allAccountCredits']});toast.success(`Race result saved · $${Number(r.total||0).toFixed(0)} in credits applied${r.rules?.length?` (${r.rules.join(', ')})`:''}`);setForm(blank());onClose();},onError:e=>toast.error(e.message||'Could not record race result')});
 return <Dialog open={open} onOpenChange={onClose}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Record Race Result</DialogTitle></DialogHeader><div className="space-y-3 py-2">
  <div><Label>Customer / Driver *</Label><CustomerSearchSelect customers={customers} value={form.customer_id} onValueChange={v=>setForm({...form,customer_id:v})}/></div>
  <div className="grid grid-cols-2 gap-3"><div><Label>Date *</Label><Input type="date" value={form.event_date} onChange={e=>setForm({...form,event_date:e.target.value})}/></div><div><Label>Track</Label><Input value={form.track_name} onChange={e=>setForm({...form,track_name:e.target.value})}/></div></div>
  <div><Label>Event</Label><Input value={form.event_name} onChange={e=>setForm({...form,event_name:e.target.value})}/></div>
  <div><Label>Class</Label><Input value={form.class_name} onChange={e=>setForm({...form,class_name:e.target.value})}/></div>
  <div className="grid grid-cols-3 gap-3"><div><Label>Feature Finish</Label><Input type="number" min="1" value={form.finish_position} onChange={e=>setForm({...form,finish_position:e.target.value})}/></div><div><Label>Heat Finish</Label><Input type="number" min="1" value={form.heat_finish_position} onChange={e=>setForm({...form,heat_finish_position:e.target.value})}/></div><div><Label>B Finish</Label><Input type="number" min="1" value={form.b_feature_finish_position} onChange={e=>setForm({...form,b_feature_finish_position:e.target.value})}/></div></div>
  <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3"><Switch checked={!!form.feature_started} onCheckedChange={v=>setForm({...form,feature_started:v})}/><div><Label>Started A Feature</Label><p className="text-xs text-slate-500">Applies the existing $10 feature-start PCS bonus.</p></div></div>
  <p className="text-xs text-slate-500">Elite automatically applies every matching PCS rule and prevents duplicate credits if the same imported result is processed again.</p>
 </div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-[#e20404] hover:bg-red-700" disabled={mutation.isPending||!form.customer_id||!form.event_date} onClick={()=>mutation.mutate(form)}>{mutation.isPending?'Applying…':'Save & Apply Credits'}</Button></DialogFooter></DialogContent></Dialog>;
}
