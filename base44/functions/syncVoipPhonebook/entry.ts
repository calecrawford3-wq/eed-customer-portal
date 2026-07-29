import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { waitUntil } from "base44:runtime";
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
// Payload:
//   customer_id: string       — the customer to sync
//   sync_type: "event"|"manual"|"nightly"|"dry_run"  (default: manual)
//   previous_phone: string    — old phone when the number changed (for old-entry removal)
//   actor: string             — admin email or "system"
//
// Returns: { action, phonebook_id, error }

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // Admin-only — prevents non-admins from triggering syncs directly
    let actor = "system";
    try {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      actor = user.email || user.full_name || "admin";
    } catch (_) {
      // Allow service-role calls (from automations) — no user context
    }

    const body = await req.json().catch(() => ({}));

    // ── Handle entity automation payload ────────────────────────────────
    // Entity automations send: { event: { type, entity_name, entity_id }, data, old_data, changed_fields }
    let customerId = "";
    let syncType = "manual";
    let previousPhone = "";
    let isDeleteEvent = false;
    let deletedCustomer = null;

    if (body.event && body.event.entity_id && body.event.entity_name === "Customer") {
      customerId = body.event.entity_id;
      syncType = "event";
      const eventType = body.event.type;

      if (eventType === "delete") {
        // Customer was deleted — use old_data to find and remove the phone book entry
        isDeleteEvent = true;
        deletedCustomer = body.old_data || null;
      } else if (eventType === "update" && body.changed_fields) {
        // Only sync if relevant fields changed
        const relevant = ["first_name", "last_name", "company_name", "phone", "status"];
        const hasRelevant = body.changed_fields.some((f) => relevant.includes(f));
        if (!hasRelevant) {
          return Response.json({ action: "skipped", reason: "No relevant fields changed" });
        }
        if (body.old_data && body.old_data.phone) {
          previousPhone = normalizePhone(body.old_data.phone);
        }
      }
    } else {
      // ── Direct call payload ─────────────────────────────────────────────
      customerId = String(body.customer_id || "");
      syncType = String(body.sync_type || "manual");
      previousPhone = body.previous_phone ? normalizePhone(body.previous_phone) : "";
    }

    const dryRun = syncType === "dry_run" || !!body.dry_run;

    if (!customerId && !isDeleteEvent) {
      return Response.json({ error: "customer_id is required" }, { status: 400 });
    }

    const settings = await getPbSettings(base44);
    if (!settings.enabled && syncType !== "dry_run") {
      return Response.json({ action: "skipped", reason: "VoIP.ms Phone Book sync is disabled" });
    }

    // Handle customer deletion — remove the phone book entry
    if (isDeleteEvent) {
      if (!settings.removeInactive) {
        return Response.json({ action: "skipped", reason: "Remove inactive is disabled" });
      }
      const oldPbId = deletedCustomer?.voipms_phonebook_id || "";
      const oldPhone = deletedCustomer?.phone ? normalizePhone(deletedCustomer.phone) : "";
      const oldName = deletedCustomer
        ? [deletedCustomer.first_name, deletedCustomer.last_name].filter(Boolean).join(" ")
        : "";

      if (oldPbId) {
        try {
          if (!dryRun) await deletePhonebookEntry(String(oldPbId));
          await logSync(base44, "deleted", deletedCustomer, oldPhone, "", "", syncType, actor);
          return Response.json({ action: "deleted", phonebook_id: oldPbId });
        } catch (e) {
          const errMsg = String(e?.message || e);
          await logSync(base44, "failed", deletedCustomer, oldPhone, "", errMsg, syncType, actor);
          return Response.json({ action: "failed", error: errMsg });
        }
      }
      // No phone book entry to delete — try by number
      if (oldPhone) {
        try {
          const entries = await getPhonebookEntries(settings.defaultGroup);
          const entry = findEntryByNumber(entries, oldPhone);
          if (entry && entry.id) {
            if (!dryRun) await deletePhonebookEntry(String(entry.id));
            await logSync(base44, "deleted", deletedCustomer, oldPhone, "", "", syncType, actor);
            return Response.json({ action: "deleted", phonebook_id: entry.id });
          }
        } catch (e) {
          const errMsg = String(e?.message || e);
          await logSync(base44, "failed", deletedCustomer, oldPhone, "", errMsg, syncType, actor);
          return Response.json({ action: "failed", error: errMsg });
        }
      }
      return Response.json({ action: "skipped", reason: "No phone book entry to delete" });
    }

    const customer = await base44.asServiceRole.entities.Customer.get(customerId);
    if (!customer) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    const groupName = settings.defaultGroup;
    const normalizedName = buildDisplayName(customer, settings.preferBusinessName);
    const normalizedPhone = normalizePhone(customer.phone || "");

    const isInactive = customer.status === "inactive";
    const shouldRemove = isInactive && settings.removeInactive;

    // If the phone number changed, remove the old entry first
    let oldEntryRemoved = false;
    const oldSyncedPhone = customer.voipms_synced_phone ? normalizePhone(customer.voipms_synced_phone) : "";
    const oldPhoneToCheck = previousPhone || oldSyncedPhone;

    if (oldPhoneToCheck && oldPhoneToCheck !== normalizedPhone) {
      try {
        const entries = await getPhonebookEntries(groupName);
        const oldEntry = findEntryByNumber(entries, oldPhoneToCheck);
        if (oldEntry && oldEntry.id) {
          if (!dryRun) {
            await deletePhonebookEntry(String(oldEntry.id));
          }
          oldEntryRemoved = true;
        }
      } catch (e) {
        console.warn("Failed to remove old phone book entry:", e?.message || e);
      }
    }

    // Inactive customer with removeInactive → delete the entry
    if (shouldRemove) {
      if (customer.voipms_phonebook_id) {
        if (!dryRun) {
          try {
            await deletePhonebookEntry(String(customer.voipms_phonebook_id));
          } catch (e) {
            const errMsg = String(e?.message || e);
            await logSync(base44, "failed", customer, normalizedPhone, "", errMsg, syncType, actor);
            await updateCustomerSyncFields(base44, customer.id, {
              voipms_sync_status: "error",
              voipms_sync_error: errMsg,
            });
            return Response.json({ action: "failed", error: errMsg });
          }
        }
        await logSync(base44, "deleted", customer, normalizedPhone, "", "", syncType, actor);
        await updateCustomerSyncFields(base44, customer.id, {
          voipms_phonebook_id: "",
          voipms_sync_status: "skipped",
          voipms_sync_error: "",
          voipms_synced_name: "",
          voipms_synced_phone: "",
        });
        return Response.json({ action: "deleted", dryRun });
      }
      await logSync(base44, "skipped", customer, normalizedPhone, "", "Customer inactive", syncType, actor);
      return Response.json({ action: "skipped", reason: "Customer inactive" });
    }

    // No valid phone → skip
    if (!normalizedPhone) {
      await logSync(base44, "skipped", customer, "", "", "No valid phone number", syncType, actor);
      await updateCustomerSyncFields(base44, customer.id, {
        voipms_sync_status: "skipped",
        voipms_sync_error: "",
      });
      return Response.json({ action: "skipped", reason: "No valid phone number" });
    }

    // Fetch existing entries and find by number
    let entries: any[] = [];
    try {
      entries = await getPhonebookEntries(groupName);
    } catch (e) {
      const errMsg = String(e?.message || e);
      await logSync(base44, "failed", customer, normalizedPhone, "", errMsg, syncType, actor);
      await updateCustomerSyncFields(base44, customer.id, {
        voipms_sync_status: "error",
        voipms_sync_error: errMsg,
      });
      return Response.json({ action: "failed", error: errMsg });
    }

    // Also check if the customer's own phonebook_id still exists
    let existingEntry = null;
    if (customer.voipms_phonebook_id) {
      existingEntry = entries.find((e) => String(e.id) === String(customer.voipms_phonebook_id));
    }
    if (!existingEntry) {
      existingEntry = findEntryByNumber(entries, normalizedPhone);
    }

    // Check for duplicate numbers across customers
    const dupCustomers = await base44.asServiceRole.entities.Customer.filter({
      phone: customer.phone,
      status: "active",
    });
    const dupCount = (dupCustomers || []).filter((c) => c.id !== customer.id).length;
    if (dupCount > 0) {
      // Flag duplicate for admin review — use a combined label
      const combinedName = settings.preferBusinessName && customer.company_name
        ? normalizedName
        : `${normalizedName} +${dupCount}`;
      if (existingEntry && existingEntry.id) {
        const needsUpdate = existingEntry.name !== combinedName || normalizePhone(existingEntry.number) !== normalizedPhone;
        if (needsUpdate) {
          if (!dryRun) {
            await updatePhonebookEntry(String(existingEntry.id), groupName, combinedName, normalizedPhone);
          }
          await logSync(base44, "updated", customer, normalizedPhone, String(existingEntry.id), "Duplicate number — combined label", syncType, actor);
          await updateCustomerSyncFields(base44, customer.id, {
            voipms_phonebook_id: String(existingEntry.id),
            voipms_sync_status: "synced",
            voipms_sync_error: `Duplicate number shared with ${dupCount} other customer(s)`,
            voipms_synced_name: combinedName,
            voipms_synced_phone: normalizedPhone,
          });
          return Response.json({ action: "updated", phonebook_id: existingEntry.id, duplicate: true, dryRun });
        }
        await logSync(base44, "noop", customer, normalizedPhone, String(existingEntry.id), "Duplicate number — already synced", syncType, actor);
        return Response.json({ action: "noop", phonebook_id: existingEntry.id, duplicate: true });
      }
    }

    // Create or update
    if (existingEntry && existingEntry.id) {
      const needsUpdate = existingEntry.name !== normalizedName || normalizePhone(existingEntry.number) !== normalizedPhone;
      if (needsUpdate) {
        if (!dryRun) {
          await updatePhonebookEntry(String(existingEntry.id), groupName, normalizedName, normalizedPhone);
        }
        await logSync(base44, "updated", customer, normalizedPhone, String(existingEntry.id), "", syncType, actor);
        await updateCustomerSyncFields(base44, customer.id, {
          voipms_phonebook_id: String(existingEntry.id),
          voipms_sync_status: "synced",
          voipms_sync_error: "",
          voipms_synced_name: normalizedName,
          voipms_synced_phone: normalizedPhone,
        });
        return Response.json({ action: "updated", phonebook_id: existingEntry.id, dryRun });
      }
      // Already in sync — no-op
      await logSync(base44, "noop", customer, normalizedPhone, String(existingEntry.id), "Already in sync", syncType, actor);
      await updateCustomerSyncFields(base44, customer.id, {
        voipms_phonebook_id: String(existingEntry.id),
        voipms_sync_status: "synced",
        voipms_sync_error: "",
        voipms_synced_name: normalizedName,
        voipms_synced_phone: normalizedPhone,
      });
      return Response.json({ action: "noop", phonebook_id: existingEntry.id });
    }

    // Create new entry
    let newId = "";
    if (!dryRun) {
      const result = await createPhonebookEntry(groupName, normalizedName, normalizedPhone);
      newId = result.id;
    }
    await logSync(base44, "created", customer, normalizedPhone, newId, "", syncType, actor);
    await updateCustomerSyncFields(base44, customer.id, {
      voipms_phonebook_id: newId,
      voipms_sync_status: "synced",
      voipms_sync_error: "",
      voipms_synced_name: normalizedName,
      voipms_synced_phone: normalizedPhone,
    });
    return Response.json({ action: "created", phonebook_id: newId, dryRun });
  } catch (e) {
    console.error("syncVoipPhonebook error:", e?.message || e);
    return Response.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

async function logSync(base44, action, customer, phone, phonebookId, errMsg, syncType, actor) {
  try {
    const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
    await base44.asServiceRole.entities.VoipmsSyncLog.create({
      action,
      customer_id: customer.id || "",
      customer_name: customer.company_name || name || "",
      phone_number: phone,
      phonebook_id: phonebookId || "",
      error_message: errMsg || "",
      sync_type: syncType,
      synced_by: actor,
    });
  } catch (_) {}
}

async function updateCustomerSyncFields(base44, customerId, fields) {
  try {
    await base44.asServiceRole.entities.Customer.update(customerId, {
      ...fields,
      voipms_last_synced_at: new Date().toISOString(),
    });
  } catch (_) {}
}