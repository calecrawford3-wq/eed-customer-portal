/**
 * ElitePhoneBridge — VoIP.ms API Proxy Endpoint
 *
 * Add this route to your Express.js bridge server (phone-events.elitefcusa.com).
 * It receives HMAC-signed requests from Base44 and forwards them to the VoIP.ms REST API,
 * so VoIP.ms only sees the bridge server's whitelisted IP.
 *
 * Requires:
 *   npm install express crypto
 *
 * Environment variables on the bridge server:
 *   VOIPMS_BRIDGE_SECRET — same HMAC key set in Base44 secrets (used to verify requests)
 *   VOIP_MS_API_USERNAME — VoIP.ms API username
 *   VOIP_MS_API_PASSWORD — VoIP.ms API password
 *
 * Add to your Express app:
 *   app.post('/voipms', voipmsProxyHandler);
 */

const crypto = require('crypto');

// VoIP.ms REST API base URL
const VOIP_API_URL = 'https://voip.ms/api/v1/rest.php';

// Verify HMAC-SHA256 signature: sign(`${timestamp}.${body}`)
function verifySignature(secret, timestamp, body, signature) {
  if (!signature || !timestamp) return false;

  // Reject timestamps older than 5 minutes
  const now = Date.now();
  const ts = Number(timestamp);
  if (isNaN(ts) || Math.abs(now - ts) > 5 * 60 * 1000) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  // Timing-safe comparison
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// Main handler — mount this on POST /voipms
async function voipmsProxyHandler(req, res) {
  const secret = process.env.VOIPMS_BRIDGE_SECRET;
  if (!secret) {
    return res.status(500).json({ status: 'error', message: 'VOIPMS_BRIDGE_SECRET not configured on bridge' });
  }

  const apiUser = process.env.VOIP_MS_API_USERNAME;
  const apiPass = process.env.VOIP_MS_API_PASSWORD;
  if (!apiUser || !apiPass) {
    return res.status(500).json({ status: 'error', message: 'VoIP.ms API credentials not configured on bridge' });
  }

  // Verify HMAC signature
  const signature = req.headers['x-elite-signature'];
  const timestamp = req.headers['x-elite-timestamp'];
  const rawBody = JSON.stringify(req.body);

  if (!verifySignature(secret, timestamp, rawBody, signature)) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired signature' });
  }

  const { method, params } = req.body;
  if (!method) {
    return res.status(400).json({ status: 'error', message: 'Missing API method' });
  }

  // Build VoIP.ms API URL
  const url = new URL(VOIP_API_URL);
  url.searchParams.set('api_username', apiUser);
  url.searchParams.set('api_password', apiPass);
  url.searchParams.set('method', method);
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
  }

  try {
    const resp = await fetch(url.toString());
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    console.error('VoIP.ms API proxy error:', e?.message || e);
    res.status(502).json({ status: 'error', message: `VoIP.ms API request failed: ${e?.message || e}` });
  }
}

// ── Express app setup (if running standalone) ───────────────────────────
// If you already have an Express app, just add:
//   app.post('/voipms', express.json(), voipmsProxyHandler);
//
// If you need a standalone server, uncomment below:

/*
const express = require('express');
const app = express();

app.use(express.json());
app.post('/voipms', voipmsProxyHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ElitePhoneBridge VoIP.ms proxy listening on port ${PORT}`);
});
*/

module.exports = { voipmsProxyHandler, verifySignature };