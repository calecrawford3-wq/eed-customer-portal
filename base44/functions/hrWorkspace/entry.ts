import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// HR data is never read through the public SDK. Every request is authenticated;
// employee access is restricted to a verified login email and its own worker ID.
const entities = {
  workers: 'HRWorker', time: 'HRTimeEntry', leave: 'HRLeaveRequest',
  pay: 'HRPayStatement', benefits: 'HRBenefitEnrollment', tax: 'HRTaxDocument',
};
const fields = {
  workers: ['first_name','last_name','email','personal_email','phone','worker_type','status','termination_date','job_title','department','hire_date','pay_type','pay_rate','benefits_notes','access_level','ownership_percentage','allowed_pages','can_view_shop_jobs','can_view_build_profitability','pto_hours_available','emergency_contact'],
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
    const companyMatches=rows(await workers.filter({email:user.email.toLowerCase().trim()}));
    if(companyMatches.some(w=>w.status==='terminated'))return fail('Company login disabled. Use personal email for former employee tax documents.',403);
    const mine=companyMatches.find(w=>w.email?.toLowerCase()===user.email.toLowerCase().trim() && w.status==='active');
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
      const result={worker:clean(mine,['id','first_name','last_name','email','phone','worker_type','status','job_title','department','hire_date','pto_hours_available','allowed_pages'])};
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
        if(Object.prototype.hasOwnProperty.call(values,'email')) {
          values.email=String(values.email||'').trim().toLowerCase();
          if(!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@eedpower\.com$/.test(values.email)) return fail('Staff login email must be an @eedpower.com address');
        }
        if(Object.prototype.hasOwnProperty.call(values,'personal_email')) {
          values.personal_email=String(values.personal_email||'').trim().toLowerCase();
          if(values.personal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.personal_email)) return fail('Enter a valid personal email address');
        }
        if(action==='create' && (!values.email || !values.first_name || !values.last_name || !['w2','1099','owner'].includes(values.worker_type))) return fail('Name, company login email and worker classification required');
        const prior=action==='update' ? await workers.get(body.id) : null;
        if(action==='update' && !prior) return fail('Employee record not found',404);
        const loginEmail=values.email ?? String(prior?.email||'').trim().toLowerCase();
        const personalEmail=values.personal_email ?? String(prior?.personal_email||'').trim().toLowerCase();
        if(!personalEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) return fail('A valid personal email is required for private HR and tax correspondence');
        if(personalEmail===loginEmail) return fail('Personal email must be different from company login email');
        const sharedPersonal=rows(await workers.filter({personal_email:personalEmail}));
        if(sharedPersonal.some(w=>w.id!==body.id)) return fail('Personal email is already assigned to another employee',409);
        if(!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@eedpower\.com$/.test(loginEmail)) return fail('Staff login email must be an @eedpower.com address');
        if(prior?.portal_invite_sent_at && values.email && values.email!==String(prior.email||'').trim().toLowerCase()) return fail('Login email cannot be changed after invitation. Update the Base44 account first.',409);
        const resultingType=values.worker_type || prior?.worker_type;
        if(Object.prototype.hasOwnProperty.call(values,'allowed_pages')) {
          const validPages=new Set('EmployeePortal StaffWorkspace Dashboard Jobs JobCard BuildWorkflow MachiningStation ShopDisplay BarcodeScan ExceptionDashboard Calendar Customers CustomerDetail CustomerSuccess RefreshRequests Communications Messaging Emails Inventory PurchaseOrders PurchaseOrderDetail Suppliers Estimates EstimateDetail Invoices InvoiceDetail Approvals Payments Credits Expenses Reports Platforms SpecSheets SpecView SpecCompare Documents Builds BuildDetail DevelopmentData RnDEngineDeveloper'.split(' '));
          if(!Array.isArray(values.allowed_pages)||values.allowed_pages.length>validPages.size||values.allowed_pages.some(p=>typeof p!=='string'||!validPages.has(p)))return fail('Invalid employee page permissions');
          values.allowed_pages=[...new Set(values.allowed_pages)];
          if(resultingType==='owner' && values.allowed_pages.length) return fail('Owner page access is managed by administrator role');
        }
        if(values.status==='terminated') {
          if(resultingType==='owner') return fail('Owner access must be revoked through a separate ownership and administrator offboarding process',409);
          if(!values.termination_date && !prior?.termination_date) values.termination_date=new Date().toISOString().slice(0,10);
        }
        if(prior?.status==='terminated' && values.status && values.status!=='terminated') return fail('Rehire requires a separate verified account transition; do not reactivate former employee directly',409);
        if(prior?.worker_type==='owner' && resultingType!=='owner') return fail('Owner profiles cannot be converted to employees; contact the administrator',409);
        if(resultingType==='owner') values.access_level='owner';
        if(Object.prototype.hasOwnProperty.call(values,'ownership_percentage')) {
          if(resultingType!=='owner') return fail('Only owners can have an ownership percentage');
          if(values.ownership_percentage===''||values.ownership_percentage===null||values.ownership_percentage===undefined) {
            values.ownership_percentage=null;
          } else {
            const pct=Number(values.ownership_percentage);
            if(!Number.isFinite(pct)||pct<0||pct>100||!/^\d+(\.\d{1,4})?$/.test(String(values.ownership_percentage))) return fail('Ownership percentage must be between 0 and 100, with up to four decimal places');
            values.ownership_percentage=pct;
          }
        }
        if(resultingType==='owner') {
          const allOwners=rows(await workers.filter({worker_type:'owner'}));
          const otherTotal=allOwners.filter(w=>w.id!==body.id).reduce((sum,w)=>sum+Number(w.ownership_percentage||0),0);
          const currentPct=Object.prototype.hasOwnProperty.call(values,'ownership_percentage')?Number(values.ownership_percentage||0):Number(prior?.ownership_percentage||0);
          if(otherTotal+currentPct>100.0000001) return fail('Combined ownership percentages cannot exceed 100%',409);
        }
        if(values.access_level==='owner' && resultingType!=='owner') return fail('Owner access level requires owner classification');
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
