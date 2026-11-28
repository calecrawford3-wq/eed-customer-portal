import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import { publicCapability } from '../../shared/publicCapability.ts';
import { IncomeError, MAX_STATEMENT_BYTES, editableIncomeStatus, financialState, incomeStatus, incomeResponse, incomeFailure, listRows, processStatement, saveFinancialRecord, textValue, incomeAudit } from '../../shared/assistanceFinancial.ts';

async function boundedBody(req, max) {
  if (Number(req.headers.get('content-length')) > max) throw new IncomeError('This upload is too large. Each bank statement must be 12 MB or smaller.', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new IncomeError('Request body required.');
  const chunks = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) { await reader.cancel(); throw new IncomeError('This upload is too large. Each bank statement must be 12 MB or smaller.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export default async function (req) {
  if (req.method !== 'POST') return incomeResponse({ error: 'Method not allowed.' }, 405);
  try {
    const contentType = req.headers.get('content-type') || '';
    const multipart = contentType.includes('multipart/form-data');
    const raw = await boundedBody(req, multipart ? MAX_STATEMENT_BYTES + 65536 : 16384);
    let body;
    if (multipart) {
      const form = await new Response(raw, { headers: { 'Content-Type': contentType } }).formData().catch(() => { throw new IncomeError('The upload could not be read. Select the PDF again.'); });
      body = Object.fromEntries(form.entries());
    } else {
      try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new IncomeError('Invalid request.'); }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new IncomeError('Invalid request.');
    const token = body.status_token;
    if (!publicCapability(token) || token.length < 32) throw new IncomeError('A valid private application link is required.', 400);
    const base44 = createClientFromRequest(req);
    const entities = base44.asServiceRole.entities;
    let app = listRows(await entities.EngineAssistanceApplication.filter({ status_token: token }, '-created_date', 1))[0];
    if (!app) throw new IncomeError('Application not found.', 404);
    const action = textValue(body.action, 40) || 'status';
    if (!['status', 'select_method', 'upload_statement', 'process_statement', 'remove_statement'].includes(action)) throw new IncomeError('Unsupported action.');
    let state = await financialState(base44, app);
    if (action === 'status') return incomeResponse({ income: incomeStatus(app, state) });
    if (!editableIncomeStatus(app)) throw new IncomeError('This application is no longer accepting income documents.', 409);
    if (action === 'select_method') {
      if (!['bank', 'statements'].includes(body.method)) throw new IncomeError('Choose bank linking or bank statements.');
      if (body.consent !== true) throw new IncomeError('Accept the income verification authorization first.', 422);
      if (app.income_request_pending && body.method !== 'statements') throw new IncomeError('Elite has requested monthly statements. Upload those statements to complete this request.', 422);
      const patch = { income_method: body.method, income_consent_at: app.income_consent_at || new Date().toISOString(), income_consent_version: 'aef-income-v1' };
      if (app.income_method !== body.method) {
        await saveFinancialRecord(base44, app, { review_status: 'unreviewed', confirmed_monthly_income_cents: null, reviewed_at: '', reviewed_by: '' }, state.review);
        patch.income_verification_status = 'requested';
      }
      app = await entities.EngineAssistanceApplication.update(app.id, patch);
    }
    if (action === 'upload_statement') {
      if (body.consent !== 'true' && body.consent !== true) throw new IncomeError('Accept the income verification authorization before uploading.', 422);
      if (body.all_pages_confirmed !== 'true' && body.all_pages_confirmed !== true) throw new IncomeError('Confirm you are providing all pages of your most recent monthly statements.', 422);
      if (state.statements.length >= 12) throw new IncomeError('Up to 12 monthly statements can be attached. Remove an incorrect file before uploading another.', 422);
      if ((app.income_upload_count || 0) >= 30) throw new IncomeError('This application has reached its document replacement limit. Contact Elite for help reviewing the files already uploaded.', 422);
      const file = body.file;
      if (!(file instanceof File) || !/\.pdf$/i.test(file.name) || (file.type && !['application/pdf', 'application/octet-stream'].includes(file.type))) throw new IncomeError('Choose an original PDF bank statement. Screenshots and other file types are not accepted.', 422);
      if (file.size < 20 || file.size > MAX_STATEMENT_BYTES) throw new IncomeError('Each PDF must be 12 MB or smaller and contain a readable statement.', 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new IncomeError('This file is not a valid PDF.', 422);
      let pdf;
      try { pdf = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: false }); } catch { throw new IncomeError('This PDF is damaged or password protected. Download an unlocked original statement from your bank.', 422); }
      const pages = pdf.getPageCount();
      if (pages < 1 || pages > 60) throw new IncomeError('Upload one monthly statement per PDF, with 1–60 pages and every page included.', 422);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      if (state.statements.some(s => s.sha256 === hash)) throw new IncomeError('This exact PDF is already attached. Upload a different statement month.', 409, 'duplicate_statement');
      const filename = textValue(file.name.replace(/[\\/\x00-\x1f]/g, '_'), 180) || 'bank-statement.pdf';
      const uploaded = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: new File([bytes], filename, { type: 'application/pdf' }) });
      if (!uploaded?.file_uri || /^https?:/i.test(uploaded.file_uri)) throw new IncomeError('Private document storage did not confirm the upload. Please retry.', 502);
      const statement = await entities.EngineAssistanceBankStatement.create({
        application_id: app.id, file_uri: uploaded.file_uri, filename, sha256: hash, byte_size: bytes.byteLength, page_count: pages,
        status: 'uploaded', uploaded_at: new Date().toISOString(), extraction_attempts: 0,
        all_pages_attested_at: new Date().toISOString(), issues: ['This statement has been uploaded and still needs document checks.'],
      });
      app = await entities.EngineAssistanceApplication.update(app.id, {
        income_method: 'statements', income_consent_at: app.income_consent_at || new Date().toISOString(), income_consent_version: 'aef-income-v1', income_verification_status: 'requested',
        income_upload_count: (app.income_upload_count || 0) + 1,
        audit_trail: incomeAudit(app, 'Applicant', 'income_statement_uploaded', 'A bank statement was uploaded privately for income review.'),
      });
      await saveFinancialRecord(base44, app, { review_status: 'unreviewed', confirmed_monthly_income_cents: null, reviewed_at: '', reviewed_by: '' }, state.review);
      return incomeResponse({ statement_id: statement.id, income: incomeStatus(app, await financialState(base44, app)) });
    }
    if (action === 'process_statement' || action === 'remove_statement') {
      const statementId = textValue(body.statement_id, 80);
      const statement = state.statements.find(s => s.id === statementId);
      if (!statement) throw new IncomeError('Statement not found on this application.', 404);
      if (action === 'process_statement') {
        if (!app.income_consent_at) throw new IncomeError('Accept the income verification authorization first.', 422);
        await processStatement(base44, app, statement);
      } else {
        // Preserve received evidence during an active review. Replacements are
        // allowed on a draft or a specific request for additional information.
        if (!['pending_payment', 'info_requested'].includes(app.status)) throw new IncomeError('Contact Elite to replace a statement while your application is under review.', 409);
        if (statement.status === 'processing' && Date.now() - (Date.parse(statement.processing_started_at || '') || 0) < 180000) throw new IncomeError('Wait for the statement check to finish before removing it.', 409);
        await entities.EngineAssistanceBankStatement.update(statement.id, { status: 'removed', removed_at: new Date().toISOString() });
        await saveFinancialRecord(base44, app, { review_status: 'unreviewed', confirmed_monthly_income_cents: null, reviewed_at: '', reviewed_by: '' }, state.review);
        await entities.EngineAssistanceApplication.update(app.id, { income_verification_status: 'requested', audit_trail: incomeAudit(app, 'Applicant', 'income_statement_removed', 'A bank statement was removed from the active submission.') });
      }
    }
    state = await financialState(base44, app);
    return incomeResponse({ income: incomeStatus(app, state) });
  } catch (error) { return incomeFailure(error); }
}
