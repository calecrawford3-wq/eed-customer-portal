import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const required = ['first_name','last_name','phone','address_line1','city','state','zip','country'];
const fields = [
  ['first_name','First name'],['last_name','Last name'],['phone','Mobile phone (international format)'],
  ['company_name','Team or business (optional)'],['address_line1','Billing address'],['address_line2','Billing address line 2'],
  ['city','Billing city'],['state','State / region'],['zip','Postal code'],['country','Country'],
  ['shipping_address_line1','Shipping address'],['shipping_address_line2','Shipping address line 2'],
  ['shipping_city','Shipping city'],['shipping_state','Shipping state / region'],['shipping_zip','Shipping postal code'],['shipping_country','Shipping country']
];
export function accountContactComplete(c) {
  return !!c?.onboarding_contact_confirmed && required.every(k => String(c?.[k] || '').trim());
}
export default function AccountSetup({ customer, onSaved, onClose }) {
  const [form,setForm] = useState({});
  const [same,setSame] = useState(false);
  const [section,setSection] = useState('contact');
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const saveField = async (key,value) => {
    try { const r=await base44.functions.invoke('updateCustomerProfile',{[key]:value});if(r?.data?.error)throw Error(r.data.error); }
    catch {setError('Some changes could not be saved. Use Save draft to retry.');}
  };
  useEffect(() => { setForm(customer || {}); },[customer?.id]);
  const progress = [accountContactComplete(customer),!!customer?.racing_role || !!customer?.onboarding_racing_skipped,!!customer?.onboarding_cars_skipped || !!customer?.onboarding_garage_completed,!!customer?.onboarding_tour_completed].filter(Boolean).length;
  const save = async (patch) => {
    setSaving(true);setError('');
    try {
      const response = await base44.functions.invoke('updateCustomerProfile',patch);
      if (response?.data?.error) throw Error(response.data.error);
      await onSaved?.();
      toast.success('Account information saved');
      return true;
    } catch(e) {setError(e.message || 'Unable to save. Please retry.');return false;}
    finally {setSaving(false);}
  };
  const saveContact = async () => {
    const patch = Object.fromEntries(fields.map(([key]) => [key,String(form[key] || '').trim()]));
    if (same) Object.assign(patch,{
      shipping_address_line1:patch.address_line1,shipping_address_line2:patch.address_line2,
      shipping_city:patch.city,shipping_state:patch.state,shipping_zip:patch.zip,shipping_country:patch.country
    });
    const missing = required.find(key=>!patch[key]);
    if (missing) {setError('Please complete your name, phone and billing address before confirming.');return;}
    patch.preferred_contact_method = form.preferred_contact_method || 'email';
    patch.sms_consent = !!form.sms_consent;
    patch.notification_estimates = form.notification_estimates !== false;
    patch.notification_build_updates = form.notification_build_updates !== false;
    patch.notification_invoices = form.notification_invoices !== false;
    patch.onboarding_contact_confirmed = true;
    if (await save(patch)) setSection('racing');
  };
  const saveRacing = async (skip=false) => {
    if (await save(skip ? {onboarding_racing_skipped:true} : {
      racing_role:form.racing_role || '',racing_classes:form.racing_classes || '',
      racing_tracks:form.racing_tracks || '',racing_primary_track:form.racing_primary_track || '',
      racing_notes_public:form.racing_notes_public || '',onboarding_racing_skipped:false
    })) setSection('finish');
  };
  const trackSuggestions=['Port City Raceway','Sweet Springs Motorsports Complex','Tulsa Speedway','Creek County Speedway','Red Dirt Raceway'];
  return <Card className="border-red-100 shadow-sm">
    <CardHeader><CardTitle>Welcome to Elite Engine Development</CardTitle><p className="text-sm text-slate-600">Your account setup saves as you go. Estimates, approvals and payments are always available.</p>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={progress} aria-label="Account setup progress"><div className="h-full bg-red-600" style={{width:`${progress*25}%`}}/></div><p className="text-xs text-slate-500">{progress} of 4 profile steps completed. Your login is managed separately by Base44.</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2">{[['contact','Contact'],['racing','Racing'],['finish','Cars & tour']].map(([key,title])=><Button key={key} variant={section===key?'default':'outline'} size="sm" onClick={()=>setSection(key)}>{title}</Button>)}</div>
      {section==='contact' && <div className="space-y-3">
        <p className="text-sm">Confirm the information Elite has on file. Email: <strong>{customer?.email}</strong> (account email changes require verified assistance).</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.filter(([k])=>!same || !k.startsWith('shipping_')).map(([key,title])=><div key={key}><Label htmlFor={key}>{title}{required.includes(key)?' *':''}</Label><Input id={key} className="mt-1 min-h-11" autoComplete={key==='first_name'?'given-name':key==='last_name'?'family-name':key==='phone'?'tel':key==='country'?'country-name':'on'} value={form[key] || ''} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} onBlur={e=>saveField(key,e.target.value.trim())}/></div>)}</div>
        <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={same} onChange={e=>setSame(e.target.checked)}/>Shipping address same as billing</label>
        <div><Label htmlFor="contact-method">Preferred contact method</Label><select id="contact-method" className="w-full min-h-11 border rounded-md px-3" value={form.preferred_contact_method || 'email'} onChange={e=>{setForm(p=>({...p,preferred_contact_method:e.target.value}));saveField('preferred_contact_method',e.target.value);}}><option value="email">Email</option><option value="phone">Phone call</option><option value="sms">Text message</option></select></div>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={!!form.sms_consent} onChange={e=>{setForm(p=>({...p,sms_consent:e.target.checked}));saveField('sms_consent',e.target.checked);}}/>I consent to receiving account-related text messages. Entering a phone number does not verify it or grant SMS consent.</label>
        <fieldset className="space-y-2"><legend className="font-medium">Notification preferences</legend>{[['notification_estimates','Estimates and additional work'],['notification_build_updates','Engine build and completion updates'],['notification_invoices','Invoice updates (required billing notices may still be sent)']].map(([key,title])=><label key={key} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={form[key] !== false} onChange={e=>{setForm(p=>({...p,[key]:e.target.checked}));saveField(key,e.target.checked);}}/>{title}</label>)}</fieldset>
        <div className="flex flex-wrap gap-2"><Button disabled={saving} onClick={saveContact}>Confirm contact & continue</Button><Button variant="outline" disabled={saving} onClick={()=>save(Object.fromEntries(fields.map(([key])=>[key,String(form[key]||'').trim()]))) }>Save draft</Button></div>
      </div>}
      {section==='racing' && <div className="space-y-3">
        <p className="text-sm text-slate-600">Tell us about your racing program so we can better understand your engine application. Optional.</p>
        {[[ 'racing_role','Your role (driver, owner, manager, other)' ],['racing_classes','Racing types and classes'],['racing_primary_track','Primary track'],['racing_tracks','Other preferred tracks (separate with commas)'],['racing_notes_public','Notes for Elite (visible to the shop)']].map(([key,title])=><div key={key}><Label htmlFor={key}>{title}</Label><Input id={key} value={form[key] || ''} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} onBlur={e=>saveField(key,e.target.value.trim())} className="mt-1 min-h-11" list={key==='racing_primary_track'?'racing-track-options':undefined}/></div>)}
        <datalist id="racing-track-options">{trackSuggestions.map(t=><option key={t} value={t}/>)}</datalist>
        <div className="flex flex-wrap gap-2"><Button disabled={saving} onClick={()=>saveRacing(false)}>Save racing profile</Button><Button variant="outline" disabled={saving} onClick={()=>saveRacing(true)}>Skip for now</Button></div>
      </div>}
      {section==='finish' && <div className="space-y-3"><p className="text-sm">Use the Cars & drivers and Portal tour buttons on your dashboard to complete your setup. Both can be revisited at any time.</p><Button variant="outline" disabled={saving} onClick={async()=>{if(await save({onboarding_cars_skipped:true})) onClose?.();}}>Finish for now</Button></div>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button variant="ghost" className="w-full" onClick={onClose}>Return to portal</Button>
    </CardContent>
  </Card>;
}
