import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, Copy, ExternalLink, Mail, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const errMessage = (e) => e?.response?.data?.error || e?.data?.error || e?.message || 'Something went wrong';

/**
 * Staff view of a customer's saved Stripe card.
 * Staff can create a secure Stripe setup link (the customer types the card on
 * Stripe, never here), copy/email it, and remove a saved card.
 */
export default function CardOnFilePanel({ customerId, customerEmail, customerName = '' }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerId) { setStatus(null); setLink(''); return; }
    let live = true;
    setLoading(true); setError(''); setLink('');
    base44.functions.invoke('manageCardOnFile', { action: 'status', customer_id: customerId })
      .then((r) => { if (!live) return; if (r.data?.error) throw new Error(r.data.error); setStatus(r.data); })
      .catch((e) => { if (live) setError(errMessage(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [customerId]);

  const refresh = async () => {
    const r = await base44.functions.invoke('manageCardOnFile', { action: 'status', customer_id: customerId });
    if (r.data?.error) throw new Error(r.data.error);
    setStatus(r.data);
  };

  async function createLink() {
    setBusy(true); setError('');
    try {
      const r = await base44.functions.invoke('manageCardOnFile', { action: 'setup', customer_id: customerId });
      if (r.data?.error) throw new Error(r.data.error);
      setLink(r.data.checkout_url || '');
    } catch (e) { setError(errMessage(e)); } finally { setBusy(false); }
  }

  async function removeCard(card) {
    if (!window.confirm(`Remove the card ending ${card.last4} from this customer?`)) return;
    setBusy(true); setError('');
    try {
      const r = await base44.functions.invoke('manageCardOnFile', { action: 'revoke', customer_id: customerId, remove_card_id: card.id });
      if (r.data?.error) throw new Error(r.data.error);
      await refresh();
      toast.success('Card removed');
    } catch (e) { setError(errMessage(e)); } finally { setBusy(false); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); toast.success('Link copied'); }
    catch { setError('Select and copy the link below.'); }
  }

  const cards = status?.cards || [];
  const emailHref = `mailto:${encodeURIComponent(customerEmail || '')}?subject=${encodeURIComponent('Save a card on file with Elite Engine Development')}&body=${encodeURIComponent(`Hi ${customerName || ''},\n\nUse this secure Stripe link to save a card on file for future payments:\n\n${link}\n\nElite Engine Development`)}`;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" /> Card on File</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">The customer enters their card on Stripe's secure page; card numbers are never stored here. Automatic charging is not active.</p>
        {loading && <p className="text-sm text-slate-500">Loading saved cards…</p>}
        {!loading && cards.length === 0 && <p className="text-sm text-slate-600">No card on file.</p>}
        {cards.map((card) => (
          <div key={card.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span className="font-medium capitalize">{card.brand} •••• {card.last4} <span className="text-slate-400 font-normal">exp {card.exp_month}/{card.exp_year}</span></span>
            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 px-2" disabled={busy} onClick={() => removeCard(card)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        {status?.auto_authorized && (
          <p className="text-xs text-amber-700">This customer authorized future overdue collection. Automatic charging is not active.</p>
        )}
        {!link ? (
          <Button size="sm" variant="outline" className="border-[#e20404] text-[#e20404] hover:bg-[#e20404]/5" disabled={busy || !customerId} onClick={createLink}>
            {busy ? 'Creating…' : cards.length ? 'Create another card link' : 'Create secure card link'}
          </Button>
        ) : (
          <div className="space-y-2">
            <Input readOnly value={link} onFocus={(e) => e.target.select()} className="w-full min-w-0 text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={copyLink}><Copy className="w-3.5 h-3.5 mr-1" /> Copy</Button>
              <Button size="sm" variant="outline" asChild>
                <a href={link} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5 mr-1" /> Open</a>
              </Button>
              {customerEmail && (
                <Button size="sm" variant="outline" asChild>
                  <a href={emailHref}><Mail className="w-3.5 h-3.5 mr-1" /> Email</a>
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setLink('')}>Clear</Button>
            </div>
            <p className="text-xs text-slate-500">The card shows here as soon as the customer finishes on Stripe.</p>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </CardContent>
    </Card>
  );
}