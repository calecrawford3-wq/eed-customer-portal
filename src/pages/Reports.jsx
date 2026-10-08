import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, FileText, Download, Printer, Package } from "lucide-react";
import OktapReportDialog from "@/components/reports/OktapReportDialog";
import SalesTaxMonthDrilldown from "@/components/reports/SalesTaxMonthDrilldown";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getMonthKey(dateStr) {
  if (!dateStr) return null;
  // Read the month straight from the "YYYY-MM-DD" string so dates on the 1st
  // aren't shifted into the previous month by timezone conversion.
  return dateStr.slice(0, 7);
}

function getMonthLabel(key) {
  const [y, m] = key.split("-");
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
}

export default function Reports() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [tab, setTab] = useState("pnl");
  const [taxView, setTaxView] = useState("all"); // all | taxable | exempt
  const [oktapOpen, setOktapOpen] = useState(false);

  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: () => base44.entities.Invoice.list("-created_date", 1000) });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: () => base44.entities.Expense.list("-date", 1000) });
  const { data: estimates = [] } = useQuery({ queryKey: ["estimates"], queryFn: () => base44.entities.Estimate.list("-created_date", 500) });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => base44.entities.Customer.list("-created_date", 200) });
  const { data: builds = [] } = useQuery({ queryKey: ["builds"], queryFn: () => base44.entities.EngineBuild.list("-created_date", 200) });
  const { data: parts = [] } = useQuery({ queryKey: ["parts-report"], queryFn: () => base44.entities.Part.list("-created_date", 1000) });
  const { data: cores = [] } = useQuery({ queryKey: ["cores-report"], queryFn: () => base44.entities.EngineCore.list("-created_date", 500) });

  const yearInvoices = invoices.filter(i => (i.issue_date || "").startsWith(year));
  const yearExpenses = expenses.filter(e => (e.date || "").startsWith(year));
  const yearEstimates = estimates.filter(e => (e.issue_date || "").startsWith(year));

  // --- P&L ---
  const totalRevenue = yearInvoices.reduce((s, i) => s + (i.amount_paid || 0), 0);
  const totalInvoiced = yearInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const totalExpensesAmt = yearExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const grossProfit = totalRevenue - yearExpenses.filter(e => e.category === "parts_cogs").reduce((s, e) => s + (e.amount || 0), 0);
  const netIncome = totalRevenue - totalExpensesAmt;

  // Monthly P&L
  const monthlyPnL = useMemo(() => {
    const map = {};
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      map[key] = { month: MONTHS[m - 1], revenue: 0, expenses: 0, profit: 0 };
    }
    yearInvoices.forEach(i => {
      const k = getMonthKey(i.issue_date);
      if (k && map[k]) map[k].revenue += (i.amount_paid || 0);
    });
    yearExpenses.forEach(e => {
      const k = getMonthKey(e.date);
      if (k && map[k]) map[k].expenses += (e.amount || 0);
    });
    return Object.values(map).map(d => ({ ...d, profit: d.revenue - d.expenses }));
  }, [year, invoices, expenses]);

  // --- Sales Tax Report ---
  const taxPaid = yearExpenses.reduce((s, e) => s + (e.tax_amount || 0), 0);

  // An invoice is tax-exempt when its customer is flagged tax_exempt, or it has no tax
  // (tax_rate 0 AND tax_amount 0). Void invoices are excluded from sales totals.
  const isInvoiceTaxExempt = (inv) => {
    if (!inv) return false;
    const cust = customers.find(c => c.id === inv.customer_id);
    if (cust?.tax_exempt) return true;
    return (!inv.tax_rate || inv.tax_rate === 0) && (!inv.tax_amount || inv.tax_amount === 0);
  };
  // Only fully paid invoices count toward sales and tax collected.
  const salesInvoices = yearInvoices.filter(i => i.status === "paid");
  const taxCollected = salesInvoices.reduce((s, i) => s + (i.tax_amount || 0), 0);
  const netTaxOwed = taxCollected - taxPaid;
  const totalSales = salesInvoices.reduce((s, i) => s + (i.subtotal || 0), 0);
  const taxableSalesInvoices = salesInvoices.filter(i => !isInvoiceTaxExempt(i));
  const exemptSalesInvoices = salesInvoices.filter(i => isInvoiceTaxExempt(i));
  const taxableSales = taxableSalesInvoices.reduce((s, i) => s + (i.subtotal || 0), 0);
  const exemptSales = exemptSalesInvoices.reduce((s, i) => s + (i.subtotal || 0), 0);
  const totalDiscounts = salesInvoices.reduce((s, i) => s + (i.discount_amount || 0), 0);
  const netSales = totalSales - totalDiscounts;

  const monthlyTax = useMemo(() => {
    const map = {};
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      map[key] = { month: MONTHS[m - 1], collected: 0, paid: 0, sales: 0, exemptSales: 0 };
    }
    salesInvoices.forEach(i => {
      const k = getMonthKey(i.issue_date);
      if (k && map[k]) {
        map[k].sales += (i.subtotal || 0);
        map[k].collected += (i.tax_amount || 0);
        if (isInvoiceTaxExempt(i)) map[k].exemptSales += (i.subtotal || 0);
      }
    });
    yearExpenses.forEach(e => {
      const k = getMonthKey(e.date);
      if (k && map[k]) map[k].paid += (e.tax_amount || 0);
    });
    return Object.values(map).map(d => ({ ...d, net: d.collected - d.paid, taxableSales: d.sales - d.exemptSales }));
  }, [year, invoices, expenses, customers]);

  // --- Expense Breakdown ---
  const expenseByCategory = useMemo(() => {
    const map = {};
    yearExpenses.forEach(e => {
      if (!map[e.category]) map[e.category] = 0;
      map[e.category] += e.amount || 0;
    });
    return Object.entries(map).map(([cat, amt]) => ({ name: cat.replace(/_/g, " "), value: amt })).sort((a, b) => b.value - a.value);
  }, [year, expenses]);

  const PIE_COLORS = ["#e20404","#3b82f6","#10b981","#f59e0b","#8b5cf6","#06b6d4","#f97316","#84cc16","#ec4899","#6b7280"];

  // --- Accounts Receivable Aging ---
  const today = new Date();
  const aging = useMemo(() => {
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    invoices.filter(i => ["sent","partial","overdue"].includes(i.status)).forEach(i => {
      const due = i.due_date ? new Date(i.due_date) : null;
      const days = due ? Math.floor((today - due) / 86400000) : 0;
      const bal = i.balance_due || 0;
      if (days <= 0) buckets.current += bal;
      else if (days <= 30) buckets.d30 += bal;
      else if (days <= 60) buckets.d60 += bal;
      else if (days <= 90) buckets.d90 += bal;
      else buckets.over90 += bal;
    });
    return [
      { label: "Current", amount: buckets.current, color: "text-emerald-600" },
      { label: "1-30 Days", amount: buckets.d30, color: "text-amber-600" },
      { label: "31-60 Days", amount: buckets.d60, color: "text-orange-600" },
      { label: "61-90 Days", amount: buckets.d90, color: "text-red-500" },
      { label: "90+ Days", amount: buckets.over90, color: "text-red-700" },
    ];
  }, [invoices]);

  // --- Inventory ---
  const activeParts = parts.filter(p => p.status !== "discontinued");
  const totalPartsOnHand = activeParts.reduce((s, p) => s + (p.quantity_on_hand || 0), 0);
  const totalPartsCostValue = activeParts.reduce((s, p) => s + ((p.quantity_on_hand || 0) * (p.unit_cost || 0)), 0);
  const totalPartsSellValue = activeParts.reduce((s, p) => s + ((p.quantity_on_hand || 0) * (p.sell_price || 0)), 0);
  const lowStockParts = activeParts.filter(p => (p.quantity_on_hand || 0) <= (p.reorder_point || 0) && (p.reorder_point || 0) > 0);

  const partsByCategory = useMemo(() => {
    const map = {};
    activeParts.forEach(p => {
      const cat = p.category || "other";
      if (!map[cat]) map[cat] = { count: 0, qty: 0, costValue: 0, sellValue: 0 };
      map[cat].count += 1;
      map[cat].qty += (p.quantity_on_hand || 0);
      map[cat].costValue += (p.quantity_on_hand || 0) * (p.unit_cost || 0);
      map[cat].sellValue += (p.quantity_on_hand || 0) * (p.sell_price || 0);
    });
    return Object.entries(map).map(([cat, data]) => ({
      category: cat.replace(/_/g, " "),
      ...data
    })).sort((a, b) => b.costValue - a.costValue);
  }, [parts]);

  const activeCores = cores.filter(c => c.status !== "inactive");
  const totalCoresOnHand = activeCores.reduce((s, c) => s + (c.quantity_on_hand || 0), 0);
  const totalCoresCostValue = activeCores.reduce((s, c) => s + ((c.quantity_on_hand || 0) * (c.unit_cost || 0)), 0);
  const totalCoresSellValue = activeCores.reduce((s, c) => s + ((c.quantity_on_hand || 0) * (c.sell_price || 0)), 0);

  const coresByCategory = useMemo(() => {
    const map = {};
    activeCores.forEach(c => {
      const cat = c.category || "other";
      if (!map[cat]) map[cat] = { count: 0, qty: 0, costValue: 0, sellValue: 0 };
      map[cat].count += 1;
      map[cat].qty += (c.quantity_on_hand || 0);
      map[cat].costValue += (c.quantity_on_hand || 0) * (c.unit_cost || 0);
      map[cat].sellValue += (c.quantity_on_hand || 0) * (c.sell_price || 0);
    });
    return Object.entries(map).map(([cat, data]) => ({
      category: cat.replace(/_/g, " "),
      ...data
    })).sort((a, b) => b.costValue - a.costValue);
  }, [cores]);

  const inventoryChart = [...partsByCategory.map(d => ({ name: d.category + " (P)", value: d.costValue })), ...coresByCategory.map(d => ({ name: d.category + " (C)", value: d.costValue }))].filter(d => d.value > 0);

  // --- Builds Metrics ---
  const completedBuilds = builds.filter(b => ["complete","shipped"].includes(b.status));
  const buildsThisYear = completedBuilds.filter(b => (b.completion_date || "").startsWith(year));

  const handlePrint = () => window.print();

  const years = [];
  for (let y = currentYear; y >= currentYear - 4; y--) years.push(String(y));

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6 md:mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Reports</h1>
          <p className="text-slate-500 mt-1">Financial reports and business metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-1" /> Print</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 flex overflow-x-auto">
          <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
          <TabsTrigger value="salestax">Sales Tax</TabsTrigger>
          <TabsTrigger value="expenses">Expense Breakdown</TabsTrigger>
          <TabsTrigger value="ar">A/R Aging</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="metrics">Business Metrics</TabsTrigger>
        </TabsList>

        {/* P&L Tab */}
        <TabsContent value="pnl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Revenue Collected</p>
                <p className="text-2xl font-bold text-emerald-600">${totalRevenue.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
                <p className="text-xs text-slate-400 mt-1">Invoiced: ${totalInvoiced.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Expenses</p>
                <p className="text-2xl font-bold text-[#e20404]">${totalExpensesAmt.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Gross Profit</p>
                <p className={`text-2xl font-bold ${grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>${grossProfit.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Net Income</p>
                <p className={`text-2xl font-bold ${netIncome >= 0 ? "text-emerald-600" : "text-red-600"}`}>${netIncome.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-sm mb-6">
            <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Revenue vs Expenses — {year}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyPnL}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                  <Tooltip formatter={v => `$${Number(v).toFixed(2)}`} />
                  <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4,4,0,0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#e20404" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Net Profit</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthlyPnL}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                  <Tooltip formatter={v => `$${Number(v).toFixed(2)}`} />
                  <Line type="monotone" dataKey="profit" name="Net Profit" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sales Tax Tab */}
        <TabsContent value="salestax">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Sales (Gross)</p>
                <p className="text-2xl font-bold text-slate-900">${totalSales.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
                <p className="text-xs text-slate-400 mt-1">{salesInvoices.length} invoices</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Net Sales (after discounts)</p>
                <p className="text-2xl font-bold text-slate-700">${netSales.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
                <p className="text-xs text-slate-400 mt-1">{totalDiscounts > 0 ? `−$${totalDiscounts.toLocaleString("en-US", {minimumFractionDigits:2})} discounts` : "No discounts applied"}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Taxable Sales</p>
                <p className="text-2xl font-bold text-slate-700">${taxableSales.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
                <p className="text-xs text-slate-400 mt-1">{taxableSalesInvoices.length} invoices</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Tax-Exempt Sales</p>
                <p className="text-2xl font-bold text-emerald-600">${exemptSales.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
                <p className="text-xs text-slate-400 mt-1">{exemptSalesInvoices.length} invoices</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Tax Collected</p>
                <p className="text-2xl font-bold text-emerald-600">${taxCollected.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Tax Paid (on expenses)</p>
                <p className="text-2xl font-bold text-slate-700">${taxPaid.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Net Tax Owed to State</p>
                <p className={`text-2xl font-bold ${netTaxOwed >= 0 ? "text-[#e20404]" : "text-emerald-600"}`}>${netTaxOwed.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Effective Tax Rate</p>
                <p className="text-2xl font-bold text-slate-700">{taxableSales > 0 ? ((taxCollected / taxableSales) * 100).toFixed(2) : "0.00"}%</p>
              </CardContent>
            </Card>
          </div>

          {/* View toggle: All / Taxable / Tax-Exempt + OKTAP generator */}
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Showing:</span>
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                {[
                  { key: "all", label: "All Sales" },
                  { key: "taxable", label: "Taxable Only" },
                  { key: "exempt", label: "Tax-Exempt Only" },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setTaxView(opt.key)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      taxView === opt.key ? "bg-[#e20404] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="outline" onClick={() => setOktapOpen(true)}>
              <FileText className="w-4 h-4 mr-1" /> Generate OKTAP Log
            </Button>
          </div>

          <Card className="border-0 shadow-sm mb-6">
            <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Sales Tax — {year}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyTax}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={v => `$${Number(v).toFixed(2)}`} />
                  <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[4,4,0,0]} />
                  <Bar dataKey="paid" name="Paid" fill="#94a3b8" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Sales Tax Detail by Month — {year}</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className="text-left py-2 font-medium text-slate-600">Month</th>
                    {taxView !== "exempt" && (
                      <>
                        <th className="text-right py-2 font-medium text-slate-600">Taxable Sales</th>
                        <th className="text-right py-2 font-medium text-slate-600">Tax Collected</th>
                      </>
                    )}
                    {taxView !== "taxable" && (
                      <th className="text-right py-2 font-medium text-slate-600">Exempt Sales</th>
                    )}
                    {taxView === "all" && (
                      <>
                        <th className="text-right py-2 font-medium text-slate-600">Tax Paid</th>
                        <th className="text-right py-2 font-medium text-slate-600">Net Owed</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {monthlyTax.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2">{row.month}</td>
                      {taxView !== "exempt" && (
                        <>
                          <td className="py-2 text-right text-slate-700">${row.taxableSales.toFixed(2)}</td>
                          <td className="py-2 text-right text-emerald-600">${row.collected.toFixed(2)}</td>
                        </>
                      )}
                      {taxView !== "taxable" && (
                        <td className="py-2 text-right text-slate-500">${row.exemptSales.toFixed(2)}</td>
                      )}
                      {taxView === "all" && (
                        <>
                          <td className="py-2 text-right text-slate-500">${row.paid.toFixed(2)}</td>
                          <td className={`py-2 text-right font-semibold ${row.net >= 0 ? "text-[#e20404]" : "text-emerald-600"}`}>${row.net.toFixed(2)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <td className="py-2 font-bold">Total</td>
                    {taxView !== "exempt" && (
                      <>
                        <td className="py-2 text-right font-bold text-slate-700">${taxableSales.toFixed(2)}</td>
                        <td className="py-2 text-right font-bold text-emerald-600">${taxCollected.toFixed(2)}</td>
                      </>
                    )}
                    {taxView !== "taxable" && (
                      <td className="py-2 text-right font-bold text-slate-500">${exemptSales.toFixed(2)}</td>
                    )}
                    {taxView === "all" && (
                      <>
                        <td className="py-2 text-right font-bold text-slate-600">${taxPaid.toFixed(2)}</td>
                        <td className={`py-2 text-right font-bold ${netTaxOwed >= 0 ? "text-[#e20404]" : "text-emerald-600"}`}>${netTaxOwed.toFixed(2)}</td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* Tax-Exempt invoice list */}
          {taxView === "exempt" && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Tax-Exempt Invoices — {year}</CardTitle></CardHeader>
              <CardContent>
                {exemptSalesInvoices.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-8">No tax-exempt sales for {year}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200">
                      <tr>
                        <th className="text-left py-2 font-medium text-slate-600">Invoice</th>
                        <th className="text-left py-2 font-medium text-slate-600">Customer</th>
                        <th className="text-left py-2 font-medium text-slate-600">Issue Date</th>
                        <th className="text-left py-2 font-medium text-slate-600">Reason</th>
                        <th className="text-right py-2 font-medium text-slate-600">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exemptSalesInvoices.map(inv => {
                        const c = customers.find(c => c.id === inv.customer_id);
                        const reason = (c?.tax_exempt) ? "Customer tax-exempt" : "No tax applied";
                        return (
                          <tr key={inv.id} className="border-b border-slate-100">
                            <td className="py-2 font-medium">{inv.invoice_number}</td>
                            <td className="py-2 text-slate-600">{c ? `${c.first_name} ${c.last_name}` : "—"}</td>
                            <td className="py-2 text-slate-500">{inv.issue_date || "—"}</td>
                            <td className="py-2"><Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">{reason}</Badge></td>
                            <td className="py-2 text-right font-medium">${(inv.subtotal || 0).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t border-slate-200 bg-slate-50">
                      <tr>
                        <td className="py-2 font-bold" colSpan={4}>Total Tax-Exempt Sales</td>
                        <td className="py-2 text-right font-bold">${exemptSales.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </CardContent>
            </Card>
          )}
          <SalesTaxMonthDrilldown
            monthlyTax={monthlyTax}
            salesInvoices={salesInvoices}
            customers={customers}
            year={year}
          />
        </TabsContent>

        <OktapReportDialog
          open={oktapOpen}
          onOpenChange={setOktapOpen}
          year={year}
          monthlyTax={monthlyTax}
          totals={{ totalSales, taxableSales, exemptSales, taxCollected }}
        />

        {/* Expense Breakdown Tab */}
        <TabsContent value="expenses">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Expenses by Category — {year}</CardTitle></CardHeader>
              <CardContent>
                {expenseByCategory.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-8">No expenses for {year}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={expenseByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {expenseByCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v => `$${Number(v).toFixed(2)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Category Detail</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200">
                    <tr>
                      <th className="text-left py-2 font-medium text-slate-600">Category</th>
                      <th className="text-right py-2 font-medium text-slate-600">Amount</th>
                      <th className="text-right py-2 font-medium text-slate-600">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseByCategory.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-2 capitalize">{row.name}</td>
                        <td className="py-2 text-right font-medium">${row.value.toFixed(2)}</td>
                        <td className="py-2 text-right text-slate-500">{totalExpensesAmt > 0 ? ((row.value / totalExpensesAmt) * 100).toFixed(1) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50">
                    <tr>
                      <td className="py-2 font-bold">Total</td>
                      <td className="py-2 text-right font-bold">${totalExpensesAmt.toFixed(2)}</td>
                      <td className="py-2 text-right font-bold">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* A/R Aging Tab */}
        <TabsContent value="ar">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            {aging.map((b, i) => (
              <Card key={i} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500">{b.label}</p>
                  <p className={`text-xl font-bold ${b.color}`}>${b.amount.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Outstanding Invoices</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className="text-left py-2 font-medium text-slate-600">Invoice</th>
                    <th className="text-left py-2 font-medium text-slate-600">Customer</th>
                    <th className="text-left py-2 font-medium text-slate-600">Due Date</th>
                    <th className="text-left py-2 font-medium text-slate-600">Days Overdue</th>
                    <th className="text-right py-2 font-medium text-slate-600">Balance</th>
                    <th className="text-left py-2 font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.filter(i => ["sent","partial","overdue"].includes(i.status) && (i.balance_due || 0) > 0).map(inv => {
                    const c = customers.find(c => c.id === inv.customer_id);
                    const due = inv.due_date ? new Date(inv.due_date) : null;
                    const days = due ? Math.floor((today - due) / 86400000) : null;
                    return (
                      <tr key={inv.id} className="border-b border-slate-100">
                        <td className="py-2 font-medium">{inv.invoice_number}</td>
                        <td className="py-2 text-slate-600">{c ? `${c.first_name} ${c.last_name}` : "—"}</td>
                        <td className="py-2 text-slate-500">{inv.due_date || "—"}</td>
                        <td className="py-2">
                          {days !== null ? (
                            <span className={days > 0 ? "text-red-600 font-medium" : "text-emerald-600"}>
                              {days > 0 ? `${days}d overdue` : "Current"}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="py-2 text-right font-bold text-[#e20404]">${Number(inv.balance_due || 0).toFixed(2)}</td>
                        <td className="py-2"><Badge className="capitalize text-xs bg-amber-100 text-amber-700 border-0">{inv.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Package className="w-4 h-4 text-slate-400" /><p className="text-xs text-slate-500">Parts On Hand</p></div>
                <p className="text-2xl font-bold text-slate-900">{totalPartsOnHand.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">{activeParts.length} active SKUs</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Parts Cost Value</p>
                <p className="text-2xl font-bold text-slate-700">${totalPartsCostValue.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
                <p className="text-xs text-slate-400 mt-1">Sell: ${totalPartsSellValue.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Package className="w-4 h-4 text-slate-400" /><p className="text-xs text-slate-500">Cores On Hand</p></div>
                <p className="text-2xl font-bold text-slate-900">{totalCoresOnHand.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">{activeCores.length} active cores</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Cores Cost Value</p>
                <p className="text-2xl font-bold text-slate-700">${totalCoresCostValue.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
                <p className="text-xs text-slate-400 mt-1">Sell: ${totalCoresSellValue.toLocaleString("en-US", {minimumFractionDigits:2})}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="border-0 shadow-sm bg-slate-50">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Inventory Value (Cost)</p>
                <p className="text-2xl font-bold text-slate-900">${(totalPartsCostValue + totalCoresCostValue).toLocaleString("en-US", {minimumFractionDigits:2})}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-slate-50">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Inventory Value (Sell)</p>
                <p className="text-2xl font-bold text-slate-900">${(totalPartsSellValue + totalCoresSellValue).toLocaleString("en-US", {minimumFractionDigits:2})}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-slate-50">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Potential Margin</p>
                <p className="text-2xl font-bold text-emerald-600">${((totalPartsSellValue + totalCoresSellValue) - (totalPartsCostValue + totalCoresCostValue)).toLocaleString("en-US", {minimumFractionDigits:2})}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-slate-50">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Low Stock Alerts</p>
                <p className="text-2xl font-bold text-amber-600">{lowStockParts.length}</p>
                <p className="text-xs text-slate-400 mt-1">At/below reorder point</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Inventory Value by Category</CardTitle></CardHeader>
              <CardContent>
                {inventoryChart.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-8">No inventory data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={inventoryChart} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip formatter={v => `$${Number(v).toFixed(2)}`} />
                      <Bar dataKey="value" name="Cost Value" fill="#3b82f6" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Low Stock Parts</CardTitle></CardHeader>
              <CardContent>
                {lowStockParts.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-8">No low-stock parts</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200">
                      <tr>
                        <th className="text-left py-2 font-medium text-slate-600">Part</th>
                        <th className="text-right py-2 font-medium text-slate-600">On Hand</th>
                        <th className="text-right py-2 font-medium text-slate-600">Reorder Pt</th>
                        <th className="text-right py-2 font-medium text-slate-600">Unit Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockParts.slice(0, 15).map(p => (
                        <tr key={p.id} className="border-b border-slate-100">
                          <td className="py-2"><span className="font-medium">{p.name}</span><span className="text-slate-400 text-xs ml-2">{p.part_number}</span></td>
                          <td className="py-2 text-right text-amber-600 font-medium">{p.quantity_on_hand || 0}</td>
                          <td className="py-2 text-right text-slate-500">{p.reorder_point || 0}</td>
                          <td className="py-2 text-right text-slate-600">${(p.unit_cost || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-sm mb-6">
            <CardHeader className="pb-3"><CardTitle className="text-base">Parts by Category</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className="text-left py-2 font-medium text-slate-600">Category</th>
                    <th className="text-right py-2 font-medium text-slate-600">SKUs</th>
                    <th className="text-right py-2 font-medium text-slate-600">Qty On Hand</th>
                    <th className="text-right py-2 font-medium text-slate-600">Cost Value</th>
                    <th className="text-right py-2 font-medium text-slate-600">Sell Value</th>
                    <th className="text-right py-2 font-medium text-slate-600">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {partsByCategory.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 capitalize">{row.category}</td>
                      <td className="py-2 text-right">{row.count}</td>
                      <td className="py-2 text-right">{row.qty}</td>
                      <td className="py-2 text-right font-medium">${row.costValue.toFixed(2)}</td>
                      <td className="py-2 text-right font-medium">${row.sellValue.toFixed(2)}</td>
                      <td className="py-2 text-right text-emerald-600">${(row.sellValue - row.costValue).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <td className="py-2 font-bold">Total Parts</td>
                    <td className="py-2 text-right font-bold">{partsByCategory.reduce((s, r) => s + r.count, 0)}</td>
                    <td className="py-2 text-right font-bold">{totalPartsOnHand}</td>
                    <td className="py-2 text-right font-bold">${totalPartsCostValue.toFixed(2)}</td>
                    <td className="py-2 text-right font-bold">${totalPartsSellValue.toFixed(2)}</td>
                    <td className="py-2 text-right font-bold text-emerald-600">${(totalPartsSellValue - totalPartsCostValue).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base">Engine Cores by Category</CardTitle></CardHeader>
            <CardContent>
              {coresByCategory.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No active cores</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200">
                    <tr>
                      <th className="text-left py-2 font-medium text-slate-600">Category</th>
                      <th className="text-right py-2 font-medium text-slate-600">Cores</th>
                      <th className="text-right py-2 font-medium text-slate-600">Qty On Hand</th>
                      <th className="text-right py-2 font-medium text-slate-600">Cost Value</th>
                      <th className="text-right py-2 font-medium text-slate-600">Sell Value</th>
                      <th className="text-right py-2 font-medium text-slate-600">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coresByCategory.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-2 capitalize">{row.category}</td>
                        <td className="py-2 text-right">{row.count}</td>
                        <td className="py-2 text-right">{row.qty}</td>
                        <td className="py-2 text-right font-medium">${row.costValue.toFixed(2)}</td>
                        <td className="py-2 text-right font-medium">${row.sellValue.toFixed(2)}</td>
                        <td className="py-2 text-right text-emerald-600">${(row.sellValue - row.costValue).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50">
                    <tr>
                      <td className="py-2 font-bold">Total Cores</td>
                      <td className="py-2 text-right font-bold">{coresByCategory.reduce((s, r) => s + r.count, 0)}</td>
                      <td className="py-2 text-right font-bold">{totalCoresOnHand}</td>
                      <td className="py-2 text-right font-bold">${totalCoresCostValue.toFixed(2)}</td>
                      <td className="py-2 text-right font-bold">${totalCoresSellValue.toFixed(2)}</td>
                      <td className="py-2 text-right font-bold text-emerald-600">${(totalCoresSellValue - totalCoresCostValue).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Business Metrics Tab */}
        <TabsContent value="metrics">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Customers</p>
                <p className="text-2xl font-bold text-slate-900">{customers.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Builds Completed ({year})</p>
                <p className="text-2xl font-bold text-slate-900">{buildsThisYear.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Estimates Sent ({year})</p>
                <p className="text-2xl font-bold text-slate-900">{yearEstimates.filter(e => e.status !== "draft").length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Estimate Conversion Rate</p>
                <p className="text-2xl font-bold text-slate-900">
                  {yearEstimates.length > 0 ? Math.round((yearEstimates.filter(e => e.status === "approved").length / yearEstimates.length) * 100) : 0}%
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Revenue Per Month — {year}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={monthlyPnL}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                    <Tooltip formatter={v => `$${Number(v).toFixed(2)}`} />
                    <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-base">Invoice Status Summary</CardTitle></CardHeader>
              <CardContent>
                {(() => {
                  const statuses = ["draft","sent","partial","paid","overdue","void"];
                  return (
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-200">
                        <tr>
                          <th className="text-left py-2 font-medium text-slate-600">Status</th>
                          <th className="text-right py-2 font-medium text-slate-600">Count</th>
                          <th className="text-right py-2 font-medium text-slate-600">Total Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statuses.map(s => {
                          const group = yearInvoices.filter(i => i.status === s);
                          const val = group.reduce((sum, i) => sum + (i.total || 0), 0);
                          return (
                            <tr key={s} className="border-b border-slate-100">
                              <td className="py-2 capitalize">{s}</td>
                              <td className="py-2 text-right">{group.length}</td>
                              <td className="py-2 text-right font-medium">${val.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}