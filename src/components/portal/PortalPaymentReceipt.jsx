import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44, base44Public } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/money';

export default function PortalPaymentReceipt({ type, id = null, token = null, onRefresh }) {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get('session_id');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['portal-payment-receipt', type, id, token, sessionId],
    enabled: !!sessionId, retry: false, gcTime: 0, staleTime: 0,
    queryFn: async () => {
      const r = await (token ? base44Public : base44).functions.invoke('getPortalCheckoutStatus', {
        documentType: type, documentId: id, guestPaymentToken: token, session_id: sessionId,
      });
      if (r.data?.error) throw new Error('Payment status unavailable');
      return r.data;
    },
  });
  if (!sessionId) return null;
  return <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
    <h2 className="font-semibold">{data?.status === 'paid' ? 'Payment received' : 'Payment status'}</h2>
    <p role="status" className="text-sm">{isLoading ? 'Checking with the payment provider…' : error ? 'Unable to verify payment yet. Refresh or contact the shop before attempting another payment.' :
      data?.status === 'paid' ? formatMoney(data.amount) + (data.recorded ? ' has been recorded. Refresh below for the updated document.' : ' is confirmed by Stripe. The shop record is still updating. Please do not pay again.') :
      data?.status === 'expired' ? 'This checkout expired without a confirmed payment.' : data?.status === 'failed' ? 'The provider reports that this payment did not complete. You can return to the document to try again.' : 'Payment is not confirmed yet. Bank payments may take time. Please check before attempting another payment.'}</p>
    <Button variant="outline" disabled={isLoading} onClick={async () => { await refetch(); await onRefresh?.(); }}>Refresh Payment Status</Button>
    {(data?.recorded || ['failed', 'expired'].includes(data?.status)) && <Button className="ml-2" onClick={async () => { await onRefresh?.(); const next = new URLSearchParams(params); next.delete('session_id'); next.delete('payment'); setParams(next, { replace: true }); }}>Continue to Updated Document</Button>}
  </section>;
}
