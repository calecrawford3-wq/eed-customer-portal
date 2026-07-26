/**
 * Shared Zoho Mail API helpers — token refresh + REST calls.
 * Reuses the existing ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN
 * secrets (already configured for outbound mail via sendSmtpEmail).
 */

const ZOHO_TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token";
const ZOHO_MAIL_API = "https://mail.zoho.com/api";

export async function getZohoMailAccessToken(base44) {
  const clientId = Deno.env.get("ZOHO_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Zoho OAuth client not configured (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET secrets)");
  }
  let refreshToken = "";
  // Prefer the AppSettings-stored Mail refresh token, fall back to env secrets
  if (base44) {
    try {
      const list = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
      const s = list && list[0];
      if (s && s.zoho_mail_refresh_token) refreshToken = s.zoho_mail_refresh_token;
    } catch (_) { /* ignore — fall back to env */ }
  }
  if (!refreshToken) refreshToken = Deno.env.get("ZOHO_MAIL_REFRESH_TOKEN") || "";
  if (!refreshToken) refreshToken = Deno.env.get("ZOHO_REFRESH_TOKEN") || "";
  if (!refreshToken) {
    throw new Error("Zoho Mail not connected — generate a grant token with Mail scopes and connect in the Emails page.");
  }
  const resp = await fetch(ZOHO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!data.access_token) {
    throw new Error("Zoho token refresh failed: " + JSON.stringify(data));
  }
  return data.access_token;
}

/** Exchange a one-time Zoho grant token (code) for a refresh token and persist it to AppSettings. */
export async function exchangeZohoMailGrantToken(base44, { code, redirectUri }) {
  const clientId = Deno.env.get("ZOHO_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Zoho OAuth client not configured (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET secrets)");
  }
  const resp = await fetch(ZOHO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri || "http://localhost",
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!data.refresh_token) {
    throw new Error("Token exchange failed: " + JSON.stringify(data));
  }
  const list = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
  const settings = list && list[0];
  if (settings) {
    await base44.asServiceRole.entities.AppSettings.update(settings.id, { zoho_mail_refresh_token: data.refresh_token });
  } else {
    await base44.asServiceRole.entities.AppSettings.create({ key: "global", zoho_mail_refresh_token: data.refresh_token });
  }
  return { success: true };
}

function authHeaders(token) {
  return { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" };
}

/** List all Zoho Mail accounts/mailboxes the authorized user has access to. */
function pickList(data, key) {
  const d = data?.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d[key])) return d[key];
  if (Array.isArray(data?.[key])) return data[key];
  return [];
}

export async function listAccounts(token) {
  const resp = await fetch(`${ZOHO_MAIL_API}/accounts`, { headers: authHeaders(token) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Zoho /accounts HTTP ${resp.status}: ${JSON.stringify(data)}`);
  }
  return pickList(data, 'accounts');
}

export async function listFolders(token, accountId) {
  const resp = await fetch(`${ZOHO_MAIL_API}/accounts/${accountId}/folders`, { headers: authHeaders(token) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Zoho /folders HTTP ${resp.status}: ${JSON.stringify(data)}`);
  }
  return pickList(data, 'folders');
}

export async function listMessages(token, accountId, folderId, limit = 50) {
  const url = `${ZOHO_MAIL_API}/accounts/${accountId}/messages/view?folderId=${folderId}&start=0&limit=${limit}`;
  const resp = await fetch(url, { headers: authHeaders(token) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Zoho /messages/view HTTP ${resp.status}: ${JSON.stringify(data)}`);
  }
  return pickList(data, 'messages');
}

export async function getMessageDetail(token, accountId, folderId, messageId) {
  const url = `${ZOHO_MAIL_API}/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content`;
  const resp = await fetch(url, { headers: authHeaders(token) });
  const data = await resp.json().catch(() => ({}));
  const d = data?.data;
  if (Array.isArray(d)) return d[0] || {};
  return d || data?.message || data || {};
}

export async function sendMessage(token, accountId, payload) {
  const resp = await fetch(`${ZOHO_MAIL_API}/accounts/${accountId}/messages`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

/** Parse a Zoho address like 'Name' <email> into { name, email }. */
export function parseAddress(addr) {
  if (!addr) return { name: "", email: "" };
  const s = String(addr);
  let m = s.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: (m[1] || "").trim().replace(/^"|"$/g, ""), email: m[2].trim().toLowerCase() };
  m = s.match(/<([^>]+)>/);
  if (m) return { name: "", email: m[1].trim().toLowerCase() };
  if (/^[^\s@]+@[^\s@]+$/.test(s.trim())) return { name: "", email: s.trim().toLowerCase() };
  return { name: s.trim(), email: "" };
}

export function htmlToText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncate(s, max) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}