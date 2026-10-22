import React,{useMemo,useState} from 'react';
import {base44} from '@/api/base44Client';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {CheckCircle2,ShieldCheck,TriangleAlert,RotateCcw,Link2,History,Cpu,Component,ScanLine} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Dialog,DialogContent,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import BarcodeScanner from '@/components/inventory/BarcodeScanner';
import {toast} from 'sonner';

export default function JobComponentVerification({job,engine}){
 const qc=useQueryClient();
 const [verified,setVerified]=useState({case:false,head:false});
 const [caseCode,setCaseCode]=useState('');
 const [headCode,setHeadCode]=useState('');
 const [mismatch,setMismatch]=useState(null);
 const [completeResult,setCompleteResult]=useState(null);
 const [pairConfirm,setPairConfirm]=useState(false);
 const {data:heads=[]}=useQuery({queryKey:['engine-heads'],queryFn:()=>base44.entities.EngineComponent.filter({component_type:'cylinder_head'},'-created_date',1000)});
 const {data:history=[]}=useQuery({queryKey:['job-component-verifications',job?.id],queryFn:()=>base44.entities.JobComponentVerification.filter({job_id:job.id},'-verified_at',50),enabled:!!job?.id});
 const currentHead=useMemo(()=>heads.find(h=>h.id===engine?.current_head_component_id)||null,[heads,engine?.current_head_component_id]);
 const latestPass=history.find(v=>v.status==='passed'||v.status==='head_repaired')||null;
 const invalidate=()=>{qc.invalidateQueries({queryKey:['job-component-verifications',job.id]});qc.invalidateQueries({queryKey:['engine-heads']});qc.invalidateQueries({queryKey:['customer-engines']});qc.invalidateQueries({queryKey:['job',job.id]});};
 const scanMutation=useMutation({mutationFn:/** @param {{code:string,caseVerified:boolean,headVerified:boolean}} args */ async({code,caseVerified,headVerified})=>{const r=await base44.functions.invoke('verifyJobComponent',{job_id:job.id,step:'auto',code,case_code:caseCode,case_verified:caseVerified,head_verified:headVerified});const data=r?.data||r;if(data?.error)throw Object.assign(new Error(data.error),data);return data;},onError:e=>toast.error(e.message||'Verification failed')});
 const finalizeMutation=useMutation({mutationFn:/** @param {{caseCode:string,headCode:string}} args */ async({caseCode:finalCase,headCode:finalHead})=>{const r=await base44.functions.invoke('verifyJobComponent',{job_id:job.id,step:'finalize',case_code:finalCase,head_code:finalHead});const data=r?.data||r;if(data?.error)throw new Error(data.error);return data;},onSuccess:data=>{invalidate();setCompleteResult(data);setMismatch(null);toast.success('Case and head verified');},onError:e=>toast.error(e.message||'Could not finalize verification')});
 const acceptHead=useMutation({mutationFn:async()=>{const scanned=mismatch?.scanned;if(!scanned?.id)throw Error('Scanned head is not recognized');if(!verified.case||!caseCode)throw Error('Verify this Job’s case first');const r=await base44.functions.invoke('acceptScannedHeadForJob',{job_id:job.id,component_id:scanned.id,case_code:caseCode});const data=r?.data||r;if(data?.error)throw Error(data.error);return data;},onSuccess:data=>{invalidate();setPairConfirm(false);setVerified({case:true,head:true});setHeadCode(data.head?.tag_code||data.head?.component_code||'');setMismatch(null);setCompleteResult({success:true,type:'complete',engine:data.engine,head:data.head,pairing_changed:true});toast.success(`${data.head?.component_code||'Head'} paired and verified`);},onError:e=>toast.error(e.message||'Could not update head pairing')});
 const initialize=useMutation({mutationFn:()=>base44.functions.invoke('initializeEngineIdentity',{customer_engine_id:engine.id}),onSuccess:()=>{invalidate();toast.success('Permanent component identities initialized');},onError:e=>toast.error(e.message||'Could not initialize identities')});
 const reset=()=>{setVerified({case:false,head:false});setCaseCode('');setHeadCode('');setMismatch(null);setCompleteResult(null);setPairConfirm(false);};
 const onScan=async(code)=>{
  if(scanMutation.isPending||finalizeMutation.isPending||completeResult)return;
  try{
   const data=await scanMutation.mutateAsync({code,caseVerified:verified.case,headVerified:verified.head});
   if(!data.recognized){setMismatch({type:'unknown',code});toast.error('This is not a recognized engine case or cylinder-head tag');return;}
   if(!data.match){setMismatch(data);toast.error(data.type==='case'?'Wrong case scanned':'Wrong cylinder head scanned');return;}
   const next={...verified};let nextCase=caseCode;let nextHead=headCode;
   if(data.type==='case'){
    next.case=true;nextCase=data.engine?.tag_code||code;setCaseCode(nextCase);toast.success(`Case verified · ${data.engine?.eed_id}`);
   }
   if(data.type==='head'){
    next.head=true;nextHead=data.head?.tag_code||code;setHeadCode(nextHead);toast.success(`Head verified · ${data.head?.component_code}`);
   }
   setVerified(next);
   setMismatch(prev=>prev?.type===data.type||prev?.type==='unknown'?null:prev);
   if(next.case&&next.head)await finalizeMutation.mutateAsync({caseCode:nextCase,headCode:nextHead});
  }catch{/* mutation handles UI */}
 };
 if(!engine)return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Link/check in the engine before component verification.</div>;
 if(!engine.tag_code||!engine.current_head_component_id)return <div className="rounded-xl border border-slate-200 bg-white p-5 text-center space-y-3"><ShieldCheck className="w-9 h-9 mx-auto text-slate-300"/><div><p className="font-semibold text-slate-900">Permanent identities are not ready</p><p className="text-sm text-slate-500">Initialize the case tag and serialized cylinder-head identity first.</p></div><Button className="bg-[#e20404] hover:bg-red-700" onClick={()=>initialize.mutate()} disabled={initialize.isPending}>{initialize.isPending?'Initializing…':'Initialize Tags & Head'}</Button></div>;
 return <div className="space-y-4">
  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
   <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[#e20404]"/>Physical Component Verification</h3><p className="text-xs text-slate-500 mt-1">Scan the case and head in either order. Elite identifies the tag automatically.</p></div>{latestPass&&<div className="text-right"><Badge className="bg-emerald-100 text-emerald-700 border-0">Last Verified</Badge><p className="text-[10px] text-slate-400 mt-1">{new Date(latestPass.verified_at).toLocaleString()}</p></div>}</div>
   <div className="p-4 md:p-6 space-y-5">
    <div className="grid sm:grid-cols-2 gap-3">
     <ComponentStatus icon={Cpu} label="Case / Bottom End" identity={`${engine.eed_id} · ${engine.engine_serial_number}`} verified={verified.case||!!completeResult}/>
     <ComponentStatus icon={Component} label="Cylinder Head" identity={currentHead?.component_code||'No head paired'} verified={verified.head||!!completeResult}/>
    </div>
    {completeResult ? <div className="text-center py-6"><div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center"><CheckCircle2 className="w-9 h-9"/></div><h3 className="text-xl font-bold text-slate-900 mt-3">Components Verified</h3><p className="text-sm text-slate-600 mt-1"><span className="font-mono font-semibold">{engine.eed_id}</span> + <span className="font-mono font-semibold">{completeResult?.head?.component_code||currentHead?.component_code}</span></p>{completeResult?.pairing_changed&&<Badge className="mt-2 bg-blue-100 text-blue-700 border-0">Head pairing updated during verification</Badge>}<div className="mt-4"><Button variant="outline" onClick={reset}><RotateCcw className="w-4 h-4 mr-1"/>Verify Again</Button></div></div> : <>
      {mismatch&&<MismatchCard mismatch={mismatch} caseVerified={verified.case} onPair={()=>setPairConfirm(true)}/>} 
      <div className="max-w-xl mx-auto"><div className="text-center mb-3"><div className="w-11 h-11 rounded-xl bg-slate-100 mx-auto flex items-center justify-center"><ScanLine className="w-5 h-5 text-slate-600"/></div><p className="font-semibold text-slate-900 mt-2">Scan either component</p><p className="text-xs text-slate-500">No selection needed. Elite detects whether the scan belongs to a case or cylinder head.</p></div><div className={(scanMutation.isPending||finalizeMutation.isPending)?'opacity-60 pointer-events-none':''}><BarcodeScanner onScan={onScan} preserveFullCode placeholder="Scan case/head tag, EED ID, serial, or HD ID..."/></div></div>
     </>}
   </div>
  </section>
  {history.length>0&&<details className="rounded-xl border border-slate-200 bg-white"><summary className="cursor-pointer p-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><History className="w-4 h-4"/>Verification History ({history.length})</summary><div className="border-t border-slate-100 divide-y">{history.map(v=><div key={v.id} className="px-4 py-3 flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-900">{verificationLabel(v.status)}</p><p className="text-xs text-slate-500">Expected head: {v.expected_head_code||'—'}{v.scanned_head_code?` · Scanned: ${v.scanned_head_code}`:''}</p>{v.notes&&<p className="text-xs text-slate-400 mt-0.5">{v.notes}</p>}</div><div className="text-right shrink-0"><Badge className={verificationBadge(v.status)}>{String(v.status).replaceAll('_',' ')}</Badge><p className="text-[10px] text-slate-400 mt-1">{new Date(v.verified_at).toLocaleString()}</p></div></div>)}</div></details>}
  <Dialog open={pairConfirm} onOpenChange={setPairConfirm}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Pair scanned head to this engine?</DialogTitle></DialogHeader><div className="space-y-3 text-sm text-slate-600"><p>You scanned <span className="font-mono font-bold text-slate-900">{mismatch?.scanned?.component_code}</span>, but Elite expected <span className="font-mono font-bold text-slate-900">{mismatch?.expected?.component_code||'no paired head'}</span>.</p><p>This updates permanent pairing history, unpairs this engine's current head, and if necessary unpairs the scanned head from its previous bottom end.</p></div><DialogFooter><Button variant="outline" onClick={()=>setPairConfirm(false)}>Cancel</Button><Button className="bg-[#e20404] hover:bg-red-700" disabled={acceptHead.isPending||!verified.case} onClick={()=>acceptHead.mutate()}>{acceptHead.isPending?'Pairing…':verified.case?'Pair Head & Verify':'Verify Case First'}</Button></DialogFooter></DialogContent></Dialog>
 </div>;
}

function ComponentStatus({icon:Icon,label,identity,verified}){return <div className={`rounded-xl border p-4 ${verified?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-slate-50'}`}><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className={`w-9 h-9 rounded-lg flex items-center justify-center ${verified?'bg-emerald-100 text-emerald-700':'bg-white text-slate-500'}`}><Icon className="w-5 h-5"/></div><div><p className="text-xs uppercase tracking-wide font-semibold text-slate-500">{label}</p><p className="font-mono font-bold text-slate-900 mt-0.5">{identity}</p></div></div>{verified?<Badge className="bg-emerald-600 text-white border-0"><CheckCircle2 className="w-3.5 h-3.5 mr-1"/>Verified</Badge>:<Badge variant="outline" className="text-slate-500">Waiting</Badge>}</div></div>}
function MismatchCard({mismatch,caseVerified,onPair}){if(mismatch.type==='unknown')return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-2"><TriangleAlert className="w-5 h-5 text-amber-600 shrink-0"/><div><p className="font-bold text-amber-800">Unrecognized scan</p><p className="text-sm text-amber-700 font-mono mt-1">{mismatch.code}</p><p className="text-xs text-amber-700 mt-1">Scan the permanent case or cylinder-head tag for this Job.</p></div></div>;
 const isHead=mismatch.type==='head';return <div className="rounded-xl border border-red-200 bg-red-50 p-4"><div className="flex gap-2"><TriangleAlert className="w-5 h-5 text-red-600 shrink-0"/><div><p className="font-bold text-red-800">Wrong {isHead?'cylinder head':'case'} scanned</p><p className="text-sm text-red-700 mt-1">Expected: <span className="font-mono font-semibold">{isHead?(mismatch.expected?.component_code||'No paired head'):mismatch.expected?.eed_id}</span></p><p className="text-sm text-red-700">Scanned: <span className="font-mono font-semibold">{isHead?(mismatch.scanned?.component_code||'Unrecognized'):(mismatch.scanned?.eed_id||mismatch.scanned?.serial||'Unrecognized')}</span></p></div></div>{isHead&&mismatch.scanned?.id&&<div className="mt-3"><Button size="sm" className="bg-red-700 hover:bg-red-800" disabled={!caseVerified} onClick={onPair}><Link2 className="w-4 h-4 mr-1"/>{caseVerified?'Pair This Head to Engine':'Verify Case Before Re-Pairing'}</Button></div>}</div>}
function verificationLabel(status){if(status==='passed')return 'Case and head matched';if(status==='head_repaired')return 'Head pairing changed and verified';if(status==='failed_case')return 'Incorrect case scanned';if(status==='failed_head')return 'Incorrect head scanned';return status;}
function verificationBadge(status){return status==='passed'||status==='head_repaired'?'bg-emerald-100 text-emerald-700 border-0':'bg-red-100 text-red-700 border-0';}
