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

    // Customer email -> customer map for auto-association
    const customers = await base44.asServiceRole.entities.Customer.list('-created_date', 500);
    const emailMap = {};
    for (const c of customers) {
      if (c.email) emailMap[String(c.email).trim().toLowerCase()] = c;
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

          const fromParsed = parseAddress(msg.from || msg.sender || detail.from);
          const toParsed = parseAddress(msg.to || msg.toAddress || detail.to);
          const subject = msg.subject || detail.subject || '(no subject)';
          const isSent = fname.includes('sent');
          const direction = isSent ? 'outbound' : 'inbound';

          const rawHtml = detail.content || detail.htmlContent || detail.html || '';
          const bodyText = truncate(htmlToText(detail.content || detail.textContent || detail.text || rawHtml || msg.summary || ''), 10000);
          const preview = truncate(bodyText.replace(/\s+/g, ' '), 300);

          let receivedAt = '';
          try {
            receivedAt = msg.receivedTime || msg.sentDate || detail.receivedTime || detail.sentDate || '';
            if (receivedAt) receivedAt = new Date(receivedAt).toISOString();
          } catch (_) { receivedAt = ''; }
          if (!receivedAt) receivedAt = new Date().toISOString();

          const matchEmail = isSent ? toParsed.email : fromParsed.email;
          const customer = matchEmail ? emailMap[matchEmail] : null;
          const customerName = customer
            ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
            : fromParsed.name || '';

          try {
            await base44.asServiceRole.entities.Email.create({
              message_id: messageId,
              account_id: String(accountId),
              account_address: accountAddress,
              folder_id: String(folderId),
              folder_name: folder.folderName || folder.name || '',
              thread_id: String(msg.threadId || msg.thread_id || messageId),
              from_address: msg.from || fromParsed.email || '',
              from_email: fromParsed.email,
              from_name: fromParsed.name,
              to_address: msg.to || toParsed.email || '',
              to_email: toParsed.email,
              cc_address: msg.cc || detail.cc || '',
              subject,
              preview,
              body_text: bodyText,
              direction,
              received_at: receivedAt,
              is_read: !String(msg.flags || '').toLowerCase().includes('unread'),
              has_attachments: !!msg.hasAttachment,
              customer_id: customer?.id || '',
              customer_name: customerName,
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