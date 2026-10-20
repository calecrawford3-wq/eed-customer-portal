import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {base44} from '@/api/base44Client';
import {Button} from '@/components/ui/button';
import {StaffSignOut} from '@/components/hr/StaffSignOut';
export default function StaffWorkspace(){
 const [info,setInfo]=useState(null),[jobs,setJobs]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;(async()=>{try{
  const r=await base44.functions.invoke('staffWorkspace',{action:'identity'});
  if(r.data?.error)throw Error(r.data.error);
  if(live)setInfo(r.data);
  if(r.data.permissions?.view_jobs){const j=await base44.functions.invoke('staffWorkspace',{action:'jobs'});if(j.data?.error)throw Error(j.data.error);if(live)setJobs(j.data.jobs||[])}
 }catch(e){if(live)setError(e.message)}})();return()=>{live=false}},[]);
 return <main className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-5xl space-y-6">
  <header><div className="flex justify-end mb-3"><StaffSignOut /></div><p className="text-sm font-bold tracking-wide text-red-600">ELITE ENGINE DEVELOPMENT</p><h1 className="text-3xl font-bold">Staff Workspace</h1><p className="text-slate-600">Your assigned shop access. Internal costs and build profitability are restricted.</p></header>
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
  {!info&&!error&&<p>Checking employee permissions…</p>}
  {info&&<><section className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">Welcome, {info.worker?.first_name||'Team member'}</h2><p className="text-sm text-slate-600">{info.worker?.job_title||'Shop team'} · {info.worker?.access_level||'Employee'}</p><div className="mt-4 flex flex-wrap gap-2"><Link to="/EmployeePortal"><Button>My Hours, Pay & Benefits</Button></Link>{info.worker?.access_level==='owner'&&<Link to="/OwnerEarnings"><Button variant="outline">My Owner Earnings</Button></Link>}{info.is_owner&&<Link to="/HRAdmin"><Button variant="outline">HR Administration</Button></Link>}</div></section>
  <section className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold mb-3">Shop Jobs</h2>{!info.permissions?.view_jobs?<p className="text-slate-600">Your account does not currently have shop job access. Ask the owner to enable View Shop Jobs in HR Administration.</p>:!jobs?<p>Loading authorized jobs…</p>:<div className="space-y-2">{jobs.map(j=><div key={j.id} className="rounded-lg border p-3 flex flex-wrap justify-between gap-2"><span className="font-semibold">{j.job_number||'Shop job'}</span><span className="capitalize text-slate-600">{(j.stage||'Unassigned').replaceAll('_',' ')}</span><span className="text-sm text-slate-500">{j.service_package||'Service'}</span></div>)}{!jobs.length&&<p className="text-slate-500">No jobs to display.</p>}</div>}<p className="mt-3 text-xs text-slate-500">This is a restricted job work queue. Detailed build editing and other backend sections will appear only after their server-side permissions are implemented.</p></section></>}
 </div></main>
}
