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
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, Plus, Trash2, Send, Printer, Package, Wrench, Search,
  DollarSign, Wrench as WrenchIcon, CheckCircle, AlertTriangle, Receipt
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import PartPickerModal from "@/components/estimates/PartPickerModal";
import GeneratePOModal from "@/components/estimates/GeneratePOModal";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";
import PaymentModal from "@/components/PaymentModal";
import QuickCreateCustomerModal from "@/components/QuickCreateCustomerModal";
import CannedJobPicker from "@/components/estimates/CannedJobPicker";
import PrintableEstimate from "@/components/PrintableEstimate";
import EngineSelector from "@/components/EngineSelector";

const emptyPart = { part_id: "", part_number: "", item_name: "", quantity: 1, unit_cost: 0, unit_price: 0, total: 0 };
const emptyLabor = { name: "", description: "", price: 0 };

const STATUS_BADGE = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-400",
};

export default function EstimateDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const isNew = params.get("new") === "1";
  const prefillCustomerId = params.get("customer_id");
  const prefillBuildId = params.get("build_id");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    estimate_number: `EST-${Date.now().toString().slice(-6)}`,
    customer_id: "", status: "draft",
    issue_date: new Date().toISOString().split("T")[0],
    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    deposit_required: false,
    deposit_amount: 0,
    deposit_paid: false,
    is_engine_build: true,
    payments: [],
    line_items: [{ ...emptyPart }],
    labor_items: [],
    tax_rate: 0, notes: "", internal_notes: ""
  });
  const [sending, setSending] = useState(false);
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [pickingIdx, setPickingIdx] = useState(null);
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [convertingToBuild, setConvertingToBuild] = useState(false);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [cannedJobOpen, setCannedJobOpen] = useState(false);
  const [selectedSpec, setSelectedSpec] = useState(null);
  const [selectedSpecPlatform, setSelectedSpecPlatform] = useState(null);
  const [printMode, setPrintMode] = useState(false);

  const { data: estimate } = useQuery({
    queryKey: ["estimate", id],
    queryFn: () => base44.entities.Estimate.filter({ id }),
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
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 100),
  });

  useEffect(() => {
    if (estimate && estimate[0]) {
      setForm({ labor_items: [], payments: [], ...estimate[0] });
    }
  }, [estimate]);

  useEffect(() => {
    if (isNew && settingsData?.[0]?.default_tax_rate) {
      setForm(f => ({ ...f, tax_rate: settingsData[0].default_tax_rate }));
    }
  }, [settingsData, isNew]);

  useEffect(() => {
    if (isNew && prefillCustomerId) {
      setForm(f => ({ ...f, customer_id: prefillCustomerId, build_id: prefillBuildId || "" }));
    }
  }, [isNew, prefillCustomerId, prefillBuildId]);

  const saveMutation = useMutation({
    mutationFn: (data) => id
      ? base44.entities.Estimate.update(id, data)
      : base44.entities.Estimate.create(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      toast.success("Estimate saved");
      if (isNew) navigate(`/EstimateDetail?id=${result.id}`);
    },
  });

  const recalc = (lineItems, laborItems, taxRate) => {
    const partTotal = lineItems.reduce((s, l) => s + (l.total || 0), 0);
    const laborTotal = laborItems.reduce((s, l) => s + (Number(l.price) || 0), 0);
    const subtotal = partTotal + laborTotal;
    const tax_amount = subtotal * (Number(taxRate) / 100);
    return { subtotal, tax_amount, total: subtotal + tax_amount };
  };

  const updateLine = (idx, field, value) => {
    const lines = [...form.line_items];
    lines[idx] = { ...lines[idx], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      lines[idx].total = (Number(lines[idx].quantity) || 0) * (Number(lines[idx].unit_price) || 0);
    }
    const totals = recalc(lines, form.labor_items, form.tax_rate);
    setForm({ ...form, line_items: lines, ...totals });
  };

  const selectPart = (part) => {
    const lines = [...form.line_items];
    lines[pickingIdx] = {
      part_id: part.id, part_number: part.part_number, item_name: part.name,
      quantity: 1, unit_cost: part.unit_cost || 0, unit_price: part.sell_price || 0,
      total: part.sell_price || 0,
    };
    const totals = recalc(lines, form.labor_items, form.tax_rate);
    setForm({ ...form, line_items: lines, ...totals });
  };

  const addLine = () => setForm(f => ({ ...f, line_items: [...f.line_items, { ...emptyPart }] }));
  const removeLine = (idx) => {
    const lines = form.line_items.filter((_, i) => i !== idx);
    const totals = recalc(lines, form.labor_items, form.tax_rate);
    setForm({ ...form, line_items: lines, ...totals });
  };

  const addLabor = () => setForm(f => ({ ...f, labor_items: [...(f.labor_items || []), { ...emptyLabor }] }));
  const updateLabor = (idx, field, value) => {
    const items = [...(form.labor_items || [])];
    items[idx] = { ...items[idx], [field]: value };
    const totals = recalc(form.line_items, items, form.tax_rate);
    setForm({ ...form, labor_items: items, ...totals });
  };
  const removeLabor = (idx) => {
    const items = (form.labor_items || []).filter((_, i) => i !== idx);
    const totals = recalc(form.line_items, items, form.tax_rate);
    setForm({ ...form, labor_items: items, ...totals });
  };

  const updateTaxRate = (rate) => {
    const totals = recalc(form.line_items, form.labor_items || [], rate);
    setForm({ ...form, tax_rate: rate, ...totals });
  };

  const handleCannedJobSelect = async (spec, platform) => {
    setSelectedSpec(spec);
    setSelectedSpecPlatform(platform);

    // Fetch current inventory prices at the moment the canned job is loaded
    const [allParts, allLaborItems] = await Promise.all([
      base44.entities.Part.list("-created_date", 500),
      base44.entities.LaborItem.list("-created_date", 200),
    ]);

    const partsMap = Object.fromEntries(allParts.map(p => [p.id, p]));
    const laborMap = Object.fromEntries(allLaborItems.map(l => [l.id, l]));

    // Build line items with current sell prices from inventory
    const cannedLineItems = (spec.canned_items?.line_items || []).length > 0
      ? spec.canned_items.line_items.map(item => {
          const inventoryPart = item.part_id ? partsMap[item.part_id] : null;
          const unitPrice = inventoryPart ? (Number(inventoryPart.sell_price) || 0) : 0;
          const unitCost = inventoryPart ? (Number(inventoryPart.unit_cost) || 0) : 0;
          const qty = Number(item.quantity) || 1;
          return {
            part_id: item.part_id || "",
            part_number: item.part_number || "",
            item_name: item.item_name || "",
            quantity: qty,
            unit_cost: unitCost,
            unit_price: unitPrice,
            total: qty * unitPrice,
          };
        })
      : [{ ...emptyPart }];

    // Build labor items with current prices from labor catalog
    const cannedLaborItems = (spec.canned_items?.labor_items || []).length > 0
      ? spec.canned_items.labor_items.map(item => {
          const inventoryLabor = item.labor_item_id ? laborMap[item.labor_item_id] : null;
          return {
            name: item.name || "",
            description: item.description || "",
            price: inventoryLabor ? (Number(inventoryLabor.price) || 0) : 0,
          };
        })
      : [{ name: "Engine Assembly & Dyno", description: `${spec.custom_name || spec.spec_type} spec build`, price: 0 }];

    const updatedNotes = (form.notes ? form.notes + "\n\n" : "") +
      `Engine Build: ${spec.custom_name || spec.spec_type} — ${platform?.manufacturer || ""} ${platform?.name || ""}\n` +
      (spec.notes ? `Spec Notes: ${spec.notes}` : "");

    const totals = recalc(cannedLineItems, cannedLaborItems, form.tax_rate);
    setForm(f => ({ ...f, line_items: cannedLineItems, labor_items: cannedLaborItems, notes: updatedNotes, ...totals }));
    toast.success("Canned job loaded with current inventory prices");
  };

  const totalDeposit = (form.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const depositMet = !form.deposit_required || totalDeposit >= Number(form.deposit_amount || 0);

  const handleRecordPayment = async (payment) => {
    const updatedPayments = [...(form.payments || []), payment];
    const newTotalDeposit = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const newDepositPaid = newTotalDeposit >= Number(form.deposit_amount || 0);
    const updated = { ...form, payments: updatedPayments, deposit_paid: newDepositPaid };
    setForm(updated);
    await saveMutation.mutateAsync(updated);
    toast.success("Payment recorded");
  };

  const handleApprove = async () => {
    if (form.deposit_required && !depositMet) {
      toast.error("Deposit must be received before approving this estimate");
      return;
    }
    const updated = { ...form, status: "approved" };
    setForm(updated);
    await saveMutation.mutateAsync(updated);

    if (form.is_engine_build) {
      // Auto-create engine build, prefilling from previous build for this engine
      setConvertingToBuild(true);
      const cust = customers.find(c => c.id === form.customer_id);

      // Find previous builds for this engine to prefill data
      let prevBuildData = {};
      if (form.customer_engine_id) {
        try {
          const engineRec = await base44.entities.CustomerEngine.filter({ id: form.customer_engine_id });
          const eng = engineRec[0];
          if (eng) {
            // Find last completed build with same serial
            const prevBuilds = await base44.entities.EngineBuild.filter({ engine_serial_number: eng.engine_serial_number });
            const lastBuild = prevBuilds.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0];
            if (lastBuild) {
              prevBuildData = {
                valve_lash_intake: lastBuild.valve_lash_intake,
                valve_lash_exhaust: lastBuild.valve_lash_exhaust,
                internal_measurements: lastBuild.internal_measurements,
                cam_info: lastBuild.cam_info,
                max_rpm: lastBuild.max_rpm,
                oil_recommendation: lastBuild.oil_recommendation,
                oil_change_interval: lastBuild.oil_change_interval,
                spark_plug_recommendation: lastBuild.spark_plug_recommendation,
                refresh_interval: lastBuild.refresh_interval,
                application: lastBuild.application,
                transmission_type: lastBuild.transmission_type,
                spec_sheet_id: lastBuild.spec_sheet_id,
              };
            }
            const build = await base44.entities.EngineBuild.create({
              engine_serial_number: eng.engine_serial_number,
              eed_id: eng.eed_id,
              customer_engine_id: eng.id,
              platform_id: eng.platform_id,
              build_number: form.estimate_number,
              customer_id: form.customer_id,
              customer_name: cust ? `${cust.first_name} ${cust.last_name}` : "",
              status: "queued",
              work_tag: "none",
              assembly_notes: form.notes || "",
              ...prevBuildData,
            });
            await base44.entities.Estimate.update(id, { build_id: build.id });
            setForm(f => ({ ...f, build_id: build.id }));
            qc.invalidateQueries({ queryKey: ["builds"] });
            setConvertingToBuild(false);
            toast.success("Estimate approved — engine build created with previous build data!");
            navigate(`/BuildDetail?id=${build.id}`);
            return;
          }
        } catch (e) {
          console.error("Error prefilling from previous build", e);
        }
      }

      // Fallback: no engine selected
      const build = await base44.entities.EngineBuild.create({
        engine_serial_number: `ESN-${Date.now().toString().slice(-6)}`,
        build_number: form.estimate_number,
        customer_id: form.customer_id,
        customer_name: cust ? `${cust.first_name} ${cust.last_name}` : "",
        status: "queued",
        work_tag: "none",
        assembly_notes: form.notes || "",
      });
      await base44.entities.Estimate.update(id, { build_id: build.id });
      setForm(f => ({ ...f, build_id: build.id }));
      qc.invalidateQueries({ queryKey: ["builds"] });
      setConvertingToBuild(false);
      toast.success("Estimate approved — engine build created!");
      navigate(`/BuildDetail?id=${build.id}`);
    } else {
      // Auto-create invoice
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const invoice = await base44.entities.Invoice.create({
        invoice_number: invoiceNumber,
        estimate_id: id,
        customer_id: form.customer_id,
        customer_engine_id: form.customer_engine_id || "",
        status: "sent",
        issue_date: new Date().toISOString().split("T")[0],
        line_items: form.line_items,
        labor_items: form.labor_items || [],
        subtotal: form.subtotal,
        tax_rate: form.tax_rate,
        tax_amount: form.tax_amount,
        total: form.total,
        amount_paid: totalDeposit > 0 ? totalDeposit : 0,
        balance_due: Math.max(0, (form.total || 0) - totalDeposit),
        notes: form.notes || "",
        payments: form.payments || [],
      });
      await base44.entities.Estimate.update(id, { invoice_id: invoice.id });
      setForm(f => ({ ...f, invoice_id: invoice.id }));
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Estimate approved — invoice created!");
      navigate(`/InvoiceDetail?id=${invoice.id}`);
    }
  };

  const handleConvertToBuild = async () => {
    if (form.status !== "approved") {
      toast.error("Estimate must be approved first");
      return;
    }
    setConvertingToBuild(true);
    const customer = customers.find(c => c.id === form.customer_id);
    try {
      const build = await base44.entities.EngineBuild.create({
        engine_serial_number: `ESN-${Date.now().toString().slice(-6)}`,
        build_number: form.estimate_number,
        customer_id: form.customer_id,
        customer_name: customer ? `${customer.first_name} ${customer.last_name}` : "",
        status: "queued",
        work_tag: "none",
        assembly_notes: form.notes || "",
      });
      // Link estimate to build
      const updated = { ...form, build_id: build.id };
      setForm(updated);
      await base44.entities.Estimate.update(id, { build_id: build.id });
      qc.invalidateQueries({ queryKey: ["builds"] });
      toast.success("Engine build created! Redirecting...");
      navigate(`/BuildDetail?id=${build.id}`);
    } catch (e) {
      toast.error("Failed to create build");
    } finally {
      setConvertingToBuild(false);
    }
  };

  const sendEstimate = async () => {
    const customer = customers.find(c => c.id === form.customer_id);
    if (!customer?.email) { toast.error("Customer has no email address"); return; }
    setSending(true);
    try {
      console.log(`[sendEstimate] Starting send for estimate ${form.estimate_number}`);
      await saveMutation.mutateAsync(form);
      
      // Generate public access token
      const publicAccessToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      console.log(`[sendEstimate] Generated public_access_token: ${publicAccessToken}`);
      
      // Generate Stripe checkout URL
      const amount = form.deposit_required ? form.deposit_amount : form.total;
      console.log(`[sendEstimate] Generating Stripe checkout URL for amount: $${amount}`);
      const stripeUrlRes = await base44.functions.invoke("generateStripeCheckoutUrl", {
        type: "estimate",
        documentId: id,
        amount,
        description: `Estimate ${form.estimate_number} - ${form.deposit_required ? "Deposit" : "Full Payment"}`,
        publicAccessToken,
        customerEmail: customer.email,
      });
      
      if (!stripeUrlRes?.data?.checkout_url) {
        console.error("[sendEstimate] Stripe checkout URL generation failed:", stripeUrlRes);
        toast.error("Failed to generate payment link");
        setSending(false);
        return;
      }
      console.log(`[sendEstimate] Stripe checkout URL generated successfully`);
      
      // Update estimate with public access token and stripe checkout URL
      console.log(`[sendEstimate] Updating estimate with public_access_token and stripe_checkout_url`);
      await base44.entities.Estimate.update(id || "", {
        public_access_token: publicAccessToken,
        stripe_checkout_url: stripeUrlRes.data.checkout_url,
        status: "sent"
      });

      // Sync snapshot to public app (non-blocking for testing)
      console.log(`[sendEstimate] Syncing estimate snapshot to public app...`);
      let snapshotError = null;
      try {
        const syncRes = await base44.functions.invoke("syncEstimateSnapshot", {
          estimateId: id,
          publicAccessToken,
        });

        if (syncRes?.data?.error) {
          snapshotError = syncRes.data.error;
          console.error("Snapshot sync failed full response:", syncRes.data);
          console.error(`[sendEstimate] Snapshot sync error details:`, {
            error: syncRes.data.error,
            details: syncRes.data.details,
            response_data: syncRes?.data,
            response_status: syncRes?.status,
          });
          toast.error(`Snapshot sync failed: ${snapshotError} - Continuing with email anyway...`);
        } else {
          console.log(`[sendEstimate] Snapshot sync successful`);
        }
      } catch (syncError) {
        console.error("Snapshot sync failed full response:", syncError.response?.data || syncError);
        console.error(`[sendEstimate] Snapshot sync caught error:`, {
          message: syncError.message,
          response_data: syncError.response?.data,
          response_status: syncError.response?.status,
          full_error: syncError,
        });
        snapshotError = syncError.message;
        toast.error(`Snapshot sync error: ${syncError.message} - Continuing with email anyway...`);
      }

      const viewUrl = `https://elite-viewer.base44.app/estimate/${publicAccessToken}`;
      console.log(`[sendEstimate] Public viewer URL: ${viewUrl}`);
      
      const settings = settingsData?.[0] || {};
      const subject = `Your Estimate is Ready — ${form.estimate_number}`;
      console.log(`[sendEstimate] Building email - To: ${customer.email}, Subject: ${subject}, ViewUrl: ${viewUrl}`);
      const depositText = form.deposit_required 
        ? `<p style="color: #e20404; font-weight: 600; margin: 0;">Deposit Required: $${Number(form.deposit_amount || 0).toFixed(2)}</p>`
        : '';
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
              .header-title { font-size: 32px; font-weight: 700; margin: 12px 0 4px 0; color: #ffffff; }
              .header-subtitle { font-size: 14px; color: #e20404; font-weight: 600; letter-spacing: 1px; margin: 0; }
              .content { padding: 40px 32px; }
              .greeting { font-size: 18px; font-weight: 600; color: #1a1a1a; margin: 0 0 16px 0; }
              .description { font-size: 15px; color: #4a5568; line-height: 1.6; margin: 0 0 24px 0; }
              .amount-box { background: #f8f9fa; border-left: 4px solid #e20404; padding: 20px; margin: 32px 0; border-radius: 4px; }
              .amount-label { font-size: 12px; color: #718096; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px 0; }
              .amount-value { font-size: 32px; color: #1a1a1a; font-weight: 700; margin: 0; }
              .deposit-info { color: #e20404; font-weight: 600; margin-top: 12px; font-size: 14px; }
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
                <h1 class="header-title">Estimate Ready</h1>
                <p class="header-subtitle">${form.estimate_number}</p>
              </div>
              
              <div class="content">
                <p class="greeting">Hi ${customer.first_name},</p>
                <p class="description">Thank you for choosing us. We've prepared a detailed estimate for your project. Please review it and let us know if you have any questions.</p>
                
                <div class="amount-box">
                  <p class="amount-label">Total Estimate</p>
                  <p class="amount-value">$${Number(form.total || 0).toFixed(2)}</p>
                  ${depositText}
                </div>
                
                <p class="description">This estimate is valid for 30 days. Once approved, we'll begin work on your project right away.</p>
                
                <div class="cta-wrapper">
                  <a href="${viewUrl}" class="cta-button">Review Estimate & Approve</a>
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
      
      console.log(`[sendEstimate] Sending SMTP email to ${customer.email}...`);
      const result = await base44.functions.invoke("sendSmtpEmail", { to: customer.email, subject, html, usePOSmtp: false });
      if (result?.data?.error) { 
        console.error(`[sendEstimate] SMTP send failed:`, result.data.error);
        toast.error("Failed to send email"); 
        setSending(false); 
        return; 
      }
      console.log(`[sendEstimate] Email sent successfully to ${customer.email}`);
      
      qc.invalidateQueries({ queryKey: ["estimates"] });
      setForm(f => ({ ...f, status: "sent", public_access_token: publicAccessToken, stripe_checkout_url: stripeUrlRes.data.checkout_url }));
      toast.success(`Estimate sent to ${customer.email}`);
    } catch (err) {
      toast.error("Failed to send estimate");
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

  const customer = customers.find(c => c.id === form.customer_id);
  const selectedEngine = customerEngines.find(e => e.id === form.customer_engine_id);
  const selectedEnginePlatform = platforms.find(p => p.id === selectedEngine?.platform_id);

  if (printMode) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4 print:hidden">
          <button onClick={() => setPrintMode(false)} className="px-4 py-2 bg-slate-200 rounded hover:bg-slate-300">← Back to Edit</button>
          <button onClick={() => { document.title = `Estimate ${form.estimate_number}`; window.print(); }} className="px-4 py-2 bg-[#e20404] text-white rounded hover:bg-[#c00303] font-semibold">🖨 Print Estimate</button>
        </div>
        <PrintableEstimate estimate={form} customer={customer || { first_name: "", last_name: "" }} settings={settingsData?.[0]} customerEngine={selectedEngine} platform={selectedEnginePlatform} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <CannedJobPicker
        open={cannedJobOpen}
        onClose={() => setCannedJobOpen(false)}
        specSheets={specSheets}
        platforms={platforms}
        parts={parts}
        onSelect={handleCannedJobSelect}
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
        onSelect={(part) => { selectPart(part); setPartPickerOpen(false); }}
      />
      <GeneratePOModal
        open={poModalOpen}
        onClose={() => setPoModalOpen(false)}
        lineItems={form.line_items}
        sourceNumber={form.estimate_number}
      />
      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        balanceDue={form.deposit_required ? Math.max(0, Number(form.deposit_amount || 0) - totalDeposit) : undefined}
        totalPaid={totalDeposit}
        onRecord={handleRecordPayment}
        title={form.deposit_required ? "Record Deposit Payment" : "Record Payment"}
      />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <Link to="/Estimates"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
        <div className="flex-1">
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
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Details + Bill To */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Estimate Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Customer *</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <CustomerSearchSelect
                    customers={customers}
                    value={form.customer_id}
                    onValueChange={v => setForm({...form, customer_id: v})}
                  />
                </div>
                <Button type="button" variant="outline" size="sm" className="shrink-0 mt-0" onClick={() => setQuickCustomerOpen(true)}>
                  + New
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Issue Date</Label><Input type="date" value={form.issue_date} onChange={e => setForm({...form, issue_date: e.target.value})} /></div>
              <div><Label>Expiry Date</Label><Input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} /></div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["draft","sent","approved","declined","expired"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
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
            <div className="border border-slate-200 rounded-lg px-3 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">Engine Build</p>
                  <p className="text-xs text-slate-400">Approval creates a build; otherwise creates an invoice</p>
                </div>
                <Switch
                  checked={!!form.is_engine_build}
                  onCheckedChange={v => setForm({...form, is_engine_build: v})}
                />
              </div>
              {form.is_engine_build && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                  {selectedSpec ? (
                    <span className="text-xs text-purple-700 font-medium">
                      {selectedSpec.custom_name || selectedSpec.spec_type} — {selectedSpecPlatform?.manufacturer} {selectedSpecPlatform?.name}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">No spec sheet selected</span>
                  )}
                  <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 text-xs h-7" onClick={() => setCannedJobOpen(true)}>
                    <WrenchIcon className="w-3 h-3 mr-1" /> {selectedSpec ? "Change Spec" : "Load Canned Job"}
                  </Button>
                </div>
              )}
            </div>
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
              {customer.phone && <p className="text-slate-600">{customer.phone}</p>}
              {selectedEngine && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-sm">
                  {selectedEngine.eed_id && <div><p className="text-xs text-slate-400 uppercase">EED ID</p><p className="font-mono font-bold text-[#e20404]">{selectedEngine.eed_id}</p></div>}
                  {selectedEngine.engine_serial_number && <div><p className="text-xs text-slate-400 uppercase">Serial #</p><p className="font-semibold">{selectedEngine.engine_serial_number}</p></div>}
                  {selectedEnginePlatform && <div><p className="text-xs text-slate-400 uppercase">Platform</p><p className="font-semibold">{selectedEnginePlatform.manufacturer} {selectedEnginePlatform.name}{selectedEnginePlatform.year_range_start ? ` (${selectedEnginePlatform.year_range_start}${selectedEnginePlatform.year_range_end ? `–${selectedEnginePlatform.year_range_end}` : "+"})` : ""}</p></div>}
                  {selectedEngine.current_stage && <div><p className="text-xs text-slate-400 uppercase">Stage</p><p className="font-semibold capitalize">{{"stock":"Stock","stage_1":"Stage 1","stage_2":"Stage 2","stage_3":"Stage 3","contract":"Contract","custom":"Custom"}[selectedEngine.current_stage] || selectedEngine.current_stage}</p></div>}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Deposit Section */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Deposit
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Require deposit</span>
              <Switch
                checked={form.deposit_required}
                onCheckedChange={v => setForm({...form, deposit_required: v})}
              />
            </div>
          </div>
        </CardHeader>
        {form.deposit_required && (
          <CardContent>
            <div className="flex items-end gap-4">
              <div className="w-48">
                <Label>Deposit Amount</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <Input
                    type="number"
                    value={form.deposit_amount}
                    onChange={e => setForm({...form, deposit_amount: Number(e.target.value)})}
                    className="pl-7"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="text-sm text-slate-500 mb-1">Payments Received</div>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold ${depositMet ? "text-emerald-600" : "text-amber-600"}`}>
                    ${totalDeposit.toFixed(2)} / ${Number(form.deposit_amount || 0).toFixed(2)}
                  </span>
                  {depositMet
                    ? <Badge className="bg-emerald-100 text-emerald-700 border-0">Deposit Received</Badge>
                    : <Badge className="bg-amber-100 text-amber-700 border-0">Awaiting Deposit</Badge>
                  }
                </div>
              </div>
              {id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => setPaymentModalOpen(true)}
                >
                  <DollarSign className="w-4 h-4 mr-1" /> Record Payment
                </Button>
              )}
            </div>

            {/* Payment Log */}
            {(form.payments || []).length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3 space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Payment History</p>
                {(form.payments || []).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-slate-100 text-slate-600 border-0 capitalize text-xs">{p.method}</Badge>
                      {p.note && <span className="text-slate-500">{p.note}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 text-xs">{p.date}</span>
                      <span className="font-semibold text-emerald-700">${Number(p.amount).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Parts */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Parts</CardTitle>
          <Button size="sm" variant="outline" onClick={addLine}><Plus className="w-4 h-4 mr-1" /> Add Part</Button>
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
                        <Button size="sm" variant="ghost" className="text-slate-400 hover:text-[#e20404] px-2 shrink-0" onClick={() => { setPickingIdx(idx); setPartPickerOpen(true); }}>
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
                    <td className="py-2 pr-2"><Input value={item.name} onChange={e => updateLabor(idx, "name", e.target.value)} placeholder="Labor name..." className="border-slate-200" /></td>
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

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="w-72 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Parts Subtotal</span><span>${(form.line_items || []).reduce((s, l) => s + (l.total || 0), 0).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Labor Subtotal</span><span>${(form.labor_items || []).reduce((s, l) => s + (Number(l.price) || 0), 0).toFixed(2)}</span></div>
          <div className="flex justify-between font-medium border-t border-slate-200 pt-2"><span className="text-slate-600">Subtotal</span><span>${Number(form.subtotal || 0).toFixed(2)}</span></div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">Tax Rate (%)</span>
            <Input type="number" value={form.tax_rate} onChange={e => updateTaxRate(Number(e.target.value))} className="w-20 text-right h-7" min="0" step="0.1" />
          </div>
          {Number(form.tax_rate) > 0 && <div className="flex justify-between"><span className="text-slate-600">Tax</span><span>${Number(form.tax_amount || 0).toFixed(2)}</span></div>}
          <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2"><span>Total</span><span className="text-[#e20404]">${Number(form.total || 0).toFixed(2)}</span></div>
          {form.deposit_required && (
            <div className="flex justify-between text-emerald-700 font-medium border-t border-slate-100 pt-2">
              <span>Deposit Required</span>
              <span>${Number(form.deposit_amount || 0).toFixed(2)}</span>
            </div>
          )}
          {totalDeposit > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Deposit Received</span>
              <span>-${totalDeposit.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div><Label>Customer Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={4} placeholder="Notes visible to customer..." /></div>
        <div><Label>Internal Notes</Label><Textarea value={form.internal_notes} onChange={e => setForm({...form, internal_notes: e.target.value})} rows={4} placeholder="Internal only..." /></div>
      </div>
    </div>
  );
}