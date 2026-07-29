import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  normalizePhone,
  buildDisplayName,
  getPhonebookEntries,
  findEntryByNumber,
  deletePhonebookEntry,
  testVoipConnection,
  getPbSettings,
  updatePbStatus,
} from '../../shared/voipPhonebook.ts';

// Bulk VoIP.ms Phone Book operations.
//
// Payload:
//   mode: "sync_all" | "dry_run" | "test_connection"  (default: sync_all)
//
// sync_all:    Sync every active customer to the VoIP.ms Phone Book.
// dry_run:     Same as sync_all but preview changes without writing to VoIP.ms.
// test_connection: Quick API credential check.
//
// Returns a summary { total, created, updated, deleted, skipped, failed, noop, errors }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    let actor = "system";
    try {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      actor = user.email || user.full_name || "admin";
    } catch (_) {
      // Allow service-role calls (from automations)
    }

    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode || "sync_all");

    // ── Test connection ───────────────────────────────────────────────
    if (mode === "test_connection") {
      const result = await testVoipConnection();
      return Response.json(result);
    }

    // ── Sync all / dry run ────────────────────────────────────────────
    const settings = await getPbSettings(base44);
    if (!settings.enabled && mode !== "dry_run") {
      return Response.json({ error: "VoIP.ms Phone Book sync is disabled" }, { status: 400 });
    }

    const dryRun = mode === "dry_run";
    const syncType = dryRun ? "dry_run" : "manual";
    const groupName = settings.defaultGroup;

    await updatePbStatus(base44, {
      voipms_pb_current_sync_status: dryRun ? "Dry run in progress…" : "Syncing all customers…",
    });

    // Fetch all customers with a phone number
    const customers = await base44.asServiceRole.entities.Customer.list("-created_date", 1000);
    const eligible = (customers || []).filter((c) => normalizePhone(c.phone || ""));

    // Fetch the full phone book once for comparison
    let existingEntries: any[] = [];
    try {
      existingEntries = await getPhonebookEntries(groupName);
    } catch (e) {
      const errMsg = String(e?.message || e);
      await updatePbStatus(base44, { voipms_pb_current_sync_status: `Sync failed: ${errMsg}` });
      return Response.json({ error: errMsg }, { status: 500 });
    }

    const summary = {
      total: eligible.length,
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
      noop: 0,
      errors: [] as string[],
      dryRun,
    };

    // Track which phone book entry IDs we've seen so we can detect orphaned entries
    const seenEntryIds = new Set<string>();

    for (const customer of eligible) {
      try {
        const normalizedName = buildDisplayName(customer, settings.preferBusinessName);
        const normalizedPhone = normalizePhone(customer.phone || "");

        if (!normalizedPhone) {
          summary.skipped++;
          continue;
        }

        // Inactive customer with removeInactive → delete
        if (customer.status === "inactive" && settings.removeInactive) {
          if (customer.voipms_phonebook_id && !dryRun) {
            try {
              await deletePhonebookEntry(String(customer.voipms_phonebook_id));
              summary.deleted++;
            } catch (e) {
              summary.failed++;
              summary.errors.push(`${customer.first_name} ${customer.last_name}: ${e?.message || e}`);
            }
          } else {
            summary.skipped++;
          }
          continue;
        }

        // Skip inactive customers when removeInactive is off
        if (customer.status === "inactive") {
          summary.skipped++;
          continue;
        }

        // Find existing entry
        let existingEntry = null;
        if (customer.voipms_phonebook_id) {
          existingEntry = existingEntries.find((e) => String(e.id) === String(customer.voipms_phonebook_id));
        }
        if (!existingEntry) {
          existingEntry = findEntryByNumber(existingEntries, normalizedPhone);
        }

        if (existingEntry && existingEntry.id) {
          seenEntryIds.add(String(existingEntry.id));
          const needsUpdate = existingEntry.name !== normalizedName || normalizePhone(existingEntry.number) !== normalizedPhone;
          if (needsUpdate) {
            if (!dryRun) {
              try {
                const { updatePhonebookEntry } = await import('../../shared/voipPhonebook.ts');
                await updatePhonebookEntry(String(existingEntry.id), groupName, normalizedName, normalizedPhone);
              } catch (e) {
                summary.failed++;
                summary.errors.push(`${customer.first_name} ${customer.last_name}: ${e?.message || e}`);
                continue;
              }
              // Update customer record
              await base44.asServiceRole.entities.Customer.update(customer.id, {
                voipms_phonebook_id: String(existingEntry.id),
                voipms_sync_status: "synced",
                voipms_sync_error: "",
                voipms_synced_name: normalizedName,
                voipms_synced_phone: normalizedPhone,
                voipms_last_synced_at: new Date().toISOString(),
              }).catch(() => {});
            }
            summary.updated++;
          } else {
            summary.noop++;
            // Still update the sync timestamp
            if (!dryRun) {
              await base44.asServiceRole.entities.Customer.update(customer.id, {
                voipms_phonebook_id: String(existingEntry.id),
                voipms_sync_status: "synced",
                voipms_synced_name: normalizedName,
                voipms_synced_phone: normalizedPhone,
                voipms_last_synced_at: new Date().toISOString(),
              }).catch(() => {});
            }
          }
        } else {
          // Create new entry
          if (!dryRun) {
            try {
              const { createPhonebookEntry } = await import('../../shared/voipPhonebook.ts');
              const result = await createPhonebookEntry(groupName, normalizedName, normalizedPhone);
              await base44.asServiceRole.entities.Customer.update(customer.id, {
                voipms_phonebook_id: result.id,
                voipms_sync_status: "synced",
                voipms_sync_error: "",
                voipms_synced_name: normalizedName,
                voipms_synced_phone: normalizedPhone,
                voipms_last_synced_at: new Date().toISOString(),
              }).catch(() => {});
            } catch (e) {
              summary.failed++;
              summary.errors.push(`${customer.first_name} ${customer.last_name}: ${e?.message || e}`);
              await base44.asServiceRole.entities.Customer.update(customer.id, {
                voipms_sync_status: "error",
                voipms_sync_error: String(e?.message || e),
              }).catch(() => {});
              continue;
            }
          }
          summary.created++;
        }

        // Small delay to avoid rate-limiting
        if (!dryRun) await sleep(200);
      } catch (e) {
        summary.failed++;
        summary.errors.push(`${customer.first_name} ${customer.last_name}: ${e?.message || e}`);
      }
    }

    // Update settings with completion status
    const now = new Date().toISOString();
    const statusMsg = dryRun
      ? `Dry run complete: ${summary.created} to create, ${summary.updated} to update, ${summary.deleted} to delete, ${summary.skipped} skipped`
      : `Sync complete: ${summary.created} created, ${summary.updated} updated, ${summary.deleted} deleted, ${summary.skipped} skipped, ${summary.failed} failed`;

    await updatePbStatus(base44, {
      voipms_pb_current_sync_status: statusMsg,
      voipms_pb_last_successful_sync: dryRun ? undefined : now,
      voipms_pb_last_full_reconciliation: dryRun ? undefined : now,
    });

    // Log a summary entry
    try {
      await base44.asServiceRole.entities.VoipmsSyncLog.create({
        action: summary.failed > 0 ? "failed" : "created",
        sync_type: syncType,
        customer_name: statusMsg,
        synced_by: actor,
      });
    } catch (_) {}

    return Response.json(summary);
  } catch (e) {
    console.error("syncAllVoipPhonebook error:", e?.message || e);
    return Response.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}