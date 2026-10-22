import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function JobNextAction({ job, estimate, onIntake, onNavigate }) {
  let title='Review job'; let detail='Open the job overview and continue from the current status.'; let label='Open Overview'; let action=()=>onNavigate('overview');
  if (job?.customer_engine_id && !job?.estimate_id) { title='Create or link the estimate'; detail='The engine is checked in, but the job cannot advance until an estimate is connected.'; label='Create Estimate'; action=onIntake; }
  else if (job?.stage === 'needs_estimate' || !estimate || estimate?.status === 'draft') { title='Estimate is next'; detail='Create or finish the estimate, then send it to the customer.'; label='Open Estimate'; action=()=>onNavigate('billing','estimate'); }
  else if (job?.stage === 'awaiting_approval' || estimate?.status === 'sent') { title='Customer approval is next'; detail='Review the estimate status and follow up with the customer if needed.'; label='Open Estimate'; action=()=>onNavigate('billing','estimate'); }
  else if (job?.stage === 'awaiting_deposit') { title='Deposit is next'; detail='Review payment status before releasing the job into active shop work.'; label='Open Billing'; action=()=>onNavigate('billing','invoice'); }
  else if (job?.stage === 'teardown') { title='Record teardown findings'; detail='Document findings and anything that needs customer approval before continuing.'; label='Open Findings'; action=()=>onNavigate('findings'); }
  else if (job?.stage === 'machining') { title='Continue machining'; detail='Machining is the current shop stage for this job.'; label='Open Machining'; action=()=>onNavigate('work','machining'); }
  else if (job?.stage === 'assembly') { title='Continue assembly'; detail='The build sheet is the primary work area at this stage.'; label='Open Build Sheet'; action=()=>onNavigate('work','build'); }
  else if (job?.stage === 'testing') { title='Finish testing'; detail='Record final build and test information before marking the engine ready.'; label='Open Build Sheet'; action=()=>onNavigate('work','build'); }
  else if (job?.stage === 'ready_for_pickup') { title='Collect balance & release engine'; detail='Verify the invoice and payment status before pickup or shipment.'; label='Open Billing'; action=()=>onNavigate('billing','invoice'); }
  else if (job?.stage === 'queued') { title='Start the workflow'; detail='The job is queued and ready for the next shop task.'; label='Open Workflow'; action=()=>onNavigate('work','workflow'); }
  return <section className="mx-4 md:mx-8 mt-4 rounded-xl border border-red-100 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3 print:hidden">
    <span className="h-10 w-10 rounded-xl bg-white text-[#e20404] flex items-center justify-center shrink-0"><Sparkles className="h-5 w-5"/></span>
    <div className="flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-red-700">Next action</p><p className="font-semibold text-slate-900">{title}</p><p className="text-sm text-slate-600">{detail}</p></div>
    <Button onClick={action} className="bg-[#e20404] hover:bg-red-700 shrink-0">{label}<ArrowRight className="h-4 w-4 ml-1"/></Button>
  </section>;
}
