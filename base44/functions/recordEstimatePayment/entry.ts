import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Validate x-sync-secret header
    const incomingSecret = req.headers.get("x-sync-secret");
    const expectedSecret = Deno.env.get("SYNC_SECRET");

    console.log(`[recordEstimatePayment] SYNC_SECRET exists: ${!!expectedSecret}`);
    console.log(`[recordEstimatePayment] x-sync-secret header exists: ${!!incomingSecret}`);
    
    if (!incomingSecret || incomingSecret !== expectedSecret) {
      console.log(`[recordEstimatePayment] Secret mismatch - access denied`);
      return Response.json({ error: "Forbidden: Invalid sync_secret" }, { status: 403 });
    }
    
    console.log(`[recordEstimatePayment] Secret validation passed`);

    // SERVICE ROLE ACCESS TEST
    console.log(`[recordEstimatePayment] SERVICE ROLE TEST START`);
    const base44 = createClientFromRequest(req);
    
    try {
      const testEstimates = await base44.asServiceRole.entities.Estimate.list(1);
      console.log(`[recordEstimatePayment] SERVICE ROLE TEST - Success: true`);
      console.log(`[recordEstimatePayment] SERVICE ROLE TEST - Estimates returned: ${testEstimates?.length || 0}`);
      
      return Response.json({
        test: "SERVICE_ROLE_ACCESS_TEST",
        success: true,
        estimatesReturned: testEstimates?.length || 0,
        message: "Service-role access to Estimate entity succeeded"
      });
    } catch (testError) {
      console.error(`[recordEstimatePayment] SERVICE ROLE TEST - Success: false`);
      console.error(`[recordEstimatePayment] SERVICE ROLE TEST - Error message: ${testError.message}`);
      console.error(`[recordEstimatePayment] SERVICE ROLE TEST - Error status: ${testError.status}`);
      console.error(`[recordEstimatePayment] SERVICE ROLE TEST - Error data:`, JSON.stringify(testError, null, 2));
      
      return Response.json({
        test: "SERVICE_ROLE_ACCESS_TEST",
        success: false,
        errorMessage: testError.message,
        errorStatus: testError.status,
        errorData: testError.toString(),
        message: "Service-role access to Estimate entity FAILED"
      }, { status: 500 });
    }

  } catch (error) {
    console.error(`[recordEstimatePayment] Outer error: ${error.message}`);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});