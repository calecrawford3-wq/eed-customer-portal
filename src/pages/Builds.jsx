import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Trash2,
  Eye,
  Wrench,
  ChevronUp,
  ChevronDown,
  CheckCircle,
  Clock,
  ArrowRight,
  Receipt
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";
import EngineSelector from "@/components/EngineSelector";

const STATUS_OPTIONS = [
  { value: "queued", label: "Queued", color: "bg-slate-100 text-slate-700" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-700" },
  { value: "assembly", label: "Assembly", color: "bg-purple-100 text-purple-700" },
  { value: "testing", label: "Testing", color: "bg-amber-100 text-amber-700" },
  { value: "complete", label: "Complete", color: "bg-emerald-100 text-emerald-700" },
  { value: "shipped", label: "Shipped", color: "bg-gray-100 text-gray-700" },
];

const WORK_TAGS = [
  { value: "none", label: "No Tag", color: "bg-transparent text-slate-400 border border-slate-200" },
  { value: "cleaning", label: "Cleaning", color: "bg-cyan-100 text-cyan-700" },
  { value: "machining", label: "Machining", color: "bg-orange-100 text-orange-700" },
  { value: "waiting_on_parts", label: "Waiting on Parts", color: "bg-red-100 text-red-700" },
  { value: "assembling", label: "Assembling", color: "bg-green-100 text-green-700" },
  { value: "on_hold", label: "On Hold", color: "bg-gray-100 text-gray-700" },
];

const SPEC_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "stage_1", label: "Stage 1" },
  { value: "stage_2", label: "Stage 2" },
  { value: "stage_3", label: "Stage 3" },
  { value: "contract", label: "Contract" },
  { value: "custom", label: "Custom" },
];

export default function Builds() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBuild, setNewBuild] = useState({
    engine_serial_number: "",
    eed_id: "",
    customer_engine_id: "",
    build_number: "",
    platform_id: "",
    spec_sheet_id: "",
    customer_id: "",
    customer_name: "",
    application: "Microsprint",
    max_rpm: "",
    assembly_notes: ""
  });

  const queryClient = useQueryClient();

  const { data: builds = [], isLoading } = useQuery({
    queryKey: ["builds"],
    queryFn: () => base44.entities.EngineBuild.list("queue_position", 100),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const { data: specSheets = [] } = useQuery({
    queryKey: ["specSheets"],
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.EngineBuild.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["builds"] });
      setShowCreateDialog(false);
      setNewBuild({
        engine_serial_number: "",
        eed_id: "",
        customer_engine_id: "",
        build_number: "",
        platform_id: "",
        spec_sheet_id: "",
        customer_id: "",
        customer_name: "",
        application: "Microsprint",
        max_rpm: "",
        assembly_notes: ""
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EngineBuild.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["builds"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EngineBuild.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["builds"] }),
  });

  const handleCreate = () => {
    const queuedBuilds = builds.filter(b => ["queued", "in_progress", "assembly", "testing"].includes(b.status));
    const maxPosition = queuedBuilds.length > 0 ? Math.max(...queuedBuilds.map(b => b.queue_position || 0)) : 0;
    
    const selectedSpec = specSheets.find(s => s.id === newBuild.spec_sheet_id);
    createMutation.mutate({
      ...newBuild,
      eed_id: newBuild.eed_id || undefined,
      queue_position: maxPosition + 1,
      status: "queued",
      work_tag: "none",
      spec_sheet_version: selectedSpec?.version,
      max_rpm: newBuild.max_rpm ? parseInt(newBuild.max_rpm) : undefined
    });
  };

  const handleSetInProgress = async (build) => {
    await updateMutation.mutateAsync({
      id: build.id,
      data: { status: "in_progress" }
    });
  };

  const handleRemoveFromProgress = async (build) => {
    await updateMutation.mutateAsync({
      id: build.id,
      data: { status: "queued" }
    });
  };

  const handleWorkTagChange = async (build, tag) => {
    await updateMutation.mutateAsync({
      id: build.id,
      data: { work_tag: tag }
    });
  };

  const handleMarkComplete = async (build) => {
    await updateMutation.mutateAsync({
      id: build.id,
      data: { status: "complete", queue_position: null, completion_date: new Date().toISOString().split('T')[0] }
    });

    // Reorder remaining queue
    const remainingInQueue = builds
      .filter(b => b.id !== build.id && ["queued", "in_progress", "assembly", "testing"].includes(b.status))
      .sort((a, b) => (a.queue_position || 999) - (b.queue_position || 999));

    for (let i = 0; i < remainingInQueue.length; i++) {
      const newStatus = i === 0 ? "in_progress" : "queued";
      await updateMutation.mutateAsync({
        id: remainingInQueue[i].id,
        data: { queue_position: i + 1, status: newStatus }
      });
    }
  };

  const handleMoveUp = async (build) => {
    const currentPos = build.queue_position;
    if (currentPos <= 1) return;

    const buildAbove = builds.find(b => b.queue_position === currentPos - 1);
    if (buildAbove) {
      await updateMutation.mutateAsync({ id: buildAbove.id, data: { queue_position: currentPos } });
    }
    await updateMutation.mutateAsync({ 
      id: build.id, 
      data: { 
        queue_position: currentPos - 1,
        status: currentPos - 1 === 1 ? "in_progress" : "queued"
      } 
    });
    if (buildAbove && currentPos === 2) {
      await updateMutation.mutateAsync({ id: buildAbove.id, data: { status: "queued" } });
    }
  };

  const handleMoveDown = async (build) => {
    const currentPos = build.queue_position;
    const maxPos = Math.max(...builds.filter(b => b.queue_position).map(b => b.queue_position));
    if (currentPos >= maxPos) return;

    const buildBelow = builds.find(b => b.queue_position === currentPos + 1);
    if (buildBelow) {
      await updateMutation.mutateAsync({ 
        id: buildBelow.id, 
        data: { 
          queue_position: currentPos,
          status: currentPos === 1 ? "in_progress" : "queued"
        } 
      });
    }
    await updateMutation.mutateAsync({ 
      id: build.id, 
      data: { 
        queue_position: currentPos + 1,
        status: "queued"
      } 
    });
  };

  const handleConvertToInvoice = async (build) => {
    const customer = customers.find(c => c.id === build.customer_id);
    const invoice = await base44.entities.Invoice.create({
      invoice_number: `INV-${Date.now().toString().slice(-6)}`,
      customer_id: build.customer_id || "",
      build_id: build.id,
      status: "draft",
      issue_date: new Date().toISOString().split("T")[0],
      line_items: [],
      labor_items: [],
      payments: [],
      tax_rate: 0,
      amount_paid: 0,
      balance_due: 0,
      notes: `Engine build: ${build.engine_serial_number}${build.build_number ? ` (${build.build_number})` : ""}`,
    });
    toast.success("Invoice created!");
    navigate(`/InvoiceDetail?id=${invoice.id}`);
  };

  const getPlatformLabel = (pid) => {
    const p = platforms.find(pl => pl.id === pid);
    if (!p) return "Unknown";
    const years = p.year_range_start ? ` (${p.year_range_start}${p.year_range_end ? `–${p.year_range_end}` : "+"})` : "";
    return `${p.manufacturer} ${p.name}${years}`;
  };
  const getPlatformName = getPlatformLabel;
  const getCustomerName = (build) => {
    if (build.customer_id) {
      const c = customers.find(c => c.id === build.customer_id);
      if (c) return `${c.first_name} ${c.last_name}${c.company_name ? ` (${c.company_name})` : ""}`;
    }
    return build.customer_name || null;
  };
  const getSpecLabel = (id) => {
    const spec = specSheets.find(s => s.id === id);
    if (!spec) return "No Spec";
    return spec.custom_name || SPEC_TYPES.find(t => t.value === spec.spec_type)?.label || spec.spec_type;
  };

  const getQueueLabel = (position, status) => {
     if (status === "in_progress") return { label: "In Progress", color: "bg-blue-500 text-white" };
     if (position != null) {
       if (position === 1) return { label: "Next Up", color: "bg-amber-500 text-white" };
       return { label: `#${position} in Queue`, color: "bg-slate-200 text-slate-700" };
     }
     return { label: "Unqueued", color: "bg-slate-100 text-slate-600" };
   };

  const getWorkTagConfig = (tag) => WORK_TAGS.find(t => t.value === tag) || WORK_TAGS[0];

  const filteredBuilds = builds.filter(build => {
    const matchesSearch = 
      build.engine_serial_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      build.build_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      build.customer_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || build.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const queuedBuilds = filteredBuilds
    .filter(b => ["queued", "in_progress", "assembly", "testing"].includes(b.status))
    .sort((a, b) => (a.queue_position || Infinity) - (b.queue_position || Infinity));

  const completedBuilds = filteredBuilds
    .filter(b => ["complete", "shipped"].includes(b.status))
    .sort((a, b) => new Date(b.completion_date || 0) - new Date(a.completion_date || 0));

  const availableSpecs = specSheets.filter(s => s.platform_id === newBuild.platform_id && s.status === "active");

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Engine Builds</h1>
          <p className="text-slate-500 mt-1">Manage build queue and track progress</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white">
              <Plus className="w-4 h-4 mr-2" />
              New Build
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Engine Build</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Engine Serial Number *</Label>
                <Input
                  value={newBuild.engine_serial_number}
                  onChange={(e) => setNewBuild({ ...newBuild, engine_serial_number: e.target.value })}
                  placeholder="e.g., T708-123456"
                />
              </div>
              <div>
                <Label>Customer</Label>
                <CustomerSearchSelect
                  customers={customers}
                  value={newBuild.customer_id}
                  onValueChange={(v) => {
                    const c = customers.find(c => c.id === v);
                    setNewBuild({ ...newBuild, customer_id: v, customer_name: c ? `${c.first_name} ${c.last_name}` : "", customer_engine_id: "", eed_id: "", engine_serial_number: "" });
                  }}
                />
              </div>
              {newBuild.customer_id && (
                <EngineSelector
                  customerId={newBuild.customer_id}
                  value={newBuild.customer_engine_id || ""}
                  onChange={(engineId, engine) => {
                    const updates = { customer_engine_id: engineId };
                    if (engine) {
                      if (engine.eed_id) updates.eed_id = engine.eed_id;
                      if (engine.engine_serial_number) updates.engine_serial_number = engine.engine_serial_number;
                      if (engine.platform_id) updates.platform_id = engine.platform_id;
                    }
                    setNewBuild(prev => ({ ...prev, ...updates }));
                  }}
                  platforms={platforms}
                />
              )}
              <div>
                <Label>EED ID</Label>
                <Input
                  value={newBuild.eed_id || ""}
                  onChange={(e) => setNewBuild({ ...newBuild, eed_id: e.target.value })}
                  placeholder="e.g. EED1040"
                  className="font-mono"
                />
              </div>
              <div>
                <Label>Engine Platform *</Label>
                <Select
                  value={newBuild.platform_id}
                  onValueChange={(value) => setNewBuild({ ...newBuild, platform_id: value, spec_sheet_id: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map((platform) => {
                      const years = platform.year_range_start
                        ? ` (${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"})`
                        : "";
                      return (
                        <SelectItem key={platform.id} value={platform.id}>
                          {platform.manufacturer} {platform.name}{years}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {newBuild.platform_id && (
                <div>
                  <Label>Spec Sheet</Label>
                  <Select
                    value={newBuild.spec_sheet_id}
                    onValueChange={(value) => setNewBuild({ ...newBuild, spec_sheet_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select spec sheet" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSpecs.map((spec) => (
                        <SelectItem key={spec.id} value={spec.id}>
                          {spec.custom_name || SPEC_TYPES.find(t => t.value === spec.spec_type)?.label} v{spec.version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Max RPM</Label>
                <Input
                  type="number"
                  value={newBuild.max_rpm}
                  onChange={(e) => setNewBuild({ ...newBuild, max_rpm: e.target.value })}
                  placeholder="e.g., 15500"
                />
              </div>
              <div>
                <Label>Application</Label>
                <Input
                  value={newBuild.application}
                  onChange={(e) => setNewBuild({ ...newBuild, application: e.target.value })}
                  placeholder="e.g., Microsprint"
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={newBuild.assembly_notes}
                  onChange={(e) => setNewBuild({ ...newBuild, assembly_notes: e.target.value })}
                  placeholder="Build notes..."
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={!newBuild.engine_serial_number || !newBuild.platform_id}
                className="w-full bg-[#e20404] hover:bg-[#c00303]"
              >
                Add to Queue
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by serial, jobcard, or customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active Queue */}
          {queuedBuilds.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#e20404]" />
                Work Queue ({queuedBuilds.length})
              </h2>
              <div className="space-y-3">
                {queuedBuilds.map((build, index) => {
                  const queueInfo = getQueueLabel(build.queue_position || index + 1, build.status);
                  const statusInfo = STATUS_OPTIONS.find(s => s.value === build.status);
                  const workTagInfo = getWorkTagConfig(build.work_tag);
                  const isInProgress = build.status === "in_progress";
                  
                  return (
                    <Card key={build.id} className={`border-0 shadow-sm ${isInProgress ? 'ring-2 ring-[#e20404]' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleMoveUp(build)}
                                disabled={build.queue_position === 1}
                              >
                                <ChevronUp className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleMoveDown(build)}
                                disabled={build.queue_position === Math.max(...queuedBuilds.map(b => b.queue_position))}
                              >
                                <ChevronDown className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-lg">{build.engine_serial_number}</h3>
                                {build.eed_id && <span className="font-mono text-sm text-[#e20404] font-semibold">{build.eed_id}</span>}
                                <Badge className={queueInfo.color}>{queueInfo.label}</Badge>
                                {build.work_tag && build.work_tag !== "none" && (
                                  <Badge className={workTagInfo.color}>{workTagInfo.label}</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 flex-wrap">
                                <span>{getPlatformLabel(build.platform_id)}</span>
                                {getCustomerName(build) && (
                                  <>
                                    <span>•</span>
                                    <span>{getCustomerName(build)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <Select
                              value={build.work_tag || "none"}
                              onValueChange={(value) => handleWorkTagChange(build, value)}
                            >
                              <SelectTrigger className="w-36 h-8 text-xs">
                                <SelectValue placeholder="Work Tag" />
                              </SelectTrigger>
                              <SelectContent>
                                {WORK_TAGS.map((tag) => (
                                  <SelectItem key={tag.value} value={tag.value}>
                                    {tag.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {isInProgress ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRemoveFromProgress(build)}
                              >
                                Remove from Progress
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-blue-600 border-blue-600 hover:bg-blue-50"
                                onClick={() => handleSetInProgress(build)}
                              >
                                Set In Progress
                              </Button>
                            )}
                            <Link to={createPageUrl(`BuildDetail?id=${build.id}`)}>
                              <Button variant="outline" size="sm">
                                <Eye className="w-4 h-4 mr-1" />
                                View
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-emerald-600 border-emerald-600 hover:bg-emerald-50"
                              onClick={() => handleMarkComplete(build)}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Complete
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => deleteMutation.mutate(build.id)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Builds */}
          {completedBuilds.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                Completed ({completedBuilds.length})
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {completedBuilds.map((build) => {
                  const statusInfo = STATUS_OPTIONS.find(s => s.value === build.status);
                  
                  return (
                    <Card key={build.id} className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold">{build.engine_serial_number}</h3>
                              {build.eed_id && <span className="font-mono text-xs text-[#e20404] font-semibold">{build.eed_id}</span>}
                            </div>
                            <p className="text-sm text-slate-500">{getPlatformLabel(build.platform_id)}</p>

                            {getCustomerName(build) && (
                              <p className="text-sm text-slate-600 mt-1">{getCustomerName(build)}</p>
                            )}
                          </div>
                          <Badge className={statusInfo?.color}>{statusInfo?.label}</Badge>
                        </div>
                        <div className="mt-3 flex justify-between items-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => handleConvertToInvoice(build)}
                          >
                            <Receipt className="w-3.5 h-3.5 mr-1" /> Create Invoice
                          </Button>
                          <div className="flex items-center gap-1">
                            <Link to={createPageUrl(`BuildDetail?id=${build.id}`)}>
                              <Button variant="ghost" size="sm">
                                View <ArrowRight className="w-4 h-4 ml-1" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => {
                                if (window.confirm(`Delete build for ${build.engine_serial_number}? This cannot be undone.`)) {
                                  deleteMutation.mutate(build.id);
                                }
                              }}
                              title="Delete build"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {filteredBuilds.length === 0 && (
            <div className="text-center py-16">
              <Wrench className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-medium text-slate-900">No builds found</h3>
              <p className="text-slate-500 mt-1">Create a new build to get started</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}