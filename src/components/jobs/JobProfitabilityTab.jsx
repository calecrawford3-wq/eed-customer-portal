import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertTriangle, RefreshCw, DollarSign, Package, Wrench, Hammer, ShieldAlert, Clock, Percent, Building2, Truck } from "lucide-react";
import { formatMoney } from "@/lib/money";

export default function JobProfitabilityTab({ job }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("computeJobProfitability", { job_id: job.id });
      setReport(res?.data || res);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#e20404]" /> Job Profitability — Quoted vs Actual
            </CardTitle>
            <Button size="sm" variant="outline" onClick={loadReport} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Computing..." : report ? "Refresh" : "Compute"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!report && !error && (
            <p className="text-sm text-slate-400 py-8 text-center">
              Click <strong>Compute</strong> to generate the quoted-vs-actual profitability breakdown for this job.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 py-4">Error: {error}</p>
          )}
          {report && !error && (
            <ProfitabilityReport report={report} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfitabilityReport({ report }) {
  const { quoted, actual, estimated_margin_pct, actual_margin_pct, missing_costs, warnings, tax_collected, credits_applied, payments_received } = report;

  return (
    <div className="space-y-4">
      {/* Warnings */}
      {warnings?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Margin summary */}
      <div className="grid grid-cols-2 gap-3">
        <MarginCard label="Estimated Margin" pct={estimated_margin_pct} />
        <MarginCard label="Actual Margin" pct={actual_margin_pct} />
      </div>

      {/* Quoted vs Actual table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="text-left py-2 pr-4 font-medium text-slate-600">Metric</th>
              <th className="text-right py-2 px-4 font-medium text-slate-600">Quoted</th>
              <th className="text-right py-2 px-4 font-medium text-slate-600">Actual</th>
              <th className="text-right py-2 pl-4 font-medium text-slate-600">Variance</th>
            </tr>
          </thead>
          <tbody>
            <ProfitRow icon={DollarSign} label="Revenue (before tax)" quoted={quoted.revenueBeforeTax} actual={actual.revenueBeforeTax} />
            <ProfitRow icon={Package} label="Parts cost" quoted={quoted.partsCost} actual={actual.partsCost} cost />
            <ProfitRow icon={Wrench} label="Labor revenue" quoted={quoted.laborRevenue} actual={actual.laborRevenue} />
            <ProfitRow icon={Hammer} label="Machining revenue" quoted={quoted.machiningRevenue} actual={actual.machiningRevenue} />
            <ProfitRow icon={Percent} label="Discount" quoted={quoted.discount} actual={actual.discount} cost />
            <ProfitRow icon={Clock} label={`Internal labor (${actual.laborHours}h @ $${actual.laborRate}/hr)`} quoted={null} actual={actual.internalLaborCost} cost />
            <ProfitRow icon={Building2} label={`Overhead burden (${actual.laborHours}h @ $${actual.overheadRate}/hr)`} quoted={null} actual={actual.overheadCost} cost />
            <ProfitRow icon={Truck} label="Outsourced machining cost" quoted={null} actual={actual.outsourcedMachiningCost} cost />
            <ProfitRow icon={ShieldAlert} label="Warranty cost" quoted={null} actual={actual.warrantyCost} cost />
            <tr className="border-t-2 border-slate-300 font-bold">
              <td className="py-2 pr-4 text-slate-900">Total Cost</td>
              <td className="py-2 px-4 text-right text-slate-500">{quoted.hasEstimate ? formatMoney(quoted.totalCost) : "—"}</td>
              <td className="py-2 px-4 text-right text-slate-900">{formatMoney(actual.totalCost)}</td>
              <td className="py-2 pl-4 text-right text-slate-400">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Machining classification summary */}
      {(actual.inHouseMachiningCount > 0 || actual.outsourcedMachiningCount > 0 || actual.machiningRevenue > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {actual.inHouseMachiningCount > 0 && (
            <Badge className="bg-blue-50 text-blue-700 border-blue-200">
              {actual.inHouseMachiningCount} in-house machining (cost covered by labor)
            </Badge>
          )}
          {actual.outsourcedMachiningCount > 0 && (
            <Badge className="bg-purple-50 text-purple-700 border-purple-200">
              {actual.outsourcedMachiningCount} outsourced machining ({formatMoney(actual.outsourcedMachiningCost)})
            </Badge>
          )}
          {actual.machiningRevenue > 0 && actual.inHouseMachiningCount === 0 && actual.outsourcedMachiningCount === 0 && (
            <Badge className="bg-amber-50 text-amber-700 border-amber-200">
              All machining unclassified — mark in-house or outsourced on the invoice
            </Badge>
          )}
        </div>
      )}

      {/* Separately tracked (not revenue or operating cost) */}
      <div className="grid grid-cols-3 gap-3">
        <InfoCard label="Tax Collected" value={formatMoney(tax_collected)} sub="Separate from revenue" />
        <InfoCard label="Credits Applied" value={formatMoney(credits_applied)} sub="Separate from costs" />
        <InfoCard label="Payments Received" value={formatMoney(payments_received)} sub="Separate from costs" />
      </div>

      {/* Missing costs */}
      {missing_costs?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm font-medium text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {missing_costs.length} Missing Cost(s) — Flagged, Not Assumed Zero
          </p>
          <div className="space-y-1">
            {missing_costs.map((mc, i) => (
              <div key={i} className="text-xs text-red-700 flex items-start gap-2">
                <Badge variant="outline" className="text-[10px] border-red-300 text-red-600 capitalize flex-shrink-0">{mc.type.replace(/_/g, " ")}</Badge>
                <span>{mc.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!quoted.hasEstimate && (
        <p className="text-xs text-slate-400 italic">No approved estimate linked — quoted figures unavailable. Actual figures computed from invoices, consumed reservations, and logged task time.</p>
      )}
    </div>
  );
}

function MarginCard({ label, pct }) {
  const isNull = pct == null;
  const isPositive = !isNull && pct >= 0;
  return (
    <div className={`rounded-lg p-3 border ${isNull ? "bg-slate-50 border-slate-200" : isPositive ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
      <p className="text-[10px] uppercase font-semibold text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${isNull ? "text-slate-400" : isPositive ? "text-emerald-700" : "text-red-700"}`}>
        {isNull ? "—" : `${pct.toFixed(1)}%`}
      </p>
    </div>
  );
}

function ProfitRow({ icon: Icon, label, quoted, actual, cost }) {
  const variance = quoted != null && actual != null ? actual - quoted : null;
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 pr-4 text-slate-700">
        <span className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-slate-400" />
          {label}
        </span>
      </td>
      <td className="py-2 px-4 text-right text-slate-600">{quoted != null ? formatMoney(quoted) : "—"}</td>
      <td className="py-2 px-4 text-right text-slate-900 font-medium">{actual != null ? formatMoney(actual) : "—"}</td>
      <td className="py-2 pl-4 text-right">
        {variance != null ? (
          <span className={variance === 0 ? "text-slate-400" : (cost ? variance > 0 : variance < 0) ? "text-red-600" : "text-emerald-600"}>
            {variance > 0 ? "+" : ""}{formatMoney(variance)}
          </span>
        ) : <span className="text-slate-300">—</span>}
      </td>
    </tr>
  );
}

function InfoCard({ label, value, sub }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
      <p className="text-[10px] uppercase font-semibold text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-[10px] text-slate-400">{sub}</p>
    </div>
  );
}