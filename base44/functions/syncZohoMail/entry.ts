import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  getZohoMailAccessToken,
  listAccounts,
  listFolders,
  listMessages,
  getMessageDetail,
  parseAddress,
  htmlToText,
  truncate,
} from '../../shared/zohoMail.ts';
import { sendPushToAllSubscriptions } from '../../shared/sendPush.ts';

// Folders we never sync into the app
const SKIP_FOLDERS = ['junk', 'spam', 'trash', 'draft', 'outbox', 'archive'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const token = await getZohoMailAccessToken(base44);
    const accounts = await listAccounts(token);
    if (!accounts.length) {
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

    // Dedupe by message_id
    const existing = await base44.asServiceRole.entities.Email.list('-received_at', 500);
    const seen = new Set((existing || []).map((e) => e.message_id).filter(Boolean));

    let newCount = 0;
    let scanned = 0;
    const errors = [];
    const newInbound = [];

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

        for (const msg of messages) {
          scanned++;
          const messageId = String(msg.messageId || msg.message_id || msg.id || '');
          if (!messageId || seen.has(messageId)) continue;
          seen.add(messageId);

          // Fetch full message detail for the body (only for new messages)
          let detail = {};
          try {
            detail = await getMessageDetail(token, accountId, folderId, messageId);
          } catch (_) {
            /* keep metadata-only */
          }

          const fromParsed = parseAddress(msg.fromAddress || msg.from || msg.sender || detail.from);
          const toParsed = parseAddress(msg.toAddress || msg.to || detail.to);
          const subject = msg.subject || detail.subject || '(no subject)';
          const isSent = fname.includes('sent');
          const direction = isSent ? 'outbound' : 'inbound';

          const rawHtml = detail.content || detail.htmlContent || detail.html || '';
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

          try {
            await base44.asServiceRole.entities.Email.create({
              message_id: messageId,
              account_id: String(accountId),
              account_address: accountAddress,
              folder_id: String(folderId),
              folder_name: folder.folderName || folder.name || '',
              thread_id: String(msg.threadId || msg.thread_id || messageId),
              from_address: msg.fromAddress || msg.from || fromParsed.email || '',
              from_email: fromParsed.email,
              from_name: fromParsed.name,
              to_address: msg.toAddress || msg.to || toParsed.email || '',
              to_email: toParsed.email,
              cc_address: msg.cc || detail.cc || '',
              subject,
              preview,
              body_text: bodyText,
              direction,
              received_at: receivedAt,
              is_read: !String(msg.flags || '').toLowerCase().includes('unread'),
              has_attachments: String(msg.hasAttachment) === "1" || msg.hasAttachment === true,
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
            if (direction === 'inbound') {
              newInbound.push({ from: fromParsed.name || fromParsed.email, subject });
            }
          } catch (e) {
            errors.push(`store(${messageId}): ${e.message || e}`);
          }
        }
      }
    }

    // Push a summary notification for new inbound mail
    if (newInbound.length) {
      try {
        const first = newInbound[0];
        const title = newInbound.length === 1 ? `New email from ${first.from}` : `${newInbound.length} new emails`;
        const body = newInbound.slice(0, 3).map((n) => `${n.from}: ${n.subject}`).join('\n');
        await sendPushToAllSubscriptions(base44, { title, body, url: '/Emails' });
      } catch (_) { /* push is best-effort */ }
    }

    return Response.json({
      success: true,
      accounts: accounts.length,
      scanned,
      newMessages: newCount,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error('syncZohoMail error:', error?.message || error);
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}