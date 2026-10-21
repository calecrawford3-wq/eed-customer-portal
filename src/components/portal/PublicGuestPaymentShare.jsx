import { useState } from 'react';
import { base44Public } from '@/api/base44Client';

export default function PublicGuestPaymentShare({documentType,publicAccessToken}) {
  const [busy,setBusy]=useState(false);
  const [url,setUrl]=useState('');
  const [error,setError]=useState('');
  const [copied,setCopied]=useState(false);
  async function share() {
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
      if(navigator.share) {
        try {await navigator.share({title:'Elite Engine Development payment request',text:'Use this secure payment-only link to pay on my behalf.',url:link});}
        catch(e){if(e?.name!=='AbortError')throw e;}
      } else if(navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);setCopied(true);
      }
    } catch(e){setError(e?.message||'Unable to share payment link');}
    finally{setBusy(false);}
  }
  return <div className="mt-3 space-y-2">
    <button type="button" onClick={share} disabled={busy} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
      {busy?'Preparing link…':'Have Someone Else Pay'}
    </button>
    <p className="text-center text-xs text-slate-500">Share a payment-only link. The payer cannot approve work or access your account.</p>
    {url&&<div className="flex gap-2"><input aria-label="Guest payment link" readOnly value={url} onFocus={e=>e.target.select()} className="min-w-0 flex-1 rounded border px-2 py-2 text-xs"/><button type="button" className="rounded border px-3 text-sm" onClick={async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);}catch{setError('Select the link to copy it.');}}}>Copy</button></div>}
    {copied&&<p className="text-sm text-green-700">Payment-only link copied.</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
