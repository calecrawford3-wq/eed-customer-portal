// VoIP.ms Phone Book synchronization helpers.
//
// All VoIP.ms API calls go directly to the VoIP.ms REST API using credentials
// stored in Base44 secrets (VOIP_MS_API_USERNAME / VOIP_MS_API_PASSWORD).
// No bridge proxy is required — direct access is verified working.
//
// API methods: getIP, getPhonebook, setPhonebook, delPhonebook,
//              getPhonebookGroups, setPhonebookGroup, delPhonebookGroup

import {
  voipMsCall,
  withRetry,
  isPermanentError,
  isVoipSuccess,
  isVoipNoRecords,
  sanitizeParams,
  VoipMsError,
  testVoipConnection,
  type VoipMsDiagnostic,
} from "./voipMsApi.ts";

// Re-export for backward compatibility with callers that import from here
export { testVoipConnection as testBridgeConnection, VoipMsError as BridgeError, sanitizeParams, type VoipMsDiagnostic as BridgeDiagnostic };

const NAME_MAX_LEN = 30;

// ── Phone normalization ──────────────────────────────────────────────

// Normalize to 10-digit North American format.
// +1XXXXXXXXXX, 1XXXXXXXXXX, XXXXXXXXXX all map to the same 10-digit number.
// Returns "" for invalid / non-North-American / extension-only numbers.
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return "";
  return d;
}

// ── Name building ─────────────────────────────────────────────────────

export function sanitizeName(name: string, maxLen = NAME_MAX_LEN): string {
  if (!name) return "";
  let s = String(name)
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[<>&"'\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > maxLen) s = s.substring(0, maxLen).trim();
  return s;
}

export function buildDisplayName(customer: any, preferBusinessName: boolean): string {
  const biz = sanitizeName(customer.company_name);
  const first = sanitizeName(customer.first_name, 15);
  const last = sanitizeName(customer.last_name, 15);

  if (preferBusinessName && biz) return biz;
  if (biz) return biz;

  const full = [first, last].filter(Boolean).join(" ").trim();
  return full || "Unknown";
}

// ── Phone book methods ────────────────────────────────────────────────

// getPhonebook — retrieve all entries.
// Must be called with exactly { method: "getPhonebook", params: {} }.
// Do NOT add phonebook, group, id, code, customer_id, or any other field —
// VoIP.ms rejects unknown parameters with status "invalid_phonebook".
export async function getPhonebookRaw(): Promise<any> {
  return withRetry(() => voipMsCall("getPhonebook", {}));
}

// getPhonebookGroups — retrieve all phone book groups.
export async function getPhonebookGroupsRaw(): Promise<any> {
  return withRetry(() => voipMsCall("getPhonebookGroups", {}));
}

// Discover the identifier field name from a getPhonebook response.
// VoIP.ms may use "id", "member_id", or another field — we inspect the actual data.
export function discoverIdField(entries: any[]): string {
  if (!entries || !entries.length) return "id";
  const first = entries[0];
  const candidates = ["id", "member_id", "entry_id", "phonebook_id", "record_id", "phonebook"];
  for (const c of candidates) {
    if (first[c] !== undefined && first[c] !== null && first[c] !== "") return c;
  }
  // Fallback: first string field that looks numeric
  for (const [k, v] of Object.entries(first)) {
    if (typeof v === "string" && /^\d+$/.test(v)) return k;
  }
  return "id";
}

// Get phonebook entries as array + the discovered ID field name.
export async function getPhonebookEntries(group?: string): Promise<{ entries: any[]; idField: string }> {
  const data = await getPhonebookRaw();
  if (!isVoipSuccess(data) && !isVoipNoRecords(data)) {
    throw new VoipMsError(
      data?.message || `VoIP.ms returned status: ${data?.status || "unknown"}`,
      { method: "getPhonebook", voipmsStatus: data?.status, voipmsMessage: data?.message, params: {} }
    );
  }
  const entries = data.phonebooks || data.phonebook || data.entries || data.result || [];
  const arr = Array.isArray(entries) ? entries : [];
  return { entries: arr, idField: discoverIdField(arr) };
}

// Diagnostic call — returns the full structured API response for the admin UI.
// Does not retry; returns all diagnostic fields: HTTP status, method, VoIP.ms status,
// safe error message, and sanitized params.
export async function getPhonebookDiagnostic(): Promise<VoipMsDiagnostic> {
  try {
    const data = await voipMsCall("getPhonebook", {});
    const voipmsStatus = data?.status || "";
    const voipmsMessage = data?.message || "";
    const isSuccess = isVoipSuccess(data) || isVoipNoRecords(data);
    return {
      ok: isSuccess,
      httpStatus: 200,
      method: "getPhonebook",
      voipmsStatus,
      voipmsMessage,
      data,
      params: {},
      safeError: isSuccess ? "" : voipmsMessage || `VoIP.ms returned status: ${voipmsStatus}`,
    };
  } catch (e: any) {
    if (e instanceof VoipMsError) {
      return e.toDiagnostic();
    }
    return {
      ok: false,
      httpStatus: 0,
      method: "getPhonebook",
      voipmsStatus: "",
      voipmsMessage: "",
      data: null,
      params: {},
      safeError: String(e?.message || e),
    };
  }
}

// Find an existing entry by normalized phone number.
export function findEntryByNumber(entries: any[], normalizedNumber: string): any | null {
  if (!normalizedNumber) return null;
  for (const e of entries) {
    const eNum = normalizePhone(e.number || e.phone || "");
    if (eNum && eNum === normalizedNumber) return e;
  }
  return null;
}

// setPhonebook — create or update a Phone Book entry.
//
// CREATE: pass only { name, number }. Do NOT include phonebook, id, group, or any
// other field — VoIP.ms treats "phonebook" as an existing entry code, not a group name.
//
// UPDATE: pass { phonebook: "ENTRY_CODE", name, number } where ENTRY_CODE is the
// real VoIP.ms entry code returned by getPhonebook.
export async function setPhonebookEntry(params: {
  phonebook?: string;
  name: string;
  number: string;
}): Promise<any> {
  const p: Record<string, any> = { name: params.name, number: params.number };
  if (params.phonebook) p.phonebook = params.phonebook;
  return withRetry(() => voipMsCall("setPhonebook", p));
}

// Create a phonebook entry. After creating, re-fetches to find the new entry's ID
// (since setPhonebook may not return the ID directly).
export async function createPhonebookEntry(group: string, name: string, number: string): Promise<{ id: string; idField: string }> {
  // CREATE: send only name + number — no phonebook code, no group name, no id
  await setPhonebookEntry({ name, number });

  // Re-fetch to find the newly created entry's code by number
  const { entries, idField } = await getPhonebookEntries(group);
  const match = findEntryByNumber(entries, normalizePhone(number));
  return { id: match ? String(match[idField] || "") : "", idField };
}

// Update a phonebook entry by ID.
export async function updatePhonebookEntry(entryCode: string, _idField: string, _group: string, name: string, number: string): Promise<void> {
  // UPDATE: use the stored VoIP.ms entry code as the "phonebook" parameter
  const data = await setPhonebookEntry({ phonebook: entryCode, name, number });
  if (!isVoipSuccess(data)) {
    throw new Error(data?.message || "Failed to update phonebook entry");
  }
}

// Delete a phonebook entry by ID.
export async function deletePhonebookEntry(id: string, idField: string = "id"): Promise<void> {
  const data = await withRetry(() => voipMsCall("delPhonebook", { [idField]: id }));
  if (!isVoipSuccess(data)) {
    throw new Error(data?.message || "Failed to delete phonebook entry");
  }
}

// ── Settings helpers ──────────────────────────────────────────────────

export interface PbSettings {
  enabled: boolean;
  defaultGroup: string;
  preferBusinessName: boolean;
  removeInactive: boolean;
  nightlyReconciliation: boolean;
}

export async function getPbSettings(base44: any): Promise<PbSettings> {
  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
  const s = (settings && settings[0]) || {};
  return {
    enabled: !!s.voipms_pb_enabled,
    defaultGroup: s.voipms_pb_default_group || "Base44",
    preferBusinessName: s.voipms_pb_prefer_business_name !== false,
    removeInactive: !!s.voipms_pb_remove_inactive,
    nightlyReconciliation: s.voipms_pb_nightly_reconciliation !== false,
  };
}

export async function updatePbStatus(base44: any, fields: Record<string, any>): Promise<void> {
  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
  if (settings && settings[0]) {
    await base44.asServiceRole.entities.AppSettings.update(settings[0].id, fields);
  }
}