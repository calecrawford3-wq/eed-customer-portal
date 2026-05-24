import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import PrintableEstimate from "@/components/PrintableEstimate";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

export default function EstimateViewer() {
  const params = new URLSearchParams(window.location.search);
  const estimateId = params.get("id");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [printMode, setPrintMode] = useState(false);

  const { data: viewerData, isLoading: estimateLoading } = useQuery({
    queryKey: ["estimate-viewer", estimateId],
    queryFn: () => base44.functions.invoke("getPublicEstimate", { estimateId }),
    enabled: !!estimateId,
  });

  const est = viewerData?.data?.estimate;
  const customer = viewerData?.data?.customer;
  const settings = viewerData?.data?.settings;

  const totalDepositReceived = (est?.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const depositRemaining = Math.max(0, (est?.deposit_amount || 0) - totalDepositReceived);

  const handlePayment = async () => {
    if (!paymentMethod) {
      toast.error("Please select a payment method");
      return;
    }

    if (paymentMethod === "stripe") {
      if (window.self !== window.top) {
        toast.error("Stripe checkout only works from a published app. Please access this link directly.");
        return;
      }
      setProcessingPayment(true);
      try {
        const amount = est.deposit_required ? depositRemaining : est.total;
        const response = await base44.functions.invoke("createCheckoutSession", {
          type: "estimate",
          documentId: estimateId,
          amount,
          description: `Estimate ${est.estimate_number} - ${est.deposit_required ? "Deposit" : "Full Payment"}`,
        });
        if (response?.data?.session_id) {
          window.location.href = `https://checkout.stripe.com/pay/${response.data.session_id}`;
        } else {
          toast.error("Failed to create payment session");
        }
      } catch (err) {
        toast.error("Payment setup failed");
        console.error(err);
      } finally {
        setProcessingPayment(false);
      }
      return;
    }

    if (paymentMethod === "cash" || paymentMethod === "check") {
      setProcessingPayment(true);
      try {
        const payment = {
          amount: est.deposit_required ? depositRemaining : est.total,
          method: paymentMethod,
          date: new Date().toISOString().split("T")[0],
          note: `${paymentMethod === "check" ? "Check" : "Cash"} payment for estimate ${est.estimate_number}`,
        };
        const updatedPayments = [...(est.payments || []), payment];
        const totalPaid = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
        const newDepositPaid = !est.deposit_required || totalPaid >= (est.deposit_amount || 0);
        
        await base44.entities.Estimate.update(estimateId, {
          payments: updatedPayments,
          deposit_paid: newDepositPaid,
        });
        toast.success(`Payment recorded! We'll process your ${paymentMethod} shortly.`);
        setPaymentMethod("");
      } catch (err) {
        toast.error("Failed to record payment");
      } finally {
        setProcessingPayment(false);
      }
    }
  };

  if (estimateLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#e20404] rounded-full animate-spin" />
      </div>
    );
  }

  if (!est || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Estimate Not Found</h2>
            <p className="text-slate-500">The estimate you're looking for couldn't be found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (printMode) {
    return (
      <div className="p-4">
        <button onClick={() => setPrintMode(false)} className="mb-4 px-4 py-2 bg-slate-200 rounded hover:bg-slate-300">← Back</button>
        <PrintableEstimate estimate={est} customer={customer} settings={settings} />
      </div>
    );
  }

  const isApproved = est.status === "approved";
  const depositMet = !est.deposit_required || totalDepositReceived >= (est.deposit_amount || 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <img src={LOGO_URL} alt="Company Logo" className="h-10" />
          <div className="text-right">
            <h1 className="text-2xl font-bold text-slate-900">{est.estimate_number}</h1>
            <Badge className={`mt-2 border-0 capitalize ${est.status === "approved" ? "bg-emerald-100 text-emerald-700" : est.status === "sent" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"}`}>
              {est.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Customer Info */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="p-6">
            <h2 className="text-sm font-bold text-slate-600 uppercase mb-4">Bill To</h2>
            <p className="font-semibold text-lg">{customer.first_name} {customer.last_name}</p>
            {customer.company_name && <p className="text-slate-600">{customer.company_name}</p>}
            {customer.address_line1 && <p className="text-slate-600">{customer.address_line1}</p>}
            {customer.city && <p className="text-slate-600">{customer.city}, {customer.state} {customer.zip}</p>}
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="p-6">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <p className="text-sm text-slate-500 mb-1">Estimate Total</p>
                <p className="text-2xl font-bold text-slate-900">${Number(est.total || 0).toFixed(2)}</p>
              </div>
              {est.deposit_required && (
                <>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Deposit Required</p>
                    <p className="text-2xl font-bold text-[#e20404]">${Number(est.deposit_amount || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Due Now</p>
                    <p className={`text-2xl font-bold ${depositMet ? "text-emerald-600" : "text-[#e20404]"}`}>${depositRemaining.toFixed(2)}</p>
                  </div>
                </>
              )}
            </div>

            {est.deposit_required && depositMet && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                <Check className="w-5 h-5 text-emerald-600" />
                <p className="text-sm text-emerald-700"><strong>Deposit received!</strong> You can approve this estimate anytime.</p>
              </div>
            )}

            {!isApproved && est.status === "sent" && (
              <>
                {est.deposit_required && !depositMet && (
                  <p className="text-sm text-slate-600 mb-4">A deposit is required before approval. Please make a payment to proceed.</p>
                )}

                {/* Payment Section */}
                <div className="bg-slate-50 p-4 rounded-lg mb-4">
                  <h3 className="font-bold text-sm mb-3">Payment Method</h3>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stripe">💳 Credit/Debit Card (Stripe)</SelectItem>
                      <SelectItem value="cash">💵 Cash</SelectItem>
                      <SelectItem value="check">✓ Check</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handlePayment}
                    disabled={!paymentMethod || processingPayment}
                    className="w-full mt-3 bg-[#e20404] hover:bg-[#c00303] text-white"
                  >
                    {processingPayment ? "Processing..." : `Pay ${est.deposit_required ? `Deposit $${depositRemaining.toFixed(2)}` : `$${est.total.toFixed(2)}`}`}
                  </Button>
                </div>
              </>
            )}

            {isApproved && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="text-sm text-emerald-700"><strong>✓ Approved!</strong> Thank you for accepting this estimate. We'll be in touch with next steps.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card className="border-0 shadow-sm mb-6">
          <CardContent className="p-6">
            <h3 className="font-bold text-sm uppercase mb-4">Items & Services</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600">Description</th>
                  <th className="text-center py-2 font-medium text-slate-600 w-16">Qty</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Price</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {(est.line_items || []).map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2">{item.item_name}</td>
                    <td className="text-center py-2">{item.quantity}</td>
                    <td className="text-right py-2">${Number(item.unit_price).toFixed(2)}</td>
                    <td className="text-right py-2 font-medium">${Number(item.total).toFixed(2)}</td>
                  </tr>
                ))}
                {(est.labor_items || []).map((item, idx) => (
                  <tr key={`labor-${idx}`} className="border-b border-slate-100">
                    <td className="py-2">{item.name}</td>
                    <td className="text-center py-2">1</td>
                    <td className="text-right py-2">${Number(item.price).toFixed(2)}</td>
                    <td className="text-right py-2 font-medium">${Number(item.price).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setPrintMode(true)} className="flex-1">Print Estimate</Button>
          {!isApproved && est.status === "sent" && (
            <Button
              onClick={() => base44.entities.Estimate.update(estimateId, { status: "approved" })}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Approve Estimate
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}