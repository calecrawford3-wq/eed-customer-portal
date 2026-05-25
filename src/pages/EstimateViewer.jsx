import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";

const formatMoney = (value) => {
  if (value === null || value === undefined || isNaN(value)) return "$0.00";
  return `$${parseFloat(value).toFixed(2)}`;
};

const calculateSubtotal = (lineItems = [], laborItems = []) => {
  const lineTotal = lineItems.reduce((sum, item) => sum + (item.total || item.quantity * item.unit_price || 0), 0);
  const laborTotal = laborItems.reduce((sum, item) => sum + (item.price || 0), 0);
  return lineTotal + laborTotal;
};

export default function EstimateViewer() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEstimate = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log("Fetching estimate with token:", token);
        
        const response = await base44.functions.invoke("getPublicEstimate", {
          publicAccessToken: token,
        });
        
        console.log("Response:", response);
        
        if (!response?.data) {
          throw new Error("No data returned from server");
        }
        
        setData(response.data);
      } catch (err) {
        console.error("Estimate fetch error:", err);
        setError(err?.message || "Failed to load estimate");
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchEstimate();
    }
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold text-slate-900">Estimate</h1>
          <p className="text-sm text-slate-500 mt-1">Token: {token}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {loading && (
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-3 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
              <p className="text-slate-600">Loading estimate details...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 rounded-lg border border-red-200 p-6">
            <p className="text-red-700 font-semibold mb-2">Error Loading Estimate</p>
            <p className="text-red-600 text-sm mb-3">{error}</p>
            <details className="text-xs text-red-500 mt-2">
              <summary className="cursor-pointer">Debug info</summary>
              <pre className="mt-2 bg-red-100 p-2 rounded overflow-auto max-h-40">
                Token: {token}
              </pre>
            </details>
          </div>
        )}

        {!loading && !error && !data && (
          <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-6">
            <p className="text-yellow-700">Estimate not found or link expired.</p>
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-6">
            {/* Debug: Show actual data structure */}
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">Debug: View raw data</summary>
              <pre className="mt-2 bg-slate-100 p-2 rounded overflow-auto max-h-64">
                {JSON.stringify(data, null, 2)}
              </pre>
            </details>

            {/* Header */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Estimate</h2>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">{data.estimate_number || "N/A"}</p>
                  <p className="text-sm text-slate-500">Reference</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm border-t border-slate-200 pt-4">
                <div>
                  <p className="text-slate-500 font-semibold">Customer</p>
                  <p className="text-slate-900">{data.customer_name || "N/A"}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 font-semibold">Status</p>
                  <span className="inline-block px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                    {data.status ? data.status.charAt(0).toUpperCase() + data.status.slice(1) : "N/A"}
                  </span>
                </div>
              </div>
            </div>

            {/* Dates and Details */}
            <div className="grid grid-cols-2 gap-4">
              {data.issue_date && (
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <p className="text-xs text-slate-500 font-semibold">Issue Date</p>
                  <p className="text-slate-900">{new Date(data.issue_date).toLocaleDateString()}</p>
                </div>
              )}
              {data.expiry_date && (
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <p className="text-xs text-slate-500 font-semibold">Expiration Date</p>
                  <p className="text-slate-900">{new Date(data.expiry_date).toLocaleDateString()}</p>
                </div>
              )}
            </div>

            {/* Line Items */}
            {data.line_items && data.line_items.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Items</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 text-slate-600 font-semibold">Description</th>
                      <th className="text-center py-2 text-slate-600 font-semibold">Qty</th>
                      <th className="text-right py-2 text-slate-600 font-semibold">Unit Price</th>
                      <th className="text-right py-2 text-slate-600 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.line_items.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-3 text-slate-900">{item.item_name || item.part_number || "Item"}</td>
                        <td className="text-center py-3 text-slate-600">{item.quantity || 0}</td>
                        <td className="text-right py-3 text-slate-600">{formatMoney(item.unit_price)}</td>
                        <td className="text-right py-3 text-slate-900 font-semibold">{formatMoney(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Labor Items */}
            {data.labor_items && data.labor_items.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Labor</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 text-slate-600 font-semibold">Description</th>
                      <th className="text-right py-2 text-slate-600 font-semibold">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.labor_items.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-3 text-slate-900">{item.name || "Labor"}</td>
                        <td className="text-right py-3 text-slate-900 font-semibold">{formatMoney(item.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Financial Summary */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="space-y-2 mb-6 pb-6 border-b border-slate-200">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="text-slate-900 font-semibold">{formatMoney(data.subtotal || calculateSubtotal(data.line_items, data.labor_items))}</span>
                </div>
                {(data.tax_amount || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Tax {data.tax_rate ? `(${data.tax_rate}%)` : ""}</span>
                    <span className="text-slate-900 font-semibold">{formatMoney(data.tax_amount)}</span>
                  </div>
                )}
                {(data.deposit_amount || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Deposit Required</span>
                    <span className="text-slate-900 font-semibold">{formatMoney(data.deposit_amount)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center mb-6">
                <span className="text-lg font-semibold text-slate-900">Total</span>
                <span className="text-2xl font-bold text-slate-900">{formatMoney(data.total || (calculateSubtotal(data.line_items, data.labor_items) + (data.tax_amount || 0)))}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {data.status === "sent" && (
                  <button className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition">
                    Approve Estimate
                  </button>
                )}
                {data.stripe_checkout_url && (
                  <button onClick={() => window.location.href = data.stripe_checkout_url} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition">
                    Pay Now
                  </button>
                )}
              </div>
            </div>

            {/* Notes */}
            {data.notes && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-3">Notes</h3>
                <p className="text-slate-600 text-sm whitespace-pre-line">{data.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}