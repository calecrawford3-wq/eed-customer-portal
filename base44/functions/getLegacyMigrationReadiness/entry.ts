import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { summarizeLegacyMigration } from '../../shared/legacyMigrationAudit.ts';

const LIMIT = 500;
const items = (response: any): any[] => Array.isArray(response) ? response : Array.isArray(response?.items) ? response.items : Array.isArray(response?.data) ? response.data : [];
const legacyIntegrationPaths = [
  { category: 'invoice', integration: 'legacy invoice viewer links', source: 'src/pages/InvoiceDetail.jsx' },
  { category: 'estimate', integration: 'legacy estimate approval links', source: 'src/pages/EstimateDetail.jsx' },
  { category: 'estimate', integration: 'legacy estimate snapshot sync', source: 'base44/shared/syncEstimateSnapshot.ts' },
  { category: 'invoice', integration: 'legacy invoice snapshot sync', source: 'base44/functions/syncInvoiceSnapshot/entry.ts' },
  { category: 'legal', integration: 'legacy legal document sync', source: 'base44/functions/syncLegalDocument/entry.ts' },
  { category: 'additional_work', integration: 'legacy additional-work approval links', source: 'src/components/jobs/AdditionalWorkDialog.jsx' },
  { category: 'comparison', integration: 'legacy comparison viewer', source: 'src/pages/EstimateDetail.jsx' },
  { category: 'checkout', integration: 'legacy Stripe checkout endpoints', source: 'base44/functions/createCheckoutSession/entry.ts' },
  { category: 'checkout', integration: 'legacy checkout URL generator', source: 'base44/functions/generateStripeCheckoutUrl/entry.ts' },
  { category: 'customer', integration: 'legacy invoice PDF import', source: 'src/components/invoices/LegacyInvoiceImportModal.jsx' },
];

export default async function(req) {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin required' }, { status: 403 });
    const service = base44.asServiceRole.entities;
    // SDK list may return a capped page. The audit explicitly labels any
    // at-limit result as incomplete; it never asserts an exhaustive scan.
    const [invoiceResult, estimateResult, workResult] = await Promise.all([
      service.Invoice.list('-created_date', LIMIT),
      service.Estimate.list('-created_date', LIMIT),
      service.AdditionalWork.list('-created_date', LIMIT),
    ]);
    const summary = summarizeLegacyMigration(items(invoiceResult), items(estimateResult), items(workResult), LIMIT);
    return Response.json({
      stage: 14,
      assessment: 'read_only_partial_inventory',
      legacy_origin: 'https://billing.eedpower.com',
      legacy_billing_preserved: true,
      migration_authorized: false,
      redirect_authorized: false,
      ...summary,
      known_legacy_integrations: legacyIntegrationPaths,
      required_external_checks: [
        'Inventory historical viewer URLs, email links, QR codes and customer bookmarks',
        'Export legacy Stripe sessions, charges, refunds, pending ACH and payout records for reconciliation',
        'Compare original legacy invoice/estimate data and PDFs with new portal records',
        'Verify every old invoice, estimate, additional-work, comparison and legal-document link',
        'Confirm old webhook deliveries and in-flight payments remain serviceable during any pilot',
        'Approve reversible routing and rollback only after Stage 13 pilot acceptance',
      ],
      note: 'No redirects, writes, imports, payments, or customer notifications were performed. A capped SDK scan is not a complete database export.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Unable to audit legacy billing safely' }, { status: 500 });
  }
}
