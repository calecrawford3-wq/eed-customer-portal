import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";
import { generateJobNumber } from "../../shared/jobLifecycle.ts";

async function nextJobSeq(base44:any) {
  const res = await base44.entities.Job.filter({ stage: { $in: ["awaiting_approval","awaiting_deposit","queued","teardown","waiting_on_parts","machining","assembly","testing","ready_for_pickup","picked_up"] } });
  const jobs = res?.items || res || [];
  let max = 100000;
  for (const job of jobs) {
    const match = /JOB-(\d+)/.exec(job.job_number || "");
    if (match) max = Math.max(max, Number(match[1]) || 0);
  }
  return max + 1;
}

Deno.serve(async req => {
  try {
    if (req.method !== "POST") return Response.json({error:"Method not allowed"},{status:405});
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") return Response.json({error:"Admin required"},{status:403});
    const body = await req.json();
    const customerId = String(body.customer_id || "");
    const engineId = String(body.customer_engine_id || "");
    if (!customerId) return Response.json({error:"Customer is required"},{status:400});

    const customers = await base44.asServiceRole.entities.Customer.filter({id:customerId});
    if (!(customers?.items || customers || []).length) return Response.json({error:"Customer not found"},{status:404});

    let engine:any = null;
    if (engineId) {
      const engines = await base44.asServiceRole.entities.CustomerEngine.filter({id:engineId,customer_id:customerId});
      engine = (engines?.items || engines || [])[0];
      if (!engine) return Response.json({error:"Engine does not belong to this customer"},{status:400});
      const existing = await base44.asServiceRole.entities.Job.filter({customer_engine_id:engineId});
      const open = (existing?.items || existing || []).filter((j:any)=>j.stage!=="picked_up"&&!j.archived&&!j.completed_at);
      if (open.length) return Response.json({error:"This engine already has an open job",existing_job_id:open[0].id},{status:409});
    }

    const seq = await nextJobSeq(base44.asServiceRole);
    const job = await base44.asServiceRole.entities.Job.create({
      job_number: generateJobNumber(seq),
      customer_id: customerId,
      customer_engine_id: engine?.id || "",
      estimate_id: "",
      build_id: "",
      invoice_ids: [],
      platform_id: engine?.platform_id || "",
      is_engine_build: true,
      stage: "awaiting_approval",
      blocking_condition: "awaiting_approval",
      is_active: false,
      deposit_required: false,
      deposit_amount: 0,
      deposit_met: false,
      parts_readiness: "unknown",
      storage_location: engine?.storage_location || "",
      archived: false,
    });
    return Response.json({success:true,job});
  } catch (e) {
    console.error('[createDraftJob]',e.message);
    return Response.json({error:e.message},{status:500});
  }
});
