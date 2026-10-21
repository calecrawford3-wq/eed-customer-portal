import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function InitialFindingsEditor({ findings = [], onChange }) {
  const [uploading, setUploading] = useState('');
  const update = (id, patch) => onChange(findings.map(f => f.id === id ? { ...f, ...patch } : f));
  const add = () => onChange([...findings, { id: crypto.randomUUID(), title: '', description: '', photo_urls: [] }]);
  const upload = async (id, files) => {
    if (!files?.length) return;
    setUploading(id);
    try {
      const urls = [];
      for (const file of Array.from(files)) {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw Error('Use JPG, PNG or WebP images under 8 MB');
        const response = await base44.integrations.Core.UploadFile({ file });
        if (!response?.file_url) throw Error('Photo upload failed');
        urls.push(response.file_url);
      }
      onChange(findings.map(f => f.id === id ? { ...f, photo_urls: [...(f.photo_urls || []), ...urls] } : f));
      toast.success('Photos attached. Save the estimate to publish them.');
    } catch (e) { toast.error(e.message || 'Unable to upload photo'); }
    finally { setUploading(''); }
  };
  return <section className="rounded-xl border border-slate-200 p-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-slate-900">Initial Findings & Concerns</h3><p className="text-sm text-slate-500">Shown with the estimate. Costs are already included in its line items. Separate from mid-build findings and additional work.</p></div><Button type="button" variant="outline" onClick={add}>+ Add Initial Finding</Button></div>
    {findings.length === 0 && <p className="text-sm text-slate-500">No initial findings attached.</p>}
    {findings.map((f, i) => <div key={f.id} className="rounded-lg border bg-slate-50 p-4 space-y-3"><div className="flex items-center justify-between"><strong className="text-sm">Finding {i+1}</strong><Button type="button" size="sm" variant="ghost" onClick={()=>onChange(findings.filter(x=>x.id!==f.id))}>Remove</Button></div><Input value={f.title || ''} onChange={e=>update(f.id,{title:e.target.value})} placeholder="Concern / component (e.g. exhaust valve wear)" aria-label="Finding title"/><Textarea value={f.description || ''} onChange={e=>update(f.id,{description:e.target.value})} rows={3} placeholder="Initial inspection observations and what is included in the estimate" aria-label="Finding description"/><div className="flex flex-wrap gap-2">{(f.photo_urls||[]).map((url,j)=><div key={j} className="relative"><a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={f.title || 'Initial finding photo'} className="h-24 w-24 rounded border object-cover"/></a><button type="button" className="absolute right-0 top-0 rounded bg-white px-2 text-red-700" aria-label="Remove photo" onClick={()=>update(f.id,{photo_urls:f.photo_urls.filter((_,k)=>k!==j)})}>×</button></div>)}</div><label className="block text-sm font-medium">Attach photos <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={!!uploading} className="mt-2 block w-full text-sm" onChange={e=>{upload(f.id,e.target.files);e.target.value='';}} /></label>{uploading===f.id&&<p className="text-sm">Uploading photos…</p>}</div>)}
  </section>;
}
