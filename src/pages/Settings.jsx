import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Mail, Receipt, FileText, ShoppingCart, Save, Send, Phone, Bell, ListChecks, MapPin } from "lucide-react";
import { toast } from "sonner";
import FromAddressesEditor from "@/components/settings/FromAddressesEditor";
import VoipPhonebookPanel from "@/components/settings/VoipPhonebookPanel";
import EmailAdminPanel from "@/components/settings/EmailAdminPanel";
import NotificationSettingsPanel from "@/components/settings/NotificationSettingsPanel";
import WorkflowTemplatesPanel from "@/components/settings/WorkflowTemplatesPanel";
import StorageLocationsPanel from "@/components/settings/StorageLocationsPanel";
import { useSearchParams } from 'react-router-dom';
import PaymentMigration from './PaymentMigration';
import SettingsHome,{SettingsLinks,SETTINGS_CATEGORIES} from '@/components/settings/SettingsHome';
import Platforms from './Platforms';
import SpecSheets from './SpecSheets';
import ReplacementRules from './ReplacementRules';
import CannedJobs from './CannedJobs';
import Addons from './Addons';

const defaultSettings = {
  key: "global",
  company_name: "Elite Engine Development",
  company_address: "",
  company_city: "",
  company_state: "",
  company_zip: "",
  company_phone: "",
  company_email: "",
  company_website: "",
  company_logo_url: "",
  default_tax_rate: 0,
  default_payment_terms: "Net 30",
  default_estimate_expiry_days: 30,
  default_invoice_due_days: 30,
  default_estimate_deposit_percent: 0,
  invoice_notes_template: "Thank you for your business!",
  estimate_notes_template: "This estimate is valid for 30 days.",
  po_notes_template: "",
  email_from_name: "Elite Engine Development",
  email_from_address: "",
  email_signature: "Elite Engine Development\nYour High-Performance Engine Specialists",
  smtp_host: "",
  smtp_port: 587,
  smtp_username: "",
  smtp_password: "",
  smtp_from_name: "Elite Engine Development",
  smtp_from_email: "",
  custom_from_emails: [],
  po_smtp_host: "",
  po_smtp_port: 587,
  po_smtp_username: "",
  po_smtp_password: "",
  po_smtp_from_name: "Elite Engine Development",
  po_smtp_from_email: "",
};

export default function Settings() {
  const qc = useQueryClient();
  const [searchParams,setSearchParams] = useSearchParams();
  const activeTab = ['overview','company','billing','payments','employees','engines','shop','inventory','portal','communications','system','email','templates','workflows','storage','telephony','notifications'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const openTab = tab=>setSearchParams(tab==='overview'?{}:{tab});
  const [form, setForm] = useState(defaultSettings);

  const { data: settingsData } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.filter({ key: "global" }),
  });

  useEffect(() => {
    if (settingsData && settingsData[0]) {
      setForm({ ...defaultSettings, ...settingsData[0] });
    }
  }, [settingsData]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (settingsData && settingsData[0]) {
        return base44.entities.AppSettings.update(settingsData[0].id, data);
      } else {
        return base44.entities.AppSettings.create(data);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Settings saved!");
    },
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingPoSmtp, setTestingPoSmtp] = useState(false);

  const testSmtp = async (usePOSmtp) => {
    const user = await base44.auth.me();
    if (!user?.email) { toast.error("Could not determine your email address"); return; }
    usePOSmtp ? setTestingPoSmtp(true) : setTestingSmtp(true);
    try {
      // Save first so the function uses latest values
      if (settingsData?.[0]) {
        await base44.entities.AppSettings.update(settingsData[0].id, form);
      }
      const res = await base44.functions.invoke('sendSmtpEmail', {
        to: user.email,
        subject: `SMTP Test — ${usePOSmtp ? 'Purchase Order' : 'General'} Account`,
        text: `This is a test email from your ${usePOSmtp ? 'Purchase Order' : 'General'} SMTP configuration in Elite Engine Development.`,
        usePOSmtp,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      toast.success(`Test email sent to ${user.email}`);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Unknown error';
      toast.error(`Test failed: ${msg}`);
    } finally {
      usePOSmtp ? setTestingPoSmtp(false) : setTestingSmtp(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500 mt-1">Configure your app, company info, and document defaults</p>
        </div>
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />{saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={openTab}>
        <TabsList className="mb-6 flex max-w-full flex-wrap h-auto gap-1 bg-transparent p-0">
          <TabsTrigger value="overview">All Settings</TabsTrigger>
          {SETTINGS_CATEGORIES.map(c=><TabsTrigger key={c.tab} value={c.tab}>{c.name}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="overview"><SettingsHome open={openTab}/></TabsContent>

        {/* Company Info */}
        <TabsContent value="company">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">Company Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Company Name</Label>
                  <Input value={form.company_name} onChange={e => set("company_name", e.target.value)} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={form.company_phone} onChange={e => set("company_phone", e.target.value)} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.company_email} onChange={e => set("company_email", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label>Website</Label>
                  <Input value={form.company_website} onChange={e => set("company_website", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label>Street Address</Label>
                  <Input value={form.company_address} onChange={e => set("company_address", e.target.value)} />
                </div>
                <div>
                  <Label>City</Label>
                  <Input value={form.company_city} onChange={e => set("company_city", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>State</Label><Input value={form.company_state} onChange={e => set("company_state", e.target.value)} /></div>
                  <div><Label>ZIP</Label><Input value={form.company_zip} onChange={e => set("company_zip", e.target.value)} /></div>
                </div>
                <div className="col-span-2">
                  <Label>Logo URL</Label>
                  <Input value={form.company_logo_url} onChange={e => set("company_logo_url", e.target.value)} placeholder="https://..." />
                  {form.company_logo_url && (
                    <img src={form.company_logo_url} alt="Logo Preview" className="mt-2 h-16 object-contain rounded border border-slate-200 p-1" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Defaults */}
        <TabsContent value="billing">
          <div className="mb-4 rounded-xl border bg-white p-4">
            <h2 className="font-semibold">Portal Payments</h2>
            <p className="mt-1 mb-3 text-sm text-slate-600">Verify your Stripe account, test or live mode, webhooks, and checkout readiness. Secure keys remain in Base44 server-side secrets; existing billing stays active.</p>
            <Button variant="outline" onClick={()=>openTab("payments")}>Open Payment Setup</Button>
          </div>
          <SettingsLinks title="Document templates" description="Configure invoice, estimate and purchase order notes." links={[{label:'Invoice & Estimate Templates',to:'/Settings?tab=templates'}]}/>
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">Billing Defaults</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Default Tax Rate (%)</Label>
                  <Input type="number" value={form.default_tax_rate} onChange={e => set("default_tax_rate", Number(e.target.value))} min={0} step={0.1} />
                  <p className="text-xs text-slate-400 mt-1">Applied automatically to new estimates and invoices</p>
                </div>
                <div>
                  <Label>Default Payment Terms</Label>
                  <Input value={form.default_payment_terms} onChange={e => set("default_payment_terms", e.target.value)} placeholder="Net 30" />
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <h4 className="text-sm font-medium text-slate-700">New Document Defaults</h4>
                <p className="text-xs text-slate-500">Applied when creating new estimates and invoices. Existing documents are unchanged.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm">Estimate valid for (days)<Input type="number" min={1} max={365} value={form.default_estimate_expiry_days??30} onChange={e=>set("default_estimate_expiry_days",Math.min(365,Math.max(1,Number(e.target.value)||1)))}/></label>
                  <label className="text-sm">Invoice due in (days)<Input type="number" min={0} max={365} value={form.default_invoice_due_days??30} onChange={e=>set("default_invoice_due_days",Math.min(365,Math.max(0,Number(e.target.value)||0)))}/></label>
                  <label className="text-sm">Default estimate deposit (%)<Input type="number" min={0} max={100} value={form.default_estimate_deposit_percent??0} onChange={e=>set("default_estimate_deposit_percent",Math.min(100,Math.max(0,Number(e.target.value)||0)))}/></label>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-medium text-slate-700 mb-3">Internal Labor Cost (Profitability)</h4>
                <p className="text-xs text-slate-400 mb-3">Used to compute actual job profitability. Distinct from customer billing rates — applied to logged task hours to determine internal labor cost.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Internal Labor Rate ($/hour)</Label>
                    <Input type="number" value={form.internal_labor_rate ?? 0} onChange={e => set("internal_labor_rate", Number(e.target.value))} min={0} step={1} placeholder="0" />
                    <p className="text-xs text-slate-400 mt-1">0 = labor cost not tracked (flagged as missing in profitability)</p>
                  </div>
                  <div>
                    <Label>Overhead Burden Rate ($/hour)</Label>
                    <Input type="number" value={form.labor_overhead_rate ?? 0} onChange={e => set("labor_overhead_rate", Number(e.target.value))} min={0} step={1} placeholder="0" />
                    <p className="text-xs text-slate-400 mt-1">Added to labor rate for fully-loaded labor cost</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments"><PaymentMigration embedded /></TabsContent>

        <TabsContent value="employees" className="space-y-4">
          <SettingsLinks title="Employee administration" description="Staff profiles, employee-level page permissions, onboarding and time records remain managed in HR Administration." links={[{label:'HR Administration & Page Permissions',to:'/HRAdmin',detail:'Edit each employee and their allowed pages'},{label:'Employee Portal',to:'/EmployeePortal',detail:'Time clock and employee self-service'},{label:'Staff Workspace',to:'/StaffWorkspace',detail:'Restricted operational job queue'}]}/>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Advanced view/edit/delete permissions are not yet available. Page permissions do not grant backend access to protected financial records.</div>
        </TabsContent>
        <TabsContent value="engines" className="space-y-4">
          <SettingsLinks title="Engine configuration" description="Manage your supported platforms, technical specifications, and replacement schedules without leaving Settings." links={[{label:'Platforms',to:'/Platforms'},{label:'Spec Sheets',to:'/SpecSheets'},{label:'Replacement Rules',to:'/ReplacementRules'}]}/>
          <details className="rounded-lg border bg-white p-4"><summary className="font-semibold cursor-pointer">Manage engine platforms here</summary><Platforms/></details>
          <details className="rounded-lg border bg-white p-4"><summary className="font-semibold cursor-pointer">Manage spec sheets here</summary><SpecSheets/></details>
          <details className="rounded-lg border bg-white p-4"><summary className="font-semibold cursor-pointer">Manage replacement rules here</summary><ReplacementRules/></details>
        </TabsContent>
        <TabsContent value="shop" className="space-y-4">
          <SettingsLinks title="Job and workflow configuration" links={[{label:'Canned Jobs',to:'/CannedJobs'},{label:'Addons',to:'/Addons'},{label:'Build Workflow',to:'/BuildWorkflow',detail:'Daily operations, not a setting'},{label:'Machining Station',to:'/MachiningStation',detail:'Daily operations, not a setting'}]}/>
          <details className="rounded-lg border bg-white p-4"><summary className="font-semibold cursor-pointer">Manage canned jobs</summary><CannedJobs/></details>
          <details className="rounded-lg border bg-white p-4"><summary className="font-semibold cursor-pointer">Manage addons</summary><Addons/></details>
          <section className="rounded-lg border bg-white p-4 space-y-3"><h3 className="font-semibold">Workflow templates</h3><WorkflowTemplatesPanel/></section>
        </TabsContent>
        <TabsContent value="inventory" className="space-y-4">
          <SettingsLinks title="Inventory administration" links={[{label:'Inventory',to:'/Inventory',detail:'Manage stock and reorder levels'},{label:'Suppliers',to:'/Suppliers'},{label:'Purchase Orders',to:'/PurchaseOrders'}]}/>
          <section className="rounded-lg border bg-white p-4 space-y-3"><h3 className="font-semibold">Storage locations</h3><StorageLocationsPanel/></section>
        </TabsContent>
        <TabsContent value="portal" className="space-y-4">
          <SettingsLinks title="Customer portal administration" description="Customer accounts and the existing onboarding workflow are managed in their respective areas. Additional required-field toggles and customer feature flags need backend integration before they can be enforced." links={[{label:'Customer Portal',to:'/CustomerPortal'},{label:'Customer Records',to:'/Customers'},{label:'Refresh Requests',to:'/RefreshRequests'},{label:'Customer Success',to:'/CustomerSuccess'}]}/>
        </TabsContent>
        <TabsContent value="communications" className="space-y-4">
          <SettingsLinks title="Communication settings" description="Configure email delivery, phone integrations and alerts." links={[{label:'Email Configuration',to:'/Settings?tab=email'},{label:'Phone Configuration',to:'/Settings?tab=telephony'},{label:'Notifications',to:'/Settings?tab=notifications'}]}/>
          <section className="rounded-lg border bg-white p-4 space-y-3"><h3 className="font-semibold">Notification preferences</h3><NotificationSettingsPanel form={form} set={set}/></section>
        </TabsContent>
        <TabsContent value="system" className="space-y-4">
          <SettingsLinks title="System administration" description="Available diagnostics and operational reports. A consolidated audit trail for all changes is not implemented yet." links={[{label:'Payment & Stripe Diagnostics',to:'/Settings?tab=payments'},{label:'Workflow Templates',to:'/Settings?tab=workflows'},{label:'Business Reports',to:'/Reports'},{label:'Exceptions',to:'/ExceptionDashboard'},{label:'Human Resources',to:'/HRAdmin'}]}/>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">System-wide audit history, automation error monitoring and integration health checks require separate backend instrumentation. No false health or audit status is displayed.</div>
        </TabsContent>

        {/* Email Setup */}
        <TabsContent value="email">
          <div className="space-y-4">
            {/* General SMTP */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">General SMTP (noreply — customer emails, portal invites, etc.)</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => testSmtp(false)} disabled={testingSmtp}>
                    <Send className="w-4 h-4 mr-2" />{testingSmtp ? "Sending..." : "Send Test Email"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>SMTP Host</Label>
                    <Input value={form.smtp_host} onChange={e => set("smtp_host", e.target.value)} placeholder="smtp.yourdomain.com" />
                  </div>
                  <div>
                    <Label>SMTP Port</Label>
                    <Input type="number" value={form.smtp_port} onChange={e => set("smtp_port", Number(e.target.value))} placeholder="587" />
                  </div>
                  <div>
                    <Label>SMTP Username</Label>
                    <Input value={form.smtp_username} onChange={e => set("smtp_username", e.target.value)} placeholder="noreply@yourdomain.com" />
                  </div>
                  <div>
                    <Label>SMTP Password</Label>
                    <Input type="password" value={form.smtp_password} onChange={e => set("smtp_password", e.target.value)} placeholder="••••••••" />
                  </div>
                  <div>
                    <Label>From Name</Label>
                    <Input value={form.smtp_from_name} onChange={e => set("smtp_from_name", e.target.value)} placeholder="Elite Engine Development" />
                  </div>
                  <div>
                    <Label>From Email</Label>
                    <Input type="email" value={form.smtp_from_email} onChange={e => set("smtp_from_email", e.target.value)} placeholder="noreply@yourdomain.com" />
                  </div>
                  <div className="col-span-2">
                    <Label>Email Signature</Label>
                    <Textarea value={form.email_signature} onChange={e => set("email_signature", e.target.value)} rows={3} placeholder="Your email signature..." />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base">Additional "From" Addresses (Zoho)</CardTitle></CardHeader>
              <CardContent>
                <FromAddressesEditor value={form.custom_from_emails || []} onChange={(arr) => set("custom_from_emails", arr)} />
              </CardContent>
            </Card>

            <EmailAdminPanel />

            {/* PO SMTP */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Purchase Order SMTP</CardTitle>
                    <p className="text-sm text-slate-500 mt-1">Separate SMTP account used only when sending purchase orders to suppliers</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => testSmtp(true)} disabled={testingPoSmtp}>
                    <Send className="w-4 h-4 mr-2" />{testingPoSmtp ? "Sending..." : "Send Test Email"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>SMTP Host</Label>
                    <Input value={form.po_smtp_host} onChange={e => set("po_smtp_host", e.target.value)} placeholder="smtp.yourdomain.com" />
                  </div>
                  <div>
                    <Label>SMTP Port</Label>
                    <Input type="number" value={form.po_smtp_port} onChange={e => set("po_smtp_port", Number(e.target.value))} placeholder="587" />
                  </div>
                  <div>
                    <Label>SMTP Username</Label>
                    <Input value={form.po_smtp_username} onChange={e => set("po_smtp_username", e.target.value)} placeholder="purchasing@yourdomain.com" />
                  </div>
                  <div>
                    <Label>SMTP Password</Label>
                    <Input type="password" value={form.po_smtp_password} onChange={e => set("po_smtp_password", e.target.value)} placeholder="••••••••" />
                  </div>
                  <div>
                    <Label>From Name</Label>
                    <Input value={form.po_smtp_from_name} onChange={e => set("po_smtp_from_name", e.target.value)} placeholder="Elite Engine Development" />
                  </div>
                  <div>
                    <Label>From Email</Label>
                    <Input type="email" value={form.po_smtp_from_email} onChange={e => set("po_smtp_from_email", e.target.value)} placeholder="purchasing@yourdomain.com" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Document Templates */}
        <TabsContent value="templates">
          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> Invoice Default Notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={form.invoice_notes_template} onChange={e => set("invoice_notes_template", e.target.value)} rows={4} placeholder="Default notes shown on invoices..." />
                <p className="text-xs text-slate-400 mt-2">Pre-filled on all new invoices. You can edit per-invoice.</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> Estimate Default Notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={form.estimate_notes_template} onChange={e => set("estimate_notes_template", e.target.value)} rows={4} placeholder="Default notes shown on estimates..." />
                <p className="text-xs text-slate-400 mt-2">Pre-filled on all new estimates. You can edit per-estimate.</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Purchase Order Default Notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={form.po_notes_template} onChange={e => set("po_notes_template", e.target.value)} rows={4} placeholder="Default notes shown on POs..." />
                <p className="text-xs text-slate-400 mt-2">Pre-filled on all new purchase orders.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Build Workflow Templates */}
        <TabsContent value="workflows">
          <WorkflowTemplatesPanel />
        </TabsContent>

        {/* Storage Locations */}
        <TabsContent value="storage">
          <StorageLocationsPanel />
        </TabsContent>

        {/* Telephony / VoIP */}
        <TabsContent value="telephony">
          <VoipPhonebookPanel />
        </TabsContent>

        {/* Notification Preferences */}
        <TabsContent value="notifications">
          <NotificationSettingsPanel form={form} set={set} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
