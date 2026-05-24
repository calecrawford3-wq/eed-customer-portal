import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Mail, Receipt, FileText, ShoppingCart, Save, Send } from "lucide-react";
import { toast } from "sonner";

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
  po_smtp_host: "",
  po_smtp_port: 587,
  po_smtp_username: "",
  po_smtp_password: "",
  po_smtp_from_name: "Elite Engine Development",
  po_smtp_from_email: "",
};

export default function Settings() {
  const qc = useQueryClient();
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
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500 mt-1">Configure your app, company info, and document defaults</p>
        </div>
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />{saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      <Tabs defaultValue="company">
        <TabsList className="mb-6">
          <TabsTrigger value="company"><Building2 className="w-4 h-4 mr-1" /> Company</TabsTrigger>
          <TabsTrigger value="billing"><Receipt className="w-4 h-4 mr-1" /> Billing</TabsTrigger>
          <TabsTrigger value="email"><Mail className="w-4 h-4 mr-1" /> Email</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="w-4 h-4 mr-1" /> Templates</TabsTrigger>
        </TabsList>

        {/* Company Info */}
        <TabsContent value="company">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-base">Company Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Setup */}
        <TabsContent value="email">
          <div className="space-y-4">
            {/* General SMTP */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">General SMTP (noreply — customer emails, portal invites, etc.)</CardTitle>
                <Button variant="outline" size="sm" onClick={() => testSmtp(false)} disabled={testingSmtp}>
                  <Send className="w-4 h-4 mr-2" />{testingSmtp ? "Sending..." : "Send Test Email"}
                </Button>
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

            {/* PO SMTP */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Purchase Order SMTP</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">Separate SMTP account used only when sending purchase orders to suppliers</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => testSmtp(true)} disabled={testingPoSmtp}>
                  <Send className="w-4 h-4 mr-2" />{testingPoSmtp ? "Sending..." : "Send Test Email"}
                </Button>
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
      </Tabs>
    </div>
  );
}