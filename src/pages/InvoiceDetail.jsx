import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Send, Printer, DollarSign, Package, Wrench, Search, Cog, Recycle, FileText, Paperclip, Download, Unlink, History, MessageSquare, Layers } from "lucide-react";
import { openSmsDraft } from "@/lib/shareDocText";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import PartPickerModal from "@/components/estimates/PartPickerModal";
import CoreCreditModal from "@/components/estimates/CoreCreditModal";
import QuickCreateCoreModal from "@/components/estimates/QuickCreateCoreModal";
import GeneratePOModal from "@/components/estimates/GeneratePOModal";
import LaborMachiningPickerModal from "@/components/estimates/LaborMachiningPickerModal";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";
import PaymentModal from "@/components/PaymentModal";
import QuickCreateCustomerModal from "@/components/QuickCreateCustomerModal";
import PrintableInvoice from "@/components/PrintableInvoice";
import EngineSelector from "@/components/EngineSelector";
import IllegalPartsViewModal from "@/components/legal/IllegalPartsViewModal";
import HistoryModal from "@/components/HistoryModal";
import EmailsSection from "@/components/emails/EmailsSection";
import MultiPartPickerModal from "@/components/estimates/MultiPartPickerModal";
import PrintableBuildPartsList from "@/components/PrintableBuildPartsList";
import NextStepBanner from "@/components/NextStepBanner";
import LoadingState from "@/components/LoadingState";

const emptyPart = { part_id: "", part_number: "", item_name: "", quantity: 1, unit_cost: 0, unit_price: 0, total: 0 };
const emptyLabor = { name: "", description: "", price: 0 };
const emptyMachining = { name: "", description: "", price: 0, quantity: 1, cost_type: "unspecified", actual_cost: null, vendor: "" };
const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

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
  const isCombinedNew = params.get("combined") === "1";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    invoice_number: `INV-${Date.now().toString().slice(-6)}`,
    customer_id: "", status: "draft",
    issue_date: new Date().toISOString().split("T")[0],
    due_date: "",
    is_combined: isCombinedNew,
    member_invoice_ids: [],
    line_items: [{ ...emptyPart }],
    labor_items: [],
    machining_items: [],
    discount_type: "none", discount_value: 0, discount_amount: 0,
    shipping_cost: 0,
    tax_rate: 0, notes: "", amount_paid: 0, balance_due: 0
  });
  const [sending, setSending] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [pickingIdx, setPickingIdx] = useState(null);
  const [coreCreditOpen, setCoreCreditOpen] = useState(false);
  const [coreCreateOpen, setCoreCreateOpen] = useState(false);
  const [editingCore, setEditingCore] = useState(null);
  const [pickerInitialTab, setPickerInitialTab] = useState("parts");
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [laborPickerOpen, setLaborPickerOpen] = useState(false);
  const [laborPickingIdx, setLaborPickingIdx] = useState(null);
  const [machiningPickerOpen, setMachiningPickerOpen] = useState(false);
  const [machiningPickingIdx, setMachiningPickingIdx] = useState(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pdfFileRef = useRef(null);
  const [legalDocOpen, setLegalDocOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [multiPartPickerOpen, setMultiPartPickerOpen] = useState(false);
  const [printPartsListMode, setPrintPartsListMode] = useState(false);

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPdf(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      const url = res?.file_url || res?.data?.file_url;
      const updated = { ...form, legacy_pdf_url: url };
      setForm(updated);
      if (id) await base44.entities.Invoice.update(id, { legacy_pdf_url: url });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("PDF attached");
    } catch (err) {
      toast.error("Upload failed: " + err.message);
    } finally {
      setUploadingPdf(false);
      e.target.value = "";
    }
  };

  const removePdf = async () => {
    const updated = { ...form, legacy_pdf_url: "" };
    setForm(updated);
    if (id) await base44.entities.Invoice.update(id, { legacy_pdf_url: "" });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    toast.success("PDF removed");
  };

  const [converting, setConverting] = useState(false);
  const convertToEstimate = async () => {
    if (!form.customer_id) { toast.error("Select a customer first"); return; }
    setConverting(true);
    try {
      const estimate = await base44.entities.Estimate.create({
        estimate_number: `EST-${form.invoice_number}`,
        customer_id: form.customer_id,
        customer_engine_id: form.customer_engine_id || "",
        invoice_id: id || "",
        is_engine_build: false,
        status: "draft",
        issue_date: form.issue_date || new Date().toISOString().split("T")[0],
        line_items: form.line_items || [],
        labor_items: form.labor_items || [],
        machining_items: form.machining_items || [],
        payments: [],
        subtotal: Number(form.subtotal) || 0,
        tax_rate: Number(form.tax_rate) || 0,
        tax_amount: Number(form.tax_amount) || 0,
        total: Number(form.total) || 0,
        shipping_cost: Number(form.shipping_cost) || 0,
        amount_paid: 0,
        amount_due: Number(form.total) || 0,
        applied_credits: 0,
        notes: form.notes || "",
        internal_notes: `Converted from invoice ${form.invoice_number}`,
      });
      // Delete the original invoice now that it's been sent back to estimate
      if (id) {
        try {
          await base44.entities.Invoice.delete(id);
          // Remove any credit redemption tied to this invoice so the customer's
          // available credit balance isn't left with an orphaned negative entry
          const redemption = customerCredits.find(c => c.linked_invoice_id === id && c.type === "redemption");
          if (redemption) await base44.entities.AccountCredit.delete(redemption.id);
        } catch (delErr) {
          console.error("Failed to delete invoice during conversion:", delErr);
        }
        qc.invalidateQueries({ queryKey: ["invoices"] });
        qc.invalidateQueries({ queryKey: ["accountCredits"] });
      }
      toast.success("Converted to estimate — invoice deleted");
      navigate(`/EstimateDetail?id=${estimate.id}`);
    } catch (err) {
      toast.error("Conversion failed: " + err.message);
    } finally {
      setConverting(false);
    }
  };

  const { data: invoice, isLoading: invoiceLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => base44.entities.Invoice.filter({ id }),
    enabled: !!id,
  });

  const { data: allInvoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list("-created_date", 200),
  });
  const memberInvoices = (form.member_invoice_ids || []).map(mid => allInvoices.find(i => i.id === mid)).filter(Boolean);
  const parentInvoice = form.combined_parent_id ? allInvoices.find(i => i.id === form.combined_parent_id) : null;

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
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["accountCredits"] });
      toast.success("Invoice saved");
      // Auto-sync to public viewer if this invoice has already been sent
      if (variables?.public_access_token) {
        const invoiceId = id || result?.id;
        base44.functions.invoke("syncInvoiceSnapshot", {
          invoiceId,
          publicAccessToken: variables.public_access_token,
        }).catch((e) => console.warn("Auto-sync to viewer failed:", e));
      }
      if (isNew) navigate(`/InvoiceDetail?id=${result.id}`);
    },
  });

  const recalc = (lineItems, laborItems, machiningItems, taxRate, amountPaid, appliedCredits, discountType = "none", discountValue = 0, shippingCost) => {
    const partTotal = lineItems.reduce((s, l) => s + (l.total || 0), 0);
    const laborTotal = laborItems.reduce((s, l) => s + (Number(l.price) || 0), 0);
    const machiningTotal = machiningItems.reduce((s, m) => s + (Number(m.price) || 0) * (Number(m.quantity) || 1), 0);
    const subtotal = partTotal + laborTotal + machiningTotal;
    const tax_amount = partTotal * (Number(taxRate) / 100); // tax on parts only
    let discount_amount = 0;
    if (discountType === "amount") {
      discount_amount = Math.min(Number(discountValue) || 0, subtotal);
    } else if (discountType === "percentage") {
      discount_amount = subtotal * ((Number(discountValue) || 0) / 100);
    }
    const shipping = shippingCost !== undefined ? (Number(shippingCost) || 0) : (Number(form.shipping_cost) || 0);
    const total = subtotal + tax_amount - discount_amount + shipping;
    const balance_due = Math.max(0, total - (Number(appliedCredits) || 0) - (Number(amountPaid) || 0));
    return { subtotal, tax_amount, discount_amount, total, balance_due };
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
    const totals = recalc(newLines, form.labor_items || [], form.machining_items || [], newTaxRate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, customer_id: v, line_items: newLines, tax_rate: newTaxRate, ...totals }));
    if (isTaxExempt && useOverride) toast.info(`Tax-exempt • ${override}% markup applied to parts`);
    else if (isTaxExempt) toast.info("Customer is tax-exempt — tax set to 0%");
    else if (useOverride) toast.info(`Applied ${override}% markup override to parts`);
  };

  const handleUnlinkEngine = async () => {
    if (!id) {
      setForm(f => ({ ...f, customer_engine_id: "" }));
      toast.success("Engine unlinked");
      return;
    }
    try {
      await base44.entities.Invoice.update(id, { customer_engine_id: "" });
      setForm(f => ({ ...f, customer_engine_id: "" }));
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      toast.success("Engine unlinked from invoice");
    } catch (err) {
      toast.error("Failed to unlink: " + err.message);
    }
  };

  const updateLine = (idx, field, value) => {
    const lines = [...form.line_items];
    lines[idx] = { ...lines[idx], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      lines[idx].total = (Number(lines[idx].quantity) || 0) * (Number(lines[idx].unit_price) || 0);
    }
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
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
      shipping_cost: Number(part.shipping_cost) || 0,
      unit_price: price,
      total: price,
    };
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, line_items: lines, ...totals }));
  };

  const selectKit = (kit, mode) => {
    const override = customer?.parts_markup_override;
    const useOverride = override !== null && override !== undefined && override !== "";
    const lines = [...form.line_items];
    const kitLabor = (kit.labor_items || []).map(l => ({ name: l.name || "", description: l.description || "", price: Number(l.price) || 0 }));

    if (mode === "whole") {
      const partsCost = (kit.components || []).reduce((s, c) => s + (Number(c.unit_cost) || 0) * (Number(c.quantity) || 1), 0);
      const hasCostOv = kit.kit_cost_override !== null && kit.kit_cost_override !== undefined && !isNaN(Number(kit.kit_cost_override));
      const hasPriceOv = kit.kit_price_override !== null && kit.kit_price_override !== undefined && !isNaN(Number(kit.kit_price_override));
      const partsPrice = (kit.components || []).reduce((s, c) => s + (Number(c.unit_price) || 0) * (Number(c.quantity) || 1), 0);
      const laborPrice = kitLabor.reduce((s, l) => s + (Number(l.price) || 0), 0);
      const kitCost = hasCostOv ? Number(kit.kit_cost_override) : partsCost;
      const kitPrice = hasPriceOv ? Number(kit.kit_price_override) : (partsPrice + laborPrice);
      const kitLine = {
        is_kit: true,
        kit_id: kit.id || "",
        part_number: kit.part_number || "",
        item_name: kit.name || "",
        quantity: 1,
        unit_cost: kitCost,
        unit_price: kitPrice,
        total: kitPrice,
        kit_components: (kit.components || []).map(c => ({
          part_id: c.part_id || "",
          part_number: c.part_number || "",
          name: c.name || "",
          quantity: Number(c.quantity) || 1,
          unit_cost: Number(c.unit_cost) || 0,
        })),
      };
      const idx = (pickingIdx === null || pickingIdx === undefined || pickingIdx >= lines.length) ? lines.length : pickingIdx;
      const newLines = idx === lines.length ? [...lines, kitLine] : [...lines.slice(0, idx), kitLine, ...lines.slice(idx + 1)];
      const totals = recalc(newLines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
      setForm(f => ({ ...f, line_items: newLines, ...totals }));
      toast.success(`Added kit "${kit.name}" as a single item`);
      return;
    }

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
    const newLabor = [...(form.labor_items || []), ...kitLabor];
    const totals = recalc(newLines, newLabor, form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, line_items: newLines, labor_items: newLabor, ...totals }));
    toast.success(`Added kit "${kit.name}" — ${expanded.length} part${expanded.length === 1 ? "" : "s"}${kitLabor.length > 0 ? ` + ${kitLabor.length} labor` : ""}`);
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
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, line_items: lines, ...totals }));
  };

  const addLine = () => setForm(f => ({ ...f, line_items: [...f.line_items, { ...emptyPart }] }));

  const addMultipleParts = (partsToAdd) => {
    const override = customer?.parts_markup_override;
    const useOverride = override !== null && override !== undefined && override !== "";
    const newLines = partsToAdd.map(part => {
      const price = useOverride ? (Number(part.unit_cost) || 0) * (1 + Number(override) / 100) : (Number(part.sell_price) || 0);
      return {
        part_id: part.id, part_number: part.part_number, item_name: part.name,
        quantity: 1, unit_cost: part.unit_cost || 0, shipping_cost: Number(part.shipping_cost) || 0,
        unit_price: price, total: price,
      };
    });
    const allLines = [...form.line_items, ...newLines];
    const totals = recalc(allLines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, line_items: allLines, ...totals }));
    toast.success(`Added ${partsToAdd.length} part${partsToAdd.length === 1 ? "" : "s"}`);
  };

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
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, line_items: lines, ...totals }));
    toast.success("Core credit added — core will be added to inventory when invoice is complete");
  };
  const removeLine = (idx) => {
    const lines = form.line_items.filter((_, i) => i !== idx);
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, line_items: lines, ...totals }));
  };

  const selectLaborFromCatalog = (item) => {
    const items = [...(form.labor_items || [])];
    items[laborPickingIdx] = { name: item.name, description: item.description || "", price: item.price || 0 };
    const totals = recalc(form.line_items, items, form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, labor_items: items, ...totals }));
  };

  const selectMachiningFromCatalog = (item) => {
    const items = [...(form.machining_items || [])];
    items[machiningPickingIdx] = {
      ...items[machiningPickingIdx],
      name: item.name,
      description: item.description || "",
      price: item.price || 0,
      cost_type: item.cost_type || "unspecified",
      vendor: item.cost_type === "outsourced" ? (item.default_vendor || items[machiningPickingIdx].vendor || "") : (items[machiningPickingIdx].vendor || ""),
    };
    const totals = recalc(form.line_items, form.labor_items || [], items, form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, machining_items: items, ...totals }));
  };

  const addLabor = () => setForm(f => ({ ...f, labor_items: [...(f.labor_items || []), { ...emptyLabor }] }));
  const updateLabor = (idx, field, value) => {
    const items = [...(form.labor_items || [])];
    items[idx] = { ...items[idx], [field]: value };
    const totals = recalc(form.line_items, items, form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, labor_items: items, ...totals }));
  };
  const removeLabor = (idx) => {
    const items = (form.labor_items || []).filter((_, i) => i !== idx);
    const totals = recalc(form.line_items, items, form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, labor_items: items, ...totals }));
  };

  const addMachining = () => setForm(f => ({ ...f, machining_items: [...(f.machining_items || []), { ...emptyMachining }] }));
  const updateMachining = (idx, field, value) => {
    const items = [...(form.machining_items || [])];
    items[idx] = { ...items[idx], [field]: value };
    const totals = recalc(form.line_items, form.labor_items || [], items, form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, machining_items: items, ...totals }));
  };
  const removeMachining = (idx) => {
    const items = (form.machining_items || []).filter((_, i) => i !== idx);
    const totals = recalc(form.line_items, form.labor_items || [], items, form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, machining_items: items, ...totals }));
  };

  const updateTaxRate = (rate) => {
    const totals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, tax_rate: rate, ...totals }));
  };

  const updateDiscount = (field, value) => {
    const updated = { ...form, [`discount_${field}`]: value };
    if (field === "type" && value === "none") updated.discount_value = 0;
    const totals = recalc(updated.line_items, updated.labor_items || [], updated.machining_items || [], updated.tax_rate, updated.amount_paid, updated.applied_credits, updated.discount_type || "none", updated.discount_value || 0);
    setForm({ ...updated, ...totals });
  };

  const updateShipping = (val) => {
    const shipping = Number(val) || 0;
    const totals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0, shipping);
    setForm(f => ({ ...f, shipping_cost: shipping, ...totals }));
  };

  const handleDeletePayment = async (idx) => {
    const updatedPayments = (form.payments || []).filter((_, i) => i !== idx);
    const paid = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const balance = Math.max(0, (form.total || 0) - (Number(form.applied_credits) || 0) - paid);
    const status = balance <= 0 ? "paid" : paid > 0 ? "partial" : "sent";
    const recalcTotals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], form.tax_rate, paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    const updated = { ...form, payments: updatedPayments, amount_paid: paid, balance_due: balance, status, ...recalcTotals };
    await saveMutation.mutateAsync(updated);
    setForm(updated);
    toast.success("Payment deleted");
  };

  const handleRecordPayment = async (payment) => {
    const updatedPayments = [...(form.payments || []), payment];
    const paid = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const balance = Math.max(0, (form.total || 0) - (Number(form.applied_credits) || 0) - paid);
    const status = balance <= 0 ? "paid" : "partial";
    const recalcTotals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], form.tax_rate, paid, form.applied_credits, form.discount_type || "none", form.discount_value || 0);
    const updated = { ...form, payments: updatedPayments, amount_paid: paid, balance_due: balance, status, ...recalcTotals };
    await saveMutation.mutateAsync(updated);
    setForm(updated);
    toast.success("Payment recorded");
  };

  const sendInvoice = async () => {
    const customer = customers.find(c => c.id === form.customer_id);
    if (!customer?.email) { toast.error("Customer has no email"); return; }
    setSending(true);
    // Generate public_access_token if missing (needed for viewer link)
    let accessToken = form.public_access_token;
    if (!accessToken) {
      accessToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      setForm(f => ({ ...f, public_access_token: accessToken }));
    }
    // Mark as "sent" before saving so the public viewer receives an acceptable
    // status (it rejects "draft"). The sync reads this persisted status.
    const formToSave = { ...form, public_access_token: accessToken, status: "sent" };
    setForm(f => ({ ...f, public_access_token: accessToken, status: "sent" }));
    const saved = await saveMutation.mutateAsync(formToSave);
    const invoiceId = id || saved?.id;

    // Sync invoice snapshot to the public viewer app
    try {
      const syncRes = await base44.functions.invoke("syncInvoiceSnapshot", {
        invoiceId,
        publicAccessToken: accessToken,
      });
      if (syncRes?.data?.error) {
        toast.error(`Snapshot sync failed: ${syncRes.data.error} - Continuing with email anyway...`);
      }
    } catch (syncError) {
      toast.error(`Snapshot sync error: ${syncError.message} - Continuing with email anyway...`);
    }

    const settings = settingsData?.[0] || {};
    const subject = `Invoice ${form.invoice_number} — Payment Due`;
    const viewUrl = `https://billing.eedpower.com/invoice/${accessToken}`;
    const dueDate = form.due_date
      ? new Date(form.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : form.due_on_completion
        ? "Due on build completion"
        : "30 days from invoice date";
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
                <p class="amount-value">$${Number(form.balance_due ?? form.total ?? 0).toFixed(2)}</p>
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
    qc.invalidateQueries({ queryKey: ["invoices"] });
    setSending(false);
    toast.success(`Invoice sent to ${customer.email}`);
  };

  const sendInvoiceByText = async () => {
    const customer = customers.find(c => c.id === form.customer_id);
    if (!customer?.phone) { toast.error("Customer has no phone number"); return; }
    setSending(true);
    try {
      let accessToken = form.public_access_token;
      if (!accessToken) {
        accessToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      }
      const status = form.status === "draft" ? "sent" : form.status;
      const formToSave = { ...form, public_access_token: accessToken, status };
      setForm(f => ({ ...f, public_access_token: accessToken, status }));
      const saved = await saveMutation.mutateAsync(formToSave);
      const invoiceId = id || saved?.id;
      try {
        await base44.functions.invoke("syncInvoiceSnapshot", { invoiceId, publicAccessToken: accessToken });
      } catch (e) { /* link still usable */ }
      const viewUrl = `https://billing.eedpower.com/invoice/${accessToken}`;
      const body = `Hi ${customer.first_name}, your invoice ${form.invoice_number} from Elite Engine Development is ready. Amount due: $${Number(form.balance_due ?? form.total ?? 0).toFixed(2)}. View & pay here: ${viewUrl}`;
      if (openSmsDraft(customer.phone, body)) {
        toast.success("Opening text message with invoice link…");
      } else {
        toast.error("Could not open messages — check the customer phone number");
      }
    } catch (e) {
      toast.error("Failed to prepare text: " + (e?.message || "error"));
    } finally {
      setSending(false);
    }
  };

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

  if (id && invoiceLoading) {
    return <LoadingState />;
  }

  if (printPartsListMode) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4 print:hidden">
          <button onClick={() => setPrintPartsListMode(false)} className="px-4 py-2 bg-slate-200 rounded hover:bg-slate-300">← Back to Edit</button>
          <button onClick={() => { document.title = `Parts List ${form.invoice_number}`; window.print(); }} className="px-4 py-2 bg-[#e20404] text-white rounded hover:bg-[#c00303] font-semibold">🖨 Print Parts List</button>
        </div>
        <PrintableBuildPartsList form={form} customer={customer} customerEngine={selectedEngine} platform={selectedEnginePlatform} specSheet={selectedSpecSheet} />
      </div>
    );
  }

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
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
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
        onNewCore={() => { setEditingCore(null); setCoreCreateOpen(true); }}
        onEditCore={(c) => { setEditingCore(c); setCoreCreateOpen(true); }}
      />
      <MultiPartPickerModal
        open={multiPartPickerOpen}
        onClose={() => setMultiPartPickerOpen(false)}
        parts={parts}
        onAddSelected={addMultipleParts}
      />
      <CoreCreditModal
        open={coreCreditOpen}
        onClose={() => setCoreCreditOpen(false)}
        onAdd={handleCoreCredit}
      />
      <QuickCreateCoreModal
        open={coreCreateOpen}
        onClose={() => setCoreCreateOpen(false)}
        editingCore={editingCore}
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
        <Button variant="outline" size="sm" onClick={convertToEstimate} disabled={converting || !form.customer_id} title="Create a new estimate from this invoice">
          <ArrowLeft className="w-4 h-4 mr-1" /> {converting ? "Converting..." : "To Estimate"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPrintMode(true)}><Printer className="w-4 h-4 mr-1" /> View</Button>
        <Button variant="outline" size="sm" onClick={() => setPrintPartsListMode(true)} title="Print engine build parts list (no prices)"><Package className="w-4 h-4 mr-1" /> Parts List</Button>
        <Button variant="outline" size="sm" onClick={sendInvoice} disabled={sending || !form.customer_id}>
          <Send className="w-4 h-4 mr-1" />{sending ? "Sending..." : "Send"}
        </Button>
        <Button variant="outline" size="sm" onClick={sendInvoiceByText} disabled={sending || !form.customer_id} title="Send invoice link via text message">
          <MessageSquare className="w-4 h-4 mr-1" />{sending ? "Sending..." : "Text"}
        </Button>
        {["draft","sent","partial","overdue"].includes(form.status) && (
          <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700" onClick={() => setPaymentModalOpen(true)}>
            <DollarSign className="w-4 h-4 mr-1" /> Record Payment
          </Button>
        )}
        {id && (
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="w-4 h-4 mr-1" /> History
          </Button>
        )}
        <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Next Step guidance banner */}
      {id && form.status === "draft" && (
        <NextStepBanner
          icon={Send}
          message="This invoice is ready to be sent to the customer."
          actionLabel="Send Invoice"
          onAction={sendInvoice}
          disabled={sending || !form.customer_id}
        />
      )}
      {id && ["sent", "partial", "overdue"].includes(form.status) && (form.balance_due || 0) > 0 && (
        <NextStepBanner
          icon={DollarSign}
          message={`Outstanding balance of $${(form.balance_due || 0).toLocaleString("en-US", { minimumFractionDigits: 0 })} — record a payment to reduce the balance.`}
          actionLabel="Record Payment"
          onAction={() => setPaymentModalOpen(true)}
        />
      )}

      {/* Combined invoice banner */}
      {form.is_combined && (
        <div className="mb-6 bg-[#e20404]/5 border border-[#e20404]/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Layers className="w-5 h-5 text-[#e20404] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#e20404]">Combined Multi-Engine Invoice</p>
              <p className="text-xs text-slate-600 mt-0.5">
                Items below are grouped by engine section for the customer-facing view. Each line item has an "Engine" tag you can edit. The customer sees one invoice with per-engine sections.
              </p>
              {memberInvoices.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-xs text-slate-500">Source invoices:</span>
                  {memberInvoices.map(mi => (
                    <Link key={mi.id} to={`/InvoiceDetail?id=${mi.id}`}>
                      <Badge className="bg-white border border-slate-200 text-slate-700 hover:border-[#e20404] cursor-pointer text-xs">{mi.invoice_number}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Button size="sm" variant="outline" className="border-[#e20404] text-[#e20404] hover:bg-[#e20404]/10" onClick={() => setForm(f => ({ ...f, is_combined: false }))}>
              Convert to single-engine
            </Button>
          </div>
        </div>
      )}
      {parentInvoice && (
        <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3">
          <Layers className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <p className="text-sm text-slate-600 flex-1">
            This invoice is part of combined invoice{" "}
            <Link to={`/InvoiceDetail?id=${parentInvoice.id}`} className="font-mono font-medium text-[#e20404] hover:underline">{parentInvoice.invoice_number}</Link>
          </p>
        </div>
      )}

      {/* Illegal Parts Agreement bar */}
      {form.contains_illegal_parts && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <FileText className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Illegal Parts Acknowledgment</p>
            <p className="text-xs text-amber-600">This invoice involves non-compliant parts. A signed agreement is on file.</p>
          </div>
          <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100" onClick={() => setLegalDocOpen(true)}>
            <FileText className="w-4 h-4 mr-1" /> View Agreement
          </Button>
        </div>
      )}

      {/* Legacy PDF attachment bar */}
      {form.is_legacy && (
        <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-700">Original Invoice PDF</p>
            <p className="text-xs text-slate-400">Attach the original PDF from your old system so customers can download it from the portal.</p>
          </div>
          {form.legacy_pdf_url ? (
            <>
              <a href={form.legacy_pdf_url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline"><Download className="w-4 h-4 mr-1" /> View PDF</Button>
              </a>
              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={removePdf}><Trash2 className="w-4 h-4" /></Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => pdfFileRef.current?.click()} disabled={uploadingPdf}>
              <Paperclip className="w-4 h-4 mr-1" /> {uploadingPdf ? "Uploading..." : "Attach PDF"}
            </Button>
          )}
          <input ref={pdfFileRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
        </div>
      )}

      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        balanceDue={form.balance_due ?? form.total ?? 0}
        totalPaid={form.amount_paid || 0}
        onRecord={handleRecordPayment}
        title="Record Payment"
      />

      <IllegalPartsViewModal
        open={legalDocOpen}
        onClose={() => setLegalDocOpen(false)}
        invoiceId={id}
        estimateId={form.estimate_id}
        customerEngineId={form.customer_engine_id}
        documentType="illegal_parts"
      />

      <HistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        context={{ type: "invoice", id, number: form.invoice_number, estimateId: form.estimate_id, buildId: form.build_id }}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
            {form.customer_id && !form.is_combined && (
              <EngineSelector
                customerId={form.customer_id}
                value={form.customer_engine_id || ""}
                onChange={(v) => setForm({...form, customer_engine_id: v})}
                platforms={platforms}
              />
            )}
            {form.customer_id && !form.is_combined && (
              <Button size="sm" variant="outline" className="w-full border-[#e20404] text-[#e20404] hover:bg-[#e20404]/5" onClick={() => setForm(f => ({ ...f, is_combined: true, customer_engine_id: "" }))}>
                <Layers className="w-4 h-4 mr-1" /> Convert to Multi-Engine Invoice
              </Button>
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
                <>
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-sm">
                  {selectedEngine.eed_id && <div><p className="text-xs text-slate-400 uppercase">EED ID</p><p className="font-mono font-bold text-[#e20404]">{selectedEngine.eed_id}</p></div>}
                  {selectedEngine.engine_serial_number && <div><p className="text-xs text-slate-400 uppercase">Serial #</p><p className="font-semibold">{selectedEngine.engine_serial_number}</p></div>}
                  {selectedEnginePlatform && <div><p className="text-xs text-slate-400 uppercase">Platform</p><p className="font-semibold">{selectedEnginePlatform.manufacturer} {selectedEnginePlatform.name}{selectedEnginePlatform.year_range_start ? ` (${selectedEnginePlatform.year_range_start}${selectedEnginePlatform.year_range_end ? `–${selectedEnginePlatform.year_range_end}` : "+"})` : ""}</p></div>}
                  {selectedEngine.current_stage && <div><p className="text-xs text-slate-400 uppercase">Stage</p><p className="font-semibold">{STAGE_LABELS_INV[selectedEngine.current_stage] || selectedEngine.current_stage}</p></div>}
                  {selectedSpecSheet && <div><p className="text-xs text-slate-400 uppercase">Spec Sheet</p><p className="font-semibold text-purple-700">{selectedSpecSheet.custom_name || STAGE_LABELS_INV[selectedSpecSheet.spec_type] || selectedSpecSheet.spec_type} <span className="text-slate-400 text-xs">v{selectedSpecSheet.version}</span></p></div>}
                </div>
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 mt-2 -mb-1" onClick={handleUnlinkEngine}>
                  <Unlink className="w-3.5 h-3.5 mr-1" /> Unlink Engine
                </Button>
                </>
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
            <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => setMultiPartPickerOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Part</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600 w-28">Part #</th>
                  <th className="text-left py-2 font-medium text-slate-600">Item Name</th>
                  {form.is_combined && <th className="text-left py-2 font-medium text-slate-600 w-40">Engine</th>}
                  <th className="text-center py-2 font-medium text-slate-600 w-16">Qty</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Unit Cost</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Unit Price</th>
                  <th className="text-right py-2 font-medium text-slate-600 w-24">Total</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {(form.line_items || []).map((line, idx) => (
                  <tr key={idx} className="border-b border-slate-100 [&>td]:align-top">
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
                      {line.is_kit && (
                        <div className="flex items-center gap-1 mt-1">
                          <Badge className="bg-purple-100 text-purple-700 border-0 text-[10px]">Kit</Badge>
                          <span className="text-[10px] text-slate-400">{(line.kit_components || []).length} part{(line.kit_components || []).length === 1 ? "" : "s"} · PO expands</span>
                        </div>
                      )}
                    </td>
                    {form.is_combined && (
                      <td className="py-2 pr-2">
                        <Input value={line.engine_section || ""} onChange={e => updateLine(idx, "engine_section", e.target.value)} placeholder="e.g. EED 1040" className="border-slate-200 text-xs" />
                      </td>
                    )}
                    <td className="py-2 px-1">
                      <Input type="number" value={line.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} className="text-center border-slate-200" min="0" />
                    </td>
                    <td className="py-2 px-1">
                      <Input type="number" value={line.unit_cost} onChange={e => updateLine(idx, "unit_cost", Number(e.target.value))} className="text-right border-slate-200 text-slate-400" min="0" step="0.01" />
                      {Number(line.shipping_cost) > 0 && (
                        <div className="text-[10px] text-slate-400 text-right mt-0.5">w/ ship ${((Number(line.unit_cost) || 0) + (Number(line.shipping_cost) || 0)).toFixed(2)}</div>
                      )}
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
          <Button variant="ghost" size="sm" className="text-slate-500 hover:text-[#e20404] mt-2" onClick={addLine}>
            <Plus className="w-4 h-4 mr-1" /> Add Manual Part
          </Button>
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
                  {form.is_combined && <th className="text-left py-2 font-medium text-slate-600 w-40">Engine</th>}
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
                    {form.is_combined && <td className="py-2 pr-2"><Input value={item.engine_section || ""} onChange={e => updateLabor(idx, "engine_section", e.target.value)} placeholder="e.g. EED 1040" className="border-slate-200 text-xs" /></td>}
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 font-medium text-slate-600 w-40">Name</th>
                    {form.is_combined && <th className="text-left py-2 font-medium text-slate-600 w-32">Engine</th>}
                    <th className="text-left py-2 font-medium text-slate-600">Description</th>
                    <th className="text-right py-2 font-medium text-slate-600 w-20">Qty</th>
                    <th className="text-right py-2 font-medium text-slate-600 w-24">Price</th>
                    <th className="text-right py-2 font-medium text-slate-600 w-28">Total</th>
                    <th className="text-left py-2 font-medium text-slate-600 w-36">Cost Type</th>
                    <th className="text-right py-2 font-medium text-slate-600 w-28">Actual Cost</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {(form.machining_items || []).map((item, idx) => {
                    const ct = item.cost_type || "unspecified";
                    return (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-2 pr-2">
                          <div className="flex gap-1">
                            <Input value={item.name} onChange={e => updateMachining(idx, "name", e.target.value)} placeholder="Machining name..." className="border-slate-200" />
                            <Button size="sm" variant="ghost" className="text-slate-400 hover:text-[#e20404] px-2 shrink-0" title="Pick from catalog" onClick={() => { setMachiningPickingIdx(idx); setMachiningPickerOpen(true); }}><Search className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                        {form.is_combined && <td className="py-2 pr-2"><Input value={item.engine_section || ""} onChange={e => updateMachining(idx, "engine_section", e.target.value)} placeholder="e.g. EED 1040" className="border-slate-200 text-xs" /></td>}
                        <td className="py-2 pr-2"><Input value={item.description} onChange={e => updateMachining(idx, "description", e.target.value)} placeholder="Description..." className="border-slate-200" /></td>
                        <td className="py-2 px-1"><Input type="number" value={item.quantity ?? 1} onChange={e => updateMachining(idx, "quantity", Number(e.target.value) || 1)} className="text-right border-slate-200" min="1" step="1" /></td>
                        <td className="py-2 px-1"><Input type="number" value={item.price} onChange={e => updateMachining(idx, "price", Number(e.target.value))} className="text-right border-slate-200" min="0" step="0.01" /></td>
                        <td className="py-2 px-1 text-right text-sm font-medium text-slate-700">${((Number(item.price) || 0) * (Number(item.quantity) || 1)).toFixed(2)}</td>
                        <td className="py-2 px-1">
                          <Select value={ct} onValueChange={v => updateMachining(idx, "cost_type", v)}>
                            <SelectTrigger className="h-8 text-xs border-slate-200"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unspecified">Unspecified</SelectItem>
                              <SelectItem value="in_house">In-house</SelectItem>
                              <SelectItem value="outsourced">Outsourced</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 px-1">
                          {ct === "outsourced" ? (
                            <div className="space-y-1">
                              <Input type="number" value={item.actual_cost ?? ""} onChange={e => updateMachining(idx, "actual_cost", e.target.value === "" ? null : Number(e.target.value))} placeholder="Vendor cost" className="text-right border-slate-200 h-8" min="0" step="0.01" />
                              <Input value={item.vendor || ""} onChange={e => updateMachining(idx, "vendor", e.target.value)} placeholder="Vendor name" className="border-slate-200 h-7 text-xs" />
                            </div>
                          ) : ct === "in_house" ? (
                            <span className="text-xs text-blue-600 italic">Covered by labor</span>
                          ) : (
                            <span className="text-xs text-amber-600">—</span>
                          )}
                        </td>
                        <td className="py-2"><Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => removeMachining(idx)}><Trash2 className="w-3.5 h-3.5" /></Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <div className="w-64 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Parts Subtotal</span><span>${(form.line_items || []).reduce((s, l) => s + (l.total || 0), 0).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Labor Subtotal</span><span>${(form.labor_items || []).reduce((s, l) => s + (Number(l.price) || 0), 0).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Machining Subtotal</span><span>${(form.machining_items || []).reduce((s, m) => s + (Number(m.price) || 0) * (Number(m.quantity) || 1), 0).toFixed(2)}</span></div>
          <div className="flex justify-between font-medium border-t border-slate-200 pt-2"><span className="text-slate-600">Subtotal</span><span>${Number(form.subtotal || 0).toFixed(2)}</span></div>
          {(() => {
            const revenue = Number(form.subtotal || 0) - Number(form.discount_amount || 0);
            const cost = (form.line_items || []).reduce((s, l) => s + (l.is_core_credit ? 0 : ((Number(l.unit_cost) || 0) + (Number(l.shipping_cost) || 0)) * (Number(l.quantity) || 0)), 0);
            const profit = revenue - cost;
            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
            return (
              <div className="flex justify-between text-xs bg-slate-50 rounded px-2 py-1">
                <span className="text-slate-500">Est. Profit (Margin)</span>
                <span className={profit >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>${profit.toFixed(2)} ({margin.toFixed(1)}%)</span>
              </div>
            );
          })()}
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600 flex items-center gap-1">Tax Rate (%) {customer?.tax_exempt && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">Exempt</Badge>}</span>
            <Input type="number" value={form.tax_rate} onChange={e => updateTaxRate(Number(e.target.value))} className="w-20 text-right h-7" min="0" step="0.1" />
          </div>
          {Number(form.tax_rate) > 0 && <div className="flex justify-between text-slate-500"><span>Tax ({form.tax_rate}% on parts)</span><span>${Number(form.tax_amount || 0).toFixed(2)}</span></div>}
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">Discount</span>
            <div className="flex items-center gap-2">
              <Select value={form.discount_type || "none"} onValueChange={v => updateDiscount("type", v)}>
                <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="amount">$ Amount</SelectItem>
                  <SelectItem value="percentage">% Percent</SelectItem>
                </SelectContent>
              </Select>
              {form.discount_type && form.discount_type !== "none" && (
                <Input type="number" value={form.discount_value || 0} onChange={e => updateDiscount("value", Number(e.target.value))} className="w-20 text-right h-7" min="0" step="0.01" />
              )}
            </div>
          </div>
          {Number(form.discount_amount) > 0 && (
            <div className="flex justify-between text-emerald-600"><span>Discount Applied</span><span>-${Number(form.discount_amount || 0).toFixed(2)}</span></div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-600">Shipping</span>
            <div className="relative w-20">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
              <Input type="number" value={Number(form.shipping_cost) || 0} onChange={e => updateShipping(Number(e.target.value))} className="text-right h-7 pl-5" min="0" step="0.01" />
            </div>
          </div>
          <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2"><span>Total</span><span>${Number(form.total || 0).toFixed(2)}</span></div>
          {availableCreditBalance > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600">Account Credit</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">(Avail: ${availableCreditBalance.toFixed(2)})</span>
                <Input type="number" value={Number(form.applied_credits) || 0} onChange={e => {
                  const applied = Math.min(Math.max(0, Number(e.target.value) || 0), availableCreditBalance);
                  const totals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], form.tax_rate, form.amount_paid, applied, form.discount_type || "none", form.discount_value || 0);
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
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {(form.payments || []).map((p, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 text-slate-500">{p.date}</td>
                    <td className="py-2"><Badge className="bg-slate-100 text-slate-700 border-0 capitalize text-xs">{p.method}</Badge></td>
                    <td className="py-2 text-slate-500">{p.note || "—"}</td>
                    <td className="py-2 text-right font-semibold text-emerald-700">${Number(p.amount).toFixed(2)}</td>
                    <td className="py-2">
                      <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 px-2" onClick={() => handleDeletePayment(i)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div><Label>Notes for Customer</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={4} /></div>
        <div><Label>Payment Notes</Label><Textarea value={form.payment_notes} onChange={e => setForm({...form, payment_notes: e.target.value})} rows={4} /></div>
      </div>

      {id && (
        <div className="mt-6">
          <EmailsSection linkType="invoice" linkId={id} docNumber={form.invoice_number} title="Emails linked to this invoice" />
        </div>
      )}
    </div>
  );
}