import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function GuestPaymentShare({ type, id }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { data, refetch, isLoading, error: loadError } = useQuery({
    queryKey: ['guest-share', type, id],
    queryFn: async () => {
      const r = await base44.functions.invoke('generateGuestPaymentToken', { document_type: type, document_id: id, action: 'status' });
      if (r.data?.error) throw new Error(r.data.error);
      return r.data;
    }, retry: false,
  });
  async function change(action) {
    if (busy) return;
    if (action === 'rotate' && !window.confirm('Replace this link? The previous link will stop working.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await base44.functions.invoke(action === 'revoke' ? 'revokeGuestPaymentToken' : 'generateGuestPaymentToken', {
        document_type: type, document_id: id, action, expires_in_days: 30,
      });
      if (r.data?.error) throw new Error(r.data.error);
      await refetch();
      setNotice(action === 'revoke' ? 'Link disabled.' : action === 'rotate' ? 'New link ready. The old link is disabled.' : 'Link created.');
    } catch { setError('Unable to update the link. Please try again.'); }
    finally { setBusy(false); }
  }
  async function share() {
    setNotice(''); setError('');
    try {
      if (navigator.share) await navigator.share({ title: 'EED payment request', text: 'View this document and pay on my behalf.', url: data.url });
      else { await navigator.clipboard.writeText(data.url); setNotice('Link copied.'); }
    } catch (e) { if (e.name !== 'AbortError') setError('Unable to share automatically. Select and copy the link below.'); }
  }
  return <section className="min-w-0 rounded-xl border border-slate-200 p-4 space-y-3">
    <h3 className="font-semibold">Have someone else pay</h3>
    <p className="text-sm text-slate-600">They can see this document, your name and engine EED ID, and pay on your behalf. They cannot approve work or access your account.</p>
    {isLoading ? <p className="text-sm">Loading link controls…</p> : loadError ? <><p role="alert" className="text-sm text-red-700">Unable to load link controls.</p><Button variant="outline" onClick={() => refetch()}>Try Again</Button></> : <>
      {!data?.checkout_enabled && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Sharing preview: online guest payments are not launched yet. While the app is private, opening this link still requires sign-in. Please wait for launch before sending it to a payer.</p>}
      {data?.active ? <>
        <label className="block text-sm font-medium">Payment-only link<input readOnly value={data.url} onFocus={e => e.target.select()} className="mt-1 block w-full min-w-0 rounded-md border p-2 text-sm" /></label>
        <p className="text-xs text-slate-500">Expires {new Date(data.expires_at).toLocaleDateString()}. Anyone with this link can view this document.</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={share}>{data.checkout_enabled ? 'Share Link' : 'Copy / Share Preview'}</Button>
          <Button variant="outline" disabled={busy} onClick={() => change('rotate')}>Replace Link</Button>
          <Button variant="outline" disabled={busy} onClick={() => change('revoke')}>Disable Link</Button>
        </div>
      </> : <Button variant="outline" disabled={busy} onClick={() => change('create')}>{busy ? 'Creating…' : data?.checkout_enabled ? 'Create Payment Link' : 'Create Preview Link'}</Button>}
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
  </section>;
}
