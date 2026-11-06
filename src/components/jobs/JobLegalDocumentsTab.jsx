import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {base44} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
import IllegalPartsViewModal from '@/components/legal/IllegalPartsViewModal';
import {printLegalDocument} from '@/components/legal/printLegalDocument';
import {FileText,Printer,Eye} from 'lucide-react';
export default function JobLegalDocumentsTab({job}){
 const [selected,setSelected]=useState(null);
 const {data:docs=[],isLoading}=useQuery({queryKey:['job-legal-documents',job.id,job.estimate_id,job.build_id,job.customer_engine_id],queryFn:async()=>{
  const fields=[['estimate_id',job.estimate_id],['build_id',job.build_id],['customer_engine_id',job.customer_engine_id],['invoice_id',job.invoice_id]].filter(([,id])=>!!id);
  const results=await Promise.all(fields.map(([field,id])=>base44.entities.LegalDocument.filter({[field]:id})));
  const byId=new Map();results.flat().forEach(doc=>byId.set(doc.id,doc));return [...byId.values()].sort((a,b)=>String(b.created_date||'').localeCompare(String(a.created_date||'')));
 },enabled:!!job.id});
 return <section className="space-y-4"><div><h2 className="text-lg font-bold">Signed Agreements & Legal Documents</h2><p className="text-sm text-slate-500">View complete contracts, illegal-parts acknowledgments, signatures, and attached photographs. Print or save as PDF.</p></div>{isLoading?<p>Loading documents…</p>:docs.length===0?<div className="rounded-lg border bg-white p-6 text-sm text-slate-500">No agreements linked to this job's estimate, build, engine, or invoice.</div>:<div className="space-y-3">{docs.map(doc=><article key={doc.id} className="rounded-xl border bg-white p-4 flex flex-wrap gap-3 items-center justify-between"><div className="flex gap-3 items-center"><FileText className="w-5 h-5 text-red-600"/><div><p className="font-semibold">{doc.title||String(doc.document_type||'Agreement').replaceAll('_',' ')}</p><p className="text-xs text-slate-500">{String(doc.status||'').replaceAll('_',' ')} · {doc.customer_signed_at?'Customer signed '+new Date(doc.customer_signed_at).toLocaleDateString():'Customer signature pending'} · {(doc.seal_tag_photos||[]).length} attachments</p></div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>setSelected(doc.id)}><Eye className="w-4 h-4 mr-1"/>View</Button><Button variant="outline" size="sm" onClick={()=>printLegalDocument(doc)}><Printer className="w-4 h-4 mr-1"/>Print / PDF</Button></div></article>)}</div>}{selected&&<IllegalPartsViewModal open={!!selected} documentId={selected} onClose={()=>setSelected(null)}/>}</section>
}
