# Stage 14: Legacy Billing Migration and Reversible Cutover
Status: PREPARATION ONLY. No legacy URLs, DNS, invoices, Stripe settings, or production payment gates have been changed.

## Baseline
- Current legacy billing hostname: billing.eedpower.com.
- New customer portal: portal.eliteenginedevelopment.com (verify actual configured domain before using).
- Existing legacy Stripe handlers and checkout links must remain active until in-flight transactions and unpaid invoices have been reconciled.
- Stage 13 launch approval and acceptance evidence are required before any live cutover.

## Implemented read-only audit
- Admin Settings → Payments → **Audit Legacy Billing** invokes `getLegacyMigrationReadiness`.
- The backend scans up to 500 invoices, estimates, and additional-work records each. At-limit scans are explicitly partial, not a complete export.
- The report counts open balances, old checkout links, outstanding approvals, duplicate invoice numbers, missing PDFs, conversion/reconciliation flags, financial mismatches, missing customer links, cross-customer estimate associations, duplicate access-token groups, missing financial values and negative values.
- It displays at most 100 record-ID-only reconciliation exceptions, never token values, contact details or payment credentials.
- This audit is not a live Stripe reconciliation, full legacy viewer export or authorization to migrate. No records or routes are modified.

## Migration inventory and evidence
- [ ] Export legacy invoices and estimates with stable IDs, customer IDs, totals, amounts paid, remaining balances, currency, tax, status, and original URLs.
- [ ] Inventory outstanding payment links, pending ACH, open Stripe Checkout Sessions, refunds, disputes, credits, deposits, subscriptions (if any), and legally signed documents.
- [ ] Identify duplicate invoices or mismatched customer associations. Do not import or change financial records until discrepancies are reviewed.
- [ ] Confirm which legacy links must remain permanently viewable for accounting/audit purposes.
- [ ] Capture pre-migration counts and balance sums; reconcile against Stripe and accounting.
- [ ] Back up/export legacy and portal records before any mutation.

## Link routing matrix
| Legacy link type | Initial behavior | Post-approval behavior |
| --- | --- | --- |
| Unpaid invoice | Keep existing billing URL and payment route | Migrate only after matching customer and balance, preserving original ID mapping |
| Paid invoice | Keep view/receipt available | Read-only archive or explicit verified mapping |
| Estimate awaiting approval | Keep original approval link functional | New portal only with consent/status and signed-document parity verified |
| Pending ACH or open checkout | Keep old webhook/session handling | No cutover until settled, expired, or separately reconciled |
| Signed legal document | Preserve signature audit trail | Show via verified portal link; never regenerate signatures |
| Bookmarked/emailed old link | Do not break or blanket redirect | Only targeted redirects after ID mapping and authorization checks |

## Controlled rollout
1. Complete Stages 8–13 acceptance and get explicit owner approval for migration.
2. Dry-run migration on exported snapshots and produce per-record match, mismatch and skipped reports.
3. Compare counts, totals, paid amounts, balances and Stripe session links before accepting import.
4. Pilot a small reviewed set of non-sensitive, settled records; verify two customer accounts and signed-out guest behavior.
5. Keep legacy billing.eedpower.com serving existing links and webhooks throughout pilot.
6. Only after owner sign-off, route new invoice links to the portal while existing links stay intact.
7. Monitor failed links, payments, webhook reconciliation, support cases and account ownership.
8. Consider retiring legacy viewer only after an independently approved archive and retention plan.

## Stop and rollback
- Stop immediately for wrong-customer documents, duplicate or lost payment, altered invoice totals, broken historical links, or invalid signature history.
- Pause only new routing/imports. Preserve webhook ingestion and reconciliation for already-created sessions.
- Restore prior routing and app checkpoint; do not overwrite transaction records or reverse legitimate Stripe payments.
- Reconcile changed records individually from snapshots, Stripe events and receipts.
- Keep old billing service active until confirmed recovery.

## Acceptance / sign-off
- [ ] Inventory and financial reconciliation complete.
- [ ] Dry-run migration report reviewed, with zero unexplained mismatches.
- [ ] Existing customer links and guest access verified.
- [ ] Pending payment and legal document treatment verified.
- [ ] Pilot customer ownership and mobile testing passed.
- [ ] Rollback rehearsal passed.
- [ ] Explicit owner approval for cutover recorded.
