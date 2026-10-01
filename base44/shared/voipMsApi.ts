// Direct VoIP.ms REST API client — no bridge proxy required.
//
// All VoIP.ms API calls go directly to https://voip.ms/api/v1/rest.php using
// credentials stored in Base44 secrets (VOIP_MS_API_USERNAME / VOIP_MS_API_PASSWORD).
// Direct access is verified working from Base44 backend functions.
//
// Usage:
//   const data = await voipMsCall("getPhonebook", {});
//   const data = await withRetry(() => voipMsCall("sendSMS", { did, dst, message }));
//
// Methods supported: getIP, getPhonebook, setPhonebook, delPhonebook,
//   getPhonebookGroups, setPhonebookGroup, delPhonebookGroup, sendSMS, sendMMS, getCDR

const VOIP_API_URL = "https://voip.ms/api/v1/rest.php";

const SENSITIVE_KEY_RE = /password|secret|token|api_?key|username|credential|auth/i;

// ── Param sanitization (for safe logging) ─────────────────────────────

export function sanitizeParams(params: Record<string, any> | undefined): Record<string, any> {
  if (!params || typeof params !== "object") return {};
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(params)) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    result[k] = v;
  }
  return result;
}

// ── Error class ───────────────────────────────────────────────────────

export interface VoipMsDiagnostic {
  ok: boolean;
  httpStatus: number;
  method: string;
  voipmsStatus: string;
  voipmsMessage: string;
  data: any;
  params: Record<string, any>;
  safeError: string;
}

export class VoipMsError extends Error {
  httpStatus: number;
  method: string;
  voipmsStatus: string;
  voipmsMessage: string;
  params: Record<string, any>;
  permanent: boolean;

  constructor(message: string, opts: { httpStatus?: number; method: string; voipmsStatus?: string; voipmsMessage?: string; params?: Record<string, any>; permanent?: boolean }) {
    super(message);
    this.name = "VoipMsError";
    this.httpStatus = opts.httpStatus || 0;
    this.method = opts.method;
    this.voipmsStatus = opts.voipmsStatus || "";
    this.voipmsMessage = opts.voipmsMessage || "";
    this.params = sanitizeParams(opts.params);
    this.permanent = opts.permanent || false;
  }

  get safeError(): string {
    return this.message || "Unknown VoIP.ms error";
  }

  toDiagnostic(): VoipMsDiagnostic {
    return {
      ok: false,
      httpStatus: this.httpStatus,
      method: this.method,
      voipmsStatus: this.voipmsStatus,
      voipmsMessage: this.voipmsMessage,
      data: null,
      params: this.params,
      safeError: this.safeError,
    };
  }
}

// ── Error classification ───────────────────────────────────────────────

function isPermanentStatus(status: string, msg: string): boolean {
  const s = (status || "").toLowerCase();
  const m = (msg || "").toLowerCase();
  return (
    s.includes("invalid_api") ||
    s.includes("invalid_user") ||
    s.includes("invalid_credential") ||
    s.includes("ip_restriction") ||
    s.includes("access_denied") ||
    s.includes("invalid_phonebook") ||
    m.includes("invalid api") ||
    m.includes("invalid user") ||
    m.includes("invalid credential") ||
    m.includes("ip address") ||
    m.includes("not allowed") ||
    m.includes("permission")
  );
}

export function isPermanentError(err: any): boolean {
  if (err instanceof VoipMsError) return err.permanent;
  const msg = String(err?.message || err).toLowerCase();
  return (
    msg.includes("invalid api") ||
    msg.includes("invalid user") ||
    msg.includes("auth") ||
    msg.includes("permission") ||
    msg.includes("not allowed") ||
    msg.includes("invalid parameter") ||
    msg.includes("forbidden") ||
    msg.includes("unauthorized") ||
    msg.includes("credentials")
  );
}

// ── Retry with exponential backoff ────────────────────────────────────

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      if (isPermanentError(e)) throw e;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── VoIP.ms response helpers ──────────────────────────────────────────

export function isVoipSuccess(data: any): boolean {
  return data && data.status === "success";
}

export function isVoipNoRecords(data: any): boolean {
  return data && (data.status === "no_records" || data.status === "no_records_found" || data.status === "no_phonebook");
}

// ── Core direct API call ──────────────────────────────────────────────

// Send a method + params directly to the VoIP.ms REST API.
// Credentials are read from Deno.env and never appear in logs or responses.
export async function voipMsCall(method: string, params: Record<string, any> = {}): Promise<any> {
  const apiUser = Deno.env.get("VOIP_MS_API_USERNAME");
  const apiPass = Deno.env.get("VOIP_MS_API_PASSWORD");
  if (!apiUser || !apiPass) {
    throw new VoipMsError("VoIP.ms API credentials not configured (VOIP_MS_API_USERNAME / VOIP_MS_API_PASSWORD)", { method, permanent: true });
  }

  const url = new URL(VOIP_API_URL);
  url.searchParams.set("api_username", apiUser);
  url.searchParams.set("api_password", apiPass);
  url.searchParams.set("method", method);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  // Admin-safe diagnostic: log method + sanitized params (no secrets/credentials)
  console.log(`[VoIP.ms] ${method}`, JSON.stringify(sanitizeParams(params)));

  let resp: Response;
  try {
    resp = await fetch(url.toString());
  } catch (e: any) {
    throw new VoipMsError(`Network error calling VoIP.ms: ${String(e?.message || e).substring(0, 200)}`, { method, params, permanent: false });
  }

  const text = await resp.text().catch(() => "");

  let data: any;
  try {
    data = JSON.parse(text);
  } catch (e: any) {
    const preview = text.substring(0, 150).replace(/\n/g, " ");
    throw new VoipMsError(`VoIP.ms returned invalid JSON (${resp.status}). Preview: ${preview}`, { httpStatus: resp.status, method, params, permanent: false });
  }

  // Success or no-records (empty phone book is not an error)
  if (isVoipSuccess(data) || isVoipNoRecords(data)) {
    return data;
  }

  // API-level error — classify and throw
  const status = data?.status || "";
  const msg = data?.message || "";
  const permanent = isPermanentStatus(status, msg);
  throw new VoipMsError(msg || `VoIP.ms returned status: ${status}`, { httpStatus: resp.status, method, voipmsStatus: status, voipmsMessage: msg, params, permanent });
}

// ── Convenience methods ───────────────────────────────────────────────

// getIP — test connectivity and verify VoIP.ms credentials are working.
export async function voipGetIP(): Promise<any> {
  return withRetry(() => voipMsCall("getIP", {}));
}

// Test direct VoIP.ms connection via getIP.
export async function testVoipConnection(): Promise<{ ok: boolean; message: string; ip?: string }> {
  try {
    const data = await voipGetIP();
    if (isVoipSuccess(data)) {
      const ip = data.ip || data.result || "";
      return { ok: true, message: `VoIP.ms connected successfully${ip ? ` (IP: ${ip})` : ""}`, ip };
    }
    return { ok: false, message: data?.message || "VoIP.ms returned non-success status" };
  } catch (e: any) {
    return { ok: false, message: String(e?.message || e) };
  }
}