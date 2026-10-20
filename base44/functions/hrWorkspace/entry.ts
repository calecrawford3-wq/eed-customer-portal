import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// HR data is never read through the public SDK. Every request is authenticated;
// employee access is restricted to a verified login email and its own worker ID.
const entities = {
  workers: 'HRWorker', time: 'HRTimeEntry', leave: 'HRLeaveRequest',
  pay: 'HRPayStatement', benefits: 'HRBenefitEnrollment', tax: 'HRTaxDocument',
};
const fields = {
  workers: ['first_name','last_name','email','phone','worker_type','status','job_title','department','hire_date','pay_type','pay_rate','benefits_notes','access_level','can_view_shop_jobs','can_view_build_profitability','pto_hours_available','emergency_contact'],
  time: ['worker_id','clock_in','clock_out','break_minutes','status','notes'],
  leave: ['worker_id','start_date','end_date','hours','leave_type','status','reason','decision_note'],
  pay: ['worker_id','period_start','period_end','pay_date','gross_pay','net_pay','taxes_withheld','deductions','statement_url','payroll_provider_reference','status'],
  benefits: ['worker_id','benefit_name','provider','plan','coverage_start','coverage_end','employee_contribution','employer_contribution','status'],
  tax: ['worker_id','tax_year','document_type','document_url','status','notes'],
};
const rows = x => Array.isArray(x) ? x : (x?.items || []);
const clean = (source, allowed) => Object.fromEntries(allowed.filter(k => Object.prototype.hasOwnProperty.call(source,k)).map(k=>[k,source[k]]));
const fail = (error,status=400) => Response.json({error},{status});
export default async function(req) {
  if(req.method!=='POST') return fail('Method not allowed',405);
  try {
    const api=createClientFromRequest(req);
    const user=await api.auth.me().catch(()=>null);
    if(!user?.email) return fail('Sign in required',401);
    const body=await req.json().catch(()=>({}));
    const admin=user.role==='admin';
    const workers=api.asServiceRole.entities.HRWorker;
    const mine=rows(await workers.filter({email:user.email.toLowerCase().trim()})).find(w=>w.email?.toLowerCase()===user.email.toLowerCase().trim() && w.status==='active');
    if(!admin && !mine) return fail('Employee access not activated',403);
    const action=body.action||'dashboard';
    const kind=body.kind;
    if(action==='dashboard') {
      if(admin && body.adminView) {
        const result={};
        for(const [key,name] of Object.entries(entities)) result[key]=rows(await api.asServiceRole.entities[name].list('-created_date',500));
        return Response.json({admin:true,...result});
      }
      if(!mine) return fail('No employee profile linked',404);
      const result={worker:clean(mine,['id','first_name','last_name','email','phone','worker_type','status','job_title','department','hire_date','pto_hours_available'])};
      for(const [key,name] of Object.entries(entities)) {
        if(key==='workers') continue;
        const data=rows(await api.asServiceRole.entities[name].filter({worker_id:mine.id}));
        result[key]=key==='pay'?data.filter(x=>x.status==='issued'):key==='tax'?data.filter(x=>x.status==='issued'||x.status==='received'):data;
      }
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }
    if(action==='clock') {
      if(!mine) return fail('Employee profile required',403);
      const entries=rows(await api.asServiceRole.entities.HRTimeEntry.filter({worker_id:mine.id,status:'open'}));
      if(body.direction==='in') {
        if(entries.length) return fail('Already clocked in',409);
        const entry=await api.asServiceRole.entities.HRTimeEntry.create({worker_id:mine.id,clock_in:new Date().toISOString(),status:'open',break_minutes:0});
        return Response.json({success:true,entry});
      }
      if(body.direction==='out') {
        if(entries.length!==1) return fail('No unique open shift found',409);
        const entry=await api.asServiceRole.entities.HRTimeEntry.update(entries[0].id,{clock_out:new Date().toISOString(),status:'closed'});
        return Response.json({success:true,entry});
      }
      return fail('Invalid clock action');
    }
    if(action==='request_leave') {
      if(!mine) return fail('Employee profile required',403);
      const hours=Number(body.hours);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(body.start_date||'') || !/^\d{4}-\d{2}-\d{2}$/.test(body.end_date||'') || body.end_date<body.start_date || !Number.isFinite(hours)||hours<=0||hours>500) return fail('Valid dates and hours required');
      const entry=await api.asServiceRole.entities.HRLeaveRequest.create({worker_id:mine.id,start_date:body.start_date,end_date:body.end_date,hours,leave_type:String(body.leave_type||'PTO').slice(0,60),reason:String(body.reason||'').slice(0,500),status:'pending'});
      return Response.json({success:true,entry});
    }
    if(!admin) return fail('HR administrator access required',403);
    if(!entities[kind]) return fail('Invalid HR record type');
    const entity=api.asServiceRole.entities[entities[kind]];
    if(action==='create'||action==='update') {
      const values=clean(body.values||{},fields[kind]);
      if(kind==='workers') {
        if(values.email) values.email=String(values.email).trim().toLowerCase();
        if(action==='create' && (!values.email || !values.first_name || !values.last_name || !['w2','1099','owner'].includes(values.worker_type))) return fail('Name, email and worker classification required');
        if(values.worker_type==='owner') values.access_level='owner';
        if(values.access_level==='owner' && values.worker_type!=='owner') return fail('Owner access level requires owner classification');
        if(values.worker_type==='owner' && action==='update' && body.id) {
          const existing=await workers.get(body.id);
          if(existing?.worker_type!=='owner' && values.worker_type==='owner') return fail('Create a separate owner profile; do not convert employees to owners',409);
        }
        if(values.access_level==='manager'||values.access_level==='shop_staff') {
          // HR designation is NOT an authentication role; backend access needs separate explicit provisioning.
        }
      } else {
        if(action==='create' && !values.worker_id) return fail('Worker ID required');
        const id=values.worker_id || (action==='update' ? (await entity.get(body.id))?.worker_id : null);
        if(!id || !rows(await workers.filter({id})).length) return fail('Worker not found',404);
      }
      if(action==='update' && !body.id) return fail('Record ID required');
      const record=action==='create'?await entity.create(values):await entity.update(body.id,values);
      return Response.json({success:true,record});
    }
    return fail('Unsupported HR action');
  } catch(e) {
    console.error('[hrWorkspace]',e?.message);
    return fail('HR request could not be completed',500);
  }
}
