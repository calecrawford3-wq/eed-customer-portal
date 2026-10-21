import { useState } from "react";
import PublicGuestPaymentShare from "@/components/portal/PublicGuestPaymentShare";
import { base44Public } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import PrintableInvoice from "@/components/PrintableInvoice";
import { getCountryName } from "@/components/CountrySelect";
import PublicAdditionalWorkSection from "@/components/public/PublicAdditionalWorkSection";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

export default function InvoiceViewer() {
  const { token: publicAccessToken } = useParams();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [printMode, setPrintMode] = useState(false);

  const { data: viewerData, isLoading: invoiceLoading, refetch } = useQuery({
    queryKey: ["invoice-viewer", publicAccessToken],
    queryFn: async () => {
      const response = await base44Public.functions.invoke("getPublicInvoice", {
        publicAccessToken,
      });
      if (!response?.data) throw new Error("Failed to fetch invoice");
      return response.data;
    },
    enabled: !!publicAccessToken,
  });

  const inv = viewerData?.invoice;
  const customer = viewerData?.customer;
  const settings = viewerData?.settings;
  const customerEngine = viewerData?.customerEngine;
  const platform = viewerData?.platform;

  const handlePayment = async (amountOption) => {
    if (processingPayment) return;
    setProcessingPayment(true);
    try {
      const result = await base44Public.functions.invoke('startPublicDocumentCheckout',{documentType:'invoice',publicAccessToken,amountOption});
      const destination = result?.data?.checkout_url;
      if (!destination) throw new Error(result?.data?.error||'Payment unavailable');
      const url = new URL(destination);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Invalid Stripe destination');
      window.location.assign(url.href);
    } catch(error) {toast.error(error?.response?.data?.error||error?.message||'Unable to start secure payment');}
    finally {setProcessingPayment(false);}
  };

  if (invoiceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#e20404] rounded-full animate-spin" />
      </div>
    );
  }

  if (!inv || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Invoice Not Found</h2>
            <p className="text-slate-500">The invoice you're looking for couldn't be found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (printMode) {
    return (
      <div className="p-4">
        <button onClick={() => setPrintMode(false)} className="mb-4 px-4 py-2 bg-slate-200 rounded hover:bg-slate-300">← Back</button>
        <PrintableInvoice invoice={inv} customer={customer} settings={settings} customerEngine={customerEngine} platform={platform} />
      </div>
    );
  }

  const isPaid = inv.status === "paid";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-6 flex items-center justify-between gap-3">
          <img src={LOGO_URL} alt="Company Logo" className="h-8 md:h-10" />
          <div className="text-right">
            <h1 className="text-2xl font-bold text-slate-900">{inv.invoice_number}</h1>
            <Badge className={`mt-2 border-0 capitalize ${inv.status === "paid" ? "bg-emerald-100 text-emerald-700" : inv.status === "overdue" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
              {inv.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Customer Info */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="p-4 md:p-6">
            <h2 className="text-sm font-bold text-slate-600 uppercase mb-4">Bill To</h2>
            <p className="font-semibold text-lg">{customer.first_name} {customer.last_name}</p>
            {customer.company_name && <p className="text-slate-600">{customer.company_name}</p>}
            {customer.address_line1 && <p className="text-slate-600">{customer.address_line1}</p>}
            {customer.city && <p className="text-slate-600">{customer.city}, {customer.state} {customer.zip}</p>}
            {customer.country && <p className="text-slate-600">{getCountryName(customer.country)}</p>}

            {customerEngine && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-6 text-sm">
                {customerEngine.eed_id && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-semibold mb-0.5">EED ID</p>
                    <p className="font-mono font-bold text-[#e20404]">{customerEngine.eed_id}</p>
                  </div>
                )}
                {customerEngine.engine_serial_number && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-semibold mb-0.5">Serial #</p>
                    <p className="font-semibold text-slate-900">{customerEngine.engine_serial_number}</p>
                  </div>
                )}
                {platform && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-semibold mb-0.5">Platform</p>
                    <p className="font-semibold text-slate-900">
                      {platform.manufacturer} {platform.name}
                      {platform.year_range_start ? ` (${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"})` : ""}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div>
                <p className="text-sm text-slate-500 mb-1">Total Due</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900">${Number(inv.total || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Credit Applied</p>
                <p className="text-xl md:text-2xl font-bold text-violet-600">${Number(inv.applied_credits || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Paid</p>
                <p className="text-xl md:text-2xl font-bold text-emerald-600">${Number(inv.amount_paid || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Balance</p>
                <p className={`text-xl md:text-2xl font-bold ${inv.balance_due <= 0 ? "text-emerald-600" : "text-[#e20404]"}`}>${Number(inv.balance_due || 0).toFixed(2)}</p>
              </div>
            </div>

            {isPaid && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                <Check className="w-5 h-5 text-emerald-600" />
                <p className="text-sm text-emerald-700"><strong>Invoice paid in full.</strong> Thank you!</p>
              </div>
            )}

            {!isPaid && (
              <>
                {/* Payment Section */}
                <div className="bg-slate-50 p-4 rounded-lg mb-4">
                  <h3 className="font-bold text-sm mb-3">Make a Payment</h3>
                  <Button onClick={()=>setPaymentModalOpen(true)} className="w-full bg-[#e20404] hover:bg-[#c00303] text-white">Pay Now</Button>
                  <PublicGuestPaymentShare documentType="invoice" publicAccessToken={publicAccessToken} />
                  {paymentModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={e=>{if(e.target===e.currentTarget&&!processingPayment)setPaymentModalOpen(false);}}><section role="dialog" aria-modal="true" aria-labelledby="invoice-payment-title" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 id="invoice-payment-title" className="text-xl font-black text-slate-900">ELITE Secure Payment</h2><p className="text-sm text-slate-500">Invoice {inv.invoice_number}</p></div><button aria-label="Close" onClick={()=>setPaymentModalOpen(false)} className="text-2xl text-slate-500">×</button></div><p className="text-sm text-slate-600">Select an amount to open Stripe Checkout. Payment methods are selected in Stripe.</p>{Number(inv.deposit_amount||0)>0&&!inv.deposit_paid&&Math.max(0,Number(inv.deposit_amount||0)-Number(inv.amount_paid||0)-Number(inv.applied_credits||0))>0&&<Button disabled={processingPayment} variant="outline" className="flex min-h-14 w-full justify-between" onClick={()=>handlePayment('deposit')}><span>Pay Deposit</span><strong>${Math.min(Math.max(0,Number(inv.deposit_amount)-Number(inv.amount_paid||0)-Number(inv.applied_credits||0)),Math.max(0,Number(inv.total)-Number(inv.amount_paid||0)-Number(inv.applied_credits||0))).toFixed(2)}</strong></Button>}<Button disabled={processingPayment} className="flex min-h-14 w-full justify-between bg-red-700 hover:bg-red-800" onClick={()=>handlePayment('balance')}><span>Pay in Full</span><strong>${Math.max(0,Number(inv.total||0)-Number(inv.amount_paid||0)-Number(inv.applied_credits||0)).toFixed(2)}</strong></Button></section></div>}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="p-4 md:p-6">
            <h3 className="font-bold text-sm uppercase mb-4">Items & Services</h3>
            {/* Desktop table */}
            <table className="hidden sm:table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600">Description</th>
                  <th className="text-center py-2 font-medium text-slate-600 w-16">Qty</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Price</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {(inv.line_items || []).map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2">{item.item_name}</td>
                    <td className="text-center py-2">{item.quantity}</td>
                    <td className="text-right py-2">${Number(item.unit_price).toFixed(2)}</td>
                    <td className="text-right py-2 font-medium">${Number(item.total).toFixed(2)}</td>
                  </tr>
                ))}
                {(inv.labor_items || []).map((item, idx) => (
                  <tr key={`labor-${idx}`} className="border-b border-slate-100">
                    <td className="py-2">
                      {item.name}
                      {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
                    </td>
                    <td className="text-center py-2">1</td>
                    <td className="text-right py-2">${Number(item.price).toFixed(2)}</td>
                    <td className="text-right py-2 font-medium">${Number(item.price).toFixed(2)}</td>
                  </tr>
                ))}
                {(inv.machining_items || []).map((item, idx) => {
                  const qty = Number(item.quantity) || 1;
                  const price = Number(item.price) || 0;
                  return (
                    <tr key={`machining-${idx}`} className="border-b border-slate-100">
                      <td className="py-2">
                        {item.name}
                        {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
                      </td>
                      <td className="text-center py-2">{qty}</td>
                      <td className="text-right py-2">${price.toFixed(2)}</td>
                      <td className="text-right py-2 font-medium">${(price * qty).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Mobile stacked cards */}
            <div className="sm:hidden space-y-3">
              {(inv.line_items || []).map((item, idx) => (
                <div key={idx} className="border border-slate-200 rounded-lg p-3">
                  <p className="font-medium text-slate-900 text-sm">{item.item_name}</p>
                  <div className="flex justify-between items-center mt-2 text-sm">
                    <span className="text-slate-500">Qty {item.quantity} × ${Number(item.unit_price).toFixed(2)}</span>
                    <span className="text-slate-900 font-semibold">${Number(item.total).toFixed(2)}</span>
                  </div>
                </div>
              ))}
              {(inv.labor_items || []).map((item, idx) => (
                <div key={`labor-${idx}`} className="border border-slate-200 rounded-lg p-3">
                  <p className="font-medium text-slate-900 text-sm">{item.name}</p>
                  {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
                  <div className="flex justify-between items-center mt-2 text-sm">
                    <span className="text-slate-500">Labor Charge</span>
                    <span className="text-slate-900 font-semibold">${Number(item.price).toFixed(2)}</span>
                  </div>
                </div>
              ))}
              {(inv.machining_items || []).map((item, idx) => {
                const qty = Number(item.quantity) || 1;
                const price = Number(item.price) || 0;
                return (
                  <div key={`machining-${idx}`} className="border border-slate-200 rounded-lg p-3">
                    <p className="font-medium text-slate-900 text-sm">{item.name}</p>
                    {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
                    <div className="flex justify-between items-center mt-2 text-sm">
                      <span className="text-slate-500">{qty > 1 ? `${qty} × $${price.toFixed(2)}` : "Machining"}</span>
                      <span className="text-slate-900 font-semibold">${(price * qty).toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Approved Additional Work + Inspection Photos */}
        <PublicAdditionalWorkSection additionalWork={viewerData?.additional_work || []} />

        {/* Actions */}
        <Button variant="outline" onClick={() => setPrintMode(true)} className="w-full">Print Invoice</Button>
      </div>
    </div>
  );
}