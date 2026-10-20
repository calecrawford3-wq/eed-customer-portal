import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney } from '@/lib/money';
import { DocumentCharges } from './PortalDocumentDialog';

export default function PortalWorkApproval({ approval: aw, customerId }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [declining, setDeclining] = useState(false);
  const canRespond = aw.status === 'pending' && !['approved', 'declined'].includes(aw.customer_response) && user?.role !== 'admin';

  const respond = async response => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await base44.functions.invoke('portalDocument', {
        documentType: 'additional_work', documentId: aw.id, customerId,
        action: 'respond', revision: aw.revision, response, note,
      });
      if (result.data?.error) throw new Error(result.data.error);
      setNotice(response === 'declined' ? 'Your decline was sent to the shop.' : result.data.applied ? 'Approved and added to your job.' : 'Your approval was saved. The shop will apply this work to your job.');
      await qc.invalidateQueries({ queryKey: ['portal-findings'] });
      await qc.invalidateQueries({ queryKey: ['portal-data'] });
    } catch (err) {
      setError(err.response?.data?.error || err.data?.error || err.message || 'Unable to save your response. Reload and try again.');
    } finally { setBusy(false); }
  };

  return <section className="rounded-xl border border-amber-200 bg-white p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><p className="text-xs text-slate-500">{aw.work_number}</p><h3 className="font-semibold break-words">{aw.title || 'Additional work request'}</h3></div><p className="text-lg font-bold">{formatMoney(aw.total)}</p></div>
    {aw.description && <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">{aw.description}</p>}
    <Button variant="outline" className="w-full min-h-11" onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide charges' : 'Review included charges'}</Button>
    {expanded && <><DocumentCharges doc={aw} /><p className="text-sm text-slate-500">Subtotal {formatMoney(aw.subtotal)} · Tax {formatMoney(aw.tax_amount)} · Total {formatMoney(aw.total)}</p></>}
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!canRespond && <p className="text-sm text-slate-600">{aw.status === 'approved' ? 'Approved and applied to your job.' : aw.customer_response === 'approved' ? 'You approved this request. Awaiting shop processing.' : aw.customer_response === 'declined' ? 'You declined this request.' : aw.status === 'canceled' ? 'This request was withdrawn.' : user?.role === 'admin' ? 'Staff preview. Customer response buttons are disabled.' : 'This request is closed.'}</p>}
    {canRespond && <>
      <p className="text-sm text-slate-600">Your response covers all work in this request. Other requests can be approved separately. Contact the shop if you want only part of this request.</p>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>I reviewed the work and authorize {formatMoney(aw.total)} in additional charges.</span></label>
      <Textarea aria-label="Message to the shop (optional)" placeholder="Message to the shop (optional)" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} />
      <Button className="w-full min-h-11 bg-[#e20404] hover:bg-red-700" disabled={busy || !consent} onClick={() => respond('approved')}>{busy ? 'Saving…' : 'Approve This Work'}</Button>
      {declining ? <div className="rounded-lg bg-slate-50 p-3 space-y-2"><p className="text-sm">Confirm that you do not authorize this work. The shop will receive your response.</p><Button variant="outline" className="w-full min-h-11" disabled={busy} onClick={() => respond('declined')}>Confirm Decline</Button><Button variant="ghost" className="w-full" disabled={busy} onClick={() => setDeclining(false)}>Keep Reviewing</Button></div> : <Button variant="ghost" className="w-full min-h-11" disabled={busy} onClick={() => setDeclining(true)}>Decline This Request</Button>}
    </>}
  </section>;
}
