import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RefreshCw, Link as LinkIcon, ClipboardList, Trash2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700",
  acknowledged: "bg-blue-100 text-blue-700",
  estimate_sent: "bg-purple-100 text-purple-700",
  completed: "bg-emerald-100 text-emerald-700",
};

export default function RefreshRequests() {
  const qc = useQueryClient();
  const [confirmState, setConfirmState] = useState({ open: false });
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["refreshRequests"],
    queryFn: () => base44.entities.RefreshRequest.list("-created_date", 200),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  const { data: builds = [] } = useQuery({
    queryKey: ["builds"],
    queryFn: () => base44.entities.EngineBuild.list("-created_date", 200),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RefreshRequest.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["refreshRequests"] });
      setDetailOpen(false);
      toast.success("Request updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.RefreshRequest.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["refreshRequests"] });
      toast.success("Request removed");
    },
  });

  const openDetail = (req) => {
    setSelected(req);
    setAdminNotes(req.admin_notes || "");
    setNewStatus(req.status);
    setDetailOpen(true);
  };

  const saveUpdate = () => {
    updateMutation.mutate({ id: selected.id, data: { status: newStatus, admin_notes: adminNotes } });
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  const getCustomer = (id) => customers.find(c => c.id === id);
  const getBuild = (id) => builds.find(b => b.id === id);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <RefreshCw className="w-7 h-7 text-[#e20404]" /> Refresh Requests
          </h1>
          <p className="text-slate-500 mt-1">
            {pendingCount > 0
              ? <span className="text-amber-600 font-medium">{pendingCount} pending request{pendingCount !== 1 ? "s" : ""}</span>
              : "No pending requests"
            }
          </p>
        </div>
        <a href="/CustomerPortal" target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm">
            <ExternalLink className="w-4 h-4 mr-1" /> Customer Portal
          </Button>
        </a>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <RefreshCw className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No refresh requests yet</p>
          <p className="text-sm mt-1">Customers can request a refresh from their portal</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Build / Engine</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Message</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => {
                const cust = getCustomer(req.customer_id);
                const build = getBuild(req.build_id);
                return (
                  <tr key={req.id} className={`border-b border-slate-100 hover:bg-slate-50 ${req.status === "pending" ? "bg-amber-50/40" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{req.customer_name || (cust ? `${cust.first_name} ${cust.last_name}` : "—")}</p>
                      {cust?.email && <p className="text-xs text-slate-400">{cust.email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-slate-800">{req.build_serial || build?.engine_serial_number || "—"}</p>
                      {build && (
                        <Link to={`/BuildDetail?id=${build.id}`} className="text-xs text-[#e20404] hover:underline">
                          View Build →
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-slate-600 truncate">{req.message || <span className="text-slate-300 italic">No message</span>}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {req.requested_date ? format(new Date(req.requested_date), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={`${STATUS_STYLES[req.status] || "bg-slate-100 text-slate-600"} border-0 capitalize`}>
                        {req.status?.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => openDetail(req)}>Manage</Button>
                        <Link to={`/EstimateDetail?new=1&customer_id=${req.customer_id}&build_id=${req.build_id}`} title="Create estimate for this customer">
                          <Button size="sm" variant="outline" className="text-purple-600 border-purple-200 hover:bg-purple-50">
                            <ClipboardList className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600"
                          onClick={() => setConfirmState({ open: true, title: "Remove Request", message: "Remove this request? This cannot be undone.", confirmLabel: "Remove", onConfirm: () => deleteMutation.mutate(req.id) })}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Refresh Request</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                <p className="font-semibold text-slate-800">{selected.customer_name}</p>
                <p className="text-sm text-slate-500">Engine: {selected.build_serial}</p>
                {selected.message && (
                  <p className="text-sm text-slate-600 mt-2 italic">"{selected.message}"</p>
                )}
              </div>
              <div>
                <Label>Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="estimate_sent">Estimate Sent</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Internal Notes</Label>
                <Textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  rows={3}
                  placeholder="Notes for your team..."
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Link to={`/EstimateDetail?new=1&customer_id=${selected?.customer_id}&build_id=${selected?.build_id}`} className="flex-1">
                  <Button variant="outline" className="w-full text-purple-600 border-purple-200 hover:bg-purple-50">
                    <ClipboardList className="w-4 h-4 mr-1" /> Create Estimate
                  </Button>
                </Link>
                {getBuild(selected.build_id) && (
                  <Link to={`/BuildDetail?id=${selected.build_id}`}>
                    <Button variant="outline">View Build</Button>
                  </Link>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={saveUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState({})}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
      />
    </div>
  );
}