import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { base44Public } from "@/api/base44Client";

const formatMoney = (value) => {
  if (value === null || value === undefined || isNaN(value)) return "$0.00";
  return `$${parseFloat(value).toFixed(2)}`;
};

const calculateSubtotal = (lineItems = [], laborItems = []) => {
  const lineTotal = lineItems.reduce((sum, item) => sum + (item.total || item.quantity * item.unit_price || 0), 0);
  const laborTotal = laborItems.reduce((sum, item) => sum + (item.price || 0), 0);
  return lineTotal + laborTotal;
};

export default function EstimateViewer({ buildVersion }) {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [approving, setApproving] = useState(false);
  const [approvingError, setApprovingError] = useState(null);
  const [approvingSuccess, setApprovingSuccess] = useState(false);
  const [payingError, setPayingError] = useState(null);
  const [selectedOptionalUids, setSelectedOptionalUids] = useState([]);
  const [updatingAddons, setUpdatingAddons] = useState(false);
  const [addonError, setAddonError] = useState(null);

  useEffect(() => {
    console.log("EstimateViewer mounted with token:", token);
    console.log("buildVersion:", buildVersion);
  }, [token, buildVersion]);

  useEffect(() => {
    const fetchEstimate = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log("Fetching estimate with token:", token);
        
        const response = await base44Public.functions.invoke("getPublicEstimate", {
          publicAccessToken: token,
        });
        
        console.log("Response:", response);
        
        if (!response?.data) {
          throw new Error("No data returned from server");
        }
        
        setData(response.data);
        const addons = response.data?.estimate?.addons || [];
        setSelectedOptionalUids(addons.filter(a => a.selection_state === 'customer_selected').map(a => a.uid));
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

  const handleApproveEstimate = async () => {
    setApproving(true);
    setApprovingError(null);
    setApprovingSuccess(false);
    try {
      console.log("Attempting to approve estimate with token:", token);
      const response = await base44Public.functions.invoke("approvePublicEstimate", {
        publicAccessToken: token,
      });
      console.log("Approve response:", response);
      
      if (response?.data?.success) {
        console.log("Approval successful");
        setApprovingSuccess(true);
        setData(prev => ({
          ...prev,
          estimate: { ...prev.estimate, status: "approved" }
        }));
      } else {
        const errorMsg = response?.data?.error || "Failed to approve estimate";
        console.error("Approval failed:", errorMsg);
        throw new Error(errorMsg);
      }
    } catch (err) {
      const errorMsg = err?.message || err?.toString() || "Failed to approve estimate";
      console.error("Approve error details:", { message: errorMsg, error: err, status: err?.response?.status });
      setApprovingError(errorMsg);
    } finally {
      setApproving(false);
    }
  };

  const handleUpdateAddons = async () => {
    setUpdatingAddons(true);
    setAddonError(null);
    try {
      const response = await base44Public.functions.invoke("selectPublicEstimateAddons", {
        publicAccessToken: token,
        selectedUids: selectedOptionalUids,
      });
      if (response?.data?.success) {
        setData(prev => ({
          ...prev,
          estimate: {
            ...prev.estimate,
            total: response.data.estimate.total,
            subtotal: response.data.estimate.subtotal,
            addons: response.data.estimate.addons,
          },
        }));
      } else {
        setAddonError(response?.data?.error || "Failed to update addons");
      }
    } catch (err) {
      setAddonError(err?.message || "Failed to update addons");
    } finally {
      setUpdatingAddons(false);
    }
  };

  const handlePayNow = () => {
    if (!data?.estimate?.stripe_checkout_url) {
      setPayingError("Payment link unavailable. Please contact Elite Engine Development.");
      return;
    }
    window.location.href = data.estimate.stripe_checkout_url;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Version indicator */}
      <div className="bg-emerald-100 border-b border-emerald-300 px-6 py-2">
        <p className="text-xs text-emerald-700 font-semibold">PUBLIC LIVE VERSION 3 | BUILD: {buildVersion}</p>
      </div>
      
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
            {/* Header */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  {data.settings?.company_logo_url && (
                    <img src={data.settings.company_logo_url} alt="Company" className="h-12 mb-4" />
                  )}
                  {data.settings?.company_name && <h2 className="text-lg font-semibold text-slate-900">{data.settings.company_name}</h2>}
                  {data.settings?.company_address && <p className="text-sm text-slate-600">{data.settings.company_address}</p>}
                  {data.settings?.company_phone && <p className="text-sm text-slate-600">{data.settings.company_phone}</p>}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">{data.estimate?.estimate_number || "N/A"}</p>
                  <p className="text-sm text-slate-500">Estimate</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm border-t border-slate-200 pt-4">
                <div>
                  <p className="text-slate-500 font-semibold">Customer</p>
                  <p className="text-slate-900">
                    {data.customer ? `${data.customer.first_name} ${data.customer.last_name}` : "N/A"}
                  </p>
                  {data.customer?.company_name && (
                    <p className="text-sm text-slate-600">{data.customer.company_name}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-slate-500 font-semibold">Status</p>
                  <span className="inline-block px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                    {data.estimate?.status ? data.estimate.status.charAt(0).toUpperCase() + data.estimate.status.slice(1) : "N/A"}
                  </span>
                </div>
              </div>

              {data.customerEngine && (
                <div className="mt-4 border-t border-slate-200 pt-4 flex flex-wrap gap-6 text-sm">
                  {data.customerEngine.eed_id && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold mb-0.5">EED ID</p>
                      <p className="font-mono font-bold text-[#e20404]">{data.customerEngine.eed_id}</p>
                    </div>
                  )}
                  {data.customerEngine.engine_serial_number && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold mb-0.5">Serial #</p>
                      <p className="font-semibold text-slate-900">{data.customerEngine.engine_serial_number}</p>
                    </div>
                  )}
                  {data.platform && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold mb-0.5">Platform</p>
                      <p className="font-semibold text-slate-900">
                        {data.platform.manufacturer} {data.platform.name}
                        {data.platform.year_range_start ? ` (${data.platform.year_range_start}${data.platform.year_range_end ? `–${data.platform.year_range_end}` : "+"})` : ""}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dates and Details */}
            <div className="grid grid-cols-2 gap-4">
              {data.estimate?.issue_date && (
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <p className="text-xs text-slate-500 font-semibold">Issue Date</p>
                  <p className="text-slate-900">{new Date(data.estimate.issue_date).toLocaleDateString()}</p>
                </div>
              )}
              {data.estimate?.expiry_date && (
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <p className="text-xs text-slate-500 font-semibold">Expiration Date</p>
                  <p className="text-slate-900">{new Date(data.estimate.expiry_date).toLocaleDateString()}</p>
                </div>
              )}
            </div>

            {/* Line Items */}
            {data.estimate?.line_items && data.estimate.line_items.length > 0 && (
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
                    {data.estimate.line_items.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-3 text-slate-900">{item.item_name}</td>
                        <td className="text-center py-3 text-slate-600">{item.quantity}</td>
                        <td className="text-right py-3 text-slate-600">{formatMoney(item.unit_price)}</td>
                        <td className="text-right py-3 text-slate-900 font-semibold">{formatMoney(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Labor Items */}
            {data.estimate?.labor_items && data.estimate.labor_items.length > 0 && (
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
                    {data.estimate.labor_items.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-3 text-slate-900">{item.name}</td>
                        <td className="text-right py-3 text-slate-900 font-semibold">{formatMoney(item.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Optional Addons */}
            {data.estimate?.addons && data.estimate.addons.length > 0 && (
              <div className="bg-white rounded-lg border border-amber-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
                  <span className="text-amber-500">✦</span> Optional Addons
                </h3>
                <p className="text-sm text-slate-500 mb-4">Select any addons you'd like added to your build. Your total updates when you confirm below.</p>
                <div className="space-y-3">
                  {data.estimate.addons.map((addon, idx) => {
                    const isPreselected = addon.selection_state === 'preselected';
                    const isCustomerSelected = addon.selection_state === 'customer_selected';
                    const checked = isPreselected || isCustomerSelected || selectedOptionalUids.includes(addon.uid);
                    const disabled = isPreselected;
                    return (
                      <div key={addon.uid || idx} className={`p-3 rounded-lg border ${checked ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={(e) => {
                              if (disabled) return;
                              setSelectedOptionalUids(prev => e.target.checked ? [...prev, addon.uid] : prev.filter(u => u !== addon.uid));
                            }}
                            className="w-5 h-5 mt-0.5 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-slate-900">{addon.name}</p>
                              <p className="font-semibold text-slate-900">${Number(addon.price || 0).toFixed(2)}</p>
                            </div>
                            {addon.description && <p className="text-xs text-slate-500 mt-0.5">{addon.description}</p>}
                            {isPreselected && <p className="text-xs text-amber-600 mt-1 font-medium">Included by shop</p>}
                            {isCustomerSelected && <p className="text-xs text-emerald-600 mt-1 font-medium">✓ You selected this</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const hasTogglable = data.estimate.addons.some(a => a.selection_state === 'optional' || a.selection_state === 'customer_selected');
                  if (!hasTogglable) return null;
                  return (
                    <div className="mt-4">
                      {addonError && <p className="text-red-600 text-sm mb-2">{addonError}</p>}
                      <button
                        onClick={handleUpdateAddons}
                        disabled={updatingAddons || data.estimate?.status !== 'sent'}
                        className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-semibold py-2 px-4 rounded-lg transition"
                      >
                        {updatingAddons ? "Updating..." : "Update Addons & Total"}
                      </button>
                      {data.estimate?.status !== 'sent' && <p className="text-xs text-slate-400 text-center mt-2">Addons can only be updated before approval.</p>}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Financial Summary */}
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="space-y-2 mb-6 pb-6 border-b border-slate-200">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="text-slate-900 font-semibold">{formatMoney(data.estimate?.subtotal || calculateSubtotal(data.estimate?.line_items, data.estimate?.labor_items))}</span>
                </div>
                {(data.estimate?.tax_amount || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Tax {data.estimate?.tax_rate ? `(${data.estimate.tax_rate}%)` : ""}</span>
                    <span className="text-slate-900 font-semibold">{formatMoney(data.estimate.tax_amount)}</span>
                  </div>
                )}
                {(data.estimate?.deposit_amount || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Deposit Required</span>
                    <span className="text-slate-900 font-semibold">{formatMoney(data.estimate.deposit_amount)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center mb-6">
                <span className="text-lg font-semibold text-slate-900">Total</span>
                <span className="text-2xl font-bold text-slate-900">{formatMoney(data.estimate?.total || (calculateSubtotal(data.estimate?.line_items, data.estimate?.labor_items) + (data.estimate?.tax_amount || 0)))}</span>
              </div>
              {Number(data.estimate?.applied_credits) > 0 && (
                <>
                  <div className="flex justify-between items-center mb-6 pt-4 border-t border-slate-200">
                    <span className="text-sm font-semibold text-violet-700">Account Credit Applied</span>
                    <span className="text-xl font-bold text-violet-600">-{formatMoney(data.estimate.applied_credits)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-lg font-semibold text-slate-900">Amount Due</span>
                    <span className="text-2xl font-bold text-[#e20404]">{formatMoney(Math.max(0, (data.estimate?.total || 0) - (data.estimate?.applied_credits || 0) - (data.estimate?.amount_paid || 0)))}</span>
                  </div>
                </>
              )}

              {/* Approve Success Message */}
              {approvingSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-emerald-700 font-semibold text-sm">✓ Estimate approved successfully.</p>
                </div>
              )}

              {/* Approve Error Message */}
              {approvingError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 font-semibold text-sm">Error: {approvingError}</p>
                </div>
              )}

              {/* Pay Error Message */}
              {payingError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 font-semibold text-sm">Error: {payingError}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                {data.estimate?.status === "sent" && (
                  <button 
                    onClick={handleApproveEstimate}
                    disabled={approving}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-2 px-4 rounded-lg transition"
                  >
                    {approving ? "Approving..." : "Approve Estimate"}
                  </button>
                )}
                {!payingError && (
                  <button 
                    onClick={handlePayNow}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                  >
                    Pay Now
                  </button>
                )}
              </div>
            </div>

            {/* Notes */}
            {data.estimate?.notes && (
              <div className="bg-white rounded-lg border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-3">Notes</h3>
                <p className="text-slate-600 text-sm whitespace-pre-line">{data.estimate.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}