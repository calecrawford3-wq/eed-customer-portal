import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const money = (value, currency = "usd") => new Intl.NumberFormat("en-US", { style: "currency", currency: /^[a-z]{3}$/i.test(currency) ? currency.toUpperCase() : "USD" }).format(Number(value || 0) / 100);
const categories = Object.entries({unreviewed:"Unclassified",income:"Income (general)",employment_income:"Employment income",business_income:"Business income",other_income:"Other income",transfer:"Transfer / funding",debt_payment:"Debt payment",housing:"Housing",utilities:"Utilities",insurance:"Insurance",groceries:"Groceries",fuel:"Fuel",dining:"Dining",shopping:"Shopping",entertainment:"Entertainment",refund:"Refund / reversal",fees:"Bank fees",other:"Other"}).map(([value,label])=>({value,label}));
const categoryLabel = value => categories.find(c=>c.value===value)?.label || "Unclassified";

export default function FinancialReviewTransactions({ transactions = [], corrections = [], onCorrectionsChange, disabled }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const reviewed = useMemo(() => new Map(corrections.map((item) => [item.transaction_id, item])), [corrections]);
  const filtered = useMemo(() => transactions.filter((transaction) => {
    const matches = `${transaction.description || ""} ${transaction.date || ""} ${transaction.account_id || ""}`.toLowerCase().includes(search.toLowerCase().trim());
    const category = reviewed.get(transaction.id)?.category || transaction.category || "unreviewed";
    const matchesReview = reviewFilter === "all" || (reviewFilter === "reviewed" && reviewed.has(transaction.id)) || (reviewFilter === "pending" && !reviewed.has(transaction.id)) || (reviewFilter === "unclassified" && category === "unreviewed");
    return matches && matchesReview && (direction === "all" || (direction === "in" ? transaction.amount_cents > 0 : transaction.amount_cents < 0));
  }), [transactions, search, direction, reviewFilter, reviewed]);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const activePage = Math.min(page, pages - 1);
  const changeCategory = (transaction, category) => {
    const current = reviewed.get(transaction.id);
    const next = corrections.filter((item) => item.transaction_id !== transaction.id);
    next.push({ transaction_id: transaction.id, category, note: current?.note || "Manually classified in financial review." });
    onCorrectionsChange(next);
  };

  return <section className="space-y-3" aria-labelledby="aef-transactions-heading">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="aef-transactions-heading" className="text-sm font-bold text-slate-900">Transactions</h3><span className="text-xs text-slate-500">{transactions.filter(t=>reviewed.has(t.id)).length} reviewed / {transactions.length} total · {filtered.length} shown</span></div>
    <div className="flex flex-wrap gap-2"><label className="relative flex-1 min-w-44"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input aria-label="Search financial transactions" placeholder="Search descriptions or dates" className="pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></label><select aria-label="Filter transaction direction" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={direction} onChange={(event) => { setDirection(event.target.value); setPage(0); }}><option value="all">All transactions</option><option value="in">Money in</option><option value="out">Money out</option></select><select aria-label="Filter review status" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={reviewFilter} onChange={e=>{setReviewFilter(e.target.value);setPage(0)}}><option value="all">All review statuses</option><option value="pending">Not reviewed</option><option value="reviewed">Reviewed</option><option value="unclassified">Unclassified</option></select></div>
    {!filtered.length ? <p className="text-sm text-slate-500 py-3">{transactions.length ? "No transactions match this search." : "No transaction history is available yet."}</p> : <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3 whitespace-nowrap">Date</th><th className="p-3">Description</th><th className="p-3 text-right whitespace-nowrap">Amount</th><th className="p-3">Review category</th></tr></thead><tbody>{filtered.slice(activePage * 20, (activePage + 1) * 20).map((transaction) => <tr key={transaction.id} className="border-t border-slate-200 align-top"><td className="p-3 whitespace-nowrap text-slate-600">{transaction.date || "Unknown"}</td><td className="p-3 min-w-44 max-w-xs"><p className="break-words text-slate-900">{transaction.description || "No description"}</p><p className="mt-1 text-[11px] text-slate-500">{transaction.status || "posted"}{` · Suggested: ${categoryLabel(transaction.suggested_category)}`}</p></td><td className={`p-3 text-right whitespace-nowrap font-medium ${transaction.amount_cents > 0 ? "text-emerald-700" : "text-slate-700"}`}>{transaction.amount_cents > 0 ? "+" : ""}{money(transaction.amount_cents, transaction.currency)}</td><td className="p-3"><select className="rounded border border-slate-300 bg-white p-2 text-xs" aria-label={`Review category for ${transaction.description || transaction.date}`} disabled={disabled} value={reviewed.get(transaction.id)?.category || transaction.category || "unreviewed"} onChange={(event) => changeCategory(transaction, event.target.value)}>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select><div className="mt-1">{reviewed.has(transaction.id) ? <span className="text-emerald-700">Reviewed</span> : <Button size="sm" variant="ghost" disabled={disabled} onClick={()=>changeCategory(transaction,transaction.category || "unreviewed")}>Accept suggestion</Button>}</div></td></tr>)}</tbody></table></div>}
    {filtered.length > 20 && <div className="flex items-center justify-between gap-2 text-xs text-slate-500"><Button variant="outline" size="sm" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Previous</Button><span>Page {activePage + 1} of {pages}</span><Button variant="outline" size="sm" disabled={activePage + 1 >= pages} onClick={() => setPage(activePage + 1)}>Next</Button></div>}
    <p className="text-xs text-slate-500">Suggested categories are estimates. Changes are applied when you save the review. A deposit may be a transfer, refund or loan rather than earned income.</p>
  </section>;
}
