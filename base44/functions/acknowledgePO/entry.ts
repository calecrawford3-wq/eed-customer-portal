import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const poId = url.searchParams.get("po_id");
    const token = url.searchParams.get("token");
    const action = url.searchParams.get("action") || "acknowledge"; // "acknowledge" or "ready"

    if (!poId || !token) {
      return new Response(htmlPage("Missing Parameters", "Invalid link. Please contact the sender.", false), {
        headers: { "Content-Type": "text/html" },
        status: 400,
      });
    }

    const base44 = createClientFromRequest(req);

    const pos = await base44.asServiceRole.entities.PurchaseOrder.filter({ id: poId });
    const po = pos?.[0];

    if (!po) {
      return new Response(htmlPage("Not Found", "Purchase order not found.", false), {
        headers: { "Content-Type": "text/html" },
        status: 404,
      });
    }

    // Token validation: base64(po_id:po_number)
    const raw = `${poId}:${po.po_number}`;
    const expectedToken = btoa(raw).replace(/=/g, "");
    if (token !== expectedToken) {
      return new Response(htmlPage("Invalid Link", "This link is not valid.", false), {
        headers: { "Content-Type": "text/html" },
        status: 403,
      });
    }

    if (action === "ready") {
      if (po.status === "received" || po.status === "cancelled") {
        return new Response(htmlPage("Already Processed", `Purchase Order <strong>${po.po_number}</strong> has already been processed.`, true), {
          headers: { "Content-Type": "text/html" },
        });
      }
      await base44.asServiceRole.entities.PurchaseOrder.update(poId, { status: "ready" });
      return new Response(htmlPage("Order Ready!", `Thank you! Purchase Order <strong>${po.po_number}</strong> has been marked as <strong>ready for pickup / shipment</strong>. We have been notified.`, true), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Default: acknowledge
    if (po.status === "acknowledged" || po.status === "ready" || po.status === "received" || po.status === "cancelled") {
      return new Response(htmlPage("Already Acknowledged", `Purchase Order <strong>${po.po_number}</strong> has already been acknowledged. No further action needed.`, true), {
        headers: { "Content-Type": "text/html" },
      });
    }

    await base44.asServiceRole.entities.PurchaseOrder.update(poId, { status: "acknowledged" });

    return new Response(htmlPage("Order Acknowledged", `Thank you! Purchase Order <strong>${po.po_number}</strong> has been successfully acknowledged. We will follow up on delivery details.`, true), {
      headers: { "Content-Type": "text/html" },
    });

  } catch (error) {
    return new Response(htmlPage("Error", `An error occurred: ${error.message}`, false), {
      headers: { "Content-Type": "text/html" },
      status: 500,
    });
  }
});

function htmlPage(title, message, success) {
  const color = success ? "#16a34a" : "#dc2626";
  const icon = success ? "✓" : "✗";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); padding: 48px 40px; max-width: 480px; width: 90%; text-align: center; }
    .icon { font-size: 48px; color: ${color}; background: ${color}18; border-radius: 50%; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
    h1 { color: #0f172a; font-size: 24px; margin: 0 0 12px; }
    p { color: #475569; font-size: 15px; line-height: 1.6; margin: 0; }
    .brand { margin-top: 32px; font-size: 13px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="brand">Elite Engine Development</div>
  </div>
</body>
</html>`;
}