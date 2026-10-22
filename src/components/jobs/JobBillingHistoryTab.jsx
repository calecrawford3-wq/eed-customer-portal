import React from 'react';
import { ClipboardList, Receipt, MessageSquare } from 'lucide-react';
import JobEstimateTab from '@/components/jobs/JobEstimateTab';
import JobInvoiceTab from '@/components/jobs/JobInvoiceTab';
import JobCommsTab from '@/components/jobs/JobCommsTab';

function Section({ icon: Icon, title, subtitle, children, open = false }) {
  return <details open={open} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
    <summary className="cursor-pointer list-none px-4 py-4 flex items-center gap-3 hover:bg-slate-50">
      <span className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"><Icon className="h-4 w-4"/></span>
      <span><span className="block text-sm font-semibold text-slate-900">{title}</span><span className="block text-xs text-slate-500">{subtitle}</span></span>
    </summary>
    <div className="border-t border-slate-100 p-4">{children}</div>
  </details>;
}

export default function JobBillingHistoryTab({ job, estimate, invoices, customer, initialSection }) {
  return <div className="space-y-3">
    <Section icon={ClipboardList} title="Estimate & Approvals" subtitle="Quoted work, approval and deposit requirements" open={initialSection === 'estimate'}><JobEstimateTab job={job} estimate={estimate}/></Section>
    <Section icon={Receipt} title="Invoice & Payments" subtitle="Balance, payments and release status" open={!initialSection || initialSection === 'invoice'}><JobInvoiceTab job={job} invoices={invoices}/></Section>
    <Section icon={MessageSquare} title="Communication & Documents" subtitle="Messages, calls, email and job documents" open={initialSection === 'comms'}><JobCommsTab job={job} customer={customer}/></Section>
  </div>;
}
