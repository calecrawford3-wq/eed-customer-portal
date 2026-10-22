import React,{useState,useEffect} from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const blankCar = {name:'',car_number:'',class_name:'',chassis:'',team:'',notes:'',primary_track:'',track_names:[],driver_ids:[],primary_driver_id:'',engine_id:'',photo_url:''};
const blankDriver = {name:'',nickname:'',phone:'',notes:''};
const tracks = ['Port City Raceway','Sweet Springs Motorsports Complex','Tulsa Speedway','Creek County Speedway','Red Dirt Raceway'];
const split = (v) => String(v || '').split(',').map(x=>x.trim()).filter(Boolean);
export default function RacingGarage({customerId,engines=[],onChange = () => {},onEditingChange = (..._args) => {}}) {
  const [cars,setCars] = useState([]);
  const [drivers,setDrivers] = useState([]);
  const [kind,setKind] = useState('car');
  const [editing,setEditing] = useState(null);
  const [form,setForm] = useState(blankCar);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  useEffect(()=>{onEditingChange?.(!!editing);},[editing,onEditingChange]);
  const invoke = async (body) => {
    try {
      const r = await base44.functions.invoke('managePortalGarage',body);
      if(r?.data?.error) throw Error(r.data.error);
      return r.data;
    } catch (e) {
      const message = e?.response?.data?.error || e?.data?.error || e?.message || 'Request failed';
      throw Error(message);
    }
  };
  const refresh = async () => {
    setLoading(true);
    try {
      const [c,d] = await Promise.all([invoke({kind:'car',action:'list',customer_id:customerId}),invoke({kind:'driver',action:'list',customer_id:customerId})]);
      setCars(c.records||[]);setDrivers(d.records||[]);
    } catch(e) {setError(e.message||'Unable to load garage');}
    finally {setLoading(false);}
  };
  useEffect(()=>{if(customerId) refresh();},[customerId]);
  const start = (type,record) => {
    setKind(type);setEditing(record?.id||'new');
    setForm(record ? {...record} : {...(type==='car'?blankCar:blankDriver)});
    setError('');
  };
  const change = (key,value)=>setForm(prev=>({...prev,[key]:value}));
  const save = async () => {
    setError('');
    const name = String(form.name || '').trim();
    if (!name) {
      setError(kind==='car' ? 'Car name / identifier is required.' : 'Driver full name is required.');
      return;
    }
    setLoading(true);
    try {
      const values = Object.fromEntries(Object.entries(form).filter(([key,value])=>key!=='id' && value!==null && value!==undefined));
      values.name = name;
      if(kind==='car') values.track_names=Array.isArray(values.track_names)?values.track_names:split(values.track_names);
      await invoke({kind,action:editing==='new'?'create':'update',id:editing==='new'?undefined:editing,values,customer_id:customerId});
      toast.success(kind==='car'?'Car saved':'Driver saved');
      setEditing(null);
      await refresh();
      onChange?.();
    } catch(e){setError(e.message||'Unable to save');}
    finally{setLoading(false);}
  };
  const archive = async (type,id)=>{
    if(!window.confirm('Archive this record? History will be retained.'))return;
    setLoading(true);setError('');
    try {await invoke({kind:type,action:'archive',id,customer_id:customerId});await refresh();toast.success('Archived');}
    catch(e){setError(e.message||'Unable to archive');}finally{setLoading(false);}
  };
  const activeCars = cars.filter(x=>!x.archived), activeDrivers = drivers.filter(x=>!x.archived);
  return <Card><CardHeader><CardTitle>My racing garage</CardTitle><p className="text-sm text-slate-600">Add cars and drivers independently. Connecting an engine here does not change its shop ownership, work orders or billing.</p></CardHeader>
    <CardContent className="space-y-5">
      <div className="flex flex-wrap gap-2"><Button onClick={()=>start('car')} disabled={loading}>Add car</Button><Button variant="outline" onClick={()=>start('driver')} disabled={loading}>Add driver</Button></div>
      {loading && <p role="status">Loading…</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {editing && <div className="border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">{editing==='new'?'Add':'Edit'} {kind}</h3>
        {(kind==='car'?[
          ['name','Car name / identifier *'],['car_number','Car number'],['class_name','Racing class'],['chassis','Chassis'],['team','Team'],['primary_track','Primary track'],['photo_url','Photo URL (HTTPS)'],['notes','Notes']
        ]:[['name','Driver full name *'],['nickname','Nickname'],['phone','Phone (optional)'],['notes','Notes']]).map(([key,label])=><div key={key}><Label htmlFor={'garage-'+key}>{label}</Label><Input id={'garage-'+key} value={form[key]||''} onChange={e=>change(key,e.target.value)} className="mt-1 min-h-11"/></div>)}
        {kind==='car' && <>
          <div><Label htmlFor="garage-photo">Upload car photo</Label><Input id="garage-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){setError('Maximum photo size is 5 MB');return;}setLoading(true);try{const result=await base44.integrations.Core.UploadFile({file});if(!result.file_url)throw Error('Upload failed');change('photo_url',result.file_url);toast.success('Photo uploaded. Save the car to keep it.');}catch(err){setError(err.message||'Upload failed');}finally{setLoading(false);}}}/></div>
          <div><Label htmlFor="garage-tracks">Additional tracks (comma-separated)</Label><Input id="garage-tracks" list="garage-track-list" value={Array.isArray(form.track_names)?form.track_names.join(', '):form.track_names||''} onChange={e=>change('track_names',e.target.value)} /><datalist id="garage-track-list">{tracks.map(t=><option key={t} value={t}/>)}</datalist></div>
          <div><Label htmlFor="garage-engine">Associated engine</Label><select id="garage-engine" className="block w-full min-h-11 border rounded-md px-3" value={form.engine_id||''} onChange={e=>change('engine_id',e.target.value)}><option value="">No engine associated</option>{engines.map(e=><option key={e.id} value={e.id}>{e.eed_id||e.engine_serial_number||e.id}</option>)}</select></div>
          <fieldset className="space-y-2"><legend className="font-medium text-sm">Drivers for this car</legend>{activeDrivers.length===0?<p className="text-sm text-slate-500">Add a driver first, then link them to this car.</p>:activeDrivers.map(d=><label key={d.id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={(form.driver_ids||[]).includes(d.id)} onChange={e=>change('driver_ids',e.target.checked?[...(form.driver_ids||[]),d.id]:(form.driver_ids||[]).filter(x=>x!==d.id))}/>{d.name}</label>)}</fieldset>
          <div><Label htmlFor="garage-primary-driver">Primary driver</Label><select id="garage-primary-driver" className="block w-full min-h-11 border rounded-md px-3" value={form.primary_driver_id||''} onChange={e=>change('primary_driver_id',e.target.value)}><option value="">No primary driver</option>{activeDrivers.filter(d=>(form.driver_ids||[]).includes(d.id)).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        </>}
        <div className="flex gap-2"><Button disabled={loading} onClick={save}>Save</Button><Button variant="outline" onClick={()=>setEditing(null)}>Cancel</Button></div>
      </div>}
      <div><h3 className="font-semibold mb-2">Cars ({activeCars.length})</h3>{activeCars.length===0?<p className="text-sm text-slate-500">No cars yet.</p>:<div className="grid sm:grid-cols-2 gap-3">{activeCars.map(c=><div key={c.id} className="border rounded-xl p-3 space-y-2">{c.photo_url && <img src={c.photo_url} alt={c.name} className="h-28 w-full object-cover rounded" loading="lazy" referrerPolicy="no-referrer"/>}<p className="font-medium">{c.name}{c.car_number?' #'+c.car_number:''}</p><p className="text-sm text-slate-600">{[c.class_name,c.chassis,c.primary_track].filter(Boolean).join(' · ')}</p><p className="text-xs text-slate-500">{(c.driver_ids||[]).map(id=>drivers.find(d=>d.id===id)?.name).filter(Boolean).join(', ')}</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>start('car',c)}>Edit</Button><Button size="sm" variant="ghost" onClick={()=>archive('car',c.id)}>Archive</Button></div></div>)}</div>}</div>
      <div><h3 className="font-semibold mb-2">Drivers ({activeDrivers.length})</h3>{activeDrivers.length===0?<p className="text-sm text-slate-500">No drivers yet.</p>:<div className="space-y-2">{activeDrivers.map(d=><div key={d.id} className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-2"><span>{d.name}</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>start('driver',d)}>Edit</Button><Button size="sm" variant="ghost" onClick={()=>archive('driver',d.id)}>Archive</Button></div></div>)}</div>}</div>
    </CardContent></Card>;
}
