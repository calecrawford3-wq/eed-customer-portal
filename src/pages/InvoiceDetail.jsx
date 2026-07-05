import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Send, Printer, DollarSign, Package, Wrench, Search, Cog, Recycle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import PartPickerModal from "@/components/estimates/PartPickerModal";
import CoreCreditModal from "@/components/estimates/CoreCreditModal";
import GeneratePOModal from "@/components/estimates/GeneratePOModal";
import LaborMachiningPickerModal from "@/components/estimates/LaborMachiningPickerModal";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";
import PaymentModal from "@/components/PaymentModal";
import QuickCreateCustomerModal from "@/components/QuickCreateCustomerModal";
import PrintableInvoice from "@/components/PrintableInvoice";
import EngineSelector from "@/components/EngineSelector";

const emptyPart = { part_id: "", part_number: "", item_name: "", quantity: 1, unit_cost: 0, unit_price: 0, total: 0 };
const emptyLabor = { name: "", description: "", price: 0 };
const emptyMachining = { name: "", description: "", price: 0 };

const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-slate-100 text-slate-400",
};

export default function InvoiceDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const isNew = params.get("new") === "1";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    invoice_number: `INV-${Date.now().toString().slice(-6)}`,
    customer_id: "", status: "draft",
    issue_date: new Date().toISOString().split("T")[0],
    due_date: "",
    line_items: [{ ...emptyPart }],
    labor_items: [],
    machining_items: [],
    tax_rate: 0, notes: "", amount_paid: 0, balance_due: 0
  });
  const [sending, setSending] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [pickingIdx, setPickingIdx] = useState(null);
  const [coreCreditOpen, setCoreCreditOpen] = useState(false);
  const [pickerInitialTab, setPickerInitialTab] = useState("parts");
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [laborPickerOpen, setLaborPickerOpen] = useState(false);
  const [laborPickingIdx, setLaborPickingIdx] = useState(null);
  const [machiningPickerOpen, setMachiningPickerOpen] = useState(false);
  const [machiningPickingIdx, setMachiningPickingIdx] = useState(null);

  const { data: invoice } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => base44.entities.Invoice.filter({ id }),
    enabled: !!id,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date", 200),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.list("-created_date", 500),
  });

  const { data: partKits = [] } = useQuery({
    queryKey: ["partKits"],
    queryFn: () => base44.entities.PartKit.list("-created_date", 200),
  });

  const { data: engineCores = [] } = useQuery({
    queryKey: ["engineCores"],
    queryFn: () => base44.entities.EngineCore.list("-created_date", 200),
  });

  const { data: customerCredits = [] } = useQuery({
    queryKey: ["accountCredits", form.customer_id],
    queryFn: () => base44.entities.AccountCredit.filter({ customer_id: form.customer_id }),
    enabled: !!form.customer_id,
  });

  const existingCreditRedemption = customerCredits.find(c => c.linked_invoice_id === id && c.type === "redemption");
  const availableCreditBalance = customerCredits.reduce((s, c) => s + (Number(c.amount) || 0), 0) - (existingCreditRedemption ? Number(existingCreditRedemption.amount) || 0 : 0);

  useEffect(() => {
    if (form.customer_id && isNew && availableCreditBalance > 0) {
      const cap = Math.min(availableCreditBalance, Number(form.total || 0));
      setForm(f => {
        if (Math.abs((Number(f.applied_credits) || 0) - cap) < 0.01) return f;
        const totals = recalc(f.line_items, f.labor_items || [], f.machining_items || [], f.tax_rate, f.amount_paid, cap);
        return { ...f, applied_credits: cap, ...totals };
      });
    }
  }, [form.customer_id, availableCreditBalance, form.total, isNew]);

  const { data: settingsData } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.filter({ key: "global" }),
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["platforms"],
    queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100),
  });

  const { data: customerEngines = [] } = useQuery({
    queryKey: ["customerEngines", form.customer_id],
    queryFn: () => base44.entities.CustomerEngine.filter({ customer_id: form.customer_id }),
    enabled: !!form.customer_id,
  });

  const { data: specSheets = [] } = useQuery({
    queryKey: ["specSheets"],
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 200),
  });

  // Fetch builds for the selected engine to find the most recent spec sheet used
  const { data: engineBuilds = [] } = useQuery({
    queryKey: ["engineBuildsForEngine", form.customer_engine_id],
    queryFn: () => base44.entities.EngineBuild.filter({ customer_engine_id: form.customer_engine_id }),
    enabled: !!form.customer_engine_id,
  });

  const { data: laborCatalog = [] } = useQuery({
    queryKey: ["laborItems"],
    queryFn: () => base44.entities.LaborItem.list("-created_date", 200),
  });

  const { data: machiningCatalog = [] } = useQuery({
    queryKey: ["machiningItems"],
    queryFn: () => base44.entities.MachiningItem.list("-created_date", 200),
  });

  useEffect(() => {
    if (invoice && invoice[0]) setForm({ labor_items: [], machining_items: [], ...invoice[0] });
  }, [invoice]);

  useEffect(() => {
    if (isNew && settingsData && settingsData[0] && settingsData[0].default_tax_rate) {
      setForm(f => ({ ...f, tax_rate: settingsData[0].default_tax_rate }));
    }
  }, [settingsData, isNew]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const result = id
        ? await base44.entities.Invoice.update(id, data)
        : await base44.entities.Invoice.create(data);
      const invoiceId = id || result.id;
      const applied = Number(data.applied_credits) || 0;
      const priorRedemption = customerCredits.find(c => c.linked_invoice_id === invoiceId && c.type === "redemption");
      if (applied > 0) {
        const redemptionData = {
          customer_id: data.customer_id,
          amount: -applied,
          type: "redemption",
          subtype: "Invoice Credit Application",
          description: `Credits applied to invoice ${data.invoice_number}`,
          date: new Date().toISOString().split("T")[0],
          linked_invoice_id: invoiceId,
          status: "active",
        };
        if (priorRedemption) {
          await base44.entities.AccountCredit.update(priorRedemption.id, redemptionData);
        } else {
          await base44.entities.AccountCredit.create(redemptionData);
        }
      } else if (priorRedemption) {
        await base44.entities.AccountCredit.delete(priorRedemption.id);
      }
      return result;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["accountCredits"] });
      toast.success("Invoice saved");
      if (isNew) navigate(`/InvoiceDetail?id=${result.id}`);
    },
  });

  const recalc = (lineItems, laborItems, machiningItems, taxRate, amountPaid, appliedCredits) => {
    const partTotal = lineItems.reduce((s, l) => s + (l.total || 0), 0);
    const laborTotal = laborItems.reduce((s, l) => s + (Number(l.price) || 0), 0);
    const machiningTotal = machiningItems.reduce((s, m) => s + (Number(m.price) || 0), 0);
    const subtotal = partTotal + laborTotal + machiningTotal;
    const tax_amount = partTotal * (Number(taxRate) / 100); // tax on parts only
    const total = subtotal + tax_amount;
    const balance_due = Math.max(0, total - (Number(appliedCredits) || 0) - (Number(amountPaid) || 0));
    return { subtotal, tax_amount, total, balance_due };
  };

  const handleCustomerChange = (v) => {
    const cust = customers.find(c => c.id === v);
    const isTaxExempt = !!cust?.tax_exempt;
    const override = cust?.parts_markup_override;
    const useOverride = override !== null && override !== undefined && override !== "";
    let newLines = form.line_items;
    if (useOverride && form.line_items.some(l => l.part_id)) {
      newLines = form.line_items.map(l => {
        if (!l.part_id) return l;
        const price = (Number(l.unit_cost) || 0) * (1 + Number(override) / 100);
        return { ...l, unit_price: price, total: (Number(l.quantity) || 0) * price };
      });
    }
    const newTaxRate = isTaxExempt ? 0 : form.tax_rate;
    const totals = recalc(newLines, form.labor_items || [], form.machining_items || [], newTaxRate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, customer_id: v, line_items: newLines, tax_rate: newTaxRate, ...totals }));
    if (isTaxExempt && useOverride) toast.info(`Tax-exempt • ${override}% markup applied to parts`);
    else if (isTaxExempt) toast.info("Customer is tax-exempt — tax set to 0%");
    else if (useOverride) toast.info(`Applied ${override}% markup override to parts`);
  };

  const updateLine = (idx, field, value) => {
    const lines = [...form.line_items];
    lines[idx] = { ...lines[idx], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      lines[idx].total = (Number(lines[idx].quantity) || 0) * (Number(lines[idx].unit_price) || 0);
    }
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, line_items: lines, ...totals }));
  };

  const selectPart = (part) => {
    const override = customer?.parts_markup_override;
    const useOverride = override !== null && override !== undefined && override !== "";
    const price = useOverride ? (Number(part.unit_cost) || 0) * (1 + Number(override) / 100) : (Number(part.sell_price) || 0);
    const lines = [...form.line_items];
    lines[pickingIdx] = {
      part_id: part.id,
      part_number: part.part_number,
      item_name: part.name,
      quantity: 1,
      unit_cost: part.unit_cost || 0,
      unit_price: price,
      total: price,
    };
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, line_items: lines, ...totals }));
  };

  const selectKit = (kit) => {
    const override = customer?.parts_markup_override;
    const useOverride = override !== null && override !== undefined && override !== "";
    const lines = [...form.line_items];
    const expanded = (kit.components || []).map(c => {
      const qty = Number(c.quantity) || 1;
      const price = useOverride ? (Number(c.unit_cost) || 0) * (1 + Number(override) / 100) : (Number(c.unit_price) || 0);
      return {
        part_id: c.part_id || "",
        part_number: c.part_number || "",
        item_name: c.name || "",
        quantity: qty,
        unit_cost: Number(c.unit_cost) || 0,
        unit_price: price,
        total: qty * price,
      };
    });
    const newLines = [
      ...lines.slice(0, pickingIdx),
      ...expanded,
      ...lines.slice(pickingIdx + 1),
    ];
    const totals = recalc(newLines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, line_items: newLines, ...totals }));
    toast.success(`Added kit "${kit.name}" — ${expanded.length} line item${expanded.length === 1 ? "" : "s"}`);
  };

  const selectCore = (core, mode) => {
    const lines = [...form.line_items];
    const idx = (pickingIdx === null || pickingIdx === undefined || pickingIdx >= lines.length) ? lines.length : pickingIdx;
    let line;
    if (mode === "credit") {
      const credit = Number(core.core_credit) || 0;
      line = {
        part_id: "", part_number: core.core_number,
        item_name: `Core Credit: ${core.name}`,
        quantity: 1, unit_cost: 0, unit_price: -credit, total: -credit,
      };
      toast.success(`Added core credit for "${core.name}" (−$${credit.toFixed(2)})`);
    } else {
      const price = Number(core.sell_price) || 0;
      line = {
        part_id: "", part_number: core.core_number, core_id: core.id,
        item_name: `${core.name} (Core)`,
        quantity: 1, unit_cost: Number(core.unit_cost) || 0, unit_price: price, total: price,
      };
      toast.success(`Added core "${core.name}" for sale ($${price.toFixed(2)})`);
    }
    if (idx === lines.length) lines.push(line); else lines[idx] = line;
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, line_items: lines, ...totals }));
  };

  const addLine = () => setForm(f => ({ ...f, line_items: [...f.line_items, { ...emptyPart }] }));

  const handleCoreCredit = (coreDetails) => {
    const credit = Number(coreDetails.core_credit) || 0;
    const lines = [...form.line_items, {
      part_id: "",
      part_number: coreDetails.core_number || "CORE-CREDIT",
      item_name: `Core Credit: ${coreDetails.name}`,
      quantity: 1,
      unit_cost: Number(coreDetails.unit_cost) || 0,
      unit_price: -credit,
      total: -credit,
      is_core_credit: true,
      core_details: { ...coreDetails },
    }];
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, line_items: lines, ...totals }));
    toast.success("Core credit added — core will be added to inventory when invoice is complete");
  };
  const removeLine = (idx) => {
    const lines = form.line_items.filter((_, i) => i !== idx);
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, line_items: lines, ...totals }));
  };

  const selectLaborFromCatalog = (item) => {
    const items = [...(form.labor_items || [])];
    items[laborPickingIdx] = { name: item.name, description: item.description || "", price: item.price || 0 };
    const totals = recalc(form.line_items, items, form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, labor_items: items, ...totals }));
  };

  const selectMachiningFromCatalog = (item) => {
    const items = [...(form.machining_items || [])];
    items[machiningPickingIdx] = { name: item.name, description: item.description || "", price: item.price || 0 };
    const totals = recalc(form.line_items, form.labor_items || [], items, form.tax_rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, machining_items: items, ...totals }));
  };

  const addLabor = () => setForm(f => ({ ...f, labor_items: [...(f.labor_items || []), { ...emptyLabor }] }));
  const updateLabor = (idx, field, value) => {
    const items = [...(form.labor_items || [])];
    items[idx] = { ...items[idx], [field]: value };
    const totals = recalc(form.line_items, items, form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, labor_items: items, ...totals }));
  };
  const removeLabor = (idx) => {
    const items = (form.labor_items || []).filter((_, i) => i !== idx);
    const totals = recalc(form.line_items, items, form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, labor_items: items, ...totals }));
  };

  const addMachining = () => setForm(f => ({ ...f, machining_items: [...(f.machining_items || []), { ...emptyMachining }] }));
  const updateMachining = (idx, field, value) => {
    const items = [...(form.machining_items || [])];
    items[idx] = { ...items[idx], [field]: value };
    const totals = recalc(form.line_items, form.labor_items || [], items, form.tax_rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, machining_items: items, ...totals }));
  };
  const removeMachining = (idx) => {
    const items = (form.machining_items || []).filter((_, i) => i !== idx);
    const totals = recalc(form.line_items, form.labor_items || [], items, form.tax_rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, machining_items: items, ...totals }));
  };

  const updateTaxRate = (rate) => {
    const totals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], rate, form.amount_paid, form.applied_credits);
    setForm(f => ({ ...f, tax_rate: rate, ...totals }));
  };

  const handleRecordPayment = async (payment) => {
    const updatedPayments = [...(form.payments || []), payment];
    const paid = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const balance = Math.max(0, (form.total || 0) - (Number(form.applied_credits) || 0) - paid);
    const status = balance <= 0 ? "paid" : "partial";
    const recalcTotals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], form.tax_rate, paid, form.applied_credits);
    const updated = { ...form, payments: updatedPayments, amount_paid: paid, balance_due: balance, status, ...recalcTotals };
    await saveMutation.mutateAsync(updated);
    setForm(updated);
    toast.success("Payment recorded");
  };

  const sendInvoice = async () => {
    const customer = customers.find(c => c.id === form.customer_id);
    if (!customer?.email) { toast.error("Customer has no email"); return; }
    setSending(true);
    await saveMutation.mutateAsync(form);
    const settings = settingsData?.[0] || {};
    const subject = `Invoice ${form.invoice_number} — Payment Due`;
    const viewUrl = `https://elite-viewer.base44.app/invoice/${form.public_access_token}`;
    const dueDate = form.due_date ? new Date(form.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : "30 days from invoice date";
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
            .header { background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); padding: 40px 32px; text-align: center; border-bottom: 4px solid #e20404; }
            .logo { height: 40px; margin-bottom: 20px; display: inline-block; }
            .header-text { color: #ffffff; margin: 0; }
            .header-title { font-size: 32px; font-weight: 700; margin: 12px 0 4px 0; }
            .header-subtitle { font-size: 14px; color: #e20404; font-weight: 600; letter-spacing: 1px; margin: 0; }
            .content { padding: 40px 32px; }
            .greeting { font-size: 18px; font-weight: 600; color: #1a1a1a; margin: 0 0 16px 0; }
            .description { font-size: 15px; color: #4a5568; line-height: 1.6; margin: 0 0 24px 0; }
            .amount-box { background: #f8f9fa; border-left: 4px solid #e20404; padding: 20px; margin: 32px 0; border-radius: 4px; }
            .amount-label { font-size: 12px; color: #718096; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px 0; }
            .amount-value { font-size: 32px; color: #1a1a1a; font-weight: 700; margin: 0; }
            .due-date { color: #4a5568; font-size: 14px; margin-top: 12px; }
            .cta-button { display: inline-block; background: #e20404; color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 6px; font-weight: 600; font-size: 16px; margin: 32px 0; transition: background 0.2s; }
            .cta-button:hover { background: #c00303; }
            .cta-wrapper { text-align: center; }
            .footer { background: #f8f9fa; padding: 32px; border-top: 1px solid #e2e8f0; text-align: center; color: #718096; font-size: 13px; line-height: 1.6; }
            .company-info { color: #1a1a1a; font-weight: 600; margin-bottom: 12px; }
            .divider { border-top: 1px solid #e2e8f0; margin: 24px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="${LOGO_URL}" alt="${settings.company_name}" class="logo" />
              <h1 class="header-title">Invoice</h1>
              <p class="header-subtitle">${form.invoice_number}</p>
            </div>

            <div class="content">
              <p class="greeting">Hi ${customer.first_name},</p>
              <p class="description">Your invoice is ready and waiting for payment. Please review the details below and submit payment at your earliest convenience.</p>

              <div class="amount-box">
                <p class="amount-label">Amount Due</p>
                <p class="amount-value">$${Number(form.total || 0).toFixed(2)}</p>
                <p class="due-date">Due by <strong>${dueDate}</strong></p>
              </div>

              <p class="description">Click the button below to view the full invoice and make a payment online using your preferred method.</p>

              <div class="cta-wrapper">
                <a href="${viewUrl}" class="cta-button">View & Pay Invoice</a>
              </div>

              <p style="font-size: 13px; color: #718096; text-align: center; margin: 24px 0 0 0;">Can't click? Copy and paste this link: <br/><span style="color: #4a5568; word-break: break-all;">${viewUrl}</span></p>
            </div>

            <div class="footer">
              <p class="company-info">${settings.company_name || "Elite Engine Development"}</p>
              ${settings.company_phone ? `<p>${settings.company_phone}</p>` : ''}
              ${settings.company_email ? `<p>${settings.company_email}</p>` : ''}
              <div class="divider"></div>
              <p>${settings.email_signature || "Thank you for your business!"}</p>
            </div>
          </div>
        </body>
      </html>
    `;
    const result = await base44.functions.invoke("sendSmtpEmail", { to: customer.email, subject, html, usePOSmtp: false });
    if (result?.data?.error) { toast.error("Failed to send email"); setSending(false); return; }
    await base44.entities.Invoice.update(id || "", { status: "sent" });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    setForm(f => ({ ...f, status: "sent" }));
    setSending(false);
    toast.success(`Invoice sent to ${customer.email}`);
  };

  const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

  const customer = customers.find(c => c.id === form.customer_id);
  const selectedEngine = customerEngines.find(e => e.id === form.customer_engine_id);
  const selectedEnginePlatform = platforms.find(p => p.id === selectedEngine?.platform_id);
  const STAGE_LABELS_INV = { stock: "Stock", stage_1: "Stage 1", stage_2: "Stage 2", stage_3: "Stage 3", contract: "Contract", custom: "Custom" };

  // Resolve spec sheet: prefer explicitly set spec_sheet_id on invoice,
  // then most recent build's spec_sheet_id, then fall back to engine's current_stage match
  const selectedSpecSheet = (() => {
    if (form.spec_sheet_id) return specSheets.find(s => s.id === form.spec_sheet_id) || null;
    if (engineBuilds.length > 0) {
      const mostRecentBuild = [...engineBuilds].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0];
      if (mostRecentBuild?.spec_sheet_id) {
        const found = specSheets.find(s => s.id === mostRecentBuild.spec_sheet_id);
        if (found) return found;
      }
    }
    if (selectedEngine?.current_stage && selectedEngine?.platform_id) {
      return specSheets.find(s =>
        s.platform_id === selectedEngine.platform_id &&
        s.spec_type === selectedEngine.current_stage &&
        s.is_current
      ) || null;
    }
    return null;
  })();

  if (printMode) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4 print:hidden">
          <button onClick={() => setPrintMode(false)} className="px-4 py-2 bg-slate-200 rounded hover:bg-slate-300">← Back to Edit</button>
          <button onClick={() => { document.title = `Invoice ${form.invoice_number}`; window.print(); }} className="px-4 py-2 bg-[#e20404] text-white rounded hover:bg-[#c00303] font-semibold">🖨 Print Invoice</button>
        </div>
        <PrintableInvoice invoice={form} customer={customer} settings={settingsData?.[0]} customerEngine={selectedEngine} platform={selectedEnginePlatform} specSheet={selectedSpecSheet} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <LaborMachiningPickerModal
        open={laborPickerOpen}
        onClose={() => setLaborPickerOpen(false)}
        items={laborCatalog}
        type="labor"
        onSelect={(item) => selectLaborFromCatalog(item)}
      />
      <LaborMachiningPickerModal
        open={machiningPickerOpen}
        onClose={() => setMachiningPickerOpen(false)}
        items={machiningCatalog}
        type="machining"
        onSelect={(item) => selectMachiningFromCatalog(item)}
      />
      <QuickCreateCustomerModal
        open={quickCustomerOpen}
        onClose={() => setQuickCustomerOpen(false)}
        onCreated={(c) => setForm(f => ({ ...f, customer_id: c.id }))}
      />
      <PartPickerModal
        open={partPickerOpen}
        onClose={() => setPartPickerOpen(false)}
        parts={parts}
        kits={partKits}
        cores={engineCores}
        initialTab={pickerInitialTab}
        onSelect={(part) => { selectPart(part); setPartPickerOpen(false); }}
        onSelectKit={selectKit}
        onSelectCore={selectCore}
      />
      <CoreCreditModal
        open={coreCreditOpen}
        onClose={() => setCoreCreditOpen(false)}
        onAdd={handleCoreCredit}
      />
      <GeneratePOModal
        open={poModalOpen}
        onClose={() => setPoModalOpen(false)}
        lineItems={form.line_items}
        sourceNumber={form.invoice_number}
      />

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <Link to="/Invoices"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{form.invoice_number}</h1>
        </div>
        <Badge className={`${STATUS_STYLES[form.status]} border-0 capitalize`}>{form.status}</Badge>
        <Button variant="outline" size="sm" onClick={() => setPoModalOpen(true)} disabled={!id}>
          <Package className="w-4 h-4 mr-1" /> Generate POs
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPrintMode(true)}><Printer className="w-4 h-4 mr-1" /> View</Button>
        <Button variant="outline" size="sm" onClick={sendInvoice} disabled={sending || !form.customer_id}>
          <Send className="w-4 h-4 mr-1" />{sending ? "Sending..." : "Send"}
        </Button>
        {["draft","sent","partial","overdue"].includes(form.status) && (
          <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700" onClick={() => setPaymentModalOpen(true)}>
            <DollarSign className="w-4 h-4 mr-1" /> Record Payment
          </Button>
        )}
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        balanceDue={form.balance_due ?? form.total ?? 0}
        totalPaid={form.amount_paid || 0}
        onRecord={handleRecordPayment}
        title="Record Payment"
      />

      <div className="grid grid-cols-2 gap-6 mb-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Invoice Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Customer *</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <CustomerSearchSelect
                    customers={customers}
                    value={form.customer_id}
                    onValueChange={handleCustomerChange}
                  />
                </div>
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setQuickCustomerOpen(true)}>
                  + New
                </Button>
              </div>
              {(customer?.tax_exempt || (customer?.parts_markup_override !== null && customer?.parts_markup_override !== undefined && customer?.parts_markup_override !== "")) && (
                <div className="flex gap-2 flex-wrap">
                  {customer?.tax_exempt && <Badge className="bg-emerald-100 text-emerald-700 border-0">Tax Exempt</Badge>}
                  {customer?.parts_markup_override !== null && customer?.parts_markup_override !== undefined && customer?.parts_markup_override !== "" && <Badge className="bg-blue-100 text-blue-700 border-0">Custom Markup: {customer.parts_markup_override}%</Badge>}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Issue Date</Label><Input type="date" value={form.issue_date} onChange={e => setForm({...form, issue_date: e.target.value})} /></div>
              <div><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} /></div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["draft","sent","partial","paid","overdue","void"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.customer_id && (
              <EngineSelector
                customerId={form.customer_id}
                value={form.customer_engine_id || ""}
                onChange={(v) => setForm({...form, customer_engine_id: v})}
                platforms={platforms}
              />
            )}
          </CardContent>
        </Card>
        {customer && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Bill To</CardTitle></CardHeader>
            <CardContent>
              <p className="font-semibold">{customer.first_name} {customer.last_name}</p>
              {customer.company_name && <p className="text-slate-600">{customer.company_name}</p>}
              {customer.address_line1 && <p className="text-slate-600">{customer.address_line1}</p>}
              {customer.city && <p className="text-slate-600">{customer.city}, {customer.state} {customer.zip}</p>}
              {customer.email && <p className="text-slate-600">{customer.email}</p>}
              {selectedEngine && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-sm">
                  {selectedEngine.eed_id && <div><p className="text-xs text-slate-400 uppercase">EED ID</p><p className="font-mono font-bold text-[#e20404]">{selectedEngine.eed_id}</p></div>}
                  {selectedEngine.engine_serial_number && <div><p className="text-xs text-slate-400 uppercase">Serial #</p><p className="font-semibold">{selectedEngine.engine_serial_number}</p></div>}
                  {selectedEnginePlatform && <div><p className="text-xs text-slate-400 uppercase">Platform</p><p className="font-semibold">{selectedEnginePlatform.manufacturer} {selectedEnginePlatform.name}{selectedEnginePlatform.year_range_start ? ` (${selectedEnginePlatform.year_range_start}${selectedEnginePlatform.year_range_end ? `–${selectedEnginePlatform.year_range_end}` : "+"})` : ""}</p></div>}
                  {selectedEngine.current_stage && <div><p className="text-xs text-slate-400 uppercase">Stage</p><p className="font-semibold">{STAGE_LABELS_INV[selectedEngine.current_stage] || selectedEngine.current_stage}</p></div>}
                  {selectedSpecSheet && <div><p className="text-xs text-slate-400 uppercase">Spec Sheet</p><p className="font-semibold text-purple-700">{selectedSpecSheet.custom_name || STAGE_LABELS_INV[selectedSpecSheet.spec_type] || selectedSpecSheet.spec_type} <span className="text-slate-400 text-xs">v{selectedSpecSheet.version}</span></p></div>}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Parts */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Parts</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCoreCreditOpen(true)} className="border-emerald-400 text-emerald-700 hover:bg-emerald-50"><Recycle className="w-4 h-4 mr-1" /> Add Core Credit</Button>
            <Button size="sm" variant="outline" onClick={() => { setPickingIdx(null); setPickerInitialTab("cores"); setPartPickerOpen(true); }} className="border-purple-300 text-purple-700 hover:bg-purple-50"><Recycle className="w-4 h-4 mr-1" /> Add Core</Button>
            <Button size="sm" variant="outline" onClick={addLine}><Plus className="w-4 h-4 mr-1" /> Add Part</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600 w-28">Part #</th>
                  <th className="text-left py-2 font-medium text-slate-600">Item Name</th>
                  <th className="text-center py-2 font-medium text-slate-600 w-16">Qty</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Unit Cost</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Unit Price</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Total</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {(form.line_items || []).map((line, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-2">
                      <Input value={line.part_number} onChange={e => updateLine(idx, "part_number", e.target.value)} placeholder="Part #" className="border-slate-200 text-xs font-mono" />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex gap-1">
                        <Input value={line.item_name} onChange={e => updateLine(idx, "item_name", e.target.value)} placeholder="Item name..." className="border-slate-200" />
                        <Button size="sm" variant="ghost" className="text-slate-400 hover:text-[#e20404] px-2 shrink-0" title="Pick from inventory" onClick={() => { setPickingIdx(idx); setPickerInitialTab("parts"); setPartPickerOpen(true); }}>
                          <Search className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                    <td className="py-2 px-1">
                      <Input type="number" value={line.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} className="text-center border-slate-200" min="0" />
                    </td>
                    <td className="py-2 px-1">
                      <Input type="number" value={line.unit_cost} onChange={e => updateLine(idx, "unit_cost", Number(e.target.value))} className="text-right border-slate-200 text-slate-400" min="0" step="0.01" />
                    </td>
                    <td className="py-2 px-1">
                      <Input type="number" value={line.unit_price} onChange={e => updateLine(idx, "unit_price", Number(e.target.value))} className="text-right border-slate-200" min="0" step="0.01" />
                    </td>
                    <td className="py-2 px-1 text-right font-medium">${Number(line.total || 0).toFixed(2)}</td>
                    <td className="py-2">
                      <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => removeLine(idx)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Labor */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Wrench className="w-4 h-4" /> Labor</CardTitle>
          <Button size="sm" variant="outline" onClick={addLabor}><Plus className="w-4 h-4 mr-1" /> Add Labor</Button>
        </CardHeader>
        <CardContent>
          {(form.labor_items || []).length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">No labor items added.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600 w-40">Name</th>
                  <th className="text-left py-2 font-medium text-slate-600">Description</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-28">Price</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {(form.labor_items || []).map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-2">
                      <div className="flex gap-1">
                        <Input value={item.name} onChange={e => updateLabor(idx, "name", e.target.value)} placeholder="Labor name..." className="border-slate-200" />
                        <Button size="sm" variant="ghost" className="text-slate-400 hover:text-[#e20404] px-2 shrink-0" title="Pick from catalog" onClick={() => { setLaborPickingIdx(idx); setLaborPickerOpen(true); }}><Search className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                    <td className="py-2 pr-2"><Input value={item.description} onChange={e => updateLabor(idx, "description", e.target.value)} placeholder="Description..." className="border-slate-200" /></td>
                    <td className="py-2 px-1"><Input type="number" value={item.price} onChange={e => updateLabor(idx, "price", Number(e.target.value))} className="text-right border-slate-200" min="0" step="0.01" /></td>
                    <td className="py-2"><Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => removeLabor(idx)}><Trash2 className="w-3.5 h-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Machining */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Cog className="w-4 h-4" /> Machining</CardTitle>
          <Button size="sm" variant="outline" onClick={addMachining}><Plus className="w-4 h-4 mr-1" /> Add Machining</Button>
        </CardHeader>
        <CardContent>
          {(form.machining_items || []).length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">No machining items added.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600 w-40">Name</th>
                  <th className="text-left py-2 font-medium text-slate-600">Description</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-28">Price</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {(form.machining_items || []).map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-2">
                      <div className="flex gap-1">
                        <Input value={item.name} onChange={e => updateMachining(idx, "name", e.target.value)} placeholder="Machining name..." className="border-slate-200" />
                        <Button size="sm" variant="ghost" className="text-slate-400 hover:text-[#e20404] px-2 shrink-0" title="Pick from catalog" onClick={() => { setMachiningPickingIdx(idx); setMachiningPickerOpen(true); }}><Search className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                    <td className="py-2 pr-2"><Input value={item.description} onChange={e => updateMachining(idx, "description", e.target.value)} placeholder="Description..." className="border-slate-200" /></td>
                    <td className="py-2 px-1"><Input type="number" value={item.price} onChange={e => updateMachining(idx, "price", Number(e.target.value))} className="text-right border-slate-200" min="0" step="0.01" /></td>
                    <td className="py-2"><Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => removeMachining(idx)}><Trash2 className="w-3.5 h-3.5" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="w-64 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Parts Subtotal</span><span>${(form.line_items || []).reduce((s, l) => s + (l.total || 0), 0).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Labor Subtotal</span><span>${(form.labor_items || []).reduce((s, l) => s + (Number(l.price) || 0), 0).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Machining Subtotal</span><span>${(form.machining_items || []).reduce((s, m) => s + (Number(m.price) || 0), 0).toFixed(2)}</span></div>
          <div className="flex justify-between font-medium border-t border-slate-200 pt-2"><span className="text-slate-600">Subtotal</span><span>${Number(form.subtotal || 0).toFixed(2)}</span></div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600 flex items-center gap-1">Tax Rate (%) {customer?.tax_exempt && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">Exempt</Badge>}</span>
            <Input type="number" value={form.tax_rate} onChange={e => updateTaxRate(Number(e.target.value))} className="w-20 text-right h-7" min="0" step="0.1" disabled={customer?.tax_exempt} />
          </div>
          {Number(form.tax_rate) > 0 && <div className="flex justify-between text-slate-500"><span>Tax ({form.tax_rate}% on parts)</span><span>${Number(form.tax_amount || 0).toFixed(2)}</span></div>}
          <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2"><span>Total</span><span>${Number(form.total || 0).toFixed(2)}</span></div>
          {availableCreditBalance > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600">Account Credit</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">(Avail: ${availableCreditBalance.toFixed(2)})</span>
                <Input type="number" value={Number(form.applied_credits) || 0} onChange={e => {
                  const applied = Math.min(Math.max(0, Number(e.target.value) || 0), availableCreditBalance);
                  const totals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, applied);
                  setForm(f => ({ ...f, applied_credits: applied, ...totals }));
                }} className="w-20 text-right h-7" min="0" step="0.01" />
              </div>
            </div>
          )}
          {Number(form.amount_paid) > 0 && <div className="flex justify-between text-emerald-600"><span>Paid</span><span>-${Number(form.amount_paid).toFixed(2)}</span></div>}
          <div className="flex justify-between text-base font-bold text-[#e20404]"><span>Balance Due</span><span>${Number(form.balance_due || 0).toFixed(2)}</span></div>
        </div>
      </div>

      {/* Payment History */}
      {(form.payments || []).length > 0 && (
        <Card className="border-0 shadow-sm mb-6">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4" /> Payment History</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600">Date</th>
                  <th className="text-left py-2 font-medium text-slate-600">Method</th>
                  <th className="text-left py-2 font-medium text-slate-600">Note</th>
                  <th className="text-right py-2 font-medium text-slate-600">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(form.payments || []).map((p, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 text-slate-500">{p.date}</td>
                    <td className="py-2"><Badge className="bg-slate-100 text-slate-700 border-0 capitalize text-xs">{p.method}</Badge></td>
                    <td className="py-2 text-slate-500">{p.note || "—"}</td>
                    <td className="py-2 text-right font-semibold text-emerald-700">${Number(p.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div><Label>Notes for Customer</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={4} /></div>
        <div><Label>Payment Notes</Label><Textarea value={form.payment_notes} onChange={e => setForm({...form, payment_notes: e.target.value})} rows={4} /></div>
      </div>
    </div>
  );
}