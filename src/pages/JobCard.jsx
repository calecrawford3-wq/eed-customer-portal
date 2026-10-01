import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConfirmDialog from "@/components/ConfirmDialog";
import JobHeader from "@/components/jobs/JobHeader";
import JobOverviewTab from "@/components/jobs/JobOverviewTab";
import JobPartsTab from "@/components/jobs/JobPartsTab";
import JobInvoiceTab from "@/components/jobs/JobInvoiceTab";
import JobEstimateTab from "@/components/jobs/JobEstimateTab";
import JobBuildTab from "@/components/jobs/JobBuildTab";
import JobWorkflowTab from "@/components/jobs/JobWorkflowTab";
import JobMachiningTab from "@/components/jobs/JobMachiningTab";
import JobCommsTab from "@/components/jobs/JobCommsTab";
import JobFindingsTab from "@/components/jobs/JobFindingsTab";
import JobProfitabilityTab from "@/components/jobs/JobProfitabilityTab";
import PrintableBuildBook from "@/components/builds/PrintableBuildBook";
import { BookOpen } from "lucide-react";

export default function JobCard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [jobId, setJobId] = useState(null);
  const [printBuildBook, setPrintBuildBook] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";
  const planMachining = searchParams.get("plan") === "1";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setJobId(params.get("id"));
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

  const estimateRaw = useLinked("Estimate", "estimate_id", job);
  // Hide expired/archived estimates from the Job Card — they're isolated to the Estimates page
  const estimate = estimateRaw && estimateRaw.status !== "expired" && !estimateRaw.archived ? estimateRaw : null;
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

  // Build Book data (loaded on demand)
  const { data: bookTasksData } = useQuery({
    queryKey: ["book-tasks", build?.id],
    queryFn: () => base44.entities.BuildTask.filter({ build_id: build.id }, { sort: "sort_order", limit: 500 }),
    enabled: !!build?.id && printBuildBook,
  });
  const { data: bookFindingsData } = useQuery({
    queryKey: ["book-findings", job?.id],
    queryFn: () => base44.entities.TeardownFinding.filter({ job_id: job.id }, { limit: 200 }),
    enabled: !!job?.id && printBuildBook,
  });
  const { data: bookReplacementsData } = useQuery({
    queryKey: ["book-replacements", build?.id],
    queryFn: () => base44.entities.ComponentReplacement.filter({ build_id: build.id }, { limit: 100 }),
    enabled: !!build?.id && printBuildBook,
  });
  const { data: bookSpecSheet } = useQuery({
    queryKey: ["book-specsheet", build?.spec_sheet_id],
    queryFn: async () => {
      const res = await base44.entities.SpecSheet.filter({ id: build.spec_sheet_id });
      return res?.[0] || null;
    },
    enabled: !!build?.spec_sheet_id && printBuildBook,
  });

  const handlePrintBuildBook = () => {
    setPrintBuildBook(true);
    setTimeout(() => window.print(), 500);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await base44.entities.Job.delete(jobId);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Job deleted");
      navigate("/Jobs");
    } catch (e) {
      toast.error("Failed to delete job: " + e.message);
    }
    setDeleting(false);
  };

  const bookTasks = bookTasksData?.items || bookTasksData || [];
  const bookFindings = (bookFindingsData?.items || bookFindingsData || []).filter(f => f.status !== "declined" && f.status !== "canceled");
  const bookReplacements = bookReplacementsData?.items || bookReplacementsData || [];
  let profitabilityData = null;
  try {
    profitabilityData = job?.profitability_snapshot ? JSON.parse(job.profitability_snapshot) : null;
  } catch (e) { /* ignore parse errors */ }

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
      {/* Print-only Build Book */}
      {printBuildBook && build && (
        <div className="hidden print:block">
          <PrintableBuildBook
            build={build}
            platform={platform}
            specSheet={bookSpecSheet}
            customer={customer}
            job={job}
            tasks={bookTasks}
            findings={bookFindings}
            replacements={bookReplacements}
            profitability={profitabilityData}
            invoice={primaryInvoice}
          />
        </div>
      )}
      <div className="px-4 md:px-8 pt-4 print:hidden flex items-center justify-between">
        <Link to="/Jobs"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> All Jobs</Button></Link>
        <div className="flex items-center gap-2">
          {build && (
            <Button variant="outline" size="sm" onClick={handlePrintBuildBook}>
              <BookOpen className="w-4 h-4 mr-1" /> Build Book
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </Button>
        </div>
      </div>
      <JobHeader job={job} customer={customer} engine={engine} platform={platform} invoice={primaryInvoice} build={build} />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={`Delete ${job.job_number}?`}
        message="This permanently removes the job card. Linked estimates, invoices, and builds will remain but will no longer be associated with a job."
        confirmLabel={deleting ? "Deleting..." : "Delete Job"}
      />

      <div className="px-4 md:px-8 mt-4">
        <Tabs value={activeTab} onValueChange={(v) => {
          const params = new URLSearchParams(window.location.search);
          params.set("tab", v);
          params.delete("plan");
          window.history.replaceState({}, "", `${window.location.pathname}?${params}`);
        }}>
          <TabsList className="flex flex-wrap h-auto overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="estimate">Estimate & Approvals</TabsTrigger>
            <TabsTrigger value="findings">Findings & Approvals</TabsTrigger>
            <TabsTrigger value="parts">Parts & Purchasing</TabsTrigger>
            <TabsTrigger value="build">Build Sheet</TabsTrigger>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="machining">Machining</TabsTrigger>
            <TabsTrigger value="invoice">Invoice & Payments</TabsTrigger>
            <TabsTrigger value="comms">Comms & Docs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <JobOverviewTab job={job} customer={customer} engine={engine} platform={platform} estimate={estimate} build={build} invoices={invoiceList} />
            <div className="mt-6">
              <JobProfitabilityTab job={job} />
            </div>
          </TabsContent>
          <TabsContent value="estimate" className="mt-4">
            <JobEstimateTab job={job} estimate={estimate} />
          </TabsContent>
          <TabsContent value="findings" className="mt-4">
            <JobFindingsTab job={job} estimate={estimate} build={build} invoices={invoiceList} />
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
          <TabsContent value="machining" className="mt-4">
            <JobMachiningTab job={job} build={build} engine={engine} autoOpenPlan={planMachining} />
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