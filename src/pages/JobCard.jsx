import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import JobHeader from "@/components/jobs/JobHeader";
import JobOverviewTab from "@/components/jobs/JobOverviewTab";
import JobPartsTab from "@/components/jobs/JobPartsTab";
import JobInvoiceTab from "@/components/jobs/JobInvoiceTab";
import JobEstimateTab from "@/components/jobs/JobEstimateTab";
import JobBuildTab from "@/components/jobs/JobBuildTab";
import JobWorkflowTab from "@/components/jobs/JobWorkflowTab";
import JobCommsTab from "@/components/jobs/JobCommsTab";

export default function JobCard() {
  const [jobId, setJobId] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setJobId(params.get("id"));
    const tab = params.get("tab");
    if (tab) setActiveTab(tab);
  }, []);

  const { data: jobData, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => base44.entities.Job.filter({ id: jobId }),
    enabled: !!jobId,
  });
  const job = jobData?.[0];

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => base44.entities.Customer.list("-created_date", 200) });
  const { data: platforms = [] } = useQuery({ queryKey: ["platforms"], queryFn: () => base44.entities.EnginePlatform.list("-created_date", 100) });
  const { data: engines = [] } = useQuery({ queryKey: ["customer-engines"], queryFn: () => base44.entities.CustomerEngine.list("-created_date", 200) });

  const estimate = useLinked("Estimate", "estimate_id", job);
  const build = useLinked("EngineBuild", "build_id", job);
  const invoices = useQuery({
    queryKey: ["job-invoices", job?.invoice_ids],
    queryFn: () => base44.entities.Invoice.filter({ id: { $in: job?.invoice_ids || [] } }, "-issue_date", 50),
    enabled: !!job?.invoice_ids?.length,
  });

  const customer = customers.find(c => c.id === job?.customer_id);
  const engine = engines.find(e => e.id === job?.customer_engine_id);
  const platform = platforms.find(p => p.id === job?.platform_id);
  const invoiceList = (invoices.data?.items || invoices.data || []);
  const primaryInvoice = invoiceList[0];

  if (isLoading || !jobId) {
    return <div className="p-8"><Skeleton className="h-10 w-64 mb-8" /><Skeleton className="h-96" /></div>;
  }
  if (!job) {
    return (
      <div className="p-8 text-center py-16">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <h3 className="text-lg font-medium text-slate-900">Job not found</h3>
        <Link to="/Jobs"><Button variant="outline" className="mt-4">Back to Jobs</Button></Link>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="px-4 md:px-8 pt-4 print:hidden">
        <Link to="/Jobs"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> All Jobs</Button></Link>
      </div>
      <JobHeader job={job} customer={customer} engine={engine} platform={platform} invoice={primaryInvoice} build={build} />

      <div className="px-4 md:px-8 mt-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="estimate">Estimate & Approvals</TabsTrigger>
            <TabsTrigger value="parts">Parts & Purchasing</TabsTrigger>
            <TabsTrigger value="build">Build Sheet</TabsTrigger>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="invoice">Invoice & Payments</TabsTrigger>
            <TabsTrigger value="comms">Comms & Docs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <JobOverviewTab job={job} customer={customer} engine={engine} platform={platform} estimate={estimate} build={build} invoices={invoiceList} />
          </TabsContent>
          <TabsContent value="estimate" className="mt-4">
            <JobEstimateTab job={job} estimate={estimate} />
          </TabsContent>
          <TabsContent value="parts" className="mt-4">
            <JobPartsTab job={job} />
          </TabsContent>
          <TabsContent value="build" className="mt-4">
            <JobBuildTab job={job} build={build} platform={platform} customer={customer} customers={customers} platforms={platforms} />
          </TabsContent>
          <TabsContent value="workflow" className="mt-4">
            <JobWorkflowTab job={job} build={build} />
          </TabsContent>
          <TabsContent value="invoice" className="mt-4">
            <JobInvoiceTab job={job} invoices={invoiceList} />
          </TabsContent>
          <TabsContent value="comms" className="mt-4">
            <JobCommsTab job={job} customer={customer} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function useLinked(entity, field, job) {
  return useQuery({
    queryKey: ["job-linked", entity, job?.[field]],
    queryFn: async () => {
      const res = await base44.entities[entity].filter({ id: job[field] });
      return res?.[0] || null;
    },
    enabled: !!job?.[field],
  }).data;
}