import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// Daily shop alerts — checks low-stock parts and overdue invoices.
// Sends admin notifications for each, deduped against notifications from the last 24h.
// Intended to be called by a scheduled automation (daily at 8am CT).
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const startedAt = new Date().toISOString();
  const logRun = async (status, summary, details) => {
    try {
      const completedAt = new Date().toISOString();
      await base44.asServiceRole.entities.AutomationRun.create({
        automation_name: "Daily Shop Alerts",
        automation_key: "daily_shop_alerts",
        target_function: "dailyShopAlerts",
        status,
        summary,
        details: details || "",
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      });
    } catch (e) { console.warn("[dailyShopAlerts] logRun failed:", e.message); }
  };
  try {
    const now = Date.now();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const todayStr = new Date(now).toISOString().split("T")[0];

    // --- Fetch recent notifications for dedup (last 50, filter client-side) ---
    let recentTitles = new Set();
    try {
      const recentNotifs = await base44.asServiceRole.entities.Notification.list("-created_date", 50);
      const yesterdayMs = now - 24 * 60 * 60 * 1000;
      for (const n of (recentNotifs || [])) {
        if ((n.type === "low_stock" || n.type === "invoice_overdue") && n.created_date) {
          const created = new Date(n.created_date).getTime();
          if (created >= yesterdayMs) {
            recentTitles.add(n.title);
          }
        }
      }
    } catch (e) {
      console.warn("[dailyShopAlerts] Failed to fetch recent notifs for dedup:", e.message);
    }

    // --- 1. Low-stock parts ---
    let lowStockParts = [];
    try {
      const allParts = await base44.asServiceRole.entities.Part.filter({
        status: "active",
      }, "-name", 500);
      lowStockParts = (allParts || []).filter(
        (p) => p.reorder_point > 0 && p.quantity_on_hand <= p.reorder_point
      );
    } catch (e) {
      console.warn("[dailyShopAlerts] Failed to fetch parts:", e.message);
    }

    let lowStockSent = 0;
    for (const part of lowStockParts) {
      const title = `Low Stock: ${part.name}`;
      if (recentTitles.has(title)) continue; // already alerted in the last 24h

      try {
        await base44.asServiceRole.functions.invoke("sendAdminNotification", {
          title,
          message: `${part.name} (${part.part_number}) is at ${part.quantity_on_hand} on hand — reorder point is ${part.reorder_point}. Suggested reorder qty: ${part.reorder_quantity || "N/A"}.`,
          type: "low_stock",
          link_url: "/Inventory",
        });
        lowStockSent++;
      } catch (e) {
        console.warn(`[dailyShopAlerts] Failed to send low-stock alert for ${part.part_number}:`, e.message);
      }
    }

    // --- 2. Overdue invoices ---
    let overdueInvoices = [];
    try {
      const sentInvoices = await base44.asServiceRole.entities.Invoice.filter({ status: "sent" }, "-issue_date", 200);
      const partialInvoices = await base44.asServiceRole.entities.Invoice.filter({ status: "partial" }, "-issue_date", 200);
      const openInvoices = [...(sentInvoices || []), ...(partialInvoices || [])];
      overdueInvoices = openInvoices.filter(
        (inv) => inv.due_date && inv.due_date < todayStr && (inv.balance_due || 0) > 0
      );
    } catch (e) {
      console.warn("[dailyShopAlerts] Failed to fetch invoices:", e.message);
    }

    let overdueSent = 0;
    for (const inv of overdueInvoices) {
      const title = `Overdue Invoice: ${inv.invoice_number}`;
      if (recentTitles.has(title)) continue;

      try {
        await base44.asServiceRole.functions.invoke("sendAdminNotification", {
          title,
          message: `Invoice ${inv.invoice_number} was due ${inv.due_date} and has an outstanding balance of $${(inv.balance_due || 0).toFixed(2)}.`,
          type: "invoice_overdue",
          link_url: `/InvoiceDetail?id=${inv.id}`,
        });
        overdueSent++;
      } catch (e) {
        console.warn(`[dailyShopAlerts] Failed to send overdue alert for ${inv.invoice_number}:`, e.message);
      }
    }

    const summary = {
      success: true,
      low_stock_checked: lowStockParts.length,
      low_stock_alerts_sent: lowStockSent,
      overdue_checked: overdueInvoices.length,
      overdue_alerts_sent: overdueSent,
    };
    console.log("[dailyShopAlerts] Summary:", JSON.stringify(summary));
    await logRun("success", `Low stock: ${lowStockSent}/${lowStockParts.length} sent, Overdue: ${overdueSent}/${overdueInvoices.length} sent`);
    return Response.json(summary);
  } catch (error) {
    console.error("[dailyShopAlerts] Error:", error.message);
    await logRun("failed", "Daily shop alerts failed", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});