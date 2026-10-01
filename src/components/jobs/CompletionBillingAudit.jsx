import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { formatMoney } from "@/lib/money";

export default function CompletionBillingAudit({ job }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runAudit = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("auditCompletionBilling", { job_id: job.id });
      setResult(res?.data || res);
    } catch (e) {
      setResult({ error: e.message });
    }
    setLoading(false);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#e20404]" /> Completion Billing Audit</CardTitle>
          <Button size="sm" variant="outline" onClick={runAudit} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> {loading ? "Checking..." : "Run Audit"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!result ? (
          <p className="text-sm text-slate-400 py-3 text-center">Run an audit to verify billing consistency across all linked invoices.</p>
        ) : result.error ? (
          <p className="text-sm text-red-600 py-2">Error: {result.error}</p>
        ) : result.clean ? (
          <div className="flex items-center gap-2 py-2 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">All billing checks passed — no issues found.</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-red-100 text-red-700">{result.summary.errors_count} error(s)</Badge>
              <Badge className="bg-amber-100 text-amber-700">{result.summary.warnings_count} warning(s)</Badge>
              <span className="text-xs text-slate-400 ml-auto">
                {result.summary.invoice_count} invoice(s) • Balance: {formatMoney(result.summary.total_balance)} • Paid: {formatMoney(result.summary.total_paid)}
              </span>
            </div>
            <div className="space-y-2">
              {result.issues.map((issue, i) => (
                <div key={i} className={`flex items-start gap-2 rounded-lg p-2 text-sm ${
                  issue.severity === "error" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"
                }`}>
                  {issue.severity === "error"
                    ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
                    : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />}
                  <div>
                    <p className="font-medium">{issue.message}</p>
                    <p className="text-xs opacity-70 capitalize">{issue.check.replace(/_/g, " ")}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}