import React,{useEffect,useState} from 'react';
import {base44} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {StaffSignOut} from '@/components/hr/StaffSignOut';
import {Link} from 'react-router-dom';
import {STAFF_PAGE_GROUPS,STAFF_SAFE_WORKSPACE_PAGES} from '@/lib/staff-page-permissions';
const request=async body=>{const r=await base44.functions.invoke('hrWorkspace',body);if(r.data?.error)throw Error(r.data.error);return r.data;};
const money=n=>Number(n||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
export default function EmployeePortal(){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[form,setForm]=useState({start_date:'',end_date:'',hours:'',leave_type:'PTO',reason:''});
 const load=async()=>{try{setData(await request({action:'dashboard'}));setError('')}catch(e){setError(e.message)}};
 useEffect(()=>{load()},[]);
 const act=async body=>{setBusy(true);setError('');try{await request(body);await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const open=data?.time?.find(t=>t.status==='open');
 return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-4xl space-y-6">
 <header><div className="flex justify-end mb-3"><StaffSignOut /></div><h1 className="text-3xl font-bold">My Employee Portal</h1><p className="text-slate-600">Elite Engine Development · Private employee access</p></header>
 {error&&<p role="alert" className="rounded bg-red-50 p-4 text-red-700">{error}</p>}
 {!data?<p>Loading your employee profile…</p>:<>
 <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">{data.worker?.first_name} {data.worker?.last_name}</h2><p>{data.worker?.job_title} · {data.worker?.worker_type==='1099'?'Independent contractor':'W-2 employee'}</p><p className="text-sm text-slate-500">{data.worker?.email}</p></section>
 <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold mb-2">My Work Pages</h2><p className="text-sm text-slate-600 mb-3">Pages your owner has enabled. Some modules require additional backend access before their records are available.</p><div className="flex flex-wrap gap-2">{STAFF_PAGE_GROUPS.flatMap(g=>g.pages).filter(([page])=>page!=='EmployeePortal'&&data.worker?.allowed_pages?.includes(page)).map(([page,label])=><Link key={page} className="rounded-md border px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50" to={'/'+page}>{label}{!STAFF_SAFE_WORKSPACE_PAGES.includes(page)&&' (pending)'}</Link>)}{!data.worker?.allowed_pages?.some(p=>p!=='EmployeePortal')&&<p className="text-sm text-slate-500">No additional pages assigned yet.</p>}</div></section>
 <section className="rounded-xl bg-white p-5 shadow-sm space-y-3"><h2 className="text-xl font-bold">Time Clock</h2><p>{open?`Clocked in since ${new Date(open.clock_in).toLocaleString()}`:'Currently clocked out'}</p><Button disabled={busy} onClick={()=>act({action:'clock',direction:open?'out':'in'})}>{busy?'Saving…':open?'Clock Out':'Clock In'}</Button><h3 className="font-semibold pt-2">Recent shifts</h3>{data.time?.slice(-12).reverse().map(t=><p key={t.id} className="border-b py-2 text-sm">{new Date(t.clock_in).toLocaleString()} → {t.clock_out?new Date(t.clock_out).toLocaleString():'Open'}</p>)}</section>
 <section className="rounded-xl bg-white p-5 shadow-sm space-y-3"><h2 className="text-xl font-bold">Time Off</h2><p>Available PTO hours: {data.worker?.pto_hours_available??'Not configured'}</p><div className="grid gap-2 sm:grid-cols-2">{['start_date','end_date','hours','leave_type','reason'].map(k=><label key={k} className="text-sm capitalize">{k.replace('_',' ')}<Input className="mt-1" type={k.includes('date')?'date':k==='hours'?'number':'text'} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}</div><Button disabled={busy} onClick={async()=>{await act({action:'request_leave',...form})}}>Request Time Off</Button>{data.leave?.map(x=><p className="border-b py-2 text-sm" key={x.id}>{x.start_date} to {x.end_date}: {x.hours} hours · {x.status}</p>)}</section>
 <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold mb-3">Pay Statements</h2>{data.pay?.length?data.pay.map(p=><div className="border-b py-3" key={p.id}><p>{p.period_start} to {p.period_end} · Pay date {p.pay_date}</p><p>Gross {money(p.gross_pay)} · Withholding {money(p.taxes_withheld)} · Net {money(p.net_pay)}</p>{p.statement_url&&<a className="text-blue-700 underline" href={p.statement_url} target="_blank" rel="noopener noreferrer">View statement</a>}</div>):<p className="text-slate-500">No issued statements yet.</p>}</section>
 <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold mb-3">Benefits</h2>{data.benefits?.length?data.benefits.map(b=><p className="border-b py-2" key={b.id}>{b.benefit_name} · {b.plan} · {b.status}</p>):<p className="text-slate-500">No benefits recorded.</p>}</section>
 <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold mb-3">Tax Documents</h2><p className="mb-3 text-sm text-slate-600">Tax forms are issued by your payroll provider. Do not upload Social Security numbers or banking credentials into HR notes.</p>{data.tax?.length?data.tax.map(t=><div className="border-b py-2" key={t.id}>{t.document_type?.toUpperCase()} · {t.tax_year} · {t.status} {t.document_url&&<a className="ml-3 text-blue-700 underline" href={t.document_url} target="_blank" rel="noopener noreferrer">Open document</a>}</div>):<p className="text-slate-500">No documents available yet.</p>}</section>
 </>}
 </div></main>;
}
