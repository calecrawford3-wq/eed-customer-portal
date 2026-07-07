import React, { useState, useEffect, useRef } from "react";
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
  User, LogOut, CheckCircle, Clock, ChevronRight, FileText, AlertTriangle, Cpu,
  Award, TrendingUp, TrendingDown
} from "lucide-react";
import { toast } from "sonner";
import PrintableBuildSheet from "@/components/PrintableBuildSheet";
import PrintableInvoice from "@/components/PrintableInvoice";

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
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [refreshBuild, setRefreshBuild] = useState(null);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [printBuild, setPrintBuild] = useState(null);
  const [detailInvoice, setDetailInvoice] = useState(null);
  const [printInvoice, setPrintInvoice] = useState(false);
  const invoicePdfRef = useRef(null);
  const qc = useQueryClient();

  const handlePrintInvoice = () => {
    if (detailInvoice?.is_legacy && detailInvoice?.legacy_pdf_url) {
      if (invoicePdfRef.current?.contentWindow) {
        try { invoicePdfRef.current.contentWindow.print(); return; } catch (e) { /* fall through */ }
      }
      window.open(detailInvoice.legacy_pdf_url, "_blank");
      return;
    }
    setPrintInvoice(true);
    setTimeout(() => window.print(), 300);
  };

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
  const { data: allCustomers = [], isLoading: customersLoading } = useQuery({
    queryKey: ["portal-customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 500),
    enabled: !!user,
  });

  useEffect(() => {
    if (user && allCustomers.length > 0) {
      if (user.role === "admin") {
        // Admins can see any customer — default to first or leave unset for picker
        return;
      }
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

  const { data: customerEngines = [] } = useQuery({
    queryKey: ["portal-engines", customer?.id],
    queryFn: () => base44.entities.CustomerEngine.filter({ customer_id: customer.id }),
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

  const { data: credits = [] } = useQuery({
    queryKey: ["portal-credits", customer?.id],
    queryFn: () => base44.entities.AccountCredit.filter({ customer_id: customer.id }),
    enabled: !!customer,
  });

  const { data: settingsData = [] } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.filter({ key: "global" }),
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

  if (customersLoading && !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#e20404] rounded-full animate-spin" />
      </div>
    );
  }

  if (!customer && user?.role !== "admin") {
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

  // Password gate for non-admin customers with a temp password set
  if (customer && user?.role !== "admin" && customer.portal_temp_password && !passwordVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardContent className="p-8">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png"
              alt="Elite Engine Development"
              className="h-12 mx-auto mb-6"
            />
            <h2 className="text-xl font-bold text-slate-900 text-center mb-1">Portal Access</h2>
            <p className="text-slate-500 text-center text-sm mb-6">Enter your access password to continue</p>
            <div className="space-y-3">
              <Input
                type="password"
                placeholder="Access password"
                value={passwordInput}
                onChange={e => { setPasswordInput(e.target.value); setPasswordError(false); }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if (passwordInput === customer.portal_temp_password) {
                      setPasswordVerified(true);
                    } else {
                      setPasswordError(true);
                    }
                  }
                }}
                className={passwordError ? "border-red-400" : ""}
              />
              {passwordError && <p className="text-sm text-red-500">Incorrect password. Please try again.</p>}
              <Button
                className="w-full bg-[#e20404] hover:bg-[#c00303] text-white"
                onClick={() => {
                  if (passwordInput === customer.portal_temp_password) {
                    setPasswordVerified(true);
                  } else {
                    setPasswordError(true);
                  }
                }}
              >
                Continue
              </Button>
              <Button variant="ghost" className="w-full text-slate-400" onClick={() => base44.auth.logout()}>
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!customer && user?.role === "admin") {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png"
              alt="Elite Engine Development"
              className="h-10"
            />
            <span className="text-sm text-slate-500">Admin — Customer Portal Preview</span>
          </div>
        </header>
        <div className="max-w-5xl mx-auto px-6 py-12">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Select a Customer to Preview</h2>
          <p className="text-slate-500 mb-6">As an admin, you can view the portal as any customer.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allCustomers.filter(c => c.status === "active").sort((a, b) => a.last_name?.localeCompare(b.last_name)).map(c => (
              <button
                key={c.id}
                className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-[#e20404] hover:shadow-sm transition-all"
                onClick={() => { setCustomer(c); setProfileForm({ ...c }); }}
              >
                <p className="font-semibold text-slate-900">{c.first_name} {c.last_name}</p>
                {c.company_name && <p className="text-sm text-slate-500">{c.company_name}</p>}
                <p className="text-xs text-slate-400 mt-1">{c.email}</p>
              </button>
            ))}
          </div>
        </div>
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

      {/* Print-only invoice */}
      {printInvoice && detailInvoice && (
        <div className="hidden print:block">
          <PrintableInvoice
            invoice={detailInvoice}
            customer={customer}
            settings={settingsData?.[0]}
            customerEngine={customerEngines.find(e => e.id === detailInvoice.customer_engine_id)}
            platform={platforms.find(p => p.id === customerEngines.find(e => e.id === detailInvoice.customer_engine_id)?.platform_id)}
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
            {user?.role !== "admin" && (
              <Button variant="ghost" size="sm" onClick={() => { setProfileForm({ ...customer }); setProfileOpen(true); }}>
                <User className="w-4 h-4 mr-1" /> {customer.first_name} {customer.last_name}
              </Button>
            )}
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" onClick={() => setCustomer(null)}>
                <User className="w-4 h-4 mr-1" /> Switch Customer
              </Button>
            )}
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

        <Tabs defaultValue="engines">
          <TabsList className="mb-6">
            <TabsTrigger value="engines">My Engines ({customerEngines.length})</TabsTrigger>
            <TabsTrigger value="builds">Engine Builds ({builds.length})</TabsTrigger>
            <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
            <TabsTrigger value="estimates">Estimates ({estimates.length})</TabsTrigger>
            <TabsTrigger value="credits">Credits</TabsTrigger>
            <TabsTrigger value="tax">Tax Statement</TabsTrigger>
          </TabsList>

          {/* ─── My Engines ─── */}
          <TabsContent value="engines">
            {customerEngines.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Cpu className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No engines registered</p>
              </div>
            ) : (
              <div className="space-y-4">
                {customerEngines.map(engine => {
                  const platform = platforms.find(p => p.id === engine.platform_id);
                  const engineBuilds = builds
                    .filter(b => b.engine_serial_number === engine.engine_serial_number)
                    .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
                  const engineInvoices = invoices.filter(inv =>
                    engineBuilds.some(b => b.id === inv.build_id) ||
                    inv.customer_engine_id === engine.id
                  );
                  return (
                    <Card key={engine.id} className="border-0 shadow-sm bg-white">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-bold text-[#e20404] text-lg">{engine.eed_id}</span>
                              <span className="text-slate-600">{engine.engine_serial_number}</span>
                            </div>
                            <p className="text-sm text-slate-500">
                              {platform ? `${platform.manufacturer} ${platform.name}` : ""}
                              {platform?.year_range_start ? ` (${platform.year_range_start}${platform.year_range_end ? `–${platform.year_range_end}` : "+"})` : ""}
                            </p>
                          </div>
                        </div>

                        {/* Builds for this engine - show build sheet only */}
                        {engineBuilds.length > 0 && (
                          <div className="border-t border-slate-100 pt-4 mb-4">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Build History</p>
                            <div className="space-y-2">
                              {engineBuilds.map(b => {
                                const progress = BUILD_PROGRESS[b.status] || 0;
                                const isActive = !["complete", "shipped"].includes(b.status);
                                return (
                                  <div key={b.id} className="bg-slate-50 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <div>
                                        <span className="text-sm font-medium">{b.build_number || b.engine_serial_number}</span>
                                        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status] || "bg-slate-100 text-slate-600"}`}>
                                          {b.status?.replace("_", " ")}
                                        </span>
                                        {b.completion_date && <span className="ml-2 text-xs text-slate-400">{b.completion_date}</span>}
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        onClick={() => handlePrintBuildSheet(b)}
                                      >
                                        <Download className="w-3 h-3 mr-1" /> Build Sheet
                                      </Button>
                                    </div>
                                    {isActive && (
                                      <div>
                                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                          <div className="h-full bg-[#e20404] rounded-full" style={{ width: `${progress}%` }} />
                                        </div>
                                      </div>
                                    )}
                                    {(b.max_rpm || b.oil_recommendation || b.refresh_interval) && (
                                      <div className="mt-2 grid grid-cols-3 gap-2">
                                        {b.max_rpm && <div><p className="text-xs text-slate-400">Max RPM</p><p className="text-xs font-semibold">{b.max_rpm.toLocaleString()}</p></div>}
                                        {b.oil_recommendation && <div><p className="text-xs text-slate-400">Oil</p><p className="text-xs font-semibold">{b.oil_recommendation}</p></div>}
                                        {b.refresh_interval && <div><p className="text-xs text-slate-400">Refresh At</p><p className="text-xs font-semibold">{b.refresh_interval}</p></div>}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Linked invoices */}
                        {engineInvoices.length > 0 && (
                          <div className="border-t border-slate-100 pt-4">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Invoices for this Engine</p>
                            <div className="space-y-1">
                              {engineInvoices.map(inv => (
                                <div key={inv.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                                  <div>
                                    <span className="text-sm font-medium">{inv.invoice_number}</span>
                                    <span className="ml-2 text-xs text-slate-500">{inv.issue_date} · ${Number(inv.total || 0).toFixed(2)}</span>
                                  </div>
                                  <Badge className={`text-xs border-0 capitalize ${STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-600"}`}>
                                    {inv.status}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

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
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{inv.invoice_number}</p>
                        {inv.is_legacy && <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">Legacy</Badge>}
                      </div>
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
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setDetailInvoice(inv); setPrintInvoice(false); }}>
                        <FileText className="w-3.5 h-3.5 mr-1" /> View
                      </Button>
                      {inv.legacy_pdf_url && (
                        <a href={inv.legacy_pdf_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline"><Download className="w-3.5 h-3.5 mr-1" /> PDF</Button>
                        </a>
                      )}
                      <Badge className={`text-xs border-0 capitalize ${STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-600"}`}>
                        {inv.status}
                      </Badge>
                    </div>
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

          {/* ─── Credits ─── */}
          <TabsContent value="credits">
            {(() => {
              const today = new Date().toISOString().split("T")[0];
              const sorted = [...credits].sort((a, b) => new Date(b.date || b.created_date || 0) - new Date(a.date || a.created_date || 0));
              const activeCredits = sorted.filter(c => !c.expires_on || c.expires_on >= today);
              const expiredCredits = sorted.filter(c => c.expires_on && c.expires_on < today);
              const available = activeCredits.reduce((s, c) => s + (c.amount || 0), 0);
              const totalEarned = sorted.filter(c => c.amount > 0).reduce((s, c) => s + c.amount, 0);
              const totalRedeemed = sorted.filter(c => c.amount < 0).reduce((s, c) => s + Math.abs(c.amount), 0);
              const expiredValue = expiredCredits.filter(c => c.amount > 0).reduce((s, c) => s + c.amount, 0);
              const TYPE_STYLES = { performance: "bg-amber-100 text-amber-700", referral: "bg-violet-100 text-violet-700", manual: "bg-slate-100 text-slate-600", redemption: "bg-red-100 text-red-700", other: "bg-slate-100 text-slate-600" };
              const TYPE_LABELS = { performance: "Performance", referral: "Referral", manual: "Manual", redemption: "Redemption", other: "Other" };
              return (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Credits expire December 31</p>
                      <p className="text-xs text-amber-700 mt-0.5">Performance and referral credits expire at the end of each calendar year (Dec 31). Redeem them toward engine builds before they expire!</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card className="border-0 shadow-sm bg-white">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="bg-violet-100 p-2 rounded-lg"><Award className="w-4 h-4 text-violet-600" /></div>
                          <span className="text-sm text-slate-500">Available Balance</span>
                        </div>
                        <p className="text-2xl font-bold text-violet-700">${available.toFixed(2)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-white">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="bg-emerald-100 p-2 rounded-lg"><TrendingUp className="w-4 h-4 text-emerald-600" /></div>
                          <span className="text-sm text-slate-500">Total Earned</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">${totalEarned.toFixed(2)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-white">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="bg-red-100 p-2 rounded-lg"><TrendingDown className="w-4 h-4 text-red-600" /></div>
                          <span className="text-sm text-slate-500">Redeemed</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">${totalRedeemed.toFixed(2)}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {expiredValue > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-500">
                      ${expiredValue.toFixed(2)} in credits expired on Dec 31.
                    </div>
                  )}

                  {sorted.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                      <Award className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p>No credits yet</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Description / Reason</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Amount</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Expires</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map(c => {
                            const isExpired = c.expires_on && c.expires_on < today;
                            return (
                              <tr key={c.id} className="border-b border-slate-100">
                                <td className="px-4 py-3 text-slate-500 text-xs">{c.date ? new Date(c.date).toLocaleDateString() : "—"}</td>
                                <td className="px-4 py-3"><Badge className={`${TYPE_STYLES[c.type] || TYPE_STYLES.other} border-0`}>{TYPE_LABELS[c.type] || c.type}</Badge></td>
                                <td className="px-4 py-3 text-slate-600">
                                  {c.subtype && <span className="font-medium text-slate-700">{c.subtype}</span>}
                                  {c.description && <span className="text-slate-500 text-xs block">{c.description}</span>}
                                </td>
                                <td className={`px-4 py-3 text-right font-bold ${c.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>{c.amount >= 0 ? "+" : "−"}${Math.abs(c.amount).toFixed(2)}</td>
                                <td className="px-4 py-3 text-xs">
                                  {c.expires_on ? (
                                    <span className={isExpired ? "text-red-500" : "text-slate-500"}>
                                      {new Date(c.expires_on).toLocaleDateString()}{isExpired && " (Expired)"}
                                    </span>
                                  ) : <span className="text-slate-300">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
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

      {/* Invoice Detail Dialog */}
      <Dialog open={!!detailInvoice && !printInvoice} onOpenChange={(o) => !o && setDetailInvoice(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Invoice {detailInvoice?.invoice_number}</span>
              <Button size="sm" variant="outline" onClick={handlePrintInvoice}>
                <Download className="w-3.5 h-3.5 mr-1" /> Print
              </Button>
            </DialogTitle>
          </DialogHeader>
          {detailInvoice && (
            <div className="py-2">
              {detailInvoice.is_legacy ? (
                detailInvoice.legacy_pdf_url ? (
                  <iframe
                    ref={invoicePdfRef}
                    src={detailInvoice.legacy_pdf_url}
                    title={`Invoice ${detailInvoice.invoice_number}`}
                    className="w-full h-[70vh] border border-slate-200 rounded-lg"
                  />
                ) : (
                  <div className="py-16 text-center text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p>No PDF attached to this legacy invoice.</p>
                  </div>
                )
              ) : (
                <PrintableInvoice
                  invoice={detailInvoice}
                  customer={customer}
                  settings={settingsData?.[0]}
                  customerEngine={customerEngines.find(e => e.id === detailInvoice.customer_engine_id)}
                  platform={platforms.find(p => p.id === customerEngines.find(e => e.id === detailInvoice.customer_engine_id)?.platform_id)}
                />
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailInvoice(null)}>Close</Button>
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