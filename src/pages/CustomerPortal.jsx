import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Receipt, ClipboardList, Wrench, DollarSign, Download, RefreshCw,
  User, LogOut, CheckCircle, Clock, ChevronRight, FileText, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import PrintableBuildSheet from "@/components/PrintableBuildSheet";

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-400",
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-slate-100 text-slate-400",
  queued: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  assembly: "bg-purple-100 text-purple-700",
  testing: "bg-amber-100 text-amber-700",
  complete: "bg-emerald-100 text-emerald-700",
  shipped: "bg-teal-100 text-teal-700",
};

const BUILD_PROGRESS = {
  queued: 10,
  in_progress: 35,
  assembly: 60,
  testing: 85,
  complete: 100,
  shipped: 100,
};

export default function CustomerPortal() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [refreshBuild, setRefreshBuild] = useState(null);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [printBuild, setPrintBuild] = useState(null);
  const qc = useQueryClient();

  // Auth check
  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const me = await base44.auth.me();
        setUser(me);
      }
      setAuthChecked(true);
    });
  }, []);

  // Find customer record by email
  const { data: allCustomers = [] } = useQuery({
    queryKey: ["portal-customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 500),
    enabled: !!user,
  });

  useEffect(() => {
    if (user && allCustomers.length > 0) {
      const found = allCustomers.find(c => c.email?.toLowerCase() === user.email?.toLowerCase());
      if (found) {
        setCustomer(found);
        setProfileForm({ ...found });
      }
    }
  }, [user, allCustomers]);

  const { data: estimates = [] } = useQuery({
    queryKey: ["portal-estimates", customer?.id],
    queryFn: () => base44.entities.Estimate.filter({ customer_id: customer.id }),
    enabled: !!customer,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["portal-invoices", customer?.id],
    queryFn: () => base44.entities.Invoice.filter({ customer_id: customer.id }),
    enabled: !!customer,
  });

  const { data: builds = [] } = useQuery({
    queryKey: ["portal-builds", customer?.id],
    queryFn: () => base44.entities.EngineBuild.filter({ customer_id: customer.id }),
    enabled: !!customer,
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
    enabled: !!customer,
  });

  const { data: specSheets = [] } = useQuery({
    queryKey: ["specSheets"],
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 100),
    enabled: !!customer,
  });

  const { data: refreshRequests = [] } = useQuery({
    queryKey: ["portal-refresh-requests", customer?.id],
    queryFn: () => base44.entities.RefreshRequest.filter({ customer_id: customer.id }),
    enabled: !!customer,
  });

  const profileMutation = useMutation({
    mutationFn: (data) => base44.entities.Customer.update(customer.id, data),
    onSuccess: (updated) => {
      setCustomer(updated);
      qc.invalidateQueries({ queryKey: ["portal-customers"] });
      setProfileOpen(false);
      toast.success("Profile updated");
    },
  });

  const refreshMutation = useMutation({
    mutationFn: (data) => base44.entities.RefreshRequest.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-refresh-requests", customer.id] });
      setRefreshOpen(false);
      setRefreshMessage("");
      setRefreshBuild(null);
      toast.success("Refresh request submitted! We'll be in touch soon.");
    },
  });

  const handleRequestRefresh = (build) => {
    setRefreshBuild(build);
    setRefreshMessage("");
    setRefreshOpen(true);
  };

  const submitRefresh = () => {
    if (!refreshBuild) return;
    refreshMutation.mutate({
      customer_id: customer.id,
      build_id: refreshBuild.id,
      customer_name: `${customer.first_name} ${customer.last_name}`,
      build_serial: refreshBuild.engine_serial_number,
      message: refreshMessage,
      status: "pending",
      requested_date: new Date().toISOString().split("T")[0],
    });
  };

  const handlePrintBuildSheet = (build) => {
    setPrintBuild(build);
    setTimeout(() => window.print(), 300);
  };

  // Tax year summary
  const currentYear = new Date().getFullYear();
  const yearlyInvoices = invoices.filter(i => i.issue_date?.startsWith(String(currentYear)));
  const yearTotal = yearlyInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const yearPaid = yearlyInvoices.reduce((s, i) => s + (i.amount_paid || 0), 0);

  const totalBalance = invoices.reduce((s, i) => s + (i.balance_due || 0), 0);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#e20404] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardContent className="p-8 text-center">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png"
              alt="Elite Engine Development"
              className="h-14 mx-auto mb-6"
            />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Customer Portal</h1>
            <p className="text-slate-500 mb-6">Sign in to view your builds, invoices, and estimates.</p>
            <Button
              className="w-full bg-[#e20404] hover:bg-[#c00303] text-white"
              onClick={() => base44.auth.redirectToLogin(window.location.href)}
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">No Account Found</h2>
            <p className="text-slate-500 mb-4">
              We couldn't find a customer account linked to <strong>{user.email}</strong>. Please contact us to set up your portal access.
            </p>
            <Button variant="outline" onClick={() => base44.auth.logout()}>Sign Out</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Print-only build sheet */}
      {printBuild && (
        <div className="hidden print:block">
          <PrintableBuildSheet
            build={printBuild}
            platform={platforms.find(p => p.id === printBuild.platform_id)}
            specSheet={specSheets.find(s => s.id === printBuild.spec_sheet_id)}
          />
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 print:hidden">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png"
            alt="Elite Engine Development"
            className="h-10"
          />
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setProfileForm({ ...customer }); setProfileOpen(true); }}>
              <User className="w-4 h-4 mr-1" /> {customer.first_name} {customer.last_name}
            </Button>
            <Button variant="outline" size="sm" onClick={() => base44.auth.logout()}>
              <LogOut className="w-4 h-4 mr-1" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 print:hidden">
        {/* Welcome + Summary */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {customer.first_name}!</h1>
          <p className="text-slate-500 mt-1">Your engine build & service history</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-blue-100 p-2 rounded-lg"><Receipt className="w-4 h-4 text-blue-600" /></div>
                <span className="text-sm text-slate-500">Total Invoiced</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">
                ${invoices.reduce((s, i) => s + (i.total || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-white">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-emerald-100 p-2 rounded-lg"><CheckCircle className="w-4 h-4 text-emerald-600" /></div>
                <span className="text-sm text-slate-500">Total Paid</span>
              </div>
              <p className="text-2xl font-bold text-emerald-700">
                ${invoices.reduce((s, i) => s + (i.amount_paid || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
          <Card className={`border-0 shadow-sm ${totalBalance > 0 ? "bg-red-50" : "bg-white"}`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className={`${totalBalance > 0 ? "bg-red-100" : "bg-slate-100"} p-2 rounded-lg`}>
                  <DollarSign className={`w-4 h-4 ${totalBalance > 0 ? "text-red-500" : "text-slate-500"}`} />
                </div>
                <span className="text-sm text-slate-500">Balance Due</span>
              </div>
              <p className={`text-2xl font-bold ${totalBalance > 0 ? "text-[#e20404]" : "text-slate-400"}`}>
                ${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="builds">
          <TabsList className="mb-6">
            <TabsTrigger value="builds">Engine Builds ({builds.length})</TabsTrigger>
            <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
            <TabsTrigger value="estimates">Estimates ({estimates.length})</TabsTrigger>
            <TabsTrigger value="tax">Tax Statement</TabsTrigger>
          </TabsList>

          {/* ─── Builds ─── */}
          <TabsContent value="builds">
            {builds.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Wrench className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No engine builds on record</p>
              </div>
            ) : (
              <div className="space-y-4">
                {builds.map(b => {
                  const platform = platforms.find(p => p.id === b.platform_id);
                  const progress = BUILD_PROGRESS[b.status] || 0;
                  const isActive = !["complete", "shipped"].includes(b.status);
                  const existingRequest = refreshRequests.find(r => r.build_id === b.id && r.status === "pending");
                  return (
                    <Card key={b.id} className="border-0 shadow-sm bg-white">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-bold text-slate-900">{b.engine_serial_number}</p>
                              <Badge className={`text-xs border-0 capitalize ${STATUS_COLORS[b.status] || "bg-slate-100 text-slate-600"}`}>
                                {b.status?.replace("_", " ")}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-500">
                              {platform ? `${platform.manufacturer} ${platform.name}` : ""}
                              {b.application ? ` · ${b.application}` : ""}
                              {b.build_number ? ` · Jobcard: ${b.build_number}` : ""}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePrintBuildSheet(b)}
                            >
                              <Download className="w-3.5 h-3.5 mr-1" /> Build Sheet
                            </Button>
                            {(b.status === "complete" || b.status === "shipped") && (
                              existingRequest ? (
                                <Button size="sm" variant="outline" disabled className="text-amber-600 border-amber-200">
                                  <Clock className="w-3.5 h-3.5 mr-1" /> Request Pending
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-[#e20404] text-[#e20404] hover:bg-red-50"
                                  onClick={() => handleRequestRefresh(b)}
                                >
                                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Request Refresh
                                </Button>
                              )
                            )}
                          </div>
                        </div>

                        {/* Progress bar for active builds */}
                        {isActive && (
                          <div className="mt-3">
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                              <span>Build Progress</span>
                              <span>{progress}%</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#e20404] rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-xs text-slate-300 mt-1">
                              {["Queued", "In Progress", "Assembly", "Testing", "Complete"].map(s => (
                                <span key={s}>{s}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Key specs */}
                        {(b.max_rpm || b.oil_recommendation || b.refresh_interval) && (
                          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3">
                            {b.max_rpm && (
                              <div>
                                <p className="text-xs text-slate-400">Max RPM</p>
                                <p className="text-sm font-semibold">{b.max_rpm?.toLocaleString()}</p>
                              </div>
                            )}
                            {b.oil_recommendation && (
                              <div>
                                <p className="text-xs text-slate-400">Recommended Oil</p>
                                <p className="text-sm font-semibold">{b.oil_recommendation}</p>
                              </div>
                            )}
                            {b.refresh_interval && (
                              <div>
                                <p className="text-xs text-slate-400">Refresh Interval</p>
                                <p className="text-sm font-semibold">{b.refresh_interval}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ─── Invoices ─── */}
          <TabsContent value="invoices">
            {invoices.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Receipt className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No invoices on record</p>
              </div>
            ) : (
              <div className="space-y-3">
                {invoices.map(inv => (
                  <div key={inv.id} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center justify-between shadow-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{inv.invoice_number}</p>
                      <p className="text-sm text-slate-500">
                        {inv.issue_date} · Total: <strong>${Number(inv.total || 0).toFixed(2)}</strong>
                        {inv.amount_paid > 0 && <span className="text-emerald-600 ml-2">· Paid: ${Number(inv.amount_paid).toFixed(2)}</span>}
                        {Number(inv.balance_due) > 0 && <span className="text-[#e20404] ml-2">· Due: ${Number(inv.balance_due).toFixed(2)}</span>}
                      </p>
                      {/* Payment history */}
                      {(inv.payments || []).length > 0 && (
                        <div className="mt-2 space-y-1">
                          {inv.payments.map((p, i) => (
                            <span key={i} className="text-xs bg-emerald-50 text-emerald-700 rounded px-2 py-0.5 mr-1">
                              ${Number(p.amount).toFixed(2)} {p.method} {p.date}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Badge className={`text-xs border-0 capitalize ${STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-600"}`}>
                      {inv.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Estimates ─── */}
          <TabsContent value="estimates">
            {estimates.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No estimates on record</p>
              </div>
            ) : (
              <div className="space-y-3">
                {estimates.map(est => (
                  <div key={est.id} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center justify-between shadow-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{est.estimate_number}</p>
                      <p className="text-sm text-slate-500">
                        {est.issue_date} · ${Number(est.total || 0).toFixed(2)}
                        {est.is_engine_build && <span className="ml-2 text-purple-600">· Engine Build</span>}
                        {est.expiry_date && <span className="ml-2">· Expires: {est.expiry_date}</span>}
                      </p>
                      {/* Line items summary */}
                      {(est.line_items || []).filter(l => l.item_name).slice(0, 3).map((l, i) => (
                        <p key={i} className="text-xs text-slate-400 mt-1">
                          {l.item_name} × {l.quantity} — ${Number(l.total || 0).toFixed(2)}
                        </p>
                      ))}
                    </div>
                    <Badge className={`text-xs border-0 capitalize ${STATUS_COLORS[est.status] || "bg-slate-100 text-slate-600"}`}>
                      {est.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Tax Statement ─── */}
          <TabsContent value="tax">
            <Card className="border-0 shadow-sm bg-white">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4" /> {currentYear} Tax Statement
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={() => window.print()}>
                    <Download className="w-3.5 h-3.5 mr-1" /> Download / Print
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border border-slate-200 rounded-lg p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <img
                        src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png"
                        alt="Elite Engine Development"
                        className="h-10 mb-2"
                      />
                      <p className="text-xs text-slate-500">Elite Engine Development</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Statement Period</p>
                      <p className="font-semibold">Jan 1 – Dec 31, {currentYear}</p>
                    </div>
                  </div>
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-700">Customer</p>
                    <p className="text-slate-900">{customer.first_name} {customer.last_name}</p>
                    {customer.company_name && <p className="text-slate-500 text-sm">{customer.company_name}</p>}
                    {customer.email && <p className="text-slate-500 text-sm">{customer.email}</p>}
                  </div>
                  <table className="w-full text-sm mb-4">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 font-medium text-slate-600">Invoice #</th>
                        <th className="text-left py-2 font-medium text-slate-600">Date</th>
                        <th className="text-right py-2 font-medium text-slate-600">Amount</th>
                        <th className="text-right py-2 font-medium text-slate-600">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyInvoices.map(inv => (
                        <tr key={inv.id} className="border-b border-slate-100">
                          <td className="py-2">{inv.invoice_number}</td>
                          <td className="py-2 text-slate-500">{inv.issue_date}</td>
                          <td className="py-2 text-right">${Number(inv.total || 0).toFixed(2)}</td>
                          <td className="py-2 text-right text-emerald-600">${Number(inv.amount_paid || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 font-bold">
                        <td className="py-2" colSpan={2}>Total</td>
                        <td className="py-2 text-right">${yearTotal.toFixed(2)}</td>
                        <td className="py-2 text-right text-emerald-600">${yearPaid.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="text-xs text-slate-400">This statement is for informational purposes only. Please consult your tax professional.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div><Label>First Name</Label><Input value={profileForm.first_name || ""} onChange={e => setProfileForm({ ...profileForm, first_name: e.target.value })} /></div>
            <div><Label>Last Name</Label><Input value={profileForm.last_name || ""} onChange={e => setProfileForm({ ...profileForm, last_name: e.target.value })} /></div>
            <div className="col-span-2"><Label>Email Address</Label><Input type="email" value={profileForm.email || ""} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={profileForm.phone || ""} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} /></div>
            <div><Label>Company</Label><Input value={profileForm.company_name || ""} onChange={e => setProfileForm({ ...profileForm, company_name: e.target.value })} /></div>
            <div className="col-span-2"><Label>Address</Label><Input value={profileForm.address_line1 || ""} onChange={e => setProfileForm({ ...profileForm, address_line1: e.target.value })} /></div>
            <div><Label>City</Label><Input value={profileForm.city || ""} onChange={e => setProfileForm({ ...profileForm, city: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>State</Label><Input value={profileForm.state || ""} onChange={e => setProfileForm({ ...profileForm, state: e.target.value })} /></div>
              <div><Label>ZIP</Label><Input value={profileForm.zip || ""} onChange={e => setProfileForm({ ...profileForm, zip: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => profileMutation.mutate(profileForm)} disabled={profileMutation.isPending}>
              {profileMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refresh Request Dialog */}
      <Dialog open={refreshOpen} onOpenChange={setRefreshOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-[#e20404]" /> Request Engine Refresh
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            {refreshBuild && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-700">{refreshBuild.engine_serial_number}</p>
                <p className="text-xs text-slate-500">{refreshBuild.application || ""}</p>
              </div>
            )}
            <div>
              <Label>Tell us about your engine's current condition (optional)</Label>
              <Textarea
                value={refreshMessage}
                onChange={e => setRefreshMessage(e.target.value)}
                rows={4}
                placeholder="e.g. Completed 20 race hours, noticed slight oil consumption, looking to refresh for next season..."
                className="mt-1"
              />
            </div>
            <p className="text-xs text-slate-400">We'll review your request and reach out with an estimate for the refresh service.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefreshOpen(false)}>Cancel</Button>
            <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={submitRefresh} disabled={refreshMutation.isPending}>
              {refreshMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}