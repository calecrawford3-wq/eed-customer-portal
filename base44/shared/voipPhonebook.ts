// VoIP.ms Phone Book synchronization helpers.
//
// All VoIP.ms REST API calls go through here so credentials are never exposed to the frontend.
// Calls are made either directly (if the server IP is whitelisted in VoIP.ms) or through an
// optional HMAC-signed ElitePhoneBridge proxy running on the shop computer.
//
// VoIP.ms Phone Book API methods used:
//   getPhonebook      — list entries (optional: phonebook group, id)
//   createPhonebook   — create entry (phonebook, name, number)
//   setPhonebook       — update entry (id, phonebook, name, number)
//   delPhonebook       — delete entry (id)
//
// Secrets (already set in the app):
//   VOIP_MS_API_USERNAME, VOIP_MS_API_PASSWORD — VoIP.ms REST API credentials
//   BRIDGE_SECRET — HMAC signing key for the ElitePhoneBridge proxy
//   VOIPMS_BRIDGE_URL — optional; when set, all API calls are proxied through the bridge

const VOIP_API_URL = "https://voip.ms/api/v1/rest.php";
const NAME_MAX_LEN = 30;

// ── Phone normalization ──────────────────────────────────────────────

// Normalize to 10-digit North American format.
// +1XXXXXXXXXX, 1XXXXXXXXXX, XXXXXXXXXX all map to the same 10-digit number.
// Returns "" for invalid / non-North-American / extension-only numbers.
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return ""; // only accept valid 10-digit US/CA numbers
  return d;
}

// ── Name building ─────────────────────────────────────────────────────

export function sanitizeName(name: string, maxLen = NAME_MAX_LEN): string {
  if (!name) return "";
  let s = String(name)
    .replace(/[\x00-\x1F\x7F]/g, "")  // control characters
    .replace(/[<>&"'\\]/g, "")         // unsupported symbols
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

// ── Credential / bridge helpers ────────────────────────────────────────

export function getCredentials(): { user: string; pass: string } | null {
  const user = Deno.env.get("VOIP_MS_API_USERNAME");
  const pass = Deno.env.get("VOIP_MS_API_PASSWORD");
  if (!user || !pass) return null;
  return { user, pass };
}

export function isBridgeMode(): boolean {
  return !!Deno.env.get("VOIPMS_BRIDGE_URL");
}

// ── Core API call ─────────────────────────────────────────────────────

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

// Make a VoIP.ms API call — directly or through the bridge proxy.
// Returns the raw JSON response from VoIP.ms (or a bridge-wrapped error).
export async function voipApiCall(method: string, params: Record<string, string> = {}): Promise<any> {
  const creds = getCredentials();
  if (!creds) throw new Error("VoIP.ms API credentials not configured");

  const bridgeUrl = Deno.env.get("VOIPMS_BRIDGE_URL");

  if (bridgeUrl) {
    return await bridgeRequest(bridgeUrl, method, params);
  }

  // Direct call
  const url = new URL(VOIP_API_URL);
  url.searchParams.set("api_username", creds.user);
  url.searchParams.set("api_password", creds.pass);
  url.searchParams.set("method", method);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const resp = await fetch(url.toString());
  return await resp.json();
}

// Forward a VoIP.ms API call through the ElitePhoneBridge with HMAC signature.
// Rejects stale timestamps (>5 min old) — the bridge also validates this.
async function bridgeRequest(bridgeUrl: string, method: string, params: Record<string, string>): Promise<any> {
  const secret = Deno.env.get("BRIDGE_SECRET") || "";
  if (!secret) throw new Error("BRIDGE_SECRET not configured for bridge mode");

  const body = JSON.stringify({ method, params });
  const ts = Date.now().toString();
  const sig = await signHmac(secret, `${ts}.${body}`);

  const resp = await fetch(bridgeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Elite-Signature": sig,
      "X-Elite-Timestamp": ts,
    },
    body,
  });

  const contentType = resp.headers.get("content-type") || "";
  const text = await resp.text().catch(() => "");

  if (!contentType.includes("application/json")) {
    // Bridge returned HTML (or other non-JSON) — likely a wrong URL or bridge service not running
    const preview = text.substring(0, 150).replace(/\n/g, " ");
    throw new Error(
      `Bridge at ${bridgeUrl} returned non-JSON response (${resp.status} ${resp.statusText}, content-type: ${contentType || "unknown"}). ` +
      `Ensure the URL points to the bridge API endpoint, not a web page. Preview: ${preview}`
    );
  }

  try {
    return JSON.parse(text);
  } catch (e: any) {
    throw new Error(`Bridge returned invalid JSON: ${String(e?.message || e).substring(0, 200)}`);
  }
}

// ── Retry with exponential backoff ────────────────────────────────────

function isPermanentError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("invalid api") || m.includes("invalid user") || m.includes("auth")
    || m.includes("permission") || m.includes("not allowed") || m.includes("invalid parameter");
}

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || e);
      if (isPermanentError(msg)) throw e; // don't retry auth/validation errors
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

function isVoipSuccess(data: any): boolean {
  return data && data.status === "success";
}

// VoIP.ms returns "no_records" when a phone book group exists but has no entries.
// This is a valid response, not an error.
function isVoipNoRecords(data: any): boolean {
  return data && (data.status === "no_records" || data.status === "no_records_found");
}

// ── Phone Book operations ─────────────────────────────────────────────

// Fetch all phonebook entries (optionally filtered by group).
export async function getPhonebookEntries(group: string): Promise<any[]> {
  return withRetry(async () => {
    const data = await voipApiCall("getPhonebook", group ? { phonebook: group } : {});
    if (!isVoipSuccess(data) && !isVoipNoRecords(data)) {
      throw new Error(data?.message || "Failed to get phonebook entries");
    }
    // VoIP.ms returns entries under "phonebook" key
    const entries = data.phonebook || data.entries || data.result || [];
    return Array.isArray(entries) ? entries : [];
  });
}

// Find an existing entry by normalized phone number.
export function findEntryByNumber(entries: any[], normalizedNumber: string): any | null {
  if (!normalizedNumber) return null;
  for (const e of entries) {
    const eNum = normalizePhone(e.number || "");
    if (eNum && eNum === normalizedNumber) return e;
  }
  return null;
}

// Create a phonebook entry. Returns the entry ID (re-fetches to get it since
// VoIP.ms createPhonebook doesn't always return the new ID).
export async function createPhonebookEntry(group: string, name: string, number: string): Promise<{ id: string }> {
  await withRetry(async () => {
    const data = await voipApiCall("createPhonebook", {
      phonebook: group,
      name,
      number,
    });
    if (!isVoipSuccess(data)) {
      throw new Error(data?.message || "Failed to create phonebook entry");
    }
  });

  // Re-fetch to find the newly created entry by number
  const entries = await getPhonebookEntries(group);
  const match = findEntryByNumber(entries, normalizePhone(number));
  return { id: match ? String(match.id || "") : "" };
}

// Update a phonebook entry.
export async function updatePhonebookEntry(id: string, group: string, name: string, number: string): Promise<void> {
  await withRetry(async () => {
    const data = await voipApiCall("setPhonebook", {
      id,
      phonebook: group,
      name,
      number,
    });
    if (!isVoipSuccess(data)) {
      throw new Error(data?.message || "Failed to update phonebook entry");
    }
  });
}

// Delete a phonebook entry.
export async function deletePhonebookEntry(id: string): Promise<void> {
  await withRetry(async () => {
    const data = await voipApiCall("delPhonebook", { id });
    if (!isVoipSuccess(data)) {
      throw new Error(data?.message || "Failed to delete phonebook entry");
    }
  });
}

// Test API connection by fetching the phone book groups.
export async function testVoipConnection(): Promise<{ ok: boolean; message: string; bridgeMode: boolean }> {
  const bridge = isBridgeMode();
  try {
    const data = await voipApiCall("getPhonebook", {});
    if (isVoipSuccess(data)) {
      const count = Array.isArray(data.phonebook) ? data.phonebook.length : 0;
      return { ok: true, message: `Connection successful (${count} entries found)`, bridgeMode: bridge };
    }
    // "no_records" means credentials are valid but the phone book is empty
    if (isVoipNoRecords(data)) {
      return { ok: true, message: "Connection successful (phone book is empty)", bridgeMode: bridge };
    }
    return { ok: false, message: data?.message || "API returned non-success status", bridgeMode: bridge };
  } catch (e: any) {
    return { ok: false, message: String(e?.message || e), bridgeMode: bridge };
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
    nightlyReconciliation: !!s.voipms_pb_nightly_reconciliation,
  };
}

export async function updatePbStatus(base44: any, fields: Record<string, any>): Promise<void> {
  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
  if (settings && settings[0]) {
    await base44.asServiceRole.entities.AppSettings.update(settings[0].id, fields);
  }
}