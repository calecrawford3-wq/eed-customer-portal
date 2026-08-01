import { secrets } from "base44:runtime";

const GRAPH_API_VERSION = "v25.0";

// Workspace connector ID for "EED Facebook Messenger" (facebook_pages, APP_USER mode)
const CONNECTOR_ID = "6a6e86767e2196ae7637803f";

/**
 * Get the current app user's Facebook user access token via the workspace connector.
 * Requires an authenticated admin user who has connected their Facebook account.
 * Throws "FACEBOOK_NOT_CONNECTED" if no app-user connection exists.
 */
export async function getAppUserAccessToken(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(CONNECTOR_ID);
  if (!accessToken) throw new Error("FACEBOOK_NOT_CONNECTED");
  return accessToken;
}

/**
 * List Facebook Pages managed by the given user access token.
 */
export async function listFacebookPages(accessToken) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,access_token&limit=100`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.data || [];
}

/**
 * Exchange a short-lived user access token for a long-lived one (60 days).
 * Page tokens derived from a long-lived user token do NOT expire.
 */
export async function exchangeForLongLivedToken(userToken, appId, appSecret) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${userToken}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.access_token;
}

async function getGlobalSettings(base44) {
  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "global" });
  return settings?.[0];
}

/**
 * Read the cached long-lived Page access token from AppSettings.
 * Used by scheduled syncs (no user context) to avoid needing an app-user connection.
 */
export async function getCachedPageToken(base44) {
  const rec = await getGlobalSettings(base44);
  if (!rec?.facebook_page_access_token) return null;
  return {
    pageId: rec.facebook_page_id,
    pageName: rec.facebook_page_name,
    pageAccessToken: rec.facebook_page_access_token,
  };
}

async function cachePageToken(base44, pageId, pageName, pageAccessToken) {
  const rec = await getGlobalSettings(base44);
  if (!rec) return;
  await base44.asServiceRole.entities.AppSettings.update(rec.id, {
    facebook_page_id: pageId,
    facebook_page_name: pageName,
    facebook_page_access_token: pageAccessToken,
    facebook_page_token_cached_at: new Date().toISOString(),
  });
}

/**
 * Force-refresh the Page access token from the app-user connection.
 * Exchanges the short-lived user token for a long-lived one, lists Pages,
 * selects the preferred Page, and caches the Page token in AppSettings.
 * Returns the list of available Pages for UI display.
 */
export async function refreshPageTokenFromAppUser(base44, preferredPageId) {
  const userToken = await getAppUserAccessToken(base44);

  const appId = secrets.get("FACEBOOK_APP_ID");
  const appSecret = secrets.get("FACEBOOK_APP_SECRET");

  let longToken = userToken;
  if (appId && appSecret) {
    try {
      longToken = await exchangeForLongLivedToken(userToken, appId, appSecret);
    } catch {
      // Exchange failed — fall back to short-lived token (will still list pages)
    }
  }

  const pages = await listFacebookPages(longToken);
  if (pages.length === 0) {
    throw new Error(
      "No Facebook Pages found. Make sure your Facebook account manages a Page with Messenger access."
    );
  }

  // Select page: preferredPageId → first page
  const page = preferredPageId ? pages.find((p) => p.id === preferredPageId) : null;
  const selected = page || pages[0];

  await cachePageToken(base44, selected.id, selected.name, selected.access_token);

  return {
    pageId: selected.id,
    pageName: selected.name,
    pageAccessToken: selected.access_token,
    pages: pages.map((p) => ({ id: p.id, name: p.name })),
  };
}

/**
 * Get Page info for sync/send operations.
 * 1. Try cached token first (fast, works for scheduled syncs with no user context).
 * 2. If no cached token, try app-user connection → exchange → cache.
 * 3. If neither, throw "not connected" error.
 */
export async function getPageInfo(base44, pageId) {
  // 1. Cached token (fast path for scheduled syncs)
  const cached = await getCachedPageToken(base44);
  if (cached && cached.pageAccessToken) {
    return cached;
  }

  // 2. No cached token — refresh from app-user connection (manual sync by admin)
  const result = await refreshPageTokenFromAppUser(base44, pageId);
  return {
    pageId: result.pageId,
    pageName: result.pageName,
    pageAccessToken: result.pageAccessToken,
  };
}

/**
 * Debug helper — returns raw API responses for troubleshooting page access.
 */
export async function debugFacebookAccess(accessToken) {
  const results = {};

  const meResp = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me?fields=id,name,email`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  results.me = await meResp.json();

  const accountsResp = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,access_token,category,perms&limit=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  results.accounts = await accountsResp.json();

  const bizResp = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/businesses?fields=id,name&limit=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  results.businesses = await bizResp.json();

  return results;
}