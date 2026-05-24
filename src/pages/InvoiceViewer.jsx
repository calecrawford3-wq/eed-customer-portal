import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import PrintableInvoice from "@/components/PrintableInvoice";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

export default function InvoiceViewer() {
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get("id");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [printMode, setPrintMode] = useState(false);

  const { data: viewerData, isLoading: invoiceLoading, refetch } = useQuery({
    queryKey: ["invoice-viewer", invoiceId],
    queryFn: async () => {
      const response = await fetch("/.netlify/functions/getPublicInvoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      if (!response.ok) throw new Error("Failed to fetch invoice");
      return response.json();
    },
    enabled: !!invoiceId,
  });

  const inv = viewerData?.invoice;
  const customer = viewerData?.customer;
  const settings = viewerData?.settings;

  const handlePayment = async () => {
    if (!paymentMethod) {
      toast.error("Please select a payment method");
      return;
    }

    const amount = paymentMethod === "stripe" ? inv.balance_due : Number(paymentAmount) || inv.balance_due;

    if (amount <= 0) {
      toast.error("Payment amount must be greater than 0");
      return;
    }

    if (paymentMethod === "stripe") {
      if (window.self !== window.top) {
        toast.error("Stripe checkout only works from a published app. Please access this link directly.");
        return;
      }
      setProcessingPayment(true);
      try {
        const response = await base44.functions.invoke("createCheckoutSession", {
          type: "invoice",
          documentId: invoiceId,
          amount: inv.balance_due,
          description: `Invoice ${inv.invoice_number} - Payment`,
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
          amount,
          method: paymentMethod,
          date: new Date().toISOString().split("T")[0],
          note: `${paymentMethod === "check" ? "Check" : "Cash"} payment`,
        };
        const updatedPayments = [...(inv.payments || []), payment];
        const newAmountPaid = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
        const newBalanceDue = Math.max(0, (inv.total || 0) - newAmountPaid);
        const newStatus = newBalanceDue <= 0 ? "paid" : "partial";

        await base44.entities.Invoice.update(invoiceId, {
          payments: updatedPayments,
          amount_paid: newAmountPaid,
          balance_due: newBalanceDue,
          status: newStatus,
        });

        toast.success(`Payment of $${amount.toFixed(2)} recorded! Thank you.`);
        setPaymentMethod("");
        setPaymentAmount("");
        refetch();
      } catch (err) {
        toast.error("Failed to record payment");
      } finally {
        setProcessingPayment(false);
      }
    }
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
        <PrintableInvoice invoice={inv} customer={customer} settings={settings} />
      </div>
    );
  }

  const isPaid = inv.status === "paid";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <img src={LOGO_URL} alt="Company Logo" className="h-10" />
          <div className="text-right">
            <h1 className="text-2xl font-bold text-slate-900">{inv.invoice_number}</h1>
            <Badge className={`mt-2 border-0 capitalize ${inv.status === "paid" ? "bg-emerald-100 text-emerald-700" : inv.status === "overdue" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
              {inv.status}
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
                <p className="text-sm text-slate-500 mb-1">Total Due</p>
                <p className="text-2xl font-bold text-slate-900">${Number(inv.total || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Paid</p>
                <p className="text-2xl font-bold text-emerald-600">${Number(inv.amount_paid || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Balance</p>
                <p className={`text-2xl font-bold ${inv.balance_due <= 0 ? "text-emerald-600" : "text-[#e20404]"}`}>${Number(inv.balance_due || 0).toFixed(2)}</p>
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

                  {paymentMethod && paymentMethod !== "stripe" && (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-slate-600">Amount</label>
                      <input
                        type="number"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder={inv.balance_due.toFixed(2)}
                        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded text-sm"
                        min="0"
                        max={inv.balance_due}
                        step="0.01"
                      />
                      <p className="text-xs text-slate-500 mt-1">Max: ${Number(inv.balance_due).toFixed(2)}</p>
                    </div>
                  )}

                  <Button
                    onClick={handlePayment}
                    disabled={!paymentMethod || processingPayment}
                    className="w-full mt-3 bg-[#e20404] hover:bg-[#c00303] text-white"
                  >
                    {processingPayment ? "Processing..." : `Pay ${paymentMethod === "stripe" ? `$${Number(inv.balance_due).toFixed(2)}` : "Now"}`}
                  </Button>
                </div>
              </>
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
        <Button variant="outline" onClick={() => setPrintMode(true)} className="w-full">Print Invoice</Button>
      </div>
    </div>
  );
}