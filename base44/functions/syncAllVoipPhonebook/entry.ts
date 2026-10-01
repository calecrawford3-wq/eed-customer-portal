import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  normalizePhone,
  buildDisplayName,
  getPhonebookEntries,
  findEntryByNumber,
  setPhonebookEntry,
  updatePhonebookEntry,
  deletePhonebookEntry,
  getPhonebookDiagnostic,
  testBridgeConnection,
  getPbSettings,
} from '../../shared/voipPhonebook.ts';
import { voipGetIP } from '../../shared/voipMsApi.ts';

// Bulk VoIP.ms Phone Book operations.
//
// Payload:
//   mode: "sync_all" | "dry_run" | "test_connection" | "get_ip" | "get_phonebook"  (default: sync_all)
//
// sync_all:       Sync every active customer to the VoIP.ms Phone Book.
// dry_run:        Same as sync_all but preview changes without writing to VoIP.ms.
// test_connection: Quick VoIP.ms API connectivity check via getIP.
// get_ip:         Call getIP directly via the VoIP.ms API and return the result.
// get_phonebook:  Retrieve the full phone book and return raw entries + field names.
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

    // ── Test VoIP.ms API connection ───────────────────────────────────
    if (mode === "test_connection") {
      const result = await testBridgeConnection();
      return Response.json(result);
    }

    // ── getIP — verify VoIP.ms API credentials ────────────────────────
    if (mode === "get_ip") {
      try {
        const data = await voipGetIP();
        return Response.json(data);
      } catch (e: any) {
        return Response.json({ status: "error", message: String(e?.message || e) });
      }
    }

    // ── get_phonebook — full structured diagnostic response ────────────
    if (mode === "get_phonebook") {
      const diag = await getPhonebookDiagnostic();
      return Response.json(diag);
    }

    // ── deduplicate — find & remove entries with the same phone number ─
    // Keeps the entry whose ID is linked to a VoipmsPhoneEntry record; deletes the rest.
    if (mode === "deduplicate") {
      const { entries, idField } = await getPhonebookEntries();

      // Group entries by normalized phone number
      const byNumber: Record<string, any[]> = {};
      for (const e of entries) {
        const num = normalizePhone(e.number || e.phone || "");
        if (!num) continue;
        (byNumber[num] ||= []).push(e);
      }

      // Collect all VoipmsPhoneEntry IDs to know which entry IDs are "linked"
      const linkedEntries = await base44.asServiceRole.entities.VoipmsPhoneEntry.filter({});
      const linkedIds = new Set((linkedEntries || []).map((pe: any) => String(pe.voipms_phonebook_id || "")).filter(Boolean));

      const duplicates: { number: string; entries: any[]; keep: string; delete: string[] }[] = [];
      let deletedCount = 0;
      const errors: string[] = [];

      for (const [num, group] of Object.entries(byNumber)) {
        if (group.length < 2) continue;

        // Prefer to keep an entry that's linked to a VoipmsPhoneEntry
        let keepEntry = group.find((e) => linkedIds.has(String(e[idField] || "")));
        if (!keepEntry) keepEntry = group[0]; // fallback: keep the first

        const keepId = String(keepEntry[idField] || "");
        const deleteIds = group.filter((e) => String(e[idField] || "") !== keepId).map((e) => String(e[idField] || ""));

        duplicates.push({
          number: num,
          entries: group.map((e) => ({ id: String(e[idField] || ""), name: e.name, number: e.number })),
          keep: keepId,
          delete: deleteIds,
        });

        // Delete the duplicates
        for (const did of deleteIds) {
          try {
            await deletePhonebookEntry(did, idField);
            deletedCount++;
          } catch (e: any) {
            errors.push(`Failed to delete entry ${did}: ${String(e?.message || e)}`);
          }
        }
      }

      return Response.json({
        totalEntries: entries.length,
        duplicateGroups: duplicates.length,
        deleted: deletedCount,
        errors,
        duplicates: body.preview ? duplicates : undefined,
      });
    }

    // ── Sync all / dry run ────────────────────────────────────────────
    const settings = await getPbSettings(base44);
    if (!settings.enabled && mode !== "dry_run") {
      return Response.json({ error: "VoIP.ms Phone Book sync is disabled" }, { status: 400 });
    }

    const dryRun = mode === "dry_run";
    const syncType = dryRun ? "dry_run" : "manual";
    const groupName = settings.defaultGroup;

    const { updatePbStatus } = await import('../../shared/voipPhonebook.ts');
    await updatePbStatus(base44, {
      voipms_pb_current_sync_status: dryRun ? "Dry run in progress…" : "Syncing all customers…",
    });

    // Fetch all customers
    const customers = await base44.asServiceRole.entities.Customer.list("-created_date", 1000);

    // Collect all eligible phone numbers across customers (primary + additional_phones)
    const eligible: Array<{ customer: any; phone: string; source: string }> = [];
    for (const c of customers || []) {
      const primary = normalizePhone(c.phone || "");
      if (primary && c.status === "active") {
        eligible.push({ customer: c, phone: primary, source: "primary" });
      }
      const extras = Array.isArray(c.additional_phones) ? c.additional_phones : [];
      for (const ep of extras) {
        const np = normalizePhone(ep);
        if (np && c.status === "active") {
          eligible.push({ customer: c, phone: np, source: "additional" });
        }
      }
    }

    // Deduplicate by customer+phone (same customer could have same number in primary + additional)
    const seen = new Set<string>();
    const deduped = eligible.filter((e) => {
      const key = `${e.customer.id}|${e.phone}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Fetch the full phone book once for comparison.
    // Abort immediately if getPhonebook fails — do NOT create entries blindly,
    // as that risks duplicate VoIP.ms Phone Book entries.
    let existingEntries: any[];
    let idField: string;
    try {
      const result = await getPhonebookEntries(groupName);
      existingEntries = result.entries;
      idField = result.idField;
    } catch (e: any) {
      const safeError = e?.safeError || String(e?.message || e);
      await updatePbStatus(base44, {
        voipms_pb_current_sync_status: `Sync aborted: ${safeError}`,
      });

      // Alert admins so API outages don't fail silently for days
      try {
        await base44.asServiceRole.entities.Notification.create({
          title: "Phone Book Sync Failed",
          message: `Nightly reconciliation aborted: ${safeError}. The VoIP.ms API may be unreachable or credentials may be invalid.`,
          type: "other",
          link_url: "/VoipPhonebookSyncHistory",
          is_read: false,
        });
      } catch (_) {}

      return Response.json({
        error: safeError,
        aborted: true,
        total: deduped.length,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        failed: 0,
        noop: 0,
        errors: [safeError],
        dryRun,
      }, { status: 500 });
    }

    const summary = {
      total: deduped.length,
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      failed: 0,
      noop: 0,
      errors: [] as string[],
      idField,
      dryRun,
    };

    const seenEntryIds = new Set<string>();

    // Track newly created entries for batch ID discovery after the loop.
    // Avoids re-fetching the entire phone book after each create (which doubles
    // API calls and causes the sync to time out before finishing all customers).
    const pendingIdDiscovery: Array<{ customerId: string; normalizedPhone: string; source: string; normalizedName: string }> = [];

    for (const { customer, phone: normalizedPhone, source } of deduped) {
      try {
        const normalizedName = buildDisplayName(customer, settings.preferBusinessName);

        // Inactive customer with removeInactive → delete
        if (customer.status === "inactive" && settings.removeInactive) {
          const pbEntry = await findVoipmsPhoneEntry(base44, customer.id, normalizedPhone);
          const pbId = pbEntry?.voipms_phonebook_id || "";
          if (pbId && !dryRun) {
            try {
              await deletePhonebookEntry(pbId, idField);
              if (pbEntry) await deleteVoipmsPhoneEntry(base44, pbEntry.id);
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

        if (customer.status === "inactive") {
          summary.skipped++;
          continue;
        }

        // Find existing VoIP.ms entry
        let existingEntry = null;
        // Check VoipmsPhoneEntry first
        const phoneEntry = await findVoipmsPhoneEntry(base44, customer.id, normalizedPhone);
        if (phoneEntry?.voipms_phonebook_id) {
          existingEntry = existingEntries.find((e) => String(e[idField]) === String(phoneEntry.voipms_phonebook_id));
        }
        if (!existingEntry) {
          existingEntry = findEntryByNumber(existingEntries, normalizedPhone);
        }

        if (existingEntry && existingEntry[idField]) {
          seenEntryIds.add(String(existingEntry[idField]));
          const needsUpdate = existingEntry.name !== normalizedName || normalizePhone(existingEntry.number) !== normalizedPhone;
          if (needsUpdate) {
            if (!dryRun) {
              try {
                await updatePhonebookEntry(String(existingEntry[idField]), idField, groupName, normalizedName, normalizedPhone);
              } catch (e) {
                summary.failed++;
                summary.errors.push(`${customer.first_name} ${customer.last_name}: ${e?.message || e}`);
                continue;
              }
              await upsertVoipmsPhoneEntry(base44, customer.id, normalizedPhone, source, {
                voipms_phonebook_id: String(existingEntry[idField]),
                voipms_sync_status: "synced",
                voipms_sync_error: "",
                voipms_synced_name: normalizedName,
                voipms_synced_phone: normalizedPhone,
              });
              // Update Customer fields for primary phone
              if (source === "primary") {
                await base44.asServiceRole.entities.Customer.update(customer.id, {
                  voipms_phonebook_id: String(existingEntry[idField]),
                  voipms_sync_status: "synced",
                  voipms_sync_error: "",
                  voipms_synced_name: normalizedName,
                  voipms_synced_phone: normalizedPhone,
                  voipms_last_synced_at: new Date().toISOString(),
                }).catch(() => {});
              }
            }
            summary.updated++;
          } else {
            summary.noop++;
            if (!dryRun) {
              await upsertVoipmsPhoneEntry(base44, customer.id, normalizedPhone, source, {
                voipms_phonebook_id: String(existingEntry[idField]),
                voipms_sync_status: "synced",
                voipms_synced_name: normalizedName,
                voipms_synced_phone: normalizedPhone,
              });
              if (source === "primary") {
                await base44.asServiceRole.entities.Customer.update(customer.id, {
                  voipms_phonebook_id: String(existingEntry[idField]),
                  voipms_sync_status: "synced",
                  voipms_synced_name: normalizedName,
                  voipms_synced_phone: normalizedPhone,
                  voipms_last_synced_at: new Date().toISOString(),
                }).catch(() => {});
              }
            }
          }
        } else {
          // Create new entry — call setPhonebook directly (1 API call, no per-entry re-fetch).
          // Entry ID is discovered in a single batch getPhonebook pass after the loop.
          if (!dryRun) {
            try {
              await setPhonebookEntry({ name: normalizedName, number: normalizedPhone });
              await upsertVoipmsPhoneEntry(base44, customer.id, normalizedPhone, source, {
                voipms_phonebook_id: "",
                voipms_sync_status: "synced",
                voipms_sync_error: "",
                voipms_synced_name: normalizedName,
                voipms_synced_phone: normalizedPhone,
              });
              if (source === "primary") {
                await base44.asServiceRole.entities.Customer.update(customer.id, {
                  voipms_sync_status: "synced",
                  voipms_sync_error: "",
                  voipms_synced_name: normalizedName,
                  voipms_synced_phone: normalizedPhone,
                  voipms_last_synced_at: new Date().toISOString(),
                }).catch(() => {});
              }
              pendingIdDiscovery.push({ customerId: customer.id, normalizedPhone, source, normalizedName });
            } catch (e) {
              summary.failed++;
              summary.errors.push(`${customer.first_name} ${customer.last_name}: ${e?.message || e}`);
              continue;
            }
          }
          summary.created++;
        }

        if (!dryRun) await sleep(100);
      } catch (e) {
        summary.failed++;
        summary.errors.push(`${customer.first_name} ${customer.last_name}: ${e?.message || e}`);
      }
    }

    // Batch ID discovery: fetch phone book once and match all newly created entries.
    // This replaces the per-create re-fetch that caused sync timeouts before the
    // last customers could be reached.
    if (!dryRun && pendingIdDiscovery.length > 0) {
      try {
        const { entries: finalEntries, idField: finalIdField } = await getPhonebookEntries(groupName);
        for (const { customerId, normalizedPhone, source } of pendingIdDiscovery) {
          const match = findEntryByNumber(finalEntries, normalizedPhone);
          if (match && match[finalIdField]) {
            const entryId = String(match[finalIdField]);
            await upsertVoipmsPhoneEntry(base44, customerId, normalizedPhone, source, {
              voipms_phonebook_id: entryId,
            });
            if (source === "primary") {
              await base44.asServiceRole.entities.Customer.update(customerId, {
                voipms_phonebook_id: entryId,
              }).catch(() => {});
            }
          }
        }
      } catch (e: any) {
        // Entries were created in VoIP.ms but IDs not captured — they'll be
        // resolved in the next nightly reconciliation.
        console.log("[Sync] Batch ID discovery failed:", e?.message || e);
      }
    }

    // Update settings with completion status
    const now = new Date().toISOString();
    const statusMsg = dryRun
      ? `Dry run: ${summary.created} to create, ${summary.updated} to update, ${summary.deleted} to delete, ${summary.skipped} skipped`
      : `Sync complete: ${summary.created} created, ${summary.updated} updated, ${summary.deleted} deleted, ${summary.skipped} skipped, ${summary.failed} failed`;

    await updatePbStatus(base44, {
      voipms_pb_current_sync_status: statusMsg,
      voipms_pb_last_successful_sync: dryRun ? undefined : now,
      voipms_pb_last_full_reconciliation: dryRun ? undefined : now,
    });

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

// ── VoipmsPhoneEntry helpers ───────────────────────────────────────────

async function findVoipmsPhoneEntry(base44: any, customerId: string, normalizedPhone: string): Promise<any | null> {
  try {
    const entries = await base44.asServiceRole.entities.VoipmsPhoneEntry.filter({
      customer_id: customerId,
      normalized_phone: normalizedPhone,
    });
    return (entries && entries[0]) || null;
  } catch (_) {
    return null;
  }
}

async function upsertVoipmsPhoneEntry(base44: any, customerId: string, normalizedPhone: string, source: string, fields: Record<string, any>): Promise<void> {
  try {
    const existing = await findVoipmsPhoneEntry(base44, customerId, normalizedPhone);
    if (existing) {
      await base44.asServiceRole.entities.VoipmsPhoneEntry.update(existing.id, {
        ...fields,
        voipms_last_synced_at: new Date().toISOString(),
      });
    } else {
      await base44.asServiceRole.entities.VoipmsPhoneEntry.create({
        customer_id: customerId,
        normalized_phone: normalizedPhone,
        source,
        ...fields,
        voipms_last_synced_at: new Date().toISOString(),
      });
    }
  } catch (_) {}
}

async function deleteVoipmsPhoneEntry(base44: any, entryId: string): Promise<void> {
  try {
    await base44.asServiceRole.entities.VoipmsPhoneEntry.delete(entryId);
  } catch (_) {}
}