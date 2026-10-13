import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, ChevronLeft, ChevronRight, Check, AlertTriangle, AlertCircle,
  Lock, Printer, Download, ClipboardCheck,
} from "lucide-react";
import { goodsSubtotal } from "@/lib/money";
import {
  SCHEDULE_J_CATEGORIES, TAX_CLASSIFICATIONS, FILING_STATUSES,
  addMoney, subMoney, calcStateTax, roundMoney, formatPeriod, formatPeriodLabel,
  validateFiling,
} from "@/lib/okTaxRules";
import ScheduleJTable from "./ScheduleJTable";
import StsFormWorksheet from "./StsFormWorksheet";
import JurisdictionBreakdown from "./JurisdictionBreakdown";

const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const STEPS = ["Select Period", "Reconcile Sales", "Review Exemptions", "Tax Calculations", "OkTAP Worksheet", "Record Filing", "Lock Period"];

export default function OktapFilingWizard({ open, onOpenChange, year, invoices, customers, expenses, taxFilings, jurisdictions, onSaved }) {
  const [step, setStep] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [adjustments, setAdjustments] = useState({ interest: 0, penalty: 0 });
  const [filingRecord, setFilingRecord] = useState({ filed_date: "", confirmation_number: "", payment_amount: 0, payment_date: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [expandedInv, setExpandedInv] = useState(null);

  const custName = useCallback((id) => {
    const c = customers?.find((c) => c.id === id);
    return c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.company_name || "—" : "—";
  }, [customers]);

  const custState = useCallback((id) => {
    const c = customers?.find((c) => c.id === id);
    return c?.state || c?.shipping_state || "";
  }, [customers]);

  const [classifyingId, setClassifyingId] = useState(null);
  const [classOverrides, setClassOverrides] = useState({});
  const handleReclassify = useCallback(async (inv, newClass) => {
    setClassOverrides((m) => ({ ...m, [inv.id]: newClass }));
    setClassifyingId(inv.id);
    try {
      await base44.entities.Invoice.update(inv.id, { tax_classification: newClass });
      if (onSaved) onSaved();
    } catch (err) {
      setClassOverrides((m) => { const c = { ...m }; delete c[inv.id]; return c; });
      console.error("Failed to reclassify invoice:", err);
    } finally {
      setClassifyingId(null);
    }
  }, [onSaved]);

  // --- Period invoices (paid invoices in the selected month) ---
  const periodInvoices = useMemo(() => {
    if (selectedMonth === null) return [];
    const monthKey = formatPeriod(year, selectedMonth);
    return (invoices || [])
      .filter((inv) => inv.status === "paid" && (inv.issue_date || "").slice(0, 7) === monthKey)
      .sort((a, b) => (a.issue_date || "").localeCompare(b.issue_date || ""));
  }, [selectedMonth, year, invoices]);

  // --- Auto-classify a transaction ---
  const classifyInvoice = useCallback((inv) => {
    if (classOverrides[inv.id]) return classOverrides[inv.id];
    if (inv.tax_classification) return inv.tax_classification;
    const cust = customers?.find((c) => c.id === inv.customer_id);
    if (cust?.tax_exempt) return "nontaxable_service";
    const state = custState(inv.customer_id);
    if (state && state.toUpperCase() !== "OK" && (inv.shipping_cost || 0) > 0) return "out_of_state";
    return "oklahoma_pickup";
  }, [customers, custState, classOverrides]);

  // Classification → Schedule J exemption code mapping
  const CLASS_EXEMPTION_CODE = {
    out_of_state: "3i",
    resale: "3a",
    manufacturing: "3g",
    nontaxable_service: "3v",
  };

  const isInvoiceExempt = useCallback((inv) => {
    const cust = customers?.find((c) => c.id === inv.customer_id);
    if (cust?.tax_exempt) return true;
    const classification = classifyInvoice(inv);
    if (CLASS_EXEMPTION_CODE[classification]) return true;
    return (!inv.tax_rate || inv.tax_rate === 0) && (!inv.tax_amount || inv.tax_amount === 0);
  }, [customers, classifyInvoice]);

  // --- Build per-invoice tax detail ---
  const invoiceDetails = useMemo(() => {
    return periodInvoices.map((inv) => {
      const goods = goodsSubtotal(inv);
      const discount = inv.discount_amount || 0;
      const netGoods = subMoney(goods, discount);
      const classification = classifyInvoice(inv);
      const exempt = isInvoiceExempt(inv);
      const exemptionCode = inv.exemption_code || CLASS_EXEMPTION_CODE[classification] || (exempt ? "3x" : null);
      const taxCollected = inv.tax_amount || 0;
      const needsReview = classification === "needs_review" || (exempt && !exemptionCode) || (!exempt && taxCollected === 0 && (inv.tax_rate || 0) === 0 && !customers?.find((c) => c.id === inv.customer_id)?.tax_exempt);
      return { inv, goods, discount, netGoods, exempt, classification, exemptionCode, taxCollected, needsReview };
    });
  }, [periodInvoices, isInvoiceExempt, classifyInvoice, customers]);

  // --- Schedule J exemption breakdown ---
  const exemptions = useMemo(() => {
    const map = {};
    SCHEDULE_J_CATEGORIES.forEach((cat) => { map[cat.code] = { amount: 0, invoices: [] }; });
    invoiceDetails.forEach(({ inv, netGoods, exempt, exemptionCode }) => {
      if (!exempt || !exemptionCode) return;
      if (!map[exemptionCode]) return;
      map[exemptionCode].amount = addMoney(map[exemptionCode].amount, netGoods);
      map[exemptionCode].invoices.push({ ...inv, exemptAmount: netGoods });
    });
    return map;
  }, [invoiceDetails]);

  // --- Tax calculations ---
  const calc = useMemo(() => {
    const grossSales = addMoney(...invoiceDetails.map((d) => d.netGoods));
    const exemptSales = addMoney(...invoiceDetails.filter((d) => d.exempt).map((d) => d.netGoods));
    const taxableSales = addMoney(...invoiceDetails.filter((d) => !d.exempt).map((d) => d.netGoods));
    const taxCollected = addMoney(...invoiceDetails.map((d) => d.taxCollected));
    const totalExemptions = exemptSales;
    const stateTax = calcStateTax(taxableSales);
    const cityCountyTax = Math.max(0, subMoney(taxCollected, stateTax));
    const totalTaxDue = addMoney(stateTax, cityCountyTax);
    const unclassifiedCount = invoiceDetails.filter((d) => d.needsReview).length;

    // Jurisdiction breakdown
    const jurisdictionMap = {};
    invoiceDetails.filter((d) => !d.exempt).forEach(({ inv, netGoods, taxCollected }) => {
      const jCode = inv.jurisdiction_code || "OK-DEFAULT";
      const jName = jCode === "OK-DEFAULT" ? "Default (Oklahoma State)" : (jurisdictions?.find((j) => j.jurisdiction_code === jCode)?.jurisdiction_name || jCode);
      if (!jurisdictionMap[jCode]) {
        jurisdictionMap[jCode] = { code: jCode, name: jName, type: "state", taxableSales: 0, stateTax: 0, countyTax: 0, cityTax: 0, invoices: [] };
      }
      jurisdictionMap[jCode].taxableSales = addMoney(jurisdictionMap[jCode].taxableSales, netGoods);
      jurisdictionMap[jCode].stateTax = addMoney(jurisdictionMap[jCode].stateTax, calcStateTax(netGoods));
      jurisdictionMap[jCode].invoices.push({ ...inv, customerName: custName(inv.customer_id), taxableAmount: netGoods, taxCollected });
    });
    // Distribute remaining tax (collected - state) as city/county
    Object.values(jurisdictionMap).forEach((j) => {
      const totalCollectedForJ = addMoney(...j.invoices.map((i) => i.taxCollected || 0));
      j.cityTax = Math.max(0, subMoney(totalCollectedForJ, j.stateTax));
      j.countyTax = 0;
    });

    const periodLabel = selectedMonth !== null ? formatPeriodLabel(year, selectedMonth) : "";

    return {
      grossSales, exemptSales, taxableSales, taxCollected,
      totalExemptions, stateTax, cityCountyTax, totalTaxDue,
      unclassifiedCount, periodLabel,
      inventoryConsumed: 0, foodSales: 0,
      cityCountyTax,
      jurisdictionData: Object.values(jurisdictionMap),
    };
  }, [invoiceDetails, jurisdictions, custName, year, selectedMonth]);

  const totalAmountDue = addMoney(calc.totalTaxDue, adjustments.interest, adjustments.penalty);
  const validation = validateFiling({ ...calc, totalTaxDue: calc.totalTaxDue, adjustments: 0 });

  // --- Existing filing for this period ---
  const existingFiling = useMemo(() => {
    if (selectedMonth === null) return null;
    const periodKey = formatPeriod(year, selectedMonth);
    return (taxFilings || []).find((f) => f.filing_period === periodKey) || null;
  }, [taxFilings, year, selectedMonth]);

  const isLocked = existingFiling?.locked;

  // --- Save filing ---
  const handleSaveFiling = async (lockAfter = false) => {
    setSaving(true);
    try {
      const periodKey = formatPeriod(year, selectedMonth);
      const payload = {
        filing_period: periodKey,
        period_type: "monthly",
        year: String(year),
        month: selectedMonth,
        status: lockAfter ? "filed" : (existingFiling?.status || "needs_review"),
        gross_sales: calc.grossSales,
        inventory_consumed: 0,
        total_exemptions: calc.totalExemptions,
        food_sales: 0,
        taxable_sales: calc.taxableSales,
        state_tax: calc.stateTax,
        city_county_tax: calc.cityCountyTax,
        total_tax_due: calc.totalTaxDue,
        interest: adjustments.interest,
        penalty: adjustments.penalty,
        total_amount_due: totalAmountDue,
        tax_collected: calc.taxCollected,
        exempt_sales: calc.exemptSales,
        schedule_j: JSON.stringify(exemptions),
        jurisdiction_breakdown: JSON.stringify(calc.jurisdictionData),
        transaction_summary: JSON.stringify(invoiceDetails.map((d) => ({
          id: d.inv.id, invoice_number: d.inv.invoice_number, customer_id: d.inv.customer_id,
          netGoods: d.netGoods, exempt: d.exempt, classification: d.classification,
          exemptionCode: d.exemptionCode, taxCollected: d.taxCollected,
        }))),
        transaction_count: invoiceDetails.length,
        unclassified_count: calc.unclassifiedCount,
        adjustments: JSON.stringify([
          ...(adjustments.interest > 0 ? [{ field: "interest", amount: adjustments.interest, explanation: "Late payment interest" }] : []),
          ...(adjustments.penalty > 0 ? [{ field: "penalty", amount: adjustments.penalty, explanation: "Late filing penalty" }] : []),
        ]),
        filed_date: filingRecord.filed_date || null,
        confirmation_number: filingRecord.confirmation_number || "",
        payment_amount: filingRecord.payment_amount || 0,
        payment_date: filingRecord.payment_date || null,
        locked: lockAfter,
        locked_at: lockAfter ? new Date().toISOString() : (existingFiling?.locked_at || null),
        locked_by: lockAfter ? "admin" : (existingFiling?.locked_by || ""),
        notes: filingRecord.notes || "",
      };

      if (existingFiling) {
        await base44.entities.TaxFiling.update(existingFiling.id, payload);
      } else {
        await base44.entities.TaxFiling.create(payload);
      }
      if (onSaved) onSaved();
    } catch (err) {
      console.error("Failed to save tax filing:", err);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => window.print();

  const handleExportCsv = () => {
    const rows = [
      ["Invoice", "Customer", "Date", "Classification", "Exempt", "Exemption Code", "Goods", "Discount", "Net", "Tax Collected"],
      ...invoiceDetails.map((d) => [
        d.inv.invoice_number, custName(d.inv.customer_id), d.inv.issue_date || "",
        d.classification, d.exempt ? "Yes" : "No", d.exemptionCode || "",
        d.goods.toFixed(2), d.discount.toFixed(2), d.netGoods.toFixed(2), d.taxCollected.toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oktap-transactions-${formatPeriod(year, selectedMonth)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canAdvance = step === 0 ? selectedMonth !== null : true;
  const hasActivity = invoiceDetails.length > 0;

  const handleClose = () => {
    setStep(0);
    setSelectedMonth(null);
    setAdjustments({ interest: 0, penalty: 0 });
    setFilingRecord({ filed_date: "", confirmation_number: "", payment_amount: 0, payment_date: "", notes: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#e20404]" />
            OkTAP Sales Tax Filing Wizard
            {existingFiling && (
              <Badge className={`ml-2 ${FILING_STATUSES.find((s) => s.value === existingFiling.status)?.color || ""}`}>
                {FILING_STATUSES.find((s) => s.value === existingFiling.status)?.label || existingFiling.status}
              </Badge>
            )}
            {isLocked && <Badge className="bg-slate-700 text-white"><Lock className="w-3 h-3 mr-1" />Locked</Badge>}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1 print:hidden">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center">
              <button
                onClick={() => i <= step || selectedMonth !== null ? setStep(i) : null}
                disabled={i > step && selectedMonth === null}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  i === step ? "bg-[#e20404] text-white" : i < step ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : <span className="w-4 text-center">{i + 1}</span>}
                {label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 mx-0.5" />}
            </div>
          ))}
        </div>

        {/* STEP 0: Period selection */}
        {step === 0 && (
          <div className="oktap-report">
            <p className="text-sm text-slate-500 mb-4">Select the filing period. Only months with paid-invoice activity are enabled.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {MONTHS_FULL.map((m, i) => {
                const monthKey = formatPeriod(year, i);
                const monthInvoices = (invoices || []).filter((inv) => inv.status === "paid" && (inv.issue_date || "").slice(0, 7) === monthKey);
                const active = monthInvoices.length > 0;
                const filing = (taxFilings || []).find((f) => f.filing_period === monthKey);
                return (
                  <button
                    key={m}
                    disabled={!active}
                    onClick={() => { setSelectedMonth(i); setStep(1); }}
                    className={`text-left p-4 rounded-lg border transition-colors ${
                      active ? "border-slate-200 hover:border-[#e20404] hover:bg-red-50 cursor-pointer" : "border-slate-100 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">{m}</p>
                      {filing && <Badge className={`text-xs border-0 ${FILING_STATUSES.find((s) => s.value === filing.status)?.color || ""}`}>{FILING_STATUSES.find((s) => s.value === filing.status)?.label}</Badge>}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {active ? `${monthInvoices.length} invoice${monthInvoices.length !== 1 ? "s" : ""} · $${monthInvoices.reduce((s, inv) => s + goodsSubtotal(inv), 0).toFixed(2)} goods` : "No activity"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 1: Reconcile Sales */}
        {step === 1 && selectedMonth !== null && (
          <div className="oktap-report">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Gross Sales</p>
                <p className="text-lg font-bold text-slate-900">${calc.grossSales.toFixed(2)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Taxable</p>
                <p className="text-lg font-bold text-blue-700">${calc.taxableSales.toFixed(2)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Exempt</p>
                <p className="text-lg font-bold text-emerald-700">${calc.exemptSales.toFixed(2)}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Needs Review</p>
                <p className={`text-lg font-bold ${calc.unclassifiedCount > 0 ? "text-amber-700" : "text-slate-400"}`}>{calc.unclassifiedCount}</p>
              </div>
            </div>

            {calc.unclassifiedCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">{calc.unclassifiedCount} transaction(s) need tax classification review. Exempt invoices without an exemption code and taxable invoices with zero tax are flagged. Classify them on the invoice detail page before filing.</p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">Invoice</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">Customer</th>
                    <th className="text-left py-2 px-2 font-semibold text-slate-700">Classification</th>
                    <th className="text-right py-2 px-1 font-semibold text-slate-700">Goods</th>
                    <th className="text-right py-2 px-1 font-semibold text-slate-400">− Disc</th>
                    <th className="text-right py-2 px-2 font-semibold text-slate-700">Net</th>
                    <th className="text-center py-2 px-2 font-semibold text-slate-700">Type</th>
                    <th className="text-right py-2 px-1 font-semibold text-slate-700">Tax</th>
                    <th className="text-center py-2 px-2 font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceDetails.map(({ inv, goods, discount, netGoods, exempt, classification, exemptionCode, taxCollected, needsReview }) => (
                    <tr key={inv.id} className={`border-b border-slate-100 ${needsReview ? "bg-amber-50/50" : ""}`}>
                      <td className="py-1.5 px-2 font-medium text-slate-700">{inv.invoice_number}</td>
                      <td className="py-1.5 px-2 text-slate-600">{custName(inv.customer_id)}</td>
                      <td className="py-1.5 px-2">
                        <Select
                          value={classification}
                          disabled={classifyingId === inv.id}
                          onValueChange={(val) => val !== classification && handleReclassify(inv, val)}
                        >
                          <SelectTrigger className="h-7 text-xs px-2 py-0 min-w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TAX_CLASSIFICATIONS.map((c) => (
                              <SelectItem key={c.value} value={c.value} className="text-xs">
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 px-1 text-right text-slate-500">${goods.toFixed(2)}</td>
                      <td className="py-1.5 px-1 text-right text-slate-400">{discount > 0 ? `−${discount.toFixed(2)}` : "—"}</td>
                      <td className="py-1.5 px-2 text-right font-semibold text-slate-800">${netGoods.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-center">
                        <Badge className={`text-xs border-0 ${exempt ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{exempt ? "Exempt" : "Taxable"}</Badge>
                      </td>
                      <td className="py-1.5 px-1 text-right text-amber-700 font-medium">${taxCollected.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-center">
                        {needsReview ? <Badge className="text-xs bg-amber-100 text-amber-700 border-0">Review</Badge> : <Check className="w-3.5 h-3.5 text-emerald-500 inline" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                  <tr>
                    <td className="py-2 px-2 font-bold text-slate-700" colSpan={3}>{invoiceDetails.length} invoice(s)</td>
                    <td className="py-2 px-1 text-right font-bold text-slate-500">${addMoney(...invoiceDetails.map((d) => d.goods)).toFixed(2)}</td>
                    <td className="py-2 px-1 text-right font-bold text-slate-400">−{addMoney(...invoiceDetails.map((d) => d.discount)).toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-bold text-slate-800">${calc.grossSales.toFixed(2)}</td>
                    <td></td>
                    <td className="py-2 px-1 text-right font-bold text-amber-700">${calc.taxCollected.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* STEP 2: Review Exemptions */}
        {step === 2 && selectedMonth !== null && (
          <div className="oktap-report">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Total Exempt Sales</p>
                <p className="text-lg font-bold text-emerald-700">${calc.exemptSales.toFixed(2)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Exempt Invoices</p>
                <p className="text-lg font-bold text-slate-700">{invoiceDetails.filter((d) => d.exempt).length}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Uncoded Exemptions</p>
                <p className={`text-lg font-bold ${invoiceDetails.filter((d) => d.exempt && !d.inv.exemption_code).length > 0 ? "text-amber-700" : "text-slate-400"}`}>
                  {invoiceDetails.filter((d) => d.exempt && !d.inv.exemption_code).length}
                </p>
              </div>
            </div>
            <ScheduleJTable exemptions={exemptions} custName={custName} />
          </div>
        )}

        {/* STEP 3: Tax Calculations */}
        {step === 3 && selectedMonth !== null && (
          <div className="oktap-report">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Taxable Sales</p>
                <p className="text-lg font-bold text-slate-900">${calc.taxableSales.toFixed(2)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">State Tax (4.5%)</p>
                <p className="text-lg font-bold text-blue-700">${calc.stateTax.toFixed(2)}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">City/County Tax</p>
                <p className="text-lg font-bold text-purple-700">${calc.cityCountyTax.toFixed(2)}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Tax Collected</p>
                <p className="text-lg font-bold text-amber-700">${calc.taxCollected.toFixed(2)}</p>
              </div>
            </div>

            {Math.abs(subMoney(calc.taxCollected, calc.totalTaxDue)) > 0.01 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  Tax collected (${calc.taxCollected.toFixed(2)}) differs from calculated liability (${calc.totalTaxDue.toFixed(2)}) by ${Math.abs(subMoney(calc.taxCollected, calc.totalTaxDue)).toFixed(2)}.
                  This may be due to rounding differences or jurisdiction rate changes. The worksheet uses the calculated liability for filing.
                </p>
              </div>
            )}

            <JurisdictionBreakdown jurisdictionData={calc.jurisdictionData} jurisdictions={jurisdictions} />
          </div>
        )}

        {/* STEP 4: OkTAP Worksheet */}
        {step === 4 && selectedMonth !== null && (
          <div className="oktap-report">
            <StsFormWorksheet
              calc={calc}
              adjustments={adjustments}
              onAdjustment={(field, value) => setAdjustments((a) => ({ ...a, [field]: value }))}
            />
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Copyable Values (in OkTAP entry order)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs font-mono">
                {[
                  ["Line 1 — Total Sales", calc.grossSales],
                  ["Line 2 — Inventory Consumed", 0],
                  ["Line 3 — Total Exemptions", calc.totalExemptions],
                  ["Line 4 — Food Sales", 0],
                  ["Line 5 — Net Taxable Sales", addMoney(calc.grossSales, 0, -calc.totalExemptions, 0)],
                  ["Line 6 — State Tax", calc.stateTax],
                  ["Line 7 — City/County Tax", calc.cityCountyTax],
                  ["Line 8 — Total Tax Due", calc.totalTaxDue],
                  ["Line 9 — Interest", adjustments.interest],
                  ["Line 10 — Penalty", adjustments.penalty],
                  ["Line 11 — Total Amount Due", totalAmountDue],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between px-2 py-1 bg-white rounded border border-slate-100">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-bold text-slate-800">${Number(val).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Record Filing */}
        {step === 5 && selectedMonth !== null && (
          <div className="oktap-report space-y-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">Filing Summary — {calc.periodLabel}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div><span className="text-slate-500">Gross Sales:</span> <span className="font-bold">${calc.grossSales.toFixed(2)}</span></div>
                <div><span className="text-slate-500">Taxable Sales:</span> <span className="font-bold">${calc.taxableSales.toFixed(2)}</span></div>
                <div><span className="text-slate-500">Exempt Sales:</span> <span className="font-bold">${calc.exemptSales.toFixed(2)}</span></div>
                <div><span className="text-slate-500">State Tax:</span> <span className="font-bold">${calc.stateTax.toFixed(2)}</span></div>
                <div><span className="text-slate-500">City/County Tax:</span> <span className="font-bold">${calc.cityCountyTax.toFixed(2)}</span></div>
                <div><span className="text-slate-500">Total Tax Due:</span> <span className="font-bold">${calc.totalTaxDue.toFixed(2)}</span></div>
                <div><span className="text-slate-500">Interest:</span> <span className="font-bold">${adjustments.interest.toFixed(2)}</span></div>
                <div><span className="text-slate-500">Penalty:</span> <span className="font-bold">${adjustments.penalty.toFixed(2)}</span></div>
                <div><span className="text-slate-500">Total Amount Due:</span> <span className="font-bold text-[#e20404]">${totalAmountDue.toFixed(2)}</span></div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Filing / Submission Date</Label>
                <Input type="date" value={filingRecord.filed_date} onChange={(e) => setFilingRecord((r) => ({ ...r, filed_date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">OkTAP Confirmation Number</Label>
                <Input value={filingRecord.confirmation_number} onChange={(e) => setFilingRecord((r) => ({ ...r, confirmation_number: e.target.value }))} placeholder="e.g. STS-202610-12345" className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Payment Amount</Label>
                <Input type="number" step="0.01" value={filingRecord.payment_amount} onChange={(e) => setFilingRecord((r) => ({ ...r, payment_amount: Number(e.target.value) || 0 }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Payment Date</Label>
                <Input type="date" value={filingRecord.payment_date} onChange={(e) => setFilingRecord((r) => ({ ...r, payment_date: e.target.value }))} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-sm">Notes</Label>
                <Input value={filingRecord.notes} onChange={(e) => setFilingRecord((r) => ({ ...r, notes: e.target.value }))} placeholder="Optional filing notes..." className="mt-1" />
              </div>
            </div>

            <Button onClick={() => handleSaveFiling(false)} disabled={saving || isLocked} className="w-full">
              <ClipboardCheck className="w-4 h-4 mr-1" /> {saving ? "Saving..." : "Save Filing Record"}
            </Button>
            {isLocked && <p className="text-xs text-slate-400 text-center">This filing period is locked. Create an amendment to make changes.</p>}
          </div>
        )}

        {/* STEP 6: Lock Period */}
        {step === 6 && selectedMonth !== null && (
          <div className="oktap-report space-y-4">
            <div className="bg-slate-50 rounded-lg p-4 text-center">
              <Lock className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Lock Filing Period — {calc.periodLabel}</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Locking prevents untracked changes to this filing period. Any corrections after locking must go through an amendment workflow.
                The filing record, Schedule J breakdown, and jurisdiction data will be permanently saved.
              </p>
            </div>

            {validation.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-700 mb-1">Validation Errors</p>
                {validation.errors.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
              </div>
            )}

            {validation.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-amber-700 mb-1">Warnings</p>
                {validation.warnings.map((w, i) => <p key={i} className="text-xs text-amber-600">• {w}</p>)}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportCsv} className="flex-1">
                <Download className="w-4 h-4 mr-1" /> Export Transactions CSV
              </Button>
              <Button onClick={handlePrint} variant="outline" className="flex-1">
                <Printer className="w-4 h-4 mr-1" /> Print Worksheet
              </Button>
            </div>

            <Button
              onClick={() => handleSaveFiling(true)}
              disabled={saving || isLocked || validation.errors.length > 0}
              className="w-full bg-slate-800 hover:bg-slate-900"
            >
              <Lock className="w-4 h-4 mr-1" /> {saving ? "Locking..." : isLocked ? "Period Locked" : "Lock & File Period"}
            </Button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200 print:hidden">
          <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex gap-2">
            {step >= 4 && <Button variant="outline" onClick={handleExportCsv}><Download className="w-4 h-4 mr-1" /> CSV</Button>}
            {step >= 4 && <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> Print</Button>}
          </div>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canAdvance || (step === 0 && !hasActivity)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}