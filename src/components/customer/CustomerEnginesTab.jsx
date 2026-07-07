import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { Cpu, Plus, ExternalLink, Receipt, ChevronDown, ChevronRight, Wrench, Pencil, ArrowRightLeft, FileText, Ban } from "lucide-react";
import { toast } from "sonner";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";
import IllegalPartsViewModal from "@/components/legal/IllegalPartsViewModal";

function getPlatformLabel(platform) {
  if (!platform) return "Unknown";
  const years = platform.year_range_start
    ? ` (${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"})`
    : "";
  return `${platform.manufacturer} ${platform.name}${years}`;
}

const STATUS_COLORS = {
  queued: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  assembly: "bg-purple-100 text-purple-700",
  testing: "bg-amber-100 text-amber-700",
  complete: "bg-emerald-100 text-emerald-700",
  shipped: "bg-teal-100 text-teal-700",
};

const STAGE_COLORS = {
  stock: "bg-slate-100 text-slate-700",
  stage_1: "bg-blue-100 text-blue-700",
  stage_2: "bg-purple-100 text-purple-700",
  stage_3: "bg-red-100 text-red-700",
  contract: "bg-emerald-100 text-emerald-700",
  custom: "bg-amber-100 text-amber-700",
};

const STAGE_LABELS = {
  stock: "Stock",
  stage_1: "Stage 1",
  stage_2: "Stage 2",
  stage_3: "Stage 3",
  contract: "Contract",
  custom: "Custom",
};

export default function CustomerEnginesTab({ customerId, customer, platforms = [] }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [expandedEngine, setExpandedEngine] = useState(null);
  const [newEngine, setNewEngine] = useState({ engine_serial_number: "", platform_id: "", notes: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [editEngine, setEditEngine] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferEngine, setTransferEngine] = useState(null);
  const [transferCustomerId, setTransferCustomerId] = useState("");
  const [legalDocToView, setLegalDocToView] = useState(null);
  const [voidDoc, setVoidDoc] = useState(null);

  const { data: allCustomers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 500),
  });

  const { data: engines = [] } = useQuery({
    queryKey: ["customer-engines", customerId],
    queryFn: () => base44.entities.CustomerEngine.filter({ customer_id: customerId }),
    enabled: !!customerId,
  });

  const { data: allBuilds = [] } = useQuery({
    queryKey: ["builds"],
    queryFn: () => base44.entities.EngineBuild.list("-created_date", 500),
  });

  const { data: allInvoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list("-created_date", 500),
  });

  const { data: legalDocs = [] } = useQuery({
    queryKey: ["legal-docs", customerId],
    queryFn: () => base44.entities.LegalDocument.filter({ customer_id: customerId }),
    enabled: !!customerId,
  });

  const { data: allEngines = [] } = useQuery({
    queryKey: ["all-engines-for-eed"],
    queryFn: () => base44.entities.CustomerEngine.list("-created_date", 1000),
    enabled: addOpen,
  });

  const getNextEedId = () => {
    const nums = allEngines
      .map(e => e.eed_id?.match(/^EED(\d+)$/)?.[1])
      .filter(Boolean)
      .map(Number);
    const max = nums.length > 0 ? Math.max(...nums) : 1039;
    return `EED${max + 1}`;
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const sameSerial = allEngines.find(e =>
        e.engine_serial_number === data.engine_serial_number && e.customer_id !== customerId
      );
      if (sameSerial) {
        throw new Error(`Serial ${data.engine_serial_number} already registered as ${sameSerial.eed_id}`);
      }
      const existForCustomer = engines.find(e => e.engine_serial_number === data.engine_serial_number);
      if (existForCustomer) {
        throw new Error(`Serial already registered as ${existForCustomer.eed_id} for this customer`);
      }
      return base44.entities.CustomerEngine.create(data);
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["customer-engines", customerId] });
      qc.invalidateQueries({ queryKey: ["all-engines-for-eed"] });
      setAddOpen(false);
      setNewEngine({ engine_serial_number: "", platform_id: "", notes: "" });
      toast.success(`Engine ${created.eed_id} registered`);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => base44.entities.CustomerEngine.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-engines", customerId] });
      qc.invalidateQueries({ queryKey: ["all-engines-for-eed"] });
      setEditOpen(false);
      toast.success("Engine updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const transferMutation = useMutation({
    mutationFn: async ({ id, newCustomerId }) => base44.entities.CustomerEngine.update(id, { customer_id: newCustomerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-engines", customerId] });
      qc.invalidateQueries({ queryKey: ["all-engines-for-eed"] });
      const target = allCustomers.find(c => c.id === transferCustomerId);
      setTransferOpen(false);
      setTransferEngine(null);
      setTransferCustomerId("");
      toast.success(`Engine transferred to ${target ? `${target.first_name} ${target.last_name}` : "new customer"}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const voidMutation = useMutation({
    mutationFn: async ({ id }) => base44.entities.LegalDocument.update(id, { status: "void" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["legal-docs", customerId] });
      setVoidDoc(null);
      toast.success("Document voided");
    },
    onError: (err) => toast.error(err.message || "Failed to void document"),
  });

  const handleAdd = () => {
    if (!newEngine.engine_serial_number || !newEngine.platform_id) {
      toast.error("Serial number and platform are required");
      return;
    }
    createMutation.mutate({
      ...newEngine,
      customer_id: customerId,
      eed_id: getNextEedId(),
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm text-slate-500">Registered engines for this customer</span>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Engine
        </Button>
      </div>

      {engines.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <Cpu className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No engines registered</p>
        </div>
      ) : (
        <div className="space-y-3">
          {engines.map(engine => {
            const platform = platforms.find(p => p.id === engine.platform_id);
            const engineBuilds = allBuilds
              .filter(b => b.engine_serial_number === engine.engine_serial_number)
              .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
            const mostRecentBuild = engineBuilds[0];
            const pastBuilds = engineBuilds.slice(1);
            const isExpanded = expandedEngine === engine.id;

            // Invoices linked to any build of this engine
            const engineInvoices = allInvoices.filter(inv =>
              engineBuilds.some(b => b.id === inv.build_id) ||
              inv.customer_engine_id === engine.id
            );

            return (
              <Card key={engine.id} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedEngine(isExpanded ? null : engine.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Cpu className="w-5 h-5 text-[#e20404]" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#e20404]">{engine.eed_id}</span>
                          <span className="text-sm text-slate-600">{engine.engine_serial_number}</span>
                        </div>
                        <p className="text-xs text-slate-400">{getPlatformLabel(platform)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {engine.current_stage && (
                        <Badge className={`text-xs border-0 ${STAGE_COLORS[engine.current_stage] || "bg-slate-100 text-slate-600"}`}>
                          {STAGE_LABELS[engine.current_stage] || engine.current_stage}
                        </Badge>
                      )}
                      {mostRecentBuild && (
                        <Badge className={`text-xs border-0 capitalize ${STATUS_COLORS[mostRecentBuild.status] || "bg-slate-100 text-slate-600"}`}>
                          {mostRecentBuild.status?.replace("_", " ")}
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-slate-500"
                        onClick={(e) => { e.stopPropagation(); setTransferEngine(engine); setTransferCustomerId(""); setTransferOpen(true); }}
                        title="Transfer to another customer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-slate-500"
                        onClick={(e) => { e.stopPropagation(); setEditEngine(engine); setEditOpen(true); }}
                        title="Edit engine"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 border-t border-slate-100 pt-4 space-y-4">
                      {/* Most recent build */}
                      {mostRecentBuild ? (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Current / Most Recent Build</p>
                          <div className="bg-slate-50 rounded-lg p-3 flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{mostRecentBuild.build_number || mostRecentBuild.engine_serial_number}</p>
                              <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-500">
                                {mostRecentBuild.max_rpm && <span>Max RPM: {mostRecentBuild.max_rpm.toLocaleString()}</span>}
                                {mostRecentBuild.oil_recommendation && <span>· Oil: {mostRecentBuild.oil_recommendation}</span>}
                                {mostRecentBuild.refresh_interval && <span>· Refresh: {mostRecentBuild.refresh_interval}</span>}
                                {mostRecentBuild.application && <span>· App: {mostRecentBuild.application}</span>}
                              </div>
                              {mostRecentBuild.completion_date && (
                                <p className="text-xs text-slate-400 mt-1">Completed: {mostRecentBuild.completion_date}</p>
                              )}
                            </div>
                            <Link to={`/BuildDetail?id=${mostRecentBuild.id}`}>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-500">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-slate-400">
                          <Wrench className="w-6 h-6 mx-auto mb-1 opacity-40" />
                          <p className="text-xs">No builds yet</p>
                        </div>
                      )}

                      {/* Past builds */}
                      {pastBuilds.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Past Builds ({pastBuilds.length})</p>
                          <div className="space-y-1">
                            {pastBuilds.map(b => (
                              <div key={b.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                                <div>
                                  <span className="text-sm font-medium">{b.build_number || b.engine_serial_number}</span>
                                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status] || "bg-slate-100 text-slate-600"}`}>
                                    {b.status?.replace("_", " ")}
                                  </span>
                                  {b.completion_date && <span className="ml-2 text-xs text-slate-400">{b.completion_date}</span>}
                                </div>
                                <Link to={`/BuildDetail?id=${b.id}`}>
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-500">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Button>
                                </Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Linked invoices */}
                      {engineInvoices.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Linked Invoices ({engineInvoices.length})</p>
                          <div className="space-y-1">
                            {engineInvoices.map(inv => (
                              <div key={inv.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                                <div>
                                  <span className="text-sm font-medium">{inv.invoice_number}</span>
                                  <span className="ml-2 text-xs text-slate-500">{inv.issue_date} · ${Number(inv.total || 0).toFixed(2)}</span>
                                  <Badge className={`ml-2 text-xs border-0 capitalize ${inv.status === "paid" ? "bg-emerald-100 text-emerald-700" : inv.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                                    {inv.status}
                                  </Badge>
                                </div>
                                <Link to={`/InvoiceDetail?id=${inv.id}`}>
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-500">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Button>
                                </Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Legal documents */}
                      {(() => {
                        const engineLegalDocs = legalDocs.filter(d => d.customer_engine_id === engine.id && d.status !== "void");
                        if (engineLegalDocs.length === 0) return null;
                        return (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Legal Documents ({engineLegalDocs.length})</p>
                            <div className="space-y-1">
                              {engineLegalDocs.map(d => {
                                const isContract = d.document_type === "contract_engine";
                                return (
                                  <div key={d.id} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isContract ? "bg-blue-50" : "bg-amber-50"}`}>
                                    <div className="flex items-center gap-2">
                                      <FileText className={`w-3.5 h-3.5 ${isContract ? "text-blue-600" : "text-amber-600"}`} />
                                      <span className={`text-sm font-medium ${isContract ? "text-blue-800" : "text-amber-800"}`}>
                                        {isContract ? "Contract Engine Agreement" : "Illegal Parts Acknowledgment"}
                                      </span>
                                      {d.status === "fully_signed" && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Signed</Badge>}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Button size="sm" variant="ghost" className={`h-7 px-2 ${isContract ? "text-blue-600" : "text-amber-600"}`} onClick={() => setLegalDocToView(d)} title="View document">
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-700" onClick={() => setVoidDoc(d)} title="Void document">
                                        <Ban className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Engine Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditEngine(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[#e20404]" /> Edit Engine
            </DialogTitle>
          </DialogHeader>
          {editEngine && (
            <div className="space-y-4 py-2">
              <div>
                <Label>EED ID</Label>
                <Input value={editEngine.eed_id || ""} onChange={e => setEditEngine({ ...editEngine, eed_id: e.target.value })} className="mt-1 font-mono" />
              </div>
              <div>
                <Label>Engine Serial Number *</Label>
                <Input value={editEngine.engine_serial_number || ""} onChange={e => setEditEngine({ ...editEngine, engine_serial_number: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Engine Platform</Label>
                <Select value={editEngine.platform_id || ""} onValueChange={v => setEditEngine({ ...editEngine, platform_id: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select platform..." /></SelectTrigger>
                  <SelectContent>
                    {platforms.map(p => (
                      <SelectItem key={p.id} value={p.id}>{getPlatformLabel(p)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Current Stage</Label>
                <Select value={editEngine.current_stage || "stock"} onValueChange={v => setEditEngine({ ...editEngine, current_stage: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STAGE_LABELS).map(([val, lbl]) => (
                      <SelectItem key={val} value={val}>{lbl}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={editEngine.notes || ""} onChange={e => setEditEngine({ ...editEngine, notes: e.target.value })} className="mt-1" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditOpen(false); setEditEngine(null); }}>Cancel</Button>
            <Button
              className="bg-[#e20404] hover:bg-[#c00303] text-white"
              disabled={updateMutation.isPending || !editEngine}
              onClick={() => updateMutation.mutate({
                id: editEngine.id,
                data: {
                  eed_id: editEngine.eed_id,
                  engine_serial_number: editEngine.engine_serial_number,
                  platform_id: editEngine.platform_id,
                  current_stage: editEngine.current_stage || "stock",
                  notes: editEngine.notes || "",
                },
              })}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Engine Dialog */}
      <Dialog open={transferOpen} onOpenChange={(o) => { setTransferOpen(o); if (!o) { setTransferEngine(null); setTransferCustomerId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-[#e20404]" /> Transfer Engine
            </DialogTitle>
          </DialogHeader>
          {transferEngine && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p><span className="text-slate-500">Engine:</span> <span className="font-mono font-bold text-[#e20404]">{transferEngine.eed_id}</span> — {transferEngine.engine_serial_number}</p>
                <p className="text-xs text-slate-400 mt-1">Currently owned by {customer?.first_name} {customer?.last_name}</p>
              </div>
              <div>
                <Label>Transfer to Customer *</Label>
                <div className="mt-1">
                  <CustomerSearchSelect
                    customers={allCustomers.filter(c => c.id !== customerId)}
                    value={transferCustomerId}
                    onValueChange={setTransferCustomerId}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTransferOpen(false); setTransferEngine(null); setTransferCustomerId(""); }}>Cancel</Button>
            <Button
              className="bg-[#e20404] hover:bg-[#c00303] text-white"
              disabled={transferMutation.isPending || !transferCustomerId}
              onClick={() => transferMutation.mutate({ id: transferEngine.id, newCustomerId: transferCustomerId })}
            >
              {transferMutation.isPending ? "Transferring..." : "Transfer Engine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IllegalPartsViewModal
        open={!!legalDocToView}
        onClose={() => setLegalDocToView(null)}
        documentId={legalDocToView?.id}
      />

      {/* Void Document Confirmation */}
      <Dialog open={!!voidDoc} onOpenChange={(o) => { if (!o) setVoidDoc(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Ban className="w-5 h-5" /> Void Document
            </DialogTitle>
          </DialogHeader>
          {voidDoc && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-slate-600">
                Are you sure you want to void this {voidDoc.document_type === "contract_engine" ? "Contract Engine Agreement" : "Illegal Parts Acknowledgment"}?
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                Voiding cancels this document permanently. {voidDoc.status === "fully_signed" ? "This document is already fully signed — voiding it will invalidate the agreement." : "The customer will need to sign a new document if required."}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDoc(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={voidMutation.isPending}
              onClick={() => voidMutation.mutate({ id: voidDoc.id })}
            >
              {voidMutation.isPending ? "Voiding..." : "Void Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Engine Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[#e20404]" /> Register New Engine
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Engine Serial Number *</Label>
              <Input
                value={newEngine.engine_serial_number}
                onChange={e => setNewEngine({ ...newEngine, engine_serial_number: e.target.value })}
                placeholder="e.g. T708-123456"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Engine Platform *</Label>
              <Select value={newEngine.platform_id} onValueChange={v => setNewEngine({ ...newEngine, platform_id: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select platform..." />
                </SelectTrigger>
                <SelectContent>
                  {platforms.filter(p => p.status !== "archived").map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {getPlatformLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={newEngine.notes}
                onChange={e => setNewEngine({ ...newEngine, notes: e.target.value })}
                placeholder="Optional notes..."
                className="mt-1"
              />
            </div>
            {addOpen && allEngines.length >= 0 && (
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm">
                <span className="text-slate-500">Next EED ID: </span>
                <span className="font-mono font-bold text-[#e20404]">{getNextEedId()}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#e20404] hover:bg-[#c00303] text-white"
              onClick={handleAdd}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Registering..." : "Register Engine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}