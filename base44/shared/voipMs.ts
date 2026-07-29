// VoIP.ms CDR lookup helper.
//
// IMPORTANT: VoIP.ms does NOT expose a live / active-call API. A Call Detail Record is only
// created once a call reaches a final disposition — Answered (then ended), No Answer, Busy, or
// Failed. While a call is still Ringing there is no CDR yet, so the caller number is NOT
// retrievable until the call is Connected (answered) or Idle (terminated). Callers of this
// helper are expected to retry over a short window to catch the CDR as soon as it appears.

function norm(p) {
  if (!p) return "";
  let d = String(p).replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return d;
}

// VoIP.ms callerid looks like "John" <1234567890> or <1234567890> or 1234567890
function extractDigits(callerid) {
  if (!callerid) return "";
  const m = String(callerid).match(/<(\d+)>/);
  if (m) return m[1];
  const m2 = String(callerid).match(/(\d{10,15})/);
  if (m2) return m2[1];
  return String(callerid).replace(/\D/g, "");
}

// VoIP.ms returns CDR `date` as "YYYY-MM-DD HH:MM:SS" in its server/account timezone,
// which observes Europe/London time (GMT in winter, BST = UTC+1 in summer). Parsing it as
// UTC (appending "Z") shifts every call +1h during summer. This interprets the wall-clock
// string as Europe/London and returns true UTC epoch ms (DST-correct).
export function parseVoipCdrDateMs(s: string): number {
  const m = String(s || "").match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) { const d = new Date(s).getTime(); return isNaN(d) ? 0 : d; }
  const [Y, Mo, D, H, Mi, S] = m.slice(1).map(Number);
  const probe = Date.UTC(Y, Mo - 1, D, H, Mi, S);
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/London", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts: Record<string, string> = {};
    for (const p of dtf.formatToParts(new Date(probe))) parts[p.type] = p.value;
    const wallMs = Date.UTC(+parts.year, +parts.month - 1, +parts.day, (+parts.hour % 24), +parts.minute, +parts.second);
    const offsetMin = (wallMs - probe) / 60000;
    return probe - offsetMin * 60000;
  } catch (_) { return probe; }
}
function parseDate(s) { return parseVoipCdrDateMs(s); }

// Returns the most recent inbound CDR to our DID within `withinMinutes`, or null.
// `didNorm` is the normalized shop DID (from VOIP_MS_FROM_NUMBER). When the DID can't be
// matched against the CDR `destination` field, we fall back to the newest recent inbound call.
export async function getLatestInboundCdr(_base44, { didNorm = "", withinMinutes = 5 } = {}) {
  const apiUser = Deno.env.get("VOIP_MS_API_USERNAME");
  const apiPass = Deno.env.get("VOIP_MS_API_PASSWORD");
  if (!apiUser || !apiPass) return null;

  const now = Date.now();
  const from = new Date(now - 30 * 60 * 1000); // pull a 30-min window from the API, then filter to recent
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const url =
    `https://voip.ms/api/v1/rest.php?api_username=${encodeURIComponent(apiUser)}` +
    `&api_password=${encodeURIComponent(apiPass)}&method=getCDR` +
    `&date_from=${fmt(from)}&date_to=${fmt(new Date())}&timezone=0` +
    `&answered=1&noanswer=1&busy=1&failed=1&page=1`;

  let data;
  try {
    const resp = await fetch(url);
    data = await resp.json();
  } catch (_) { return null; }
  if (!data || data.status !== "success") return null;

  const cdr = Array.isArray(data.cdr) ? data.cdr : [];
  const inbound = cdr.filter((c) => String(c.destination_type || "").toUpperCase().startsWith("IN"));
  const cutoff = now - withinMinutes * 60 * 1000;
  // Only calls that started within the window (allow a small future skew for clock drift)
  const recent = inbound.filter((c) => {
    const t = parseDate(c.date);
    return t >= cutoff && t <= now + 60000;
  });
  if (!recent.length) return null;

  const didMatches = didNorm
    ? recent.filter((c) => {
        const d = norm(c.destination || "");
        return d && (d === didNorm || d.endsWith(didNorm) || didNorm.endsWith(d));
      })
    : [];
  const pool = didMatches.length ? didMatches : recent;
  pool.sort((a, b) => parseDate(b.date) - parseDate(a.date));
  const top = pool[0];
  if (!top) return null;

  return {
    uniqueid: top.uniqueid || "",
    callerNumber: norm(extractDigits(top.callerid || "")),
    date: top.date || "",
    seconds: Number(top.seconds) || 0,
    disposition: top.disposition || "",
  };
}