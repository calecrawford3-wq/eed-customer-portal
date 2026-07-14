import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, User, Mail, Phone, MapPin, Building2, Edit, Wrench,
  ClipboardList, Receipt, Plus, Link2, Unlink, ExternalLink, Monitor, KeyRound, Cpu, Send
} from "lucide-react";
import CustomerPortalModal from "@/components/CustomerPortalModal";
import { formatPhone } from "@/lib/formatPhone";
import CustomerEnginesTab from "@/components/customer/CustomerEnginesTab";
import { toast } from "sonner";

export default function CustomerDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [assignBuildOpen, setAssignBuildOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  const { data: customerArr = [] } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => base44.entities.Customer.filter({ id }),
    enabled: !!id,
  });
  const customer = customerArr[0];

  const { data: builds = [] } = useQuery({
    queryKey: ["builds"],
    queryFn: () => base44.entities.EngineBuild.list("-created_date", 200),
  });

  const { data: estimates = [] } = useQuery({
    queryKey: ["estimates"],
    queryFn: () => base44.entities.Estimate.list("-created_date", 200),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list("-created_date", 200),
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Customer.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer", id] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      setEditOpen(false);
      toast.success("Customer updated");
    },
  });

  const updateBuildMutation = useMutation({
    mutationFn: ({ buildId, data }) => base44.entities.EngineBuild.update(buildId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["builds"] });
      setAssignBuildOpen(false);
      toast.success("Build assigned to customer");
    },
  });

  const handleSendPortalInvite = async () => {
    if (!customer?.email) {
      toast.error("Customer has no email address");
      return;
    }
    setSendingInvite(true);
    try {
      await base44.functions.invoke("sendPortalInvite", {
        customerId: id,
        customerEmail: customer.email,
        customerName: `${customer.first_name} ${customer.last_name}`,
      });
      toast.success(`Portal invite sent to ${customer.email}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to send portal invite");
    } finally {
      setSendingInvite(false);
    }
  };

  const customerBuilds = builds.filter(b => b.customer_id === id);
  const customerEstimates = estimates.filter(e => e.customer_id === id);
  const customerInvoices = invoices.filter(i => i.customer_id === id);
  const unassignedBuilds = builds.filter(b => !b.customer_id || b.customer_id === "");

  const getPlatformName = (pid) => platforms.find(p => p.id === pid)?.name || "Unknown";

  const totalInvoiced = customerInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = customerInvoices.reduce((s, i) => s + (i.amount_paid || 0), 0);
  const totalBalance = customerInvoices.reduce((s, i) => s + (i.balance_due || 0), 0);

  if (!customer) return (
    <div className="p-8 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-[#e20404] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/Customers"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{customer.first_name} {customer.last_name}</h1>
          {customer.company_name && <p className="text-slate-500">{customer.company_name}</p>}
        </div>
        <Badge className={customer.status === "active" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-100 text-slate-500 border-0"}>
          {customer.status}
        </Badge>
        <Button variant="outline" size="sm" onClick={() => window.open('/CustomerPortal', '_blank')}>
          <Monitor className="w-4 h-4 mr-1" /> View Portal
        </Button>
        <Button variant="outline" size="sm" onClick={handleSendPortalInvite} disabled={sendingInvite}>
          <Send className="w-4 h-4 mr-1" /> {sendingInvite ? "Sending..." : "Send Invite"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setTempPassword(customer.portal_temp_password || ""); setPasswordOpen(true); }}>
          <KeyRound className="w-4 h-4 mr-1" /> Portal Password
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setEditForm({ ...customer }); setEditOpen(true); }}>
          <Edit className="w-4 h-4 mr-1" /> Edit
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Total Invoiced</p>
            <p className="text-xl font-bold text-slate-900">${totalInvoiced.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Total Paid</p>
            <p className="text-xl font-bold text-emerald-600">${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Balance Due</p>
            <p className={`text-xl font-bold ${totalBalance > 0 ? "text-[#e20404]" : "text-slate-400"}`}>${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Engine Builds</p>
            <p className="text-xl font-bold text-slate-900">{customerBuilds.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Info */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Contact Info</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {customer.email && <div className="flex items-center gap-2 text-sm"><Mail className="w-4 h-4 text-slate-400" /><span>{customer.email}</span></div>}
            {customer.phone && <div className="flex items-center gap-2 text-sm"><Phone className="w-4 h-4 text-slate-400" /><span>{customer.phone}</span></div>}
            {customer.address_line1 && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p>{customer.address_line1}</p>
                  {customer.address_line2 && <p>{customer.address_line2}</p>}
                  {customer.city && <p>{customer.city}, {customer.state} {customer.zip}</p>}
                  {customer.country && <p>{customer.country}</p>}
                </div>
              </div>
            )}
            {customer.notes && (
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-400 mb-1">Notes</p>
                <p className="text-sm text-slate-600">{customer.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs for related records */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="engines">
            <TabsList className="mb-4">
              <TabsTrigger value="engines">Engines</TabsTrigger>
              <TabsTrigger value="builds">Builds ({customerBuilds.length})</TabsTrigger>
              <TabsTrigger value="estimates">Estimates ({customerEstimates.length})</TabsTrigger>
              <TabsTrigger value="invoices">Invoices ({customerInvoices.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="engines">
              <CustomerEnginesTab customerId={id} customer={customer} platforms={platforms} />
            </TabsContent>

            <TabsContent value="builds">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-slate-500">Engine builds for this customer</span>
                <Button size="sm" variant="outline" onClick={() => setAssignBuildOpen(true)}>
                  <Link2 className="w-3.5 h-3.5 mr-1" /> Assign Build
                </Button>
              </div>
              {customerBuilds.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Wrench className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>No builds assigned</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customerBuilds.map(b => (
                    <Card key={b.id} className="border-0 shadow-sm">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{b.engine_serial_number}</p>
                          <p className="text-xs text-slate-500">{getPlatformName(b.platform_id)}{b.build_number ? ` · ${b.build_number}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="text-xs bg-slate-100 text-slate-700 border-0">{b.status}</Badge>
                          <Link to={`/BuildDetail?id=${b.id}`}>
                            <Button size="sm" variant="ghost" className="h-7 px-2"><ExternalLink className="w-3.5 h-3.5" /></Button>
                          </Link>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400" title="Unassign" onClick={() => updateBuildMutation.mutate({ buildId: b.id, data: { customer_id: "", customer_name: "" } })}>
                            <Unlink className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="estimates">
              <div className="flex justify-end mb-3">
                <Link to={`/EstimateDetail?new=1&customer_id=${id}`}>
                  <Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1" /> New Estimate</Button>
                </Link>
              </div>
              {customerEstimates.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>No estimates</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customerEstimates.map(e => (
                    <Card key={e.id} className="border-0 shadow-sm">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{e.estimate_number}</p>
                          <p className="text-xs text-slate-500">{e.issue_date} · ${Number(e.total || 0).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="text-xs bg-slate-100 text-slate-700 border-0 capitalize">{e.status}</Badge>
                          <Link to={`/EstimateDetail?id=${e.id}`}>
                            <Button size="sm" variant="ghost" className="h-7 px-2"><ExternalLink className="w-3.5 h-3.5" /></Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="invoices">
              <div className="flex justify-end mb-3">
                <Link to={`/InvoiceDetail?new=1&customer_id=${id}`}>
                  <Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1" /> New Invoice</Button>
                </Link>
              </div>
              {customerInvoices.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>No invoices</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customerInvoices.map(inv => (
                    <Card key={inv.id} className="border-0 shadow-sm">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{inv.invoice_number}</p>
                          <p className="text-xs text-slate-500">{inv.issue_date} · ${Number(inv.total || 0).toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs border-0 capitalize ${inv.status === "paid" ? "bg-emerald-100 text-emerald-700" : inv.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>{inv.status}</Badge>
                          <Link to={`/InvoiceDetail?id=${inv.id}`}>
                            <Button size="sm" variant="ghost" className="h-7 px-2"><ExternalLink className="w-3.5 h-3.5" /></Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <CustomerPortalModal
        open={portalOpen}
        onClose={() => setPortalOpen(false)}
        customer={customer}
        estimates={customerEstimates}
        invoices={customerInvoices}
        builds={customerBuilds}
      />

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div><Label>First Name</Label><Input value={editForm.first_name || ""} onChange={e => setEditForm({ ...editForm, first_name: e.target.value })} /></div>
            <div><Label>Last Name</Label><Input value={editForm.last_name || ""} onChange={e => setEditForm({ ...editForm, last_name: e.target.value })} /></div>
            <div><Label>Company</Label><Input value={editForm.company_name || ""} onChange={e => setEditForm({ ...editForm, company_name: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={editForm.email || ""} onChange={e => setEditForm({ ...editForm, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={editForm.phone || ""} onChange={e => setEditForm({ ...editForm, phone: formatPhone(e.target.value) })} placeholder="(999) 999-9999" /></div>
            <div>
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Address</Label><Input value={editForm.address_line1 || ""} onChange={e => setEditForm({ ...editForm, address_line1: e.target.value })} /></div>
            <div><Label>City</Label><Input value={editForm.city || ""} onChange={e => setEditForm({ ...editForm, city: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>State</Label><Input value={editForm.state || ""} onChange={e => setEditForm({ ...editForm, state: e.target.value })} /></div>
              <div><Label>ZIP</Label><Input value={editForm.zip || ""} onChange={e => setEditForm({ ...editForm, zip: e.target.value })} /></div>
            </div>
            <div className="col-span-2"><Label>Country</Label><Input value={editForm.country || ""} onChange={e => setEditForm({ ...editForm, country: e.target.value })} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={editForm.notes || ""} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Portal Password Dialog */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Portal Password</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-500">
              Set a temporary password for <span className="font-medium text-slate-700">{customer.first_name} {customer.last_name}</span> to access the customer portal. Share this with the customer directly.
            </p>
            {customer.portal_temp_password && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
                Current password: <span className="font-mono font-bold">{customer.portal_temp_password}</span>
              </div>
            )}
            <div>
              <Label>New Temporary Password</Label>
              <Input
                className="mt-1 font-mono"
                value={tempPassword}
                onChange={e => setTempPassword(e.target.value)}
                placeholder="e.g. EliteAccess2024"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-slate-500"
                onClick={() => {
                  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
                  setTempPassword(random);
                }}
              >
                Generate
              </Button>
              {customer.portal_temp_password && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-500 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    updateMutation.mutate({ portal_temp_password: "" });
                    setPasswordOpen(false);
                  }}
                >
                  Clear Password
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#e20404] hover:bg-[#c00303] text-white"
              disabled={!tempPassword || updateMutation.isPending}
              onClick={() => {
                updateMutation.mutate({ portal_temp_password: tempPassword });
                setPasswordOpen(false);
              }}
            >
              Save Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Build Dialog */}
      <Dialog open={assignBuildOpen} onOpenChange={setAssignBuildOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Assign Engine Build</DialogTitle></DialogHeader>
          {unassignedBuilds.length === 0 ? (
            <p className="text-slate-500 text-sm py-4">No unassigned builds available.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto py-2">
              {unassignedBuilds.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{b.engine_serial_number}</p>
                    <p className="text-xs text-slate-500">{getPlatformName(b.platform_id)}</p>
                  </div>
                  <Button size="sm" onClick={() => updateBuildMutation.mutate({
                    buildId: b.id,
                    data: { customer_id: id, customer_name: `${customer.first_name} ${customer.last_name}` }
                  })}>
                    Assign
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}