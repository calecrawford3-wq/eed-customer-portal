import React,{useEffect,useState} from 'react';
import {base44} from '@/api/base44Client';
export default function FormerEmployeeTaxPortal(){
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{base44.functions.invoke('formerEmployeeTaxPortal',{action:'documents'}).then(r=>{if(r.data?.error)throw Error(r.data.error);setData(r.data)}).catch(e=>setError(e.response?.data?.error||e.message))},[]);
 return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-3xl space-y-5"><header><h1 className="text-3xl font-bold">Former Employee Tax Documents</h1><p className="text-slate-600">Elite Engine Development · Personal email access · Tax documents only</p></header>
 {error&&<p role="alert" className="rounded bg-red-50 p-4 text-red-700">{error}</p>}
 {!data&&!error&&<p>Loading your tax documents…</p>}
 {data&&<><section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">{data.worker.first_name} {data.worker.last_name}</h2><p className="text-sm text-slate-600">{data.worker.personal_email}</p></section><section className="rounded-xl border bg-white p-5"><h2 className="text-xl font-bold mb-2">Your tax documents</h2><p className="text-sm text-slate-600 mb-3">Only issued or received tax records assigned to you appear here. Contact HR if a form is missing.</p>{data.tax.length?data.tax.map(t=><div key={t.id} className="flex flex-wrap justify-between gap-2 border-b py-3"><span>{String(t.document_type||'Tax document').toUpperCase()} · {t.tax_year} · {t.status}</span>{t.document_url?<a className="text-blue-700 underline" href={t.document_url} target="_blank" rel="noopener noreferrer">View document</a>:<span className="text-slate-500">File not attached</span>}</div>):<p className="text-slate-500">No tax documents are currently available.</p>}</section></>}
 </div></main>;
}
