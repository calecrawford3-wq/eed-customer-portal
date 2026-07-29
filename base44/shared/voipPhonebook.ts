// VoIP.ms Phone Book synchronization helpers.
//
// All VoIP.ms API calls go through the ElitePhoneBridge proxy with HMAC-SHA256 auth.
// The bridge stores VoIP.ms credentials locally — Base44 never sees or requests them.
//
// Bridge protocol:
//   POST to VOIPMS_BRIDGE_URL with Content-Type: application/json
//   Headers: X-Bridge-Timestamp, X-Bridge-Request-Id, X-Bridge-Signature
//   Signature: HMAC-SHA256(VOIPMS_BRIDGE_SECRET, timestamp + "." + requestId + "." + exactJsonBody)
//   The exact JSON string used for signing must be identical to the body sent.
//
// Bridge methods: getIP, getPhonebook, setPhonebook, delPhonebook,
//                  getPhonebookGroups, setPhonebookGroup, delPhonebookGroup
//
// Secrets (in Base44):
//   VOIPMS_BRIDGE_URL — bridge endpoint URL
//   VOIPMS_BRIDGE_SECRET — HMAC signing key (must match bridge's settings.env)

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

// ── Bridge configuration ──────────────────────────────────────────────

export function isBridgeMode(): boolean {
  return !!Deno.env.get("VOIPMS_BRIDGE_URL");
}

export function getBridgeUrl(): string {
  return Deno.env.get("VOIPMS_BRIDGE_URL") || "";
}

// ── HMAC signing ─────────────────────────────────────────────────────

async function signHmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate a UUID v4 for each request — never reuse a request ID.
function generateRequestId(): string {
  return crypto.randomUUID();
}

// ── Core bridge call ──────────────────────────────────────────────────

// Send a method + params to the bridge with HMAC-SHA256 authentication.
// The JSON body is created once, signed, and that exact string is sent.
export async function bridgeCall(method: string, params: Record<string, any> = {}): Promise<any> {
  const bridgeUrl = getBridgeUrl();
  if (!bridgeUrl) throw new Error("VOIPMS_BRIDGE_URL not configured");

  const secret = Deno.env.get("VOIPMS_BRIDGE_SECRET");
  if (!secret) throw new Error("VOIPMS_BRIDGE_SECRET not configured");

  // Create the JSON body once — used for both signing and sending
  const body = JSON.stringify({ method, params });
  const timestamp = Date.now().toString();
  const requestId = generateRequestId();

  // Sign: timestamp + "." + requestId + "." + exactJsonBody
  const signature = await signHmac(secret, `${timestamp}.${requestId}.${body}`);

  const resp = await fetch(bridgeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bridge-Timestamp": timestamp,
      "X-Bridge-Request-Id": requestId,
      "X-Bridge-Signature": signature,
    },
    body,
  });

  const contentType = resp.headers.get("content-type") || "";
  const text = await resp.text().catch(() => "");

  if (!contentType.includes("application/json")) {
    const preview = text.substring(0, 150).replace(/\n/g, " ");
    throw new Error(
      `Bridge at ${bridgeUrl} returned non-JSON (${resp.status} ${resp.statusText}, content-type: ${contentType || "unknown"}). Preview: ${preview}`
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (e: any) {
    throw new Error(`Bridge returned invalid JSON: ${String(e?.message || e).substring(0, 200)}`);
  }

  // The ElitePhoneBridge wraps responses: { ok, method, requestId, voipmsHttpStatus, data }
  // Bridge-level errors (bad signature, missing credentials, etc.) have ok=false
  if (parsed.ok === false) {
    throw new Error(parsed.message || parsed.error || "Bridge returned an error");
  }

  // Extract the actual VoIP.ms API response from the data field
  if (parsed.data !== undefined) {
    return parsed.data;
  }

  return parsed;
}

// ── Retry with exponential backoff ────────────────────────────────────

function isPermanentError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("invalid api") || m.includes("invalid user") || m.includes("auth")
    || m.includes("permission") || m.includes("not allowed") || m.includes("invalid parameter")
    || m.includes("signature") || m.includes("forbidden") || m.includes("unauthorized");
}

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || e);
      if (isPermanentError(msg)) throw e;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── VoIP.ms response helpers ──────────────────────────────────────────

function isVoipSuccess(data: any): boolean {
  return data && data.status === "success";
}

function isVoipNoRecords(data: any): boolean {
  return data && (data.status === "no_records" || data.status === "no_records_found");
}

// ── Bridge methods ────────────────────────────────────────────────────

// getIP — test bridge connectivity and verify VoIP.ms credentials are working.
export async function bridgeGetIP(): Promise<any> {
  return withRetry(() => bridgeCall("getIP", {}));
}

// getPhonebook — retrieve all entries (optionally filtered by group).
// Returns the raw VoIP.ms response.
export async function getPhonebookRaw(group?: string): Promise<any> {
  return withRetry(() => bridgeCall("getPhonebook", group ? { phonebook: group } : {}));
}

// getPhonebookGroups — retrieve all phone book groups.
export async function getPhonebookGroupsRaw(): Promise<any> {
  return withRetry(() => bridgeCall("getPhonebookGroups", {}));
}

// Discover the identifier field name from a getPhonebook response.
// VoIP.ms may use "id", "member_id", or another field — we inspect the actual data.
export function discoverIdField(entries: any[]): string {
  if (!entries || !entries.length) return "id";
  const first = entries[0];
  const candidates = ["id", "member_id", "entry_id", "phonebook_id", "record_id"];
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
  const data = await getPhonebookRaw(group);
  if (!isVoipSuccess(data) && !isVoipNoRecords(data)) {
    throw new Error(data?.message || "Failed to get phonebook entries");
  }
  const entries = data.phonebook || data.entries || data.result || [];
  const arr = Array.isArray(entries) ? entries : [];
  return { entries: arr, idField: discoverIdField(arr) };
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

// setPhonebook — create or update an entry.
// When id is provided, updates; when omitted, creates.
// Returns the raw VoIP.ms response.
export async function setPhonebookEntry(params: {
  id?: string;
  group?: string;
  name: string;
  number: string;
}): Promise<any> {
  const p: Record<string, any> = { name: params.name, number: params.number };
  if (params.group) p.phonebook = params.group;
  if (params.id) p.id = params.id;
  return withRetry(() => bridgeCall("setPhonebook", p));
}

// Create a phonebook entry. After creating, re-fetches to find the new entry's ID
// (since setPhonebook may not return the ID directly).
export async function createPhonebookEntry(group: string, name: string, number: string): Promise<{ id: string; idField: string }> {
  await setPhonebookEntry({ group, name, number });

  // Re-fetch to find the newly created entry by number
  const { entries, idField } = await getPhonebookEntries(group);
  const match = findEntryByNumber(entries, normalizePhone(number));
  return { id: match ? String(match[idField] || "") : "", idField };
}

// Update a phonebook entry by ID.
export async function updatePhonebookEntry(id: string, idField: string, group: string, name: string, number: string): Promise<void> {
  const params: Record<string, any> = { name, number, [idField]: id };
  if (group) params.phonebook = group;
  const data = await setPhonebookEntry(params);
  if (!isVoipSuccess(data)) {
    throw new Error(data?.message || "Failed to update phonebook entry");
  }
}

// Delete a phonebook entry by ID.
export async function deletePhonebookEntry(id: string, idField: string = "id"): Promise<void> {
  const data = await withRetry(() => bridgeCall("delPhonebook", { [idField]: id }));
  if (!isVoipSuccess(data)) {
    throw new Error(data?.message || "Failed to delete phonebook entry");
  }
}

// Test bridge connection via getIP.
export async function testBridgeConnection(): Promise<{ ok: boolean; message: string; ip?: string }> {
  try {
    const data = await bridgeGetIP();
    if (isVoipSuccess(data)) {
      const ip = data.ip || data.result || "";
      return { ok: true, message: `Bridge connected successfully${ip ? ` (IP: ${ip})` : ""}`, ip };
    }
    return { ok: false, message: data?.message || "Bridge returned non-success status" };
  } catch (e: any) {
    return { ok: false, message: String(e?.message || e) };
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