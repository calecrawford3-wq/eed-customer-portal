/**
 * ElitePhoneBridge — VoIP.ms API Proxy Endpoint
 *
 * Add this route to your Express.js bridge server (phone-events.elitefcusa.com).
 * It receives HMAC-signed requests from Base44 and forwards them to the VoIP.ms REST API,
 * so VoIP.ms only sees the bridge server's whitelisted IP.
 *
 * Install: npm install express
 *
 * Environment variables (C:\ElitePhoneBridge\settings.env):
 *   VOIPMS_BRIDGE_SECRET — HMAC signing key (must match Base44 secret)
 *   VOIP_MS_API_USERNAME — VoIP.ms API username
 *   VOIP_MS_API_PASSWORD — VoIP.ms API password
 *
 * Authentication headers from Base44:
 *   X-Bridge-Timestamp  — Unix timestamp in ms (rejected if >5 min old)
 *   X-Bridge-Request-Id — Unique UUID per request (never reused)
 *   X-Bridge-Signature  — HMAC-SHA256(secret, timestamp + "." + requestId + "." + exactJsonBody)
 *
 * Request body: { "method": "getIP", "params": {} }
 *
 * Supported methods: getIP, getPhonebook, setPhonebook, delPhonebook,
 *                    getPhonebookGroups, setPhonebookGroup, delPhonebookGroup
 *
 * Add to your Express app:
 *   app.post('/voipms', express.json(), voipmsProxyHandler);
 */

const crypto = require('crypto');

const VOIP_API_URL = 'https://voip.ms/api/v1/rest.php';

// Verify HMAC-SHA256 signature: sign(`${timestamp}.${requestId}.${body}`)
function verifySignature(secret, timestamp, requestId, body, signature) {
  if (!signature || !timestamp || !requestId) return false;

  // Reject timestamps older than 5 minutes
  const now = Date.now();
  const ts = Number(timestamp);
  if (isNaN(ts) || Math.abs(now - ts) > 5 * 60 * 1000) {
    return false;
  }

  const message = `${timestamp}.${requestId}.${body}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  // Timing-safe comparison
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// Main handler — mount on POST /voipms
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

  // Verify HMAC signature — the body must be the exact string that was signed
  const signature = req.headers['x-bridge-signature'];
  const timestamp = req.headers['x-bridge-timestamp'];
  const requestId = req.headers['x-bridge-request-id'];

  // Use the raw body string for signature verification
  // (express.json() parses it, but we need the original string)
  const rawBody = req.rawBody || JSON.stringify(req.body);

  if (!verifySignature(secret, timestamp, requestId, rawBody, signature)) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired signature' });
  }

  const { method, params } = req.body;
  if (!method) {
    return res.status(400).json({ status: 'error', message: 'Missing API method' });
  }

  // Whitelist of allowed VoIP.ms methods
  const ALLOWED_METHODS = [
    'getIP',
    'getPhonebook',
    'setPhonebook',
    'delPhonebook',
    'getPhonebookGroups',
    'setPhonebookGroup',
    'delPhonebookGroup',
    'sendSMS',
    'sendMMS',
  ];
  if (!ALLOWED_METHODS.includes(method)) {
    return res.status(403).json({ status: 'error', message: `VoIP.ms method not permitted: ${method}` });
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

// ── Express app setup ─────────────────────────────────────────────────
// If you already have an Express app, just add:
//   app.post('/voipms', express.json({ verify: (req, res, buf) => { req.rawBody = buf.toString(); } }), voipmsProxyHandler);
//
// IMPORTANT: To verify signatures, you need the raw request body.
// Use the `verify` callback in express.json() to capture it, or use
// a body-parser raw middleware before the JSON parser.
//
// Standalone server setup:

/*
const express = require('express');
const app = express();

// Capture raw body for signature verification before parsing JSON
app.use('/voipms', express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.post('/voipms', voipmsProxyHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ElitePhoneBridge VoIP.ms proxy listening on port ${PORT}`);
});
*/

module.exports = { voipmsProxyHandler, verifySignature };