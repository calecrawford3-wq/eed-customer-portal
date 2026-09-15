import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { syncCustomerEngineStage } from "@/lib/syncCustomerEngineStage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, Plus, Trash2, Send, Printer, Package, Wrench, Search, Cog,
  DollarSign, Wrench as WrenchIcon, CheckCircle, AlertTriangle, Receipt, Recycle, History, MessageSquare, Sparkles
} from "lucide-react";
import { openSmsDraft } from "@/lib/shareDocText";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import PartPickerModal from "@/components/estimates/PartPickerModal";
import CoreCreditModal from "@/components/estimates/CoreCreditModal";
import QuickCreateCoreModal from "@/components/estimates/QuickCreateCoreModal";
import GeneratePOModal from "@/components/estimates/GeneratePOModal";
import CustomerSearchSelect from "@/components/CustomerSearchSelect";
import PaymentModal from "@/components/PaymentModal";
import QuickCreateCustomerModal from "@/components/QuickCreateCustomerModal";
import CannedJobPicker from "@/components/estimates/CannedJobPicker";
import LaborMachiningPickerModal from "@/components/estimates/LaborMachiningPickerModal";
import PrintableEstimate from "@/components/PrintableEstimate";
import EngineSelector from "@/components/EngineSelector";
import IllegalPartsModal from "@/components/legal/IllegalPartsModal";
import IllegalPartsViewModal from "@/components/legal/IllegalPartsViewModal";
import ContractEngineModal from "@/components/legal/ContractEngineModal";
import { AlertTriangle as AlertTriangleIcon, ShieldAlert, FileText } from "lucide-react";
import HistoryModal from "@/components/HistoryModal";
import EmailsSection from "@/components/emails/EmailsSection";
import ConfirmDialog from "@/components/ConfirmDialog";
import EstimateTotals from "@/components/estimates/EstimateTotals";
import EstimateDepositSection from "@/components/estimates/EstimateDepositSection";
import EstimateHeader from "@/components/estimates/EstimateHeader";
import SimpleItemsTable from "@/components/estimates/SimpleItemsTable";
import MultiPartPickerModal from "@/components/estimates/MultiPartPickerModal";
import StageComparisonSection from "@/components/estimates/StageComparisonSection";
import AddonPickerModal from "@/components/addons/AddonPickerModal";
import EstimateAddonsSection from "@/components/estimates/EstimateAddonsSection";
import LoadingState from "@/components/LoadingState";
import { buildComparisonEmailHtml, comparisonEmailSubject } from "@/lib/comparisonEmail";

const COMPARISON_VIEWER_BASE = "https://elite-viewer.base44.app/comparison";

const emptyPart = { part_id: "", part_number: "", item_name: "", quantity: 1, unit_cost: 0, unit_price: 0, total: 0 };
const emptyLabor = { name: "", description: "", price: 0 };
const emptyMachining = { name: "", description: "", price: 0 };
const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png";

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
  const prefillEngineId = params.get("customer_engine_id");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmState, setConfirmState] = useState({ open: false });

  const [form, setForm] = useState({
    estimate_number: `EST-${Date.now().toString().slice(-6)}`,
    customer_id: "", status: "draft",
    issue_date: new Date().toISOString().split("T")[0],
    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    deposit_required: false,
    deposit_type: "amount",
    deposit_percent: 0,
    deposit_amount: 0,
    deposit_paid: false,
    is_engine_build: true,
    contains_illegal_parts: false,
    payments: [],
    line_items: [{ ...emptyPart }],
    labor_items: [],
    machining_items: [],
    discount_type: "none", discount_value: 0, discount_amount: 0,
    shipping_cost: 0,
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
  const [printMode, setPrintMode] = useState(false);
  const [laborPickerOpen, setLaborPickerOpen] = useState(false);
  const [laborPickingIdx, setLaborPickingIdx] = useState(null);
  const [machiningPickerOpen, setMachiningPickerOpen] = useState(false);
  const [machiningPickingIdx, setMachiningPickingIdx] = useState(null);
  const [coreCreditOpen, setCoreCreditOpen] = useState(false);
  const [coreCreateOpen, setCoreCreateOpen] = useState(false);
  const [editingCore, setEditingCore] = useState(null);
  const [pickerInitialTab, setPickerInitialTab] = useState("parts");
  const [illegalPartsOpen, setIllegalPartsOpen] = useState(false);
  const [illegalPartsViewOpen, setIllegalPartsViewOpen] = useState(false);
  const [contractEngineOpen, setContractEngineOpen] = useState(false);
  const [contractEngineViewOpen, setContractEngineViewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [multiPartPickerOpen, setMultiPartPickerOpen] = useState(false);
  const [addonPickerOpen, setAddonPickerOpen] = useState(false);

  const { data: estimate, isLoading: estimateLoading } = useQuery({
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

  const existingCreditRedemption = customerCredits.find(c => c.linked_estimate_id === id && c.type === "redemption");
  const availableCreditBalance = customerCredits.reduce((s, c) => s + (Number(c.amount) || 0), 0) - (existingCreditRedemption ? Number(existingCreditRedemption.amount) || 0 : 0);

  useEffect(() => {
    if (form.customer_id && isNew && availableCreditBalance > 0) {
      const cap = Math.min(availableCreditBalance, Number(form.total || 0));
      setForm(f => Math.abs((Number(f.applied_credits) || 0) - cap) < 0.01 ? f : { ...f, applied_credits: cap });
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
    queryFn: async () => {
      const engines = await base44.entities.CustomerEngine.filter({ customer_id: form.customer_id });
      // Sync stage for all engines in this list
      engines?.forEach(eng => syncCustomerEngineStage(eng.id).catch(() => {}));
      return engines;
    },
    enabled: !!form.customer_id,
  });

  const { data: allSpecSheets = [] } = useQuery({
    queryKey: ["allSpecSheets"],
    queryFn: () => base44.entities.SpecSheet.list("-created_date", 200),
  });

  const { data: allEstimates = [] } = useQuery({
    queryKey: ["estimates"],
    queryFn: () => base44.entities.Estimate.list("-created_date", 200),
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
    if (estimate && estimate[0]) {
      setForm({ labor_items: [], machining_items: [], payments: [], ...estimate[0] });
      // Sync engine stage when estimate loads
      if (estimate[0].customer_engine_id) {
        syncCustomerEngineStage(estimate[0].customer_engine_id).catch(e => 
          console.warn("Failed to sync stage on load:", e)
        );
      }
    }
  }, [estimate]);

  useEffect(() => {
    if (isNew && settingsData?.[0]?.default_tax_rate) {
      setForm(f => ({ ...f, tax_rate: settingsData[0].default_tax_rate }));
    }
  }, [settingsData, isNew]);

  useEffect(() => {
    if (isNew && prefillCustomerId) {
      setForm(f => ({ ...f, customer_id: prefillCustomerId, build_id: prefillBuildId || "", customer_engine_id: prefillEngineId || "" }));
    }
  }, [isNew, prefillCustomerId, prefillBuildId, prefillEngineId]);

  // Auto-calculate deposit amount when in percent mode
  useEffect(() => {
    if (form.deposit_required && form.deposit_type === "percent") {
      const calculated = (Number(form.total || 0) * (Number(form.deposit_percent || 0) / 100));
      setForm(f => Math.abs((Number(f.deposit_amount) || 0) - calculated) < 0.01 ? f : { ...f, deposit_amount: calculated });
    }
  }, [form.deposit_required, form.deposit_type, form.deposit_percent, form.total]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const result = id
        ? await base44.entities.Estimate.update(id, data)
        : await base44.entities.Estimate.create(data);
      const estimateId = id || result.id;
      const applied = Number(data.applied_credits) || 0;
      const priorRedemption = customerCredits.find(c => c.linked_estimate_id === estimateId && c.type === "redemption");
      if (applied > 0) {
        const redemptionData = {
          customer_id: data.customer_id,
          amount: -applied,
          type: "redemption",
          subtype: "Estimate Credit Application",
          description: `Credits applied to estimate ${data.estimate_number}`,
          date: new Date().toISOString().split("T")[0],
          linked_estimate_id: estimateId,
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
      // If this estimate has already been sent and the deposit fields changed,
      // regenerate the Stripe checkout URL so the public viewer's payment link matches the new deposit.
      if (data.public_access_token && estimate?.[0]) {
        const orig = estimate[0];
        const depositChanged =
          (orig.deposit_required || false) !== (data.deposit_required || false) ||
          Number(orig.deposit_amount || 0) !== Number(data.deposit_amount || 0);
        if (depositChanged) {
          try {
            const amount = data.deposit_required ? Number(data.deposit_amount || 0) : Number(data.total || 0);
            const stripeUrlRes = await base44.functions.invoke("generateStripeCheckoutUrl", {
              type: "estimate",
              documentId: estimateId,
              amount,
              description: `Estimate ${data.estimate_number} - ${data.deposit_required ? "Deposit" : "Full Payment"}`,
              publicAccessToken: data.public_access_token,
              customerEmail: customers.find(c => c.id === data.customer_id)?.email,
            });
            if (stripeUrlRes?.data?.checkout_url) {
              await base44.entities.Estimate.update(estimateId, { stripe_checkout_url: stripeUrlRes.data.checkout_url });
            }
          } catch (e) {
            console.warn("Failed to regenerate Stripe checkout URL after deposit change:", e);
          }
        }
      }
      return result;
    },
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["accountCredits"] });
      toast.success("Estimate saved");
      // Auto-sync to public viewer if this estimate has already been sent
      if (variables?.public_access_token) {
        const estimateId = id || result?.id;
        base44.functions.invoke("syncEstimateSnapshot", {
          estimateId,
          publicAccessToken: variables.public_access_token,
        }).then(() => toast.success("Customer view updated — no need to resend"))
          .catch((e) => console.warn("Auto-sync to viewer failed:", e));
      }
      if (isNew) navigate(`/EstimateDetail?id=${result.id}`);
    },
  });

  const recalc = (lineItems, laborItems, machiningItems, taxRate, discountType = "none", discountValue = 0, shippingCost, addons = form.addons || []) => {
    const partTotal = lineItems.reduce((s, l) => s + (l.total || 0), 0);
    const laborTotal = laborItems.reduce((s, l) => s + (Number(l.price) || 0), 0);
    const machiningTotal = machiningItems.reduce((s, m) => s + (Number(m.price) || 0), 0);
    const selectedAddonTotal = (addons || []).filter(a => a.selection_state === 'preselected' || a.selection_state === 'customer_selected').reduce((s, a) => s + (Number(a.price) || 0), 0);
    const subtotal = partTotal + laborTotal + machiningTotal + selectedAddonTotal;
    const tax_amount = partTotal * (Number(taxRate) / 100); // tax on parts only
    let discount_amount = 0;
    if (discountType === "amount") {
      discount_amount = Math.min(Number(discountValue) || 0, subtotal);
    } else if (discountType === "percentage") {
      discount_amount = subtotal * ((Number(discountValue) || 0) / 100);
    }
    const shipping = shippingCost !== undefined ? (Number(shippingCost) || 0) : (Number(form.shipping_cost) || 0);
    return { subtotal, tax_amount, discount_amount, total: subtotal + tax_amount - discount_amount + shipping };
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
    const totals = recalc(newLines, form.labor_items || [], form.machining_items || [], newTaxRate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, customer_id: v, line_items: newLines, tax_rate: newTaxRate, ...totals });
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
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, line_items: lines, ...totals });
  };

  const selectPart = (part) => {
    const override = customer?.parts_markup_override;
    const useOverride = override !== null && override !== undefined && override !== "";
    const price = useOverride ? (Number(part.unit_cost) || 0) * (1 + Number(override) / 100) : (Number(part.sell_price) || 0);
    const lines = [...form.line_items];
    lines[pickingIdx] = {
      part_id: part.id, part_number: part.part_number, item_name: part.name,
      quantity: 1, unit_cost: part.unit_cost || 0, shipping_cost: Number(part.shipping_cost) || 0, unit_price: price,
      total: price,
    };
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, line_items: lines, ...totals });
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
      const totals = recalc(newLines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0);
      setForm({ ...form, line_items: newLines, ...totals });
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
    const totals = recalc(newLines, newLabor, form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, line_items: newLines, labor_items: newLabor, ...totals });
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
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, line_items: lines, ...totals });
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
    const totals = recalc(allLines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, line_items: allLines, ...totals });
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
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, line_items: lines, ...totals });
    toast.success("Core credit added — core will be added to inventory when invoice is complete");
  };
  const removeLine = (idx) => {
    const lines = form.line_items.filter((_, i) => i !== idx);
    const totals = recalc(lines, form.labor_items || [], form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, line_items: lines, ...totals });
  };

  const selectLaborFromCatalog = (item) => {
    const items = [...(form.labor_items || [])];
    items[laborPickingIdx] = { name: item.name, description: item.description || "", price: item.price || 0 };
    const totals = recalc(form.line_items, items, form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, labor_items: items, ...totals });
  };

  const selectMachiningFromCatalog = (item) => {
    const items = [...(form.machining_items || [])];
    items[machiningPickingIdx] = { name: item.name, description: item.description || "", price: item.price || 0 };
    const totals = recalc(form.line_items, form.labor_items || [], items, form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, machining_items: items, ...totals });
  };

  const addLabor = () => setForm(f => ({ ...f, labor_items: [...(f.labor_items || []), { ...emptyLabor }] }));
  const updateLabor = (idx, field, value) => {
    const items = [...(form.labor_items || [])];
    items[idx] = { ...items[idx], [field]: value };
    const totals = recalc(form.line_items, items, form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, labor_items: items, ...totals });
  };
  const removeLabor = (idx) => {
    const items = (form.labor_items || []).filter((_, i) => i !== idx);
    const totals = recalc(form.line_items, items, form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, labor_items: items, ...totals });
  };

  const addMachining = () => setForm(f => ({ ...f, machining_items: [...(f.machining_items || []), { ...emptyMachining }] }));
  const updateMachining = (idx, field, value) => {
    const items = [...(form.machining_items || [])];
    items[idx] = { ...items[idx], [field]: value };
    const totals = recalc(form.line_items, form.labor_items || [], items, form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, machining_items: items, ...totals });
  };
  const removeMachining = (idx) => {
    const items = (form.machining_items || []).filter((_, i) => i !== idx);
    const totals = recalc(form.line_items, form.labor_items || [], items, form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, machining_items: items, ...totals });
  };

  const addAddon = (addonEntry) => {
    const addons = [...(form.addons || []), addonEntry];
    const totals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0, form.shipping_cost, addons);
    setForm(f => ({ ...f, addons, ...totals }));
  };
  const toggleAddonPreselected = (uid, preselected) => {
    const addons = (form.addons || []).map(a => a.uid === uid ? { ...a, selection_state: preselected ? "preselected" : "optional" } : a);
    const totals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0, form.shipping_cost, addons);
    setForm(f => ({ ...f, addons, ...totals }));
  };
  const removeAddon = (uid) => {
    const addons = (form.addons || []).filter(a => a.uid !== uid);
    const totals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0, form.shipping_cost, addons);
    setForm(f => ({ ...f, addons, ...totals }));
  };
  const expandSelectedAddonLines = (addons) => {
    const selected = (addons || []).filter(a => a.selection_state === 'preselected' || a.selection_state === 'customer_selected');
    return {
      lineItems: selected.flatMap(a => (a.line_items || []).map(li => ({ part_id: li.part_id, part_number: li.part_number, item_name: `${a.name}: ${li.item_name}`, quantity: li.quantity, unit_cost: 0, unit_price: li.unit_price, total: li.total }))),
      laborItems: selected.flatMap(a => (a.labor_items || []).map(li => ({ name: `${a.name}: ${li.name}`, description: li.description || "", price: li.price }))),
      machiningItems: selected.flatMap(a => (a.machining_items || []).map(mi => ({ name: `${a.name}: ${mi.name}`, description: mi.description || "", price: mi.price }))),
    };
  };

  const updateTaxRate = (rate) => {
    const totals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], rate, form.discount_type || "none", form.discount_value || 0);
    setForm({ ...form, tax_rate: rate, ...totals });
  };

  const updateDiscount = (field, value) => {
    const updated = { ...form, [`discount_${field}`]: value };
    if (field === "type" && value === "none") updated.discount_value = 0;
    const totals = recalc(updated.line_items, updated.labor_items || [], updated.machining_items || [], updated.tax_rate, updated.discount_type || "none", updated.discount_value || 0);
    setForm({ ...updated, ...totals });
  };

  const updateShipping = (val) => {
    const shipping = Number(val) || 0;
    const totals = recalc(form.line_items, form.labor_items || [], form.machining_items || [], form.tax_rate, form.discount_type || "none", form.discount_value || 0, shipping);
    setForm(f => ({ ...f, shipping_cost: shipping, ...totals }));
  };

  const handleCannedJobSelect = async (cannedJob) => {
    setSelectedSpec(cannedJob);

    // Fetch current inventory prices at the moment the canned job is loaded
    const [allParts, allLaborItems, allMachiningItems] = await Promise.all([
      base44.entities.Part.list("-created_date", 500),
      base44.entities.LaborItem.list("-created_date", 200),
      base44.entities.MachiningItem.list("-created_date", 200),
    ]);

    const partsMap = Object.fromEntries(allParts.map(p => [p.id, p]));
    const laborMap = Object.fromEntries(allLaborItems.map(l => [l.id, l]));
    const machiningMap = Object.fromEntries(allMachiningItems.map(m => [m.id, m]));

    // Build line items with current sell prices from inventory
    const cannedLineItems = (cannedJob.line_items || []).length > 0
      ? cannedJob.line_items.map(item => {
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
    const cannedLaborItems = (cannedJob.labor_items || []).length > 0
      ? cannedJob.labor_items.map(item => {
          let inventoryLabor = item.labor_item_id ? laborMap[item.labor_item_id] : null;
          if (!inventoryLabor && item.name) {
            inventoryLabor = allLaborItems.find(l => l.name && l.name.toLowerCase() === item.name.toLowerCase());
          }
          return {
            name: item.name || "",
            description: item.description || "",
            price: inventoryLabor ? (Number(inventoryLabor.price) || 0) : 0,
          };
        })
      : [{ name: "Engine Assembly & Dyno", description: `${cannedJob.name} build`, price: 0 }];

    // Build machining items with current prices from machining catalog
    const cannedMachiningItems = (cannedJob.machining_items || []).length > 0
      ? cannedJob.machining_items.map(item => {
          let inventoryMachining = item.machining_item_id ? machiningMap[item.machining_item_id] : null;
          if (!inventoryMachining && item.name) {
            inventoryMachining = allMachiningItems.find(m => m.name && m.name.toLowerCase() === item.name.toLowerCase());
          }
          return {
            name: item.name || "",
            description: item.description || "",
            price: inventoryMachining ? (Number(inventoryMachining.price) || 0) : 0,
          };
        })
      : [];

    const updatedNotes = (form.notes ? form.notes + "\n\n" : "") +
      `Canned Job: ${cannedJob.name}\n` +
      (cannedJob.description ? `Description: ${cannedJob.description}` : "");

    const totals = recalc(cannedLineItems, cannedLaborItems, cannedMachiningItems, form.tax_rate, form.discount_type || "none", form.discount_value || 0);
    setForm(f => ({ ...f, line_items: cannedLineItems, labor_items: cannedLaborItems, machining_items: cannedMachiningItems, notes: updatedNotes, ...totals }));
    toast.success("Canned job loaded with current inventory prices");
  };

  const totalDeposit = (form.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const depositMet = !form.deposit_required || totalDeposit >= Number(form.deposit_amount || 0);

  const handleRecordPayment = async (payment) => {
    const updatedPayments = [...(form.payments || []), payment];
    const newTotalDeposit = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const newDepositPaid = newTotalDeposit >= Number(form.deposit_amount || 0);

    // Always convert to invoice — payment goes on the invoice, not the estimate
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const invoice = await base44.entities.Invoice.create({
      invoice_number: invoiceNumber,
      estimate_id: id,
      customer_id: form.customer_id,
      customer_engine_id: form.customer_engine_id || "",
      build_id: form.build_id || "",
      status: newTotalDeposit >= (form.total || 0) ? "paid" : "partial",
      issue_date: new Date().toISOString().split("T")[0],
      line_items: [...form.line_items, ...expandSelectedAddonLines(form.addons).lineItems],
      labor_items: [...(form.labor_items || []), ...expandSelectedAddonLines(form.addons).laborItems],
      machining_items: [...(form.machining_items || []), ...expandSelectedAddonLines(form.addons).machiningItems],
      subtotal: form.subtotal,
      tax_rate: form.tax_rate,
      tax_amount: form.tax_amount,
      total: form.total,
      discount_type: form.discount_type || "none",
      discount_value: form.discount_value || 0,
      discount_amount: form.discount_amount || 0,
      shipping_cost: Number(form.shipping_cost) || 0,
      amount_paid: newTotalDeposit,
      balance_due: Math.max(0, (form.total || 0) - newTotalDeposit),
      public_access_token: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      contains_illegal_parts: form.contains_illegal_parts || false,
      notes: form.notes || "",
      payments: updatedPayments,
    });
    await base44.entities.Estimate.update(id, {
      invoice_id: invoice.id,
      status: "approved",
      deposit_paid: newDepositPaid,
      payments: [],
      amount_paid: 0,
    });
    setForm(f => ({ ...f, invoice_id: invoice.id, status: "approved", deposit_paid: newDepositPaid, payments: [], amount_paid: 0 }));
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["estimates"] });

    // For engine builds with deposit met: also create the build
    if (form.is_engine_build && newDepositPaid && !form.build_id) {
      try {
        const cust = customers.find(c => c.id === form.customer_id);
        let prevBuildData = {};
        let buildCreated = false;
        
        if (form.customer_engine_id) {
          const engineRec = await base44.entities.CustomerEngine.filter({ id: form.customer_engine_id });
          const eng = engineRec[0];
          if (eng) {
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
             const allBuilds = await base44.entities.EngineBuild.list("queue_position", 500);
             const queuedBuilds = allBuilds.filter(b => ["queued", "in_progress", "assembly", "testing"].includes(b.status));
             const maxPos = queuedBuilds.length > 0 ? Math.max(...queuedBuilds.map(b => b.queue_position || 0)) : 0;

             const build = await base44.entities.EngineBuild.create({
               engine_serial_number: eng.engine_serial_number,
               eed_id: eng.eed_id,
               customer_engine_id: eng.id,
               platform_id: eng.platform_id,
               build_number: form.estimate_number,
               customer_id: form.customer_id,
               customer_name: cust ? `${cust.first_name} ${cust.last_name}` : "",
               queue_position: maxPos + 1,
               status: "queued",
               work_tag: "none",
               assembly_notes: form.notes || "",
               ...prevBuildData,
             });
             try {
              await base44.entities.CustomerEngine.update(eng.id, { check_in_status: "in_build" });
              qc.invalidateQueries({ queryKey: ["checked-in-engines"] });
             } catch (e) { console.warn("Failed to update engine check-in status:", e); }
             await base44.entities.Estimate.update(id, { build_id: build.id, customer_engine_id: eng.id });
             setForm(f => ({ ...f, build_id: build.id, customer_engine_id: eng.id }));
            qc.invalidateQueries({ queryKey: ["builds"] });
            toast.success("Deposit received — engine build created and queued!");
            buildCreated = true;
            }
            }

            if (!buildCreated) {
            // Fallback: no engine selected
            const allBuilds = await base44.entities.EngineBuild.list("queue_position", 500);
            const queuedBuilds = allBuilds.filter(b => ["queued", "in_progress", "assembly", "testing"].includes(b.status));
            const maxPos = queuedBuilds.length > 0 ? Math.max(...queuedBuilds.map(b => b.queue_position || 0)) : 0;

            const build = await base44.entities.EngineBuild.create({
            engine_serial_number: `ESN-${Date.now().toString().slice(-6)}`,
            eed_id: `EED-${Date.now().toString().slice(-6)}`,
            build_number: form.estimate_number,
            platform_id: form.customer_engine_id ? selectedEngine?.platform_id : "",
            customer_id: form.customer_id,
            customer_name: cust ? `${cust.first_name} ${cust.last_name}` : "",
            queue_position: maxPos + 1,
            status: "queued",
            work_tag: "none",
            assembly_notes: form.notes || "",
            });
            await base44.entities.Estimate.update(id, { build_id: build.id, ...(form.customer_engine_id ? { customer_engine_id: form.customer_engine_id } : {}) });
            setForm(f => ({ ...f, build_id: build.id }));
            qc.invalidateQueries({ queryKey: ["builds"] });
            toast.success("Deposit received — engine build created and queued!");
            }
            } catch (e) {
         console.error("Failed to auto-create build on payment:", e);
         toast.error("Invoice created but failed to create build");
        }
        }
        toast.success("Payment recorded — invoice created!");
        navigate(`/InvoiceDetail?id=${invoice.id}`);
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
      // Auto-create engine build + invoice, prefilling from previous build for this engine
      setConvertingToBuild(true);
      const cust = customers.find(c => c.id === form.customer_id);

      // 1) Gather previous-build data (safe to fail — wrapped in try/catch)
      let prevBuildData = {};
      let eng = null;
      if (form.customer_engine_id) {
        try {
          const engineRec = await base44.entities.CustomerEngine.filter({ id: form.customer_engine_id });
          eng = engineRec?.[0] || null;
          if (eng) {
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
              if (lastBuild.spec_sheet_id) {
                try {
                  const specs = await base44.entities.SpecSheet.filter({ id: lastBuild.spec_sheet_id });
                  if (specs?.[0]?.spec_type) {
                    await base44.entities.CustomerEngine.update(eng.id, { current_stage: specs[0].spec_type });
                  }
                } catch (e) {
                  console.warn("Failed to update stage from build spec sheet:", e);
                }
              }
            }
          }
        } catch (e) {
          console.error("Error prefilling from previous build", e);
        }
      }

      // 2) Create the engine build (NOT inside the try/catch above)
      let buildData;
      if (eng) {
        buildData = {
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
        };
      } else {
        buildData = {
          engine_serial_number: `ESN-${Date.now().toString().slice(-6)}`,
          eed_id: `EED-${Date.now().toString().slice(-6)}`,
          build_number: form.estimate_number,
          platform_id: form.customer_engine_id ? selectedEngine?.platform_id : "",
          customer_id: form.customer_id,
          customer_name: cust ? `${cust.first_name} ${cust.last_name}` : "",
          status: "queued",
          work_tag: "none",
          assembly_notes: form.notes || "",
        };
      }

      try {
        const build = await base44.entities.EngineBuild.create(buildData);
        if (eng) {
          try {
            await base44.entities.CustomerEngine.update(eng.id, { check_in_status: "in_build" });
            qc.invalidateQueries({ queryKey: ["checked-in-engines"] });
          } catch (e) { console.warn("Failed to update engine check-in status:", e); }
        }
        // 3) Create the invoice simultaneously — errors surface to the user now
        const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
        const invoice = await base44.entities.Invoice.create({
          invoice_number: invoiceNumber,
          estimate_id: id,
          customer_id: form.customer_id,
          customer_engine_id: form.customer_engine_id || "",
          build_id: build.id,
          status: "sent",
          issue_date: new Date().toISOString().split("T")[0],
          line_items: [...form.line_items, ...expandSelectedAddonLines(form.addons).lineItems],
          labor_items: [...(form.labor_items || []), ...expandSelectedAddonLines(form.addons).laborItems],
          machining_items: [...(form.machining_items || []), ...expandSelectedAddonLines(form.addons).machiningItems],
          subtotal: form.subtotal,
          tax_rate: form.tax_rate,
          tax_amount: form.tax_amount,
          total: form.total,
          discount_type: form.discount_type || "none",
          discount_value: form.discount_value || 0,
          discount_amount: form.discount_amount || 0,
          shipping_cost: Number(form.shipping_cost) || 0,
          applied_credits: Number(form.applied_credits) || 0,
          amount_paid: totalDeposit > 0 ? totalDeposit : 0,
          balance_due: Math.max(0, (form.total || 0) - (Number(form.applied_credits) || 0) - totalDeposit),
          contains_illegal_parts: form.contains_illegal_parts || false,
          notes: form.notes || "",
          payments: form.payments || [],
        });
        await base44.entities.EngineBuild.update(build.id, { invoice_number: invoice.invoice_number });
        await base44.entities.Estimate.update(id, { build_id: build.id, invoice_id: invoice.id, ...(form.customer_engine_id ? { customer_engine_id: form.customer_engine_id } : {}) });
        // Link the legal document (if any) to the new invoice and engine
        if (form.contains_illegal_parts) {
          try {
            const docs = await base44.entities.LegalDocument.filter({ estimate_id: id, document_type: "illegal_parts" });
            const activeDoc = (docs || []).find(d => d.status !== "void");
            if (activeDoc) {
              await base44.entities.LegalDocument.update(activeDoc.id, {
                invoice_id: invoice.id,
                customer_engine_id: form.customer_engine_id || activeDoc.customer_engine_id || null,
                build_id: build.id,
              });
            }
          } catch (e) { console.warn("Failed to link legal doc to invoice:", e); }
        }
        setForm(f => ({ ...f, build_id: build.id, invoice_id: invoice.id }));
        qc.invalidateQueries({ queryKey: ["builds"] });
        qc.invalidateQueries({ queryKey: ["invoices"] });
        setConvertingToBuild(false);
        toast.success("Estimate approved — engine build & invoice created!");
        navigate(`/BuildDetail?id=${build.id}`);
      } catch (e) {
        console.error("Failed to create build/invoice on approval:", e);
        setConvertingToBuild(false);
        toast.error(`Failed to create build/invoice: ${e.message || e}`);
      }
      return;
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
        line_items: [...form.line_items, ...expandSelectedAddonLines(form.addons).lineItems],
        labor_items: [...(form.labor_items || []), ...expandSelectedAddonLines(form.addons).laborItems],
        machining_items: [...(form.machining_items || []), ...expandSelectedAddonLines(form.addons).machiningItems],
        subtotal: form.subtotal,
        tax_rate: form.tax_rate,
        tax_amount: form.tax_amount,
        total: form.total,
        discount_type: form.discount_type || "none",
        discount_value: form.discount_value || 0,
        discount_amount: form.discount_amount || 0,
        shipping_cost: Number(form.shipping_cost) || 0,
        amount_paid: totalDeposit > 0 ? totalDeposit : 0,
        balance_due: Math.max(0, (form.total || 0) - totalDeposit),
        contains_illegal_parts: form.contains_illegal_parts || false,
        notes: form.notes || "",
        payments: form.payments || [],
      });
      await base44.entities.Estimate.update(id, { invoice_id: invoice.id });
      // Link the legal document (if any) to the new invoice and engine
      if (form.contains_illegal_parts) {
        try {
          const docs = await base44.entities.LegalDocument.filter({ estimate_id: id, document_type: "illegal_parts" });
          const activeDoc = (docs || []).find(d => d.status !== "void");
          if (activeDoc) {
            await base44.entities.LegalDocument.update(activeDoc.id, {
              invoice_id: invoice.id,
              customer_engine_id: form.customer_engine_id || activeDoc.customer_engine_id || null,
            });
          }
        } catch (e) { console.warn("Failed to link legal doc to invoice:", e); }
      }
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
      const allBuilds = await base44.entities.EngineBuild.list("queue_position", 500);
      const queuedBuilds = allBuilds.filter(b => ["queued", "in_progress", "assembly", "testing"].includes(b.status));
      const maxPos = queuedBuilds.length > 0 ? Math.max(...queuedBuilds.map(b => b.queue_position || 0)) : 0;

      const build = await base44.entities.EngineBuild.create({
        engine_serial_number: `ESN-${Date.now().toString().slice(-6)}`,
        eed_id: `EED-${Date.now().toString().slice(-6)}`,
        build_number: form.estimate_number,
        platform_id: form.customer_engine_id ? selectedEngine?.platform_id : "",
        customer_id: form.customer_id,
        customer_name: customer ? `${customer.first_name} ${customer.last_name}` : "",
        queue_position: maxPos + 1,
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

    // If this estimate is part of a stage comparison group, send the comparison
    // email with the comparison link instead of the single-estimate email.
    if (form.comparison_group_id && form.comparison_public_token) {
      try {
        const groupEstimates = (allEstimates || []).filter(e => e.comparison_group_id === form.comparison_group_id);
        const sortedGroup = groupEstimates.sort((a, b) => (a.comparison_sort_order || 0) - (b.comparison_sort_order || 0));
        const url = `${COMPARISON_VIEWER_BASE}/${form.comparison_public_token}`;
        const settings = settingsData?.[0] || {};
        const html = buildComparisonEmailHtml({ stages: sortedGroup, customer, settings, url });
        const res = await base44.functions.invoke("sendSmtpEmail", {
          to: customer.email,
          subject: comparisonEmailSubject(sortedGroup),
          html,
          usePOSmtp: false,
        });
        if (res?.data?.error) { toast.error("Failed to send email"); setSending(false); return; }
        qc.invalidateQueries({ queryKey: ["estimates"] });
        toast.success(`Comparison sent to ${customer.email}`);
      } catch (err) {
        toast.error("Failed to send comparison email");
        console.error(err);
      } finally {
        setSending(false);
      }
      return;
    }

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

  const sendEstimateByText = async () => {
    const customer = customers.find(c => c.id === form.customer_id);
    if (!customer?.phone) { toast.error("Customer has no phone number"); return; }
    if (!id) { toast.error("Save the estimate first"); return; }
    setSending(true);
    try {
      let publicAccessToken = form.public_access_token;
      let checkoutUrl = form.stripe_checkout_url;
      if (!publicAccessToken) {
        publicAccessToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      }
      if (!checkoutUrl) {
        const amount = form.deposit_required ? form.deposit_amount : form.total;
        try {
          const stripeUrlRes = await base44.functions.invoke("generateStripeCheckoutUrl", {
            type: "estimate", documentId: id, amount,
            description: `Estimate ${form.estimate_number} - ${form.deposit_required ? "Deposit" : "Full Payment"}`,
            publicAccessToken, customerEmail: customer.email,
          });
          if (stripeUrlRes?.data?.checkout_url) checkoutUrl = stripeUrlRes.data.checkout_url;
        } catch (e) { /* link still usable without checkout */ }
      }
      const status = form.status === "draft" ? "sent" : form.status;
      await base44.entities.Estimate.update(id, {
        public_access_token: publicAccessToken,
        ...(checkoutUrl ? { stripe_checkout_url: checkoutUrl } : {}),
        status,
      });
      setForm(f => ({ ...f, public_access_token: publicAccessToken, ...(checkoutUrl ? { stripe_checkout_url: checkoutUrl } : {}), status }));
      try {
        await base44.functions.invoke("syncEstimateSnapshot", { estimateId: id, publicAccessToken });
      } catch (e) { /* link still usable */ }
      const viewUrl = `https://elite-viewer.base44.app/estimate/${publicAccessToken}`;
      const body = `Hi ${customer.first_name}, your estimate ${form.estimate_number} from Elite Engine Development is ready. Total: $${Number(form.total || 0).toFixed(2)}. Review & approve here: ${viewUrl}`;
      if (openSmsDraft(customer.phone, body)) {
        toast.success("Opening text message with estimate link…");
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
  const STAGE_LABELS_EST = { stock: "Stock", stage_1: "Stage 1", stage_2: "Stage 2", stage_3: "Stage 3", contract: "Contract", custom: "Custom" };

  // Resolve spec sheet: prefer explicitly set spec_sheet_id on estimate,
  // then most recent build's spec_sheet_id, then fall back to engine's current_stage match
  const selectedSpecSheetForEngine = (() => {
    if (form.spec_sheet_id) return allSpecSheets.find(s => s.id === form.spec_sheet_id) || null;
    if (engineBuilds.length > 0) {
      const mostRecentBuild = [...engineBuilds].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0];
      if (mostRecentBuild?.spec_sheet_id) {
        const found = allSpecSheets.find(s => s.id === mostRecentBuild.spec_sheet_id);
        if (found) return found;
      }
    }
    if (selectedEngine?.current_stage && selectedEngine?.platform_id) {
      return allSpecSheets.find(s =>
        s.platform_id === selectedEngine.platform_id &&
        s.spec_type === selectedEngine.current_stage &&
        s.is_current
      ) || null;
    }
    return null;
  })();

  const voidContractEngine = async () => {
    if (!id) return;
    const docs = await base44.entities.LegalDocument.filter({ estimate_id: id, document_type: "contract_engine" });
    for (const d of (docs || [])) {
      if (d.status !== "void") await base44.entities.LegalDocument.update(d.id, { status: "void" });
    }
    await base44.entities.Estimate.update(id, { contains_contract_engine: false });
    setForm(f => ({ ...f, contains_contract_engine: false }));
    qc.invalidateQueries({ queryKey: ["estimate", id] });
    toast.success("Contract Engine agreement voided");
  };

  const voidIllegalParts = async () => {
    if (!id) return;
    try {
      const docs = await base44.entities.LegalDocument.filter({ estimate_id: id, document_type: "illegal_parts" });
      for (const d of (docs || [])) {
        if (d.status !== "void") await base44.entities.LegalDocument.update(d.id, { status: "void" });
      }
      await base44.entities.Estimate.update(id, { contains_illegal_parts: false });
      setForm(f => ({ ...f, contains_illegal_parts: false }));
      if (form.public_access_token) {
        await base44.functions.invoke("syncEstimateSnapshot", { estimateId: id, publicAccessToken: form.public_access_token });
      }
      qc.invalidateQueries({ queryKey: ["estimate", id] });
      toast.success("Illegal Parts agreement deleted");
    } catch (e) {
      toast.error("Failed to delete: " + e.message);
    }
  };

  if (id && estimateLoading) {
    return <LoadingState />;
  }

  if (printMode) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4 print:hidden">
          <button onClick={() => setPrintMode(false)} className="px-4 py-2 bg-slate-200 rounded hover:bg-slate-300">← Back to Edit</button>
          <button onClick={() => { document.title = `Estimate ${form.estimate_number}`; window.print(); }} className="px-4 py-2 bg-[#e20404] text-white rounded hover:bg-[#c00303] font-semibold">🖨 Print Estimate</button>
        </div>
        <PrintableEstimate estimate={form} customer={customer || { first_name: "", last_name: "" }} settings={settingsData?.[0]} customerEngine={selectedEngine} platform={selectedEnginePlatform} specSheet={selectedSpecSheetForEngine} />
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
      <CannedJobPicker
        open={cannedJobOpen}
        onClose={() => setCannedJobOpen(false)}
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
      <AddonPickerModal
        open={addonPickerOpen}
        onClose={() => setAddonPickerOpen(false)}
        onAdd={addAddon}
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
      <IllegalPartsViewModal
        open={illegalPartsViewOpen}
        onClose={() => setIllegalPartsViewOpen(false)}
        estimateId={id}
        documentType="illegal_parts"
      />
      <IllegalPartsViewModal
        open={contractEngineViewOpen}
        onClose={() => setContractEngineViewOpen(false)}
        estimateId={id}
        customerEngineId={form.customer_engine_id}
        documentType="contract_engine"
      />
      <ContractEngineModal
        open={contractEngineOpen}
        onClose={() => setContractEngineOpen(false)}
        estimateId={id}
        customerId={form.customer_id}
        buildId={form.build_id}
        customerEngineId={form.customer_engine_id}
        engineSerialNumber={selectedEngine?.engine_serial_number}
        customerName={customer ? `${customer.first_name} ${customer.last_name}` : ""}
        onCreated={async (legalDoc) => {
          if (id && legalDoc?.public_access_token) {
            try {
              setForm(f => ({ ...f, contains_contract_engine: true }));
              await base44.entities.Estimate.update(id, { contains_contract_engine: true });
              await base44.functions.invoke("syncLegalDocument", { legalDocumentId: legalDoc.id });
              qc.invalidateQueries({ queryKey: ["estimate", id] });
              toast.success("Contract Engine agreement created");
            } catch (e) {
              console.error("Failed to sync contract engine doc:", e);
            }
          }
        }}
      />
      <IllegalPartsModal
        open={illegalPartsOpen}
        onClose={() => setIllegalPartsOpen(false)}
        onSigned={async (legalDoc) => {
          // Save the legal document token on the estimate and re-sync to viewer app
          if (id && legalDoc?.public_access_token) {
            try {
              setForm(f => ({ ...f, contains_illegal_parts: true }));
              await base44.entities.Estimate.update(id, {
                contains_illegal_parts: true,
              });
              await base44.functions.invoke("syncLegalDocument", { legalDocumentId: legalDoc.id });
              if (form.public_access_token) {
                await base44.functions.invoke("syncEstimateSnapshot", { estimateId: id, publicAccessToken: form.public_access_token });
              }
              qc.invalidateQueries({ queryKey: ["estimate", id] });
              toast.success("Illegal Parts document created and synced to portal");
            } catch (e) {
              console.error("Failed to sync legal document after signing:", e);
              toast.error("Document created but sync to portal failed — try re-syncing");
            }
          }
        }}
        estimateId={id}
        customerId={form.customer_id}
        buildId={form.build_id}
        customerEngineId={form.customer_engine_id}
      />

      <HistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        context={{ type: "estimate", id, number: form.estimate_number, buildId: form.build_id }}
      />

      <EstimateHeader
        form={form}
        id={id}
        depositMet={depositMet}
        sending={sending}
        convertingToBuild={convertingToBuild}
        saveMutation={saveMutation}
        sendEstimate={sendEstimate}
        sendEstimateByText={sendEstimateByText}
        handleApprove={handleApprove}
        handleConvertToBuild={handleConvertToBuild}
        setPoModalOpen={setPoModalOpen}
        setPrintMode={setPrintMode}
        setHistoryOpen={setHistoryOpen}
      />

      {/* Details + Bill To */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
                    onValueChange={handleCustomerChange}
                  />
                </div>
                <Button type="button" variant="outline" size="sm" className="shrink-0 mt-0" onClick={() => setQuickCustomerOpen(true)}>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      {selectedSpec.name}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">No canned job selected</span>
                  )}
                  <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 text-xs h-7" onClick={() => setCannedJobOpen(true)}>
                    <WrenchIcon className="w-3 h-3 mr-1" /> {selectedSpec ? "Change Canned Job" : "Load Canned Job"}
                  </Button>
                </div>
              )}
            </div>
            <div className="border border-blue-200 rounded-lg px-3 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-600" /> Contract Engine
                  </p>
                  <p className="text-xs text-slate-400">Generates IP & seal agreement — you sign first, then customer</p>
                </div>
                <Switch
                  checked={!!form.contains_contract_engine}
                  onCheckedChange={v => {
                    if (v) {
                      if (!id) { toast.error("Save the estimate first"); return; }
                      setContractEngineOpen(true);
                    } else {
                      setForm({...form, contains_contract_engine: false});
                    }
                  }}
                />
              </div>
              {form.contains_contract_engine && (
                <div className="flex items-center justify-between border-t border-blue-100 pt-2">
                  <span className="text-xs text-blue-700 font-medium flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Contract pending customer signature
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 text-xs h-7" onClick={() => setContractEngineOpen(true)} disabled={!id}>
                      New
                    </Button>
                    <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 text-xs h-7" onClick={() => setContractEngineViewOpen(true)} disabled={!id}>
                      View
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-300 text-red-600 text-xs h-7" onClick={() => setConfirmState({ open: true, title: "Void Contract Engine", message: "Void the Contract Engine agreement?", confirmLabel: "Void", onConfirm: voidContractEngine })} disabled={!id}>
                      Void
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="border border-amber-200 rounded-lg px-3 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600" /> Contains Illegal Parts
                  </p>
                  <p className="text-xs text-slate-400">Customer must sign an acknowledgment after approving</p>
                </div>
                <Switch
                  checked={!!form.contains_illegal_parts}
                  onCheckedChange={v => {
                    if (v) {
                      if (!id) {
                        toast.error("Save the estimate first before flagging illegal parts");
                        return;
                      }
                      setIllegalPartsOpen(true);
                    } else {
                      setForm({...form, contains_illegal_parts: false});
                    }
                  }}
                />
              </div>
              {form.contains_illegal_parts && (
                <div className="flex items-center justify-between border-t border-amber-100 pt-2">
                  <span className="text-xs text-amber-700 font-medium flex items-center gap-1">
                    <AlertTriangleIcon className="w-3 h-3" /> {id ? "Signed after approval" : "Save estimate first"}
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 text-xs h-7" onClick={() => setIllegalPartsOpen(true)} disabled={!id}>
                      Create
                    </Button>
                    <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 text-xs h-7" onClick={() => setIllegalPartsViewOpen(true)} disabled={!id}>
                      View
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-300 text-red-600 text-xs h-7" onClick={() => setConfirmState({ open: true, title: "Delete Illegal Parts Acknowledgment", message: "Delete the Illegal Parts acknowledgment? This will void the signed document and remove the flag from this estimate.", confirmLabel: "Delete", onConfirm: voidIllegalParts })} disabled={!id}>
                      Delete
                    </Button>
                  </div>
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
                  {selectedEngine.current_stage && <div><p className="text-xs text-slate-400 uppercase">Stage</p><p className="font-semibold">{STAGE_LABELS_EST[selectedEngine.current_stage] || selectedEngine.current_stage}</p></div>}
                  {selectedSpecSheetForEngine && <div><p className="text-xs text-slate-400 uppercase">Spec Sheet</p><p className="font-semibold text-purple-700">{selectedSpecSheetForEngine.custom_name || STAGE_LABELS_EST[selectedSpecSheetForEngine.spec_type] || selectedSpecSheetForEngine.spec_type} <span className="text-slate-400 text-xs">v{selectedSpecSheetForEngine.version}</span></p></div>}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>



      {id && (
        <StageComparisonSection
          estimate={form}
          estimates={allEstimates}
          customer={customer}
          onNavigateToEstimate={(estId) => navigate(`/EstimateDetail?id=${estId}`)}
        />
      )}

      <EstimateDepositSection
        form={form}
        setForm={setForm}
        id={id}
        totalDeposit={totalDeposit}
        depositMet={depositMet}
        setPaymentModalOpen={setPaymentModalOpen}
      />

      {/* Parts */}
      <Card className="border-0 shadow-sm mb-6">
        <CardHeader className="pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Parts</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setCoreCreditOpen(true)} className="border-emerald-400 text-emerald-700 hover:bg-emerald-50"><Recycle className="w-4 h-4 mr-1" /> Add Core Credit</Button>
            <Button size="sm" variant="outline" onClick={() => { setPickingIdx(null); setPickerInitialTab("cores"); setPartPickerOpen(true); }} className="border-purple-300 text-purple-700 hover:bg-purple-50"><Recycle className="w-4 h-4 mr-1" /> Add Core</Button>
            <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => setMultiPartPickerOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Part</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
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
                  <tr key={idx} className="border-b border-slate-100 [&>td]:align-top">
                    <td className="py-2 pr-2">
                      <Input value={line.part_number} onChange={e => updateLine(idx, "part_number", e.target.value)} placeholder="Part #" className="border-slate-200 text-xs font-mono" />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex gap-1">
                        <Input value={line.item_name} onChange={e => updateLine(idx, "item_name", e.target.value)} placeholder="Item name..." className="border-slate-200" />
                        <Button size="sm" variant="ghost" className="text-slate-400 hover:text-[#e20404] px-2 shrink-0" onClick={() => { setPickingIdx(idx); setPickerInitialTab("parts"); setPartPickerOpen(true); }}>
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

      <SimpleItemsTable
        type="labor"
        items={form.labor_items}
        onUpdate={updateLabor}
        onRemove={removeLabor}
        onAdd={addLabor}
        onPick={(idx) => { setLaborPickingIdx(idx); setLaborPickerOpen(true); }}
      />
      <SimpleItemsTable
        type="machining"
        items={form.machining_items}
        onUpdate={updateMachining}
        onRemove={removeMachining}
        onAdd={addMachining}
        onPick={(idx) => { setMachiningPickingIdx(idx); setMachiningPickerOpen(true); }}
      />

      <div className="mb-6">
        <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 mb-3" onClick={() => setAddonPickerOpen(true)}>
          <Sparkles className="w-4 h-4 mr-1" /> Add Addons
        </Button>
        <EstimateAddonsSection
          addons={form.addons || []}
          onTogglePreselected={toggleAddonPreselected}
          onRemove={removeAddon}
        />
      </div>

      <EstimateTotals
        form={form}
        customer={customer}
        setForm={setForm}
        updateTaxRate={updateTaxRate}
        updateDiscount={updateDiscount}
        updateShipping={updateShipping}
        availableCreditBalance={availableCreditBalance}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div><Label>Customer Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={4} placeholder="Notes visible to customer..." /></div>
        <div><Label>Internal Notes</Label><Textarea value={form.internal_notes} onChange={e => setForm({...form, internal_notes: e.target.value})} rows={4} placeholder="Internal only..." /></div>
      </div>

      {id && (
        <div className="mt-6">
          <EmailsSection linkType="estimate" linkId={id} docNumber={form.estimate_number} title="Emails linked to this estimate" />
        </div>
      )}

      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState({})}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
      />
    </div>
  );
}