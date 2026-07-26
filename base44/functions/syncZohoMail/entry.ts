import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  getZohoMailAccessToken,
  listAccounts,
  listFolders,
  listMessages,
  getMessageDetail,
  parseAddress,
  parseAttachment,
  htmlToText,
  truncate,
} from '../../shared/zohoMail.ts';
import { sanitizeStoredHtml } from '../../shared/emailSanitizer.ts';
import { sendPushToAllSubscriptions } from '../../shared/sendPush.ts';

// Folders we never sync into the app
const SKIP_FOLDERS = ['junk', 'spam', 'trash', 'draft', 'outbox', 'archive'];
const SYNC_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getSettings(base44) {
  const list = await base44.asServiceRole.entities.AppSettings.filter({ key: 'global' });
  return list && list[0];
}

/** Release the sync lock only if it still belongs to this job. */
async function releaseLock(base44, jobId) {
  const s = await getSettings(base44);
  if (!s) return;
  let lock = null;
  try { lock = s.email_sync_lock ? JSON.parse(s.email_sync_lock) : null; } catch (_) { lock = null; }
  if (lock && lock.job_id === jobId) {
    await base44.asServiceRole.entities.AppSettings.update(s.id, { email_sync_lock: '' });
  }
}

function normalizeSubject(s) {
  return String(s || '').replace(/^((re|fwd|fw)\s*:\s*)+/gi, '').trim();
}

function parseMsgTimeMs(msg) {
  try {
    const rt = msg.receivedTime || msg.sentDateInGMT || msg.sentDate || '';
    if (!rt) return 0;
    return /^\d+$/.test(String(rt)) ? Number(rt) : new Date(rt).getTime();
  } catch (_) { return 0; }
}

// Quiet-hours check in shop local time (America/Chicago). cfg: {enabled, start, end} (HH:MM).
function inQuietHours(cfg) {
  if (!cfg || !cfg.enabled || !cfg.start || !cfg.end) return false;
  try {
    const now = new Date();
    const chicago = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    const [h, m] = chicago.split(':').map(Number);
    const cur = h * 60 + m;
    const [sh, sm] = cfg.start.split(':').map(Number);
    const [eh, em] = cfg.end.split(':').map(Number);
    const s = sh * 60 + sm, e = eh * 60 + em;
    if (s === e) return false;
    return s < e ? (cur >= s && cur < e) : (cur >= s || cur < e);
  } catch (_) { return false; }
}

export default async function(req) {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  let base44;
  const jobId = crypto.randomUUID();
  let settings;
  let skipped = false;
  try {
    base44 = createClientFromRequest(req);

    // Optional full historical resync (admin action) — ignores and resets checkpoints
    let fullResync = false;
    try { const body = await req.json(); fullResync = !!body?.fullResync; } catch (_) { /* no body */ }

    // --- Overlap protection: refuse to run while another sync is active ---
    settings = await getSettings(base44);
    let checkpoints = {};
    try { checkpoints = settings?.email_sync_checkpoints ? JSON.parse(settings.email_sync_checkpoints) : {}; } catch (_) { checkpoints = {}; }
    const startCheckpoints = fullResync ? {} : checkpoints;
    const newCheckpoints = { ...startCheckpoints };
    const lockRaw = settings?.email_sync_lock || '';
    let lock = null;
    try { lock = lockRaw ? JSON.parse(lockRaw) : null; } catch (_) { lock = null; }
    if (lock && lock.job_id && (Date.now() - (lock.locked_at || 0)) < SYNC_LOCK_TTL_MS) {
      skipped = true;
      return Response.json({ success: true, skipped: true, note: 'A sync is already in progress — try again in a moment.' });
    }
    const lockVal = JSON.stringify({ job_id: jobId, locked_at: Date.now() });
    if (settings) {
      await base44.asServiceRole.entities.AppSettings.update(settings.id, { email_sync_lock: lockVal });
    } else {
      settings = await base44.asServiceRole.entities.AppSettings.create({ key: 'global', email_sync_lock: lockVal });
    }

    const token = await getZohoMailAccessToken(base44);
    const accounts = await listAccounts(token);
    if (!accounts.length) {
      await writeSyncLog(base44, { started_at: startedAt, status: 'success', accounts: 0, triggered_by: 'manual', startMs, errors: [] });
      return Response.json({ success: true, accounts: 0, scanned: 0, newMessages: 0, note: 'No mailboxes found' });
    }

    // Customer & Supplier email -> contact maps for auto-association
    const customers = await base44.asServiceRole.entities.Customer.list('-created_date', 500);
    const suppliers = await base44.asServiceRole.entities.Supplier.list('-created_date', 500);
    const emailMap = {};
    for (const c of customers) {
      if (c.email) emailMap[String(c.email).trim().toLowerCase()] = { type: 'customer', ref: c };
      for (const ae of (c.additional_emails || [])) {
        const v = String(ae || '').trim().toLowerCase();
        if (v) emailMap[v] = { type: 'customer', ref: c };
      }
    }
    const supplierMap = {};
    for (const s of suppliers) {
      if (s.email) supplierMap[String(s.email).trim().toLowerCase()] = s;
    }

    // Dedupe by account_id + message_id (composite key — message IDs are not globally unique)
    const existing = await base44.asServiceRole.entities.Email.list('-received_at', 500);
    const seen = new Set((existing || []).map((e) => `${e.account_id || ''}|${e.message_id || ''}`).filter((k) => k && k !== '|'));

    let newCount = 0;
    let scanned = 0;
    const errors = [];
    const newInbound = [];
    const newEmails = []; // captured for thread + auto-link building

    for (const account of accounts) {
      const accountId = account.accountId || account.account_id || account.mailAccountId || account.id;
      if (!accountId) continue;
      const accountAddress = account.mailboxAddress || (account.emailAddress && account.emailAddress[0] && account.emailAddress[0].mailId) || account.incomingUserName || '';

      let folders = [];
      try {
        folders = await listFolders(token, accountId);
      } catch (e) {
        errors.push(`folders(${accountId}): ${e.message || e}`);
        continue;
      }

      for (const folder of folders) {
        const folderId = folder.folderId || folder.folder_id || folder.id;
        const fname = String(folder.folderName || folder.name || '').toLowerCase();
        if (!folderId || SKIP_FOLDERS.some((s) => fname.includes(s))) continue;

        let messages = [];
        try {
          messages = await listMessages(token, accountId, folderId, 50);
        } catch (e) {
          errors.push(`list(${accountId}/${fname}): ${e.message || e}`);
          continue;
        }

        // Incremental checkpoint: skip this folder entirely if its newest message
        // is not newer than the last sync (unless this is a full resync).
        const cpKey = `${accountId}|${folderId}`;
        const folderCp = startCheckpoints[cpKey];
        const msgTimeById = {};
        let batchMaxMs = 0;
        for (const msg of messages) {
          const t = parseMsgTimeMs(msg);
          const mid = String(msg.messageId || msg.message_id || msg.id || '');
          if (mid) msgTimeById[mid] = t;
          if (t > batchMaxMs) batchMaxMs = t;
        }
        if (!fullResync && folderCp?.last_message_time && batchMaxMs && batchMaxMs <= folderCp.last_message_time) {
          continue;
        }
        let folderMaxMs = folderCp?.last_message_time || 0;

        for (const msg of messages) {
          const messageId = String(msg.messageId || msg.message_id || msg.id || '');
          if (!messageId) continue;
          const msgMs = msgTimeById[messageId] || 0;
          if (!fullResync && folderCp?.last_message_time && msgMs && msgMs <= folderCp.last_message_time) continue;
          scanned++;
          const dedupeKey = `${accountId}|${messageId}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          let detail = {};
          try {
            detail = await getMessageDetail(token, accountId, folderId, messageId);
          } catch (_) { /* keep metadata-only */ }

          const fromParsed = parseAddress(msg.fromAddress || msg.from || msg.sender || detail.from);
          const toParsed = parseAddress(msg.toAddress || msg.to || detail.to);
          const subject = msg.subject || detail.subject || '(no subject)';
          const isSent = fname.includes('sent');
          const direction = isSent ? 'outbound' : 'inbound';

          const rawHtml = detail.content || detail.htmlContent || detail.html || '';
          const bodyHtml = sanitizeStoredHtml(rawHtml);
          const bodyText = truncate(htmlToText(detail.content || detail.textContent || detail.text || rawHtml || msg.summary || ''), 10000);
          const preview = truncate(bodyText.replace(/\s+/g, ' '), 300);

          let receivedAt = '';
          try {
            const rt = msg.receivedTime || msg.sentDateInGMT || msg.sentDate || detail.receivedTime || detail.sentDate || '';
            if (rt) {
              receivedAt = /^\d+$/.test(String(rt)) ? new Date(Number(rt)).toISOString() : new Date(rt).toISOString();
            }
          } catch (_) { receivedAt = ''; }
          if (!receivedAt) receivedAt = new Date().toISOString();

          const matchEmail = isSent ? toParsed.email : fromParsed.email;
          const matchLower = matchEmail ? String(matchEmail).trim().toLowerCase() : '';
          const custEntry = matchLower ? emailMap[matchLower] : null;
          const customer = custEntry?.type === 'customer' ? custEntry.ref : null;
          const customerName = customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : '';
          const supplier = matchLower ? supplierMap[matchLower] : null;
          const supplierName = supplier ? (supplier.name || '') : '';
          const isRead = !String(msg.flags || '').toLowerCase().includes('unread');
          const hasAttachments = String(msg.hasAttachment) === "1" || msg.hasAttachment === true;
          const attachments = Array.isArray(detail.attachments)
            ? detail.attachments.map((a) => parseAttachment(a, accountId, folderId, messageId)).filter(Boolean)
            : [];
          const threadId = String(msg.threadId || msg.thread_id || messageId);

          try {
            const created = await base44.asServiceRole.entities.Email.create({
              message_id: messageId,
              account_id: String(accountId),
              account_address: accountAddress,
              folder_id: String(folderId),
              folder_name: folder.folderName || folder.name || '',
              thread_id: threadId,
              from_address: msg.fromAddress || msg.from || fromParsed.email || '',
              from_email: fromParsed.email,
              from_name: fromParsed.name,
              to_address: msg.toAddress || msg.to || toParsed.email || '',
              to_email: toParsed.email,
              cc_address: msg.cc || detail.cc || '',
              subject,
              preview,
              body_text: bodyText,
              body_html: bodyHtml,
              direction,
              received_at: receivedAt,
              is_read: isRead,
              has_attachments: hasAttachments,
              attachments,
              customer_id: customer?.id || '',
              customer_name: customerName,
              supplier_id: supplier?.id || '',
              supplier_name: supplierName,
              link_type: 'none',
              link_id: '',
              link_number: '',
              is_linked: false,
            });
            newCount++;
            if (msgMs > folderMaxMs) folderMaxMs = msgMs;
            newEmails.push({
              id: created?.id || '',
              account_id: String(accountId),
              account_address: accountAddress,
              thread_id: threadId,
              subject,
              from_email: fromParsed.email,
              to_email: toParsed.email,
              received_at: receivedAt,
              is_read: isRead,
              has_attachments: hasAttachments,
              customer_id: customer?.id || '',
              customer_name: customerName,
              supplier_id: supplier?.id || '',
              supplier_name: supplierName,
              link_type: 'none',
            });
            if (direction === 'inbound') {
              newInbound.push({ from: fromParsed.name || fromParsed.email, subject });
            }
          } catch (e) {
            errors.push(`store(${messageId}): ${e.message || e}`);
          }
        }
        if (folderMaxMs > (folderCp?.last_message_time || 0)) {
          newCheckpoints[cpKey] = { last_message_time: folderMaxMs, last_message_id: '' };
        }
      }
    }

    // --- Build / refresh EmailThread aggregates from all known emails ---
    let threadsCreated = 0;
    let threadsUpdated = 0;
    try {
      const allEmails = (existing || []).concat(newEmails);
      const threadsMap = {};
      for (const e of allEmails) {
        const key = `${e.account_id || ''}|${e.thread_id || ''}`;
        if (!key || key === '|') continue;
        const t = threadsMap[key] || {
          account_id: e.account_id || '',
          account_address: e.account_address || '',
          thread_id: e.thread_id || '',
          subject: '',
          participant_emails: new Set(),
          last_message_at: null,
          message_count: 0,
          unread_count: 0,
          has_attachments: false,
          customer_id: '',
          customer_name: '',
          supplier_id: '',
          supplier_name: '',
          link_type: 'none',
          link_number: '',
        };
        const ra = e.received_at || '';
        if (ra && (!t.last_message_at || new Date(ra) > new Date(t.last_message_at))) {
          t.last_message_at = ra;
          if (e.subject) t.subject = e.subject;
        }
        if (e.from_email) t.participant_emails.add(String(e.from_email).toLowerCase());
        if (e.to_email) {
          for (const x of String(e.to_email).split(',')) {
            const v = x.trim().toLowerCase();
            if (v) t.participant_emails.add(v);
          }
        }
        t.message_count++;
        if (!e.is_read) t.unread_count++;
        if (e.has_attachments) t.has_attachments = true;
        if (e.customer_id && !t.customer_id) { t.customer_id = e.customer_id; t.customer_name = e.customer_name || ''; }
        if (e.supplier_id && !t.supplier_id) { t.supplier_id = e.supplier_id; t.supplier_name = e.supplier_name || ''; }
        if (e.link_type && e.link_type !== 'none' && t.link_type === 'none') { t.link_type = e.link_type; t.link_number = e.link_number || ''; }
        threadsMap[key] = t;
      }

      const existingThreads = await base44.asServiceRole.entities.EmailThread.list('-last_message_at', 500);
      const tMap = {};
      for (const t of existingThreads) tMap[`${t.account_id}|${t.thread_id}`] = t;
      const nowIso = new Date().toISOString();
      const toCreate = [];
      const toUpdate = [];
      for (const [key, agg] of Object.entries(threadsMap)) {
        const data = {
          account_address: agg.account_address || '',
          subject: agg.subject || '(no subject)',
          normalized_subject: normalizeSubject(agg.subject),
          participant_emails: Array.from(agg.participant_emails),
          last_message_at: agg.last_message_at || nowIso,
          message_count: agg.message_count,
          unread_count: agg.unread_count,
          has_attachments: agg.has_attachments,
          customer_id: agg.customer_id,
          customer_name: agg.customer_name,
          supplier_id: agg.supplier_id,
          supplier_name: agg.supplier_name,
          link_type: agg.link_type,
          link_number: agg.link_number,
          status: 'active',
          last_synced_at: nowIso,
        };
        const existingT = tMap[key];
        if (existingT) {
          toUpdate.push({ id: existingT.id, ...data });
        } else {
          toCreate.push({ account_id: agg.account_id, thread_id: agg.thread_id, assigned_user_id: '', ...data });
        }
      }
      if (toCreate.length) {
        await base44.asServiceRole.entities.EmailThread.bulkCreate(toCreate);
        threadsCreated = toCreate.length;
      }
      if (toUpdate.length) {
        await base44.asServiceRole.entities.EmailThread.bulkUpdate(toUpdate);
        threadsUpdated = toUpdate.length;
      }
    } catch (e) {
      errors.push('threads: ' + (e.message || e));
    }

    // --- Auto EmailLink records for newly matched customer/supplier ---
    let linksCreated = 0;
    try {
      const autoLinks = [];
      for (const ne of newEmails) {
        if (!ne.id) continue;
        if (ne.customer_id) autoLinks.push({ email_id: ne.id, thread_id: ne.thread_id, account_id: ne.account_id, entity_type: 'customer', entity_id: ne.customer_id, entity_label: ne.customer_name || '', link_source: 'auto', confidence_score: 100, matched_by: 'email_address', match_status: 'confirmed' });
        if (ne.supplier_id) autoLinks.push({ email_id: ne.id, thread_id: ne.thread_id, account_id: ne.account_id, entity_type: 'supplier', entity_id: ne.supplier_id, entity_label: ne.supplier_name || '', link_source: 'auto', confidence_score: 100, matched_by: 'email_address', match_status: 'confirmed' });
      }
      if (autoLinks.length) {
        await base44.asServiceRole.entities.EmailLink.bulkCreate(autoLinks);
        linksCreated = autoLinks.length;
      }
    } catch (e) {
      errors.push('auto links: ' + (e.message || e));
    }

    // Push a summary notification for new inbound mail — respecting quiet hours + resync suppression
    if (newInbound.length) {
      let quietCfg = null;
      try { quietCfg = settings?.email_notify_quiet_hours ? JSON.parse(settings.email_notify_quiet_hours) : null; } catch (_) { quietCfg = null; }
      const notifyOnFullResync = settings?.email_notify_on_full_resync === true;
      const suppressDueResync = fullResync && !notifyOnFullResync;
      const suppressDueQuiet = inQuietHours(quietCfg);
      if (!suppressDueResync && !suppressDueQuiet) {
        try {
          const first = newInbound[0];
          const title = newInbound.length === 1 ? `New email from ${first.from}` : `${newInbound.length} new emails`;
          const body = newInbound.slice(0, 3).map((n) => `${n.from}: ${n.subject}`).join('\n');
          await sendPushToAllSubscriptions(base44, { title, body, url: '/Emails' });
        } catch (_) { /* push is best-effort */ }
      }
    }

    // Persist updated sync checkpoints
    try {
      const sEnd = await getSettings(base44);
      if (sEnd) await base44.asServiceRole.entities.AppSettings.update(sEnd.id, { email_sync_checkpoints: JSON.stringify(newCheckpoints) });
    } catch (e) { errors.push('checkpoints: ' + (e.message || e)); }

    await writeSyncLog(base44, {
      started_at: startedAt, status: errors.length ? 'partial' : 'success',
      accounts: accounts.length, messages_found: scanned, messages_created: newCount,
      threads_created: threadsCreated, threads_updated: threadsUpdated, links_created: linksCreated,
      triggered_by: 'manual', startMs, errors: errors.slice(0, 20),
    });

    return Response.json({
      success: true,
      accounts: accounts.length,
      scanned,
      newMessages: newCount,
      threadsCreated,
      threadsUpdated,
      linksCreated,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error('syncZohoMail error:', error?.message || error);
    if (base44) {
      try {
        await writeSyncLog(base44, { started_at: startedAt, status: 'failed', triggered_by: 'manual', startMs, errors: [error?.message || String(error)] });
      } catch (_) { /* best-effort */ }
    }
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  } finally {
    if (base44 && !skipped) {
      try { await releaseLock(base44, jobId); } catch (_) { /* best-effort */ }
    }
  }
}

async function writeSyncLog(base44, { started_at, status, accounts = 0, messages_found = 0, messages_created = 0, threads_created = 0, threads_updated = 0, links_created = 0, triggered_by = 'manual', startMs, errors = [] }) {
  try {
    await base44.asServiceRole.entities.EmailSyncLog.create({
      started_at,
      completed_at: new Date().toISOString(),
      status,
      duration_ms: Date.now() - startMs,
      accounts,
      messages_found,
      messages_created,
      threads_created,
      threads_updated,
      links_created,
      errors,
      triggered_by,
    });
  } catch (_) { /* logging is best-effort */ }
}