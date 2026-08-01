import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// Deletes Notification records older than 30 days to keep the dropdown lean.
// Intended to be called by a scheduled automation (daily).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let deletedCount = 0;
    try {
      const result = await base44.asServiceRole.entities.Notification.deleteMany({
        created_date: { $lt: cutoff },
      });
      deletedCount = result?.deleted_count || result?.count || 0;
    } catch (e) {
      console.error("[cleanupOldNotifications] deleteMany failed:", e.message);
      return Response.json({ error: e.message }, { status: 500 });
    }

    console.log(`[cleanupOldNotifications] Deleted ${deletedCount} notifications older than ${cutoff}`);
    return Response.json({ success: true, deleted: deletedCount, cutoff });
  } catch (error) {
    console.error("[cleanupOldNotifications] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});