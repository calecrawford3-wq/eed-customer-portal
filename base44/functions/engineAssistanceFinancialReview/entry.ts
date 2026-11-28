import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { adminFinancialView, financialState, financialRetrievalState, IncomeError, incomeAudit, incomeFailure, incomeResponse, listRows, processStatement, saveFinancialRecord, syncBankData, textValue } from '../../shared/assistanceFinancial.ts';
import { validateStatementMetadata } from '../../shared/assistanceFinancialMath.ts';

export default async function (req) {
  if (req.method !== 'POST') return incomeResponse({ error: 'Method not allowed.' }, 405);
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(error => {
      const status = error?.status || error?.response?.status;
      if (status === 401 || status === 403) return null;
      throw error;
    });
    if (!user || user.role !== 'admin') return incomeResponse({ error: 'Administrator access required.' }, 403);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new IncomeError('Invalid request.');
    const applicationId = textValue(body.application_id, 80);
    if (!applicationId) throw new IncomeError('Application required.');
    const e = base44.asServiceRole.entities;
    let app = listRows(await e.EngineAssistanceApplication.filter({ id: applicationId }, '-created_date', 1))[0];
    if (!app) throw new IncomeError('Application not found.', 404);
    const action = textValue(body.action, 40) || 'get';
    if (!['get', 'refresh', 'check', 'save_review', 'signed_document', 'process_statement', 'review_statement'].includes(action)) throw new IncomeError('Unsupported action.');
    if (action === 'get') {
      const state = await financialState(base44, app);
      const retrieval = financialRetrievalState(state.review || {});
      // Reopening a pending review must not indefinitely return a stale cache.
      // This checks existing Stripe snapshots only; it never requests a refresh.
      if ((retrieval.pending || retrieval.needs_sync) && app.income_method !== 'statements' && Date.now() - (Date.parse(state.review?.last_checked_at || '') || 0) >= 15000) return incomeResponse(await syncBankData(base44, app, false, state));
      return incomeResponse(await adminFinancialView(base44, app, state));
    }
    if (action === 'refresh' || action === 'check') return incomeResponse(await syncBankData(base44, app, action === 'refresh'));
    const state = await financialState(base44, app);
    const actor = textValue(user.email || user.full_name || user.id, 160);
    if (['signed_document', 'process_statement', 'review_statement'].includes(action)) {
      const statement = state.statements.find(s => s.id === textValue(body.statement_id, 80));
      if (!statement) throw new IncomeError('Statement not found on this application.', 404);
      if (action === 'signed_document') {
        const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: statement.file_uri, expires_in: 120 });
        if (!signed?.signed_url) throw new IncomeError('The private document could not be opened.', 502);
        return incomeResponse({ signed_url: signed.signed_url });
      }
      if (action === 'process_statement') await processStatement(base44, app, statement, actor);
      if (action === 'review_statement') {
        if (!['accept', 'reject'].includes(body.decision)) throw new IncomeError('Choose accept or reject.');
        const note = textValue(body.note, 1500);
        if (note.length < 10) throw new IncomeError('Record a review reason of at least 10 characters.');
        if (statement.status === 'processing' && Date.now() - (Date.parse(statement.processing_started_at || '') || 0) < 180000) throw new IncomeError('Wait for automatic reading to finish before saving a manual review.', 409);
        let patch;
        if (body.decision === 'accept') {
          if (body.all_pages_present !== true) throw new IncomeError('Open the original PDF and confirm every statement page is present before accepting it.', 422);
          const checked = validateStatementMetadata({
            is_bank_statement: true, readable: true, all_pages_present: true, reported_page_count: statement.page_count,
            period_start: textValue(body.period_start, 10), period_end: textValue(body.period_end, 10),
            institution_name: textValue(body.institution_name, 120), account_holder_name: textValue(body.account_holder_name, 150), account_last4: textValue(body.account_last4, 4), currency: textValue(body.currency, 3).toLowerCase(),
            transactions: [], transactions_complete: false, warnings: [],
          }, statement.page_count);
          if (!checked.ready) throw new IncomeError(`Confirm the statement details: ${checked.issues.join(' ')}`, 422);
          const { transactions: ignoredTransactions, ...metadata } = checked.normalized;
          // A metadata correction does not magically repair extracted amounts.
          // Keep original rows as unverified estimates and require manual income.
          patch = { ...metadata, status: 'ready', issues: ['Statement dates and completeness were accepted by staff. Transaction extraction is an estimate; review amounts against the PDF.'], transactions_complete: false };
        } else patch = { status: 'rejected', issues: ['Elite could not accept this statement. Please provide a replacement original bank PDF.'] };
        await e.EngineAssistanceBankStatement.update(statement.id, { ...patch, reviewed_by: actor, reviewed_at: new Date().toISOString(), review_note: note });
        await saveFinancialRecord(base44, app, { review_status: 'unreviewed', confirmed_monthly_income_cents: null, reviewed_at: '', reviewed_by: '' }, state.review);
        app = await e.EngineAssistanceApplication.update(app.id, { income_verification_status: 'requested', audit_trail: incomeAudit(app, actor, 'income_statement_reviewed', `A bank statement was ${body.decision === 'accept' ? 'accepted' : 'rejected'} after staff review. The private review record contains the reason.`) });
      }
    }
    if (action === 'save_review') {
      const status = textValue(body.review_status, 30);
      if (!['unreviewed', 'needs_information', 'reviewed'].includes(status)) throw new IncomeError('Choose a valid review status.');
      const notes = textValue(body.notes, 5000);
      if (status !== 'unreviewed' && notes.length < 10) throw new IncomeError('Add review notes of at least 10 characters before recording this status.');
      const required = Number(body.required_statement_months);
      if (![3, 6].includes(required)) throw new IncomeError('Choose three or six statement months.');
      const incomeCents = body.confirmed_monthly_income_cents;
      if (incomeCents !== null && incomeCents !== undefined && (!Number.isSafeInteger(incomeCents) || incomeCents < 0 || incomeCents > 100000000)) throw new IncomeError('Verified monthly income must be a nonnegative dollar amount.');
      const current = await adminFinancialView(base44, app);
      const validIds = new Set(current.review.transactions.map(t => t.id));
      if (!Array.isArray(body.corrections) || body.corrections.length > 4000) throw new IncomeError('Transaction corrections are invalid.');
      const corrections = body.corrections.map(c => {
        if (!validIds.has(c?.transaction_id) || !['income', 'transfer', 'debt_payment', 'other', 'unreviewed'].includes(c?.category)) throw new IncomeError('A transaction correction does not match this application. Refresh the review before saving.');
        return { transaction_id: c.transaction_id, category: c.category, note: textValue(c.note, 400) };
      });
      const requesting = status === 'needs_information' || required > (app.income_statement_months === 6 ? 6 : 3);
      if (status === 'reviewed' && requesting) throw new IncomeError('Request the additional statements before marking the financial review complete.');
      if (status === 'reviewed') {
        if (incomeCents === null || incomeCents === undefined) throw new IncomeError('Enter the monthly income you confirmed, including zero when appropriate, before marking income reviewed.', 422);
        const bankAccounts = state.review?.bank_accounts || [];
        const evidence = (app.income_method === 'bank') ? state.review?.status === 'ready' && !state.review?.truncated && !state.review?.errors?.length && bankAccounts.length > 0 && bankAccounts.every(a => a.context_verified && a.status === 'active' && a.permissions?.includes('transactions') && a.permissions?.includes('ownership') && a.has_imported_transactions && a.transactions_status === 'succeeded' && a.ownership_status === 'succeeded' && a.owner_names?.length && !a.sync_error) : current.checklist.complete;
        if (!evidence) throw new IncomeError('Complete the bank connection or the statement checklist before marking income reviewed.', 422);
      }
      if (requesting && !['pending_payment', 'submitted', 'under_review', 'info_requested'].includes(app.status)) throw new IncomeError('Reopen the application before requesting more documents.', 409);
      const now = new Date().toISOString();
      await saveFinancialRecord(base44, app, { review_status: requesting ? 'needs_information' : status, notes, required_statement_months: required,
        confirmed_monthly_income_cents: status === 'reviewed' ? incomeCents ?? null : null, corrections,
        reviewed_by: status === 'reviewed' ? actor : '', reviewed_at: status === 'reviewed' ? now : '',
      }, state.review);
      const patch = { income_statement_months: required, income_verification_status: status === 'reviewed' ? 'reviewed' : app.income_verification_status === 'reviewed' ? 'requested' : app.income_verification_status,
        income_verification_verified_at: status === 'reviewed' ? now : '',
        audit_trail: incomeAudit(app, actor, 'financial_review_saved', requesting ? `Requested ${required} monthly bank statements for financial review.` : `Financial review saved as ${status}. This does not approve funding.`),
      };
      if (requesting) Object.assign(patch, {
        income_request_pending: true, income_method: 'statements',
        ...(app.status !== 'pending_payment' ? { status: 'info_requested' } : {}),
        info_request_note: `Please upload your ${required} most recent consecutive monthly bank statements, including all pages, using the income documents section below. The newest statement must end within the past 45 days.`,
      });
      else if (status === 'reviewed') patch.income_request_pending = false;
      app = await e.EngineAssistanceApplication.update(app.id, patch);
    }
    return incomeResponse(await adminFinancialView(base44, app));
  } catch (error) { return incomeFailure(error); }
}
