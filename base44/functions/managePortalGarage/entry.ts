import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { portalCustomerId } from '../../shared/portalDocument.ts';

// Never accept customer_id, role, pricing, shop workflow or engine ownership from a customer.
const FIELDS = {
  car: ['name','car_number','chassis','class_name','team','notes','primary_track','track_names','driver_ids','primary_driver_id','engine_id','photo_url','archived'],
  driver: ['name','nickname','phone','notes','archived'],
};
const ENTITY = { car: 'PortalCar', driver: 'PortalDriver' };
const items = (r: any) => r?.items || r || [];
const clean = (value: any) => String(value ?? '').trim();
const error = (message: string, status = 400) => Response.json({error:message}, {status});

export default async function(req: Request) {
  try {
    if (req.method !== 'POST') return error('Method not allowed',405);
    const api = createClientFromRequest(req);
    const user = await api.auth.me();
    if (!user) return error('Authentication required',401);
    const body = await req.json().catch(()=>({}));
    // Admins must explicitly choose a customer; customers cannot impersonate other customers.
    const customerId = user.role === 'admin'
      ? clean(body.customer_id)
      : await portalCustomerId(api,user);
    if (!customerId) return error('Customer account not linked',403);
    if (user.role !== 'admin' && body.customer_id && body.customer_id !== customerId) return error('Forbidden customer',403);
    const customer = items(await api.asServiceRole.entities.Customer.filter({id:customerId}))[0];
    if (!customer) return error('Customer not found',404);
    const entity = api.asServiceRole.entities[ENTITY[body.kind] as keyof typeof ENTITY];
    if (!entity) return error('Invalid resource');
    const kind = body.kind as 'car'|'driver';
    const action = body.action || 'list';
    const owned = async (id: string) => {
      if (!id || typeof id !== 'string') return null;
      const record = items(await entity.filter({id,customer_id:customerId}))[0];
      return record?.customer_id === customerId ? record : null;
    };
    if (action === 'list') {
      const records = items(await entity.filter({customer_id:customerId},{limit:200}));
      return Response.json({records:records.filter((r:any)=>r.customer_id===customerId).map((r:any)=>Object.fromEntries(['id',...FIELDS[kind]].map(k=>[k,r[k] ?? null])))});
    }
    if (!['create','update','archive'].includes(action)) return error('Unsupported action');
    const existing = action === 'create' ? null : await owned(body.id);
    if (action !== 'create' && !existing) return error('Record not found',404);
    if (action === 'archive') {
      const updated = await entity.update(existing.id,{archived:true});
      return Response.json({success:true,id:updated.id});
    }
    const values = body.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return error('Missing values');
    const patch: Record<string,any> = {};
    for (const key of FIELDS[kind]) {
      if (!Object.prototype.hasOwnProperty.call(values,key)) continue;
      const value = values[key];
      if (key === 'archived') {
        if (typeof value !== 'boolean') return error('Invalid archived flag');
        patch[key] = value;
      } else if (['track_names','driver_ids'].includes(key)) {
        if (!Array.isArray(value) || value.length > 40 || !value.every((v:any)=>typeof v==='string' && v.length<=120)) return error('Invalid list');
        patch[key] = [...new Set(value.map(clean).filter(Boolean))];
      } else {
        if (typeof value !== 'string' || value.length > (key==='notes' ? 2000 : 250)) return error('Invalid '+key);
        patch[key] = clean(value);
      }
    }
    if (kind === 'car') {
      if (patch.driver_ids) {
        for (const id of patch.driver_ids) {
          const d = items(await api.asServiceRole.entities.PortalDriver.filter({id,customer_id:customerId}))[0];
          if (!d || d.customer_id!==customerId || d.archived) return error('Driver does not belong to your account',403);
        }
      }
      const primary = patch.primary_driver_id ?? existing?.primary_driver_id;
      if (primary) {
        const d = items(await api.asServiceRole.entities.PortalDriver.filter({id:primary,customer_id:customerId}))[0];
        if (!d || d.customer_id!==customerId || d.archived) return error('Primary driver does not belong to your account',403);
        const selected = patch.driver_ids ?? existing?.driver_ids ?? [];
        if (!selected.includes(primary)) return error('Primary driver must be selected for the car');
      }
      if (patch.engine_id) {
        const engine = items(await api.asServiceRole.entities.CustomerEngine.filter({id:patch.engine_id,customer_id:customerId}))[0];
        if (!engine || engine.customer_id!==customerId) return error('Engine does not belong to your account',403);
      }
      if (patch.photo_url && !/^https:\/\//.test(patch.photo_url)) return error('Photo must use HTTPS');
    }
    const name = patch.name ?? existing?.name;
    if (!name || !clean(name)) return error('Name required');
    if (kind === 'driver') {
      const others = items(await entity.filter({customer_id:customerId},{limit:200}));
      if (others.some((d:any)=>d.id!==existing?.id && !d.archived && clean(d.name).toLowerCase()===clean(name).toLowerCase())) return error('A driver with this name already exists',409);
    }
    const priorEngineId = existing?.engine_id || '';
    const updated = action==='create'
      ? await entity.create({...patch,customer_id:customerId,archived:false})
      : await entity.update(existing.id,patch);
    // Engine associations are historical references only. Never modify CustomerEngine or engine ownership.
    if (kind==='car' && Object.prototype.hasOwnProperty.call(patch,'engine_id') && priorEngineId!==patch.engine_id) {
      const history = api.asServiceRole.entities.PortalCarEngineHistory;
      const now = new Date().toISOString();
      const active = items(await history.filter({customer_id:customerId,car_id:updated.id},{limit:100})).filter((h:any)=>!h.ended_at);
      for (const old of active) await history.update(old.id,{ended_at:now});
      if (patch.engine_id) await history.create({customer_id:customerId,car_id:updated.id,engine_id:patch.engine_id,started_at:now,ended_at:''});
    }
    return Response.json({success:true,id:updated.id});
  } catch(e) {
    console.error('[managePortalGarage]',e?.message);
    return error('Unable to update your racing garage',500);
  }
}
