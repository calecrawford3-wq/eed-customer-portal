import { useParams } from "react-router-dom";

export default function EstimateViewer() {
  const { token } = useParams();

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
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <p className="text-slate-600">Loading estimate details...</p>
        </div>
      </div>
    </div>
  );
}