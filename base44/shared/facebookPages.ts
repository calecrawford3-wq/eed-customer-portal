const GRAPH_API_VERSION = "v25.0";

export async function getUserAccessToken(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection("facebook_pages");
  if (!accessToken) throw new Error("Facebook is not connected. Go to Settings → Facebook to connect.");
  return accessToken;
}

export async function listFacebookPages(accessToken) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,access_token&limit=100`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.data || [];
}

export async function debugFacebookAccess(accessToken) {
  // Returns raw API responses for troubleshooting page access issues
  const results = {};

  // 1. Who am I?
  const meResp = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/me?fields=id,name,email`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  results.me = await meResp.json();

  // 2. Standard /me/accounts
  const accountsResp = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,access_token,category,perms&limit=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  results.accounts = await accountsResp.json();

  // 3. Businesses (for New Pages Experience in Business Portfolios)
  const bizResp = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/me/businesses?fields=id,name&limit=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  results.businesses = await bizResp.json();

  // 4. Token permissions/scopes
  const debugResp = await fetch(`https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${accessToken}`);
  results.debug_token = await debugResp.json();

  return results;
}

export async function getPageInfo(base44, pageId) {
  const userToken = await getUserAccessToken(base44);
  const pages = await listFacebookPages(userToken);
  if (pageId) {
    const page = pages.find((p) => p.id === pageId);
    if (page) return { pageId: page.id, pageName: page.name, pageAccessToken: page.access_token };
  }
  if (pages.length === 0) {
    throw new Error("No Facebook Pages found. Make sure your Facebook account manages a Page with Messenger access.");
  }
  const page = pages[0];
  return { pageId: page.id, pageName: page.name, pageAccessToken: page.access_token };
}