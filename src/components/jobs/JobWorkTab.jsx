import React, { useEffect, useState } from 'react';
import { Hammer, ListChecks, Wrench, ShieldCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import JobBuildTab from '@/components/jobs/JobBuildTab';
import JobWorkflowTab from '@/components/jobs/JobWorkflowTab';
import JobMachiningTab from '@/components/jobs/JobMachiningTab';
import JobComponentVerification from '@/components/jobs/JobComponentVerification';

const sectionForStage = stage => stage === 'machining' ? 'machining' : ['assembly','testing','ready_for_pickup'].includes(stage) ? 'build' : 'workflow';

export default function JobWorkTab({ job, build, platform, customer, customers, platforms, engine, initialSection, autoOpenPlan }) {
  const [section, setSection] = useState(initialSection || sectionForStage(job?.stage));
  useEffect(() => {
    if (initialSection) setSection(initialSection);
    else setSection(sectionForStage(job?.stage));
  }, [job?.stage, initialSection]);

  return <div className="space-y-4">
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Work area</p>
      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="grid w-full h-auto grid-cols-4 gap-1 bg-white p-1">
          <TabsTrigger value="workflow" className="min-h-10"><ListChecks className="h-4 w-4 mr-1"/>Workflow</TabsTrigger>
          <TabsTrigger value="machining" className="min-h-10"><Wrench className="h-4 w-4 mr-1"/>Machining</TabsTrigger>
          <TabsTrigger value="build" className="min-h-10"><Hammer className="h-4 w-4 mr-1"/>Build Sheet</TabsTrigger>
          <TabsTrigger value="verify" className="min-h-10"><ShieldCheck className="h-4 w-4 mr-1"/>Verify</TabsTrigger>
        </TabsList>
        <TabsContent value="workflow" className="mt-4"><JobWorkflowTab job={job} build={build}/></TabsContent>
        <TabsContent value="machining" className="mt-4"><JobMachiningTab job={job} build={build} engine={engine} autoOpenPlan={autoOpenPlan}/></TabsContent>
        <TabsContent value="build" className="mt-4"><JobBuildTab job={job} build={build} platform={platform} customer={customer} customers={customers} platforms={platforms}/></TabsContent>
        <TabsContent value="verify" className="mt-4"><JobComponentVerification job={job} engine={engine}/></TabsContent>
      </Tabs>
    </div>
  </div>;
}
