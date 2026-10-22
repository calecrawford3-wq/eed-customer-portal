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
import JobFindingsTab from "@/components/jobs/JobFindingsTab";
import JobPartsTab from "@/components/jobs/JobPartsTab";
import JobWorkTab from "@/components/jobs/JobWorkTab";
import JobBillingHistoryTab from "@/components/jobs/JobBillingHistoryTab";
import JobNextAction from "@/components/jobs/JobNextAction";
import JobProfitabilityTab from "@/components/jobs/JobProfitabilityTab";
import PrintableBuildBook from "@/components/builds/PrintableBuildBook";
import IntakeLinkDialog from "@/components/jobs/IntakeLinkDialog";
import { BookOpen, ClipboardList } from "lucide-react";

export default function JobCard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [jobId, setJobId] = useState(null);
  const [printBuildBook, setPrintBuildBook] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") || "overview";
  const legacyTabMap = { estimate: "billing", invoice: "billing", comms: "billing", build: "work", workflow: "work", machining: "work" };
  const activeTab = legacyTabMap[requestedTab] || requestedTab;
  const initialWorkSection = ["build","workflow","machining"].includes(requestedTab) ? requestedTab : searchParams.get("work") || undefined;
  const initialBillingSection = ["estimate","invoice","comms"].includes(requestedTab) ? requestedTab : searchParams.get("billing") || undefined;
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

  // Auto-open the estimate prompt when a checked-in engine job loads with no estimate
  useEffect(() => {
    if (job && job.customer_engine_id && !job.estimate_id) {
      setIntakeOpen(true);
    }
  }, [job?.id]);

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
  const invoiceList = (invoices.data || []);
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
  const { data: bookFindingPhotosData } = useQuery({
    queryKey: ["book-finding-photos", job?.id],
    queryFn: async () => {
      const findingIds = (Array.isArray(bookFindingsData) ? bookFindingsData : (bookFindingsData?.items || [])).map(f => f.id).filter(Boolean);
      if (findingIds.length === 0) return {};
      const res = await base44.functions.invoke("getFindingPhotosAdmin", { finding_ids: findingIds });
      const photos = res?.data?.photos || res?.photos || [];
      const map = {};
      for (const p of photos) { (map[p.finding_id] ||= []).push(p); }
      return map;
    },
    enabled: !!job?.id && printBuildBook && (Array.isArray(bookFindingsData) ? bookFindingsData.length : (bookFindingsData?.items?.length || 0)) > 0,
  });

  const handlePrintBuildBook = () => {
    setPrintBuildBook(true);
    setTimeout(() => window.print(), 1500);
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

  const bookTasks = Array.isArray(bookTasksData) ? bookTasksData : (bookTasksData?.items || []);
  const bookFindings = (Array.isArray(bookFindingsData) ? bookFindingsData : (bookFindingsData?.items || [])).filter(f => f.status !== "declined" && f.status !== "canceled");
  const bookReplacements = Array.isArray(bookReplacementsData) ? bookReplacementsData : (bookReplacementsData?.items || []);
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

  // Checked-in engine with no estimate — prompt to create/link one
  const needsEstimate = job.customer_engine_id && !job.estimate_id;

  const navigateJobArea = (tab, section) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    next.delete("plan"); next.delete("work"); next.delete("billing");
    if (tab === "work" && section) next.set("work", section);
    if (tab === "billing" && section) next.set("billing", section);
    setSearchParams(next, { replace: true });
  };


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
            findingPhotos={bookFindingPhotosData || {}}
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
      {needsEstimate && (
        <div className="mx-4 md:mx-8 mt-4 bg-gradient-to-r from-amber-50 to-red-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 print:hidden">
          <div className="flex items-center gap-3 flex-1">
            <ClipboardList className="w-8 h-8 text-[#e20404] flex-shrink-0" />
            <div>
              <p className="font-semibold text-slate-900">No estimate linked to this engine</p>
              <p className="text-sm text-slate-600">Create or link an estimate to start the workflow for this checked-in engine.</p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => setIntakeOpen(true)}>
              <ClipboardList className="w-4 h-4 mr-1" /> Create Estimate
            </Button>
          </div>
        </div>
      )}

      <JobNextAction job={job} estimate={estimate} onIntake={() => setIntakeOpen(true)} onNavigate={navigateJobArea} />

      <JobHeader job={job} customer={customer} engine={engine} platform={platform} invoice={primaryInvoice} invoices={invoiceList} estimate={estimate} build={build} />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={`Delete ${job.job_number}?`}
        message="This permanently removes the job card. Linked estimates, invoices, and builds will remain but will no longer be associated with a job."
        confirmLabel={deleting ? "Deleting..." : "Delete Job"}
      />

      {needsEstimate && (
        <IntakeLinkDialog
          job={job}
          customer={customer}
          open={intakeOpen}
          onClose={() => setIntakeOpen(false)}
          onLinked={() => { setIntakeOpen(false); qc.invalidateQueries({ queryKey: ["job", jobId] }); qc.invalidateQueries({ queryKey: ["jobs"] }); }}
        />
      )}

      <div className="px-4 md:px-8 mt-4">
        <Tabs value={activeTab} onValueChange={(v) => navigateJobArea(v)}>
          <TabsList className="grid grid-cols-5 h-auto gap-1 bg-white border border-slate-200 p-1 overflow-x-auto">
            <TabsTrigger value="overview" className="min-h-10">Overview</TabsTrigger>
            <TabsTrigger value="work" className="min-h-10">Work</TabsTrigger>
            <TabsTrigger value="findings" className="min-h-10">Findings</TabsTrigger>
            <TabsTrigger value="parts" className="min-h-10">Parts</TabsTrigger>
            <TabsTrigger value="billing" className="min-h-10">Billing & History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <JobOverviewTab job={job} customer={customer} engine={engine} platform={platform} estimate={estimate} build={build} invoices={invoiceList} />
            <div className="mt-6"><JobProfitabilityTab job={job} /></div>
          </TabsContent>
          <TabsContent value="work" className="mt-4">
            <JobWorkTab job={job} build={build} platform={platform} customer={customer} customers={customers} platforms={platforms} engine={engine} initialSection={initialWorkSection} autoOpenPlan={planMachining} />
          </TabsContent>
          <TabsContent value="findings" className="mt-4">
            <JobFindingsTab job={job} estimate={estimate} build={build} invoices={invoiceList} />
          </TabsContent>
          <TabsContent value="parts" className="mt-4"><JobPartsTab job={job} /></TabsContent>
          <TabsContent value="billing" className="mt-4">
            <JobBillingHistoryTab job={job} estimate={estimate} invoices={invoiceList} customer={customer} initialSection={initialBillingSection} />
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