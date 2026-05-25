import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";

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
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <p className="text-slate-600">Estimate data loaded successfully.</p>
            <details className="text-xs text-slate-500 mt-4">
              <summary className="cursor-pointer">Show data</summary>
              <pre className="mt-2 bg-slate-100 p-2 rounded overflow-auto max-h-64">
                {JSON.stringify(data, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}