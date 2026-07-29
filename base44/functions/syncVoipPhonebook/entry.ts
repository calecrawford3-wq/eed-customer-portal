import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  normalizePhone,
  buildDisplayName,
  getPhonebookEntries,
  findEntryByNumber,
  createPhonebookEntry,
  updatePhonebookEntry,
  deletePhonebookEntry,
  getPbSettings,
} from '../../shared/voipPhonebook.ts';

// Sync a single customer to the VoIP.ms Phone Book.
//
// Called by the Customer entity automation on create/update, and by the admin
// retry button. Also used internally by syncAllVoipPhonebook for bulk syncs.
//
// Supports multiple phone numbers per customer (primary phone + additional_phones array).
// Each unique number gets its own VoipmsPhoneEntry record and VoIP.ms Phone Book entry.
//
// Payload:
//   customer_id: string       — the customer to sync
//   sync_type: "event"|"manual"|"nightly"|"dry_run"  (default: manual)
//   actor: string             — admin email or "system"

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

    // ── Handle entity automation payload ────────────────────────────────
    let customerId = "";
    let syncType = "manual";
    let isDeleteEvent = false;
    let deletedCustomer: any = null;

    if (body.event && body.event.entity_id && body.event.entity_name === "Customer") {
      customerId = body.event.entity_id;
      syncType = "event";
      const eventType = body.event.type;

      if (eventType === "delete") {
        isDeleteEvent = true;
        deletedCustomer = body.old_data || null;
      } else if (eventType === "update" && body.changed_fields) {
        const relevant = ["first_name", "last_name", "company_name", "phone", "additional_phones", "status"];
        const hasRelevant = body.changed_fields.some((f: string) => relevant.includes(f));
        if (!hasRelevant) {
          return Response.json({ action: "skipped", reason: "No relevant fields changed" });
        }
      }
    } else {
      customerId = String(body.customer_id || "");
      syncType = String(body.sync_type || "manual");
    }

    const dryRun = syncType === "dry_run" || !!body.dry_run;

    if (!customerId && !isDeleteEvent) {
      return Response.json({ error: "customer_id is required" }, { status: 400 });
    }

    const settings = await getPbSettings(base44);
    if (!settings.enabled && syncType !== "dry_run") {
      return Response.json({ action: "skipped", reason: "VoIP.ms Phone Book sync is disabled" });
    }

    // ── Handle customer deletion — remove all phone book entries ────────
    if (isDeleteEvent) {
      if (!settings.removeInactive) {
        return Response.json({ action: "skipped", reason: "Remove inactive is disabled" });
      }
      const oldName = deletedCustomer
        ? [deletedCustomer.first_name, deletedCustomer.last_name].filter(Boolean).join(" ")
        : "";

      // Delete all VoipmsPhoneEntry records for this customer
      const phoneEntries = await base44.asServiceRole.entities.VoipmsPhoneEntry.filter({
        customer_id: customerId,
      }).catch(() => []);

      let deletedCount = 0;
      for (const pe of phoneEntries || []) {
        const pbId = pe.voipms_phonebook_id;
        if (pbId) {
          try {
            if (!dryRun) {
              // Fetch phonebook to get idField, then delete
              const { entries, idField } = await getPhonebookEntries(settings.defaultGroup);
              await deletePhonebookEntry(pbId, idField);
            }
            deletedCount++;
            await logSync(base44, "deleted", deletedCustomer, pe.normalized_phone, "", "", syncType, actor);
          } catch (e) {
            // Entry may already be gone — that's fine
          }
        }
        if (!dryRun) {
          await base44.asServiceRole.entities.VoipmsPhoneEntry.delete(pe.id).catch(() => {});
        }
      }

      // Also try the legacy Customer.voipms_phonebook_id field
      const legacyId = deletedCustomer?.voipms_phonebook_id || "";
      if (legacyId && !phoneEntries?.length) {
        try {
          if (!dryRun) {
            const { idField } = await getPhonebookEntries(settings.defaultGroup);
            await deletePhonebookEntry(legacyId, idField);
          }
          deletedCount++;
          await logSync(base44, "deleted", deletedCustomer, normalizePhone(deletedCustomer?.phone || ""), "", "", syncType, actor);
        } catch (e) {
          // Already gone
        }
      }

      return Response.json({ action: deletedCount > 0 ? "deleted" : "skipped", count: deletedCount, dryRun });
    }

    // ── Normal sync (create/update) ─────────────────────────────────────
    const customer = await base44.asServiceRole.entities.Customer.get(customerId);
    if (!customer) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    const groupName = settings.defaultGroup;
    const normalizedName = buildDisplayName(customer, settings.preferBusinessName);
    const isInactive = customer.status === "inactive";
    const shouldRemove = isInactive && settings.removeInactive;

    // Collect all phone numbers for this customer
    const allPhones: Array<{ phone: string; source: string }> = [];
    const primary = normalizePhone(customer.phone || "");
    if (primary) allPhones.push({ phone: primary, source: "primary" });
    const extras = Array.isArray(customer.additional_phones) ? customer.additional_phones : [];
    for (const ep of extras) {
      const np = normalizePhone(ep);
      if (np) allPhones.push({ phone: np, source: "additional" });
    }

    // Deduplicate (same customer might have same number in primary + additional)
    const phoneSet = new Set<string>();
    const uniquePhones = allPhones.filter((p) => {
      if (phoneSet.has(p.phone)) return false;
      phoneSet.add(p.phone);
      return true;
    });

    // ── Inactive customer with removeInactive → delete all entries ─────
    if (shouldRemove) {
      const phoneEntries = await base44.asServiceRole.entities.VoipmsPhoneEntry.filter({
        customer_id: customerId,
      }).catch(() => []);

      let deletedCount = 0;
      let idField = "id";
      try {
        const result = await getPhonebookEntries(groupName);
        idField = result.idField;
      } catch (_) {}

      for (const pe of phoneEntries || []) {
        if (pe.voipms_phonebook_id) {
          try {
            if (!dryRun) await deletePhonebookEntry(pe.voipms_phonebook_id, idField);
            deletedCount++;
          } catch (e) {
            // Entry may be gone
          }
        }
        if (!dryRun) {
          await base44.asServiceRole.entities.VoipmsPhoneEntry.delete(pe.id).catch(() => {});
        }
      }

      if (!dryRun) {
        await updateCustomerSyncFields(base44, customerId, {
          voipms_phonebook_id: "",
          voipms_sync_status: "skipped",
          voipms_sync_error: "",
          voipms_synced_name: "",
          voipms_synced_phone: "",
        });
      }
      await logSync(base44, "deleted", customer, "", "", "", syncType, actor);
      return Response.json({ action: "deleted", count: deletedCount, dryRun });
    }

    // ── No valid phone numbers → skip ──────────────────────────────────
    if (!uniquePhones.length) {
      await logSync(base44, "skipped", customer, "", "", "No valid phone numbers", syncType, actor);
      await updateCustomerSyncFields(base44, customerId, {
        voipms_sync_status: "skipped",
        voipms_sync_error: "",
      });
      return Response.json({ action: "skipped", reason: "No valid phone numbers" });
    }

    // Fetch existing phone book entries + ID field.
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
      await logSync(base44, "failed", customer, "", "", safeError, syncType, actor);
      await updateCustomerSyncFields(base44, customerId, {
        voipms_sync_status: "error",
        voipms_sync_error: safeError,
      });
      return Response.json({ action: "failed", error: safeError, aborted: true });
    }

    // Get existing VoipmsPhoneEntry records for this customer
    const existingPhoneEntries = await base44.asServiceRole.entities.VoipmsPhoneEntry.filter({
      customer_id: customerId,
    }).catch(() => []);

    const results: any[] = [];
    const syncedPhoneSet = new Set<string>();

    for (const { phone: normalizedPhone, source } of uniquePhones) {
      syncedPhoneSet.add(normalizedPhone);

      // Find existing VoIP.ms entry
      const phoneEntry = (existingPhoneEntries || []).find((pe) => pe.normalized_phone === normalizedPhone);
      let existingEntry = null;
      if (phoneEntry?.voipms_phonebook_id) {
        existingEntry = existingEntries.find((e) => String(e[idField]) === String(phoneEntry.voipms_phonebook_id));
      }
      if (!existingEntry) {
        existingEntry = findEntryByNumber(existingEntries, normalizedPhone);
      }

      try {
        if (existingEntry && existingEntry[idField]) {
          const needsUpdate = existingEntry.name !== normalizedName || normalizePhone(existingEntry.number) !== normalizedPhone;
          if (needsUpdate) {
            if (!dryRun) {
              await updatePhonebookEntry(String(existingEntry[idField]), idField, groupName, normalizedName, normalizedPhone);
              await upsertPhoneEntry(base44, customerId, normalizedPhone, source, {
                voipms_phonebook_id: String(existingEntry[idField]),
                voipms_sync_status: "synced",
                voipms_sync_error: "",
                voipms_synced_name: normalizedName,
                voipms_synced_phone: normalizedPhone,
              });
            }
            results.push({ phone: normalizedPhone, action: "updated" });
            await logSync(base44, "updated", customer, normalizedPhone, String(existingEntry[idField]), "", syncType, actor);
          } else {
            if (!dryRun) {
              await upsertPhoneEntry(base44, customerId, normalizedPhone, source, {
                voipms_phonebook_id: String(existingEntry[idField]),
                voipms_sync_status: "synced",
                voipms_synced_name: normalizedName,
                voipms_synced_phone: normalizedPhone,
              });
            }
            results.push({ phone: normalizedPhone, action: "noop" });
          }
        } else {
          // Create new entry
          let newId = "";
          if (!dryRun) {
            const createResult = await createPhonebookEntry(groupName, normalizedName, normalizedPhone);
            newId = createResult.id;
            await upsertPhoneEntry(base44, customerId, normalizedPhone, source, {
              voipms_phonebook_id: newId,
              voipms_sync_status: "synced",
              voipms_sync_error: "",
              voipms_synced_name: normalizedName,
              voipms_synced_phone: normalizedPhone,
            });
          }
          results.push({ phone: normalizedPhone, action: "created", id: newId });
          await logSync(base44, "created", customer, normalizedPhone, newId, "", syncType, actor);
        }

        // Update Customer fields for the primary phone (backward compat)
        if (source === "primary" && !dryRun) {
          const entry = existingEntry && existingEntry[idField]
            ? existingEntry
            : results.find((r) => r.phone === normalizedPhone && r.id);
          const pbId = entry?.[idField] || (results.find((r) => r.phone === normalizedPhone)?.id) || "";
          await updateCustomerSyncFields(base44, customerId, {
            voipms_phonebook_id: pbId,
            voipms_sync_status: "synced",
            voipms_sync_error: "",
            voipms_synced_name: normalizedName,
            voipms_synced_phone: normalizedPhone,
          });
        }
      } catch (e: any) {
        const errMsg = String(e?.message || e);
        results.push({ phone: normalizedPhone, action: "failed", error: errMsg });
        await logSync(base44, "failed", customer, normalizedPhone, "", errMsg, syncType, actor);
        if (!dryRun) {
          await upsertPhoneEntry(base44, customerId, normalizedPhone, source, {
            voipms_sync_status: "error",
            voipms_sync_error: errMsg,
          });
        }
      }
    }

    // Remove VoipmsPhoneEntry records for numbers no longer on the customer
    if (!dryRun) {
      for (const pe of existingPhoneEntries || []) {
        if (!syncedPhoneSet.has(pe.normalized_phone)) {
          // This number was removed from the customer — delete from VoIP.ms
          if (pe.voipms_phonebook_id) {
            try {
              await deletePhonebookEntry(pe.voipms_phonebook_id, idField);
              await logSync(base44, "deleted", customer, pe.normalized_phone, pe.voipms_phonebook_id, "Number removed from customer", syncType, actor);
            } catch (_) {}
          }
          await base44.asServiceRole.entities.VoipmsPhoneEntry.delete(pe.id).catch(() => {});
        }
      }
    }

    const summary = {
      action: "synced",
      phones: results,
      created: results.filter((r) => r.action === "created").length,
      updated: results.filter((r) => r.action === "updated").length,
      noop: results.filter((r) => r.action === "noop").length,
      failed: results.filter((r) => r.action === "failed").length,
      dryRun,
    };

    return Response.json(summary);
  } catch (e) {
    console.error("syncVoipPhonebook error:", e?.message || e);
    return Response.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

async function logSync(base44: any, action: string, customer: any, phone: string, phonebookId: string, errMsg: string, syncType: string, actor: string) {
  try {
    const name = customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") : "";
    const custName = customer?.company_name || name || "";
    await base44.asServiceRole.entities.VoipmsSyncLog.create({
      action,
      customer_id: customer?.id || "",
      customer_name: custName,
      phone_number: phone,
      phonebook_id: phonebookId || "",
      error_message: errMsg || "",
      sync_type: syncType,
      synced_by: actor,
    });
  } catch (_) {}
}

async function updateCustomerSyncFields(base44: any, customerId: string, fields: Record<string, any>) {
  try {
    await base44.asServiceRole.entities.Customer.update(customerId, {
      ...fields,
      voipms_last_synced_at: new Date().toISOString(),
    });
  } catch (_) {}
}

async function upsertPhoneEntry(base44: any, customerId: string, normalizedPhone: string, source: string, fields: Record<string, any>) {
  try {
    const existing = await base44.asServiceRole.entities.VoipmsPhoneEntry.filter({
      customer_id: customerId,
      normalized_phone: normalizedPhone,
    });
    if (existing && existing[0]) {
      await base44.asServiceRole.entities.VoipmsPhoneEntry.update(existing[0].id, {
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