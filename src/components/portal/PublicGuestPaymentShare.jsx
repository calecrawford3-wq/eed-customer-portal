import { useState } from 'react';
import { base44Public } from '@/api/base44Client';

export default function PublicGuestPaymentShare({documentType,publicAccessToken}) {
  const [busy,setBusy]=useState(false);
  const [url,setUrl]=useState('');
  const [error,setError]=useState('');
  const [copied,setCopied]=useState(false);
  const [email,setEmail]=useState('');
  const [open,setOpen]=useState(false);
  async function share(action='copy') {
    if(busy)return;
    setBusy(true);setError('');setCopied(false);
    try {
      let link=url;
      if(!link) {
        const response=await base44Public.functions.invoke('createPublicGuestPaymentLink',{documentType,publicAccessToken});
        link=response?.data?.url;
        if(!link)throw Error(response?.data?.error||'Unable to create link');
        setUrl(link);
      }
      if(action==='email') {
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw Error('Enter a valid email address.');
        const subject='Elite Engine Development - Secure Payment Request';
        const body='Hello,\n\nPlease use this secure link to pay on my behalf:\n\n'+link+'\n\nThis payment-only link does not grant access to my account or approval permissions.\n\nThank you.';
        window.location.href='mailto:'+encodeURIComponent(email.trim())+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
      } else {
        await navigator.clipboard.writeText(link);setCopied(true);
      }
    } catch(e){setError(e?.message||'Unable to share payment link');}
    finally{setBusy(false);}
  }
  return <div className="mt-3 space-y-3">
    <button type="button" onClick={()=>setOpen(v=>!v)} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-800 hover:bg-slate-50">Have Someone Else Pay</button>
    {open&&<div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">Share a payment-only link. The payer cannot approve work or access your account.</p>
      <button type="button" disabled={busy} onClick={()=>share('copy')} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy?'Preparing…':'Copy Payment Link'}</button>
      {url&&<input aria-label="Guest payment link" readOnly value={url} onFocus={e=>e.target.select()} className="w-full min-w-0 rounded border p-2 text-xs"/>}
      {copied&&<p role="status" className="text-sm text-green-700">Link copied.</p>}
      <div className="space-y-2 border-t pt-3">
        <label htmlFor="guest-payer-email" className="block text-sm font-semibold">Send by Email</label>
        <input id="guest-payer-email" type="email" autoComplete="email" placeholder="Guest email address" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"/>
        <button type="button" disabled={busy} onClick={()=>share('email')} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 font-semibold text-slate-900 disabled:opacity-50">Compose Email With Payment Link</button>
        <p className="text-xs text-slate-500">Opens your email app with the recipient and link filled in. Review and press Send there.</p>
      </div>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>}
  </div>;
}
