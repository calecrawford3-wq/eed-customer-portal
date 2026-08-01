import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  AlertTriangle,
  Package,
  Printer,
  Send,
  MessageSquare,
  CheckCircle,
  Wrench as WrenchIcon,
  Receipt,
  History,
} from "lucide-react";

const STATUS_BADGE = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-400",
};

export default function EstimateHeader({
  form,
  id,
  depositMet,
  sending,
  convertingToBuild,
  saveMutation,
  sendEstimate,
  sendEstimateByText,
  handleApprove,
  handleConvertToBuild,
  setPoModalOpen,
  setPrintMode,
  setHistoryOpen,
}) {
  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      <Link to="/Estimates"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{form.estimate_number}</h1>
      </div>
      <Badge className={`${STATUS_BADGE[form.status] || "bg-slate-100 text-slate-600"} border-0 capitalize`}>{form.status}</Badge>

      {form.deposit_required && !depositMet && (
        <Badge className="bg-amber-100 text-amber-700 border-0 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Deposit Pending
        </Badge>
      )}

      <Button variant="outline" size="sm" onClick={() => setPoModalOpen(true)} disabled={!id}>
        <Package className="w-4 h-4 mr-1" /> Generate POs
      </Button>
      <Button variant="outline" size="sm" onClick={() => setPrintMode(true)}>
        <Printer className="w-4 h-4 mr-1" /> View
      </Button>
      <Button variant="outline" size="sm" onClick={sendEstimate} disabled={sending || !form.customer_id}>
        <Send className="w-4 h-4 mr-1" /> {sending ? "Sending..." : "Send"}
      </Button>
      <Button variant="outline" size="sm" onClick={sendEstimateByText} disabled={sending || !form.customer_id} title="Send estimate link via text message">
        <MessageSquare className="w-4 h-4 mr-1" />{sending ? "Sending..." : "Text"}
      </Button>
      {id && form.status !== "approved" && form.status !== "declined" && (
        <Button
          variant="outline" size="sm"
          className="border-emerald-400 text-emerald-700 hover:bg-emerald-50"
          onClick={handleApprove}
          disabled={form.deposit_required && !depositMet}
          title={form.deposit_required && !depositMet ? "Deposit must be received first" : ""}
        >
          <CheckCircle className="w-4 h-4 mr-1" /> Approve
        </Button>
      )}
      {form.status === "approved" && !form.build_id && (
        <Button
          variant="outline" size="sm"
          className="border-purple-400 text-purple-700 hover:bg-purple-50"
          onClick={handleConvertToBuild}
          disabled={convertingToBuild}
        >
          <WrenchIcon className="w-4 h-4 mr-1" /> {convertingToBuild ? "Creating..." : "Convert to Build"}
        </Button>
      )}
      {form.build_id && (
        <Link to={`/BuildDetail?id=${form.build_id}`}>
          <Button variant="outline" size="sm" className="border-purple-400 text-purple-700 hover:bg-purple-50">
            <WrenchIcon className="w-4 h-4 mr-1" /> View Build
          </Button>
        </Link>
      )}
      {form.invoice_id && (
        <Link to={`/InvoiceDetail?id=${form.invoice_id}`}>
          <Button variant="outline" size="sm" className="border-emerald-400 text-emerald-700 hover:bg-emerald-50">
            <Receipt className="w-4 h-4 mr-1" /> View Invoice
          </Button>
        </Link>
      )}
      {id && (
        <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
          <History className="w-4 h-4 mr-1" /> History
        </Button>
      )}
      <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}