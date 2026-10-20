# Stage 6: portal payment implementation and cutover

## Current status

New portal and guest checkout share one recorder: `portalStripeWebhook`.
This is preparation for cutover, not proof of a successful live deployment.
No Stripe endpoint, visibility setting, or production secret was changed by
this code commit. Existing billing routes and payment callbacks remain active.
New sessions are tagged `eed_portal_v1`. Legacy main-app handlers explicitly
ignore that source, and the new recorder ignores legacy sessions.

The new checkout initially supports card payments. It adds no customer
processing surcharge. Existing billing still provides its current payment
methods/fees until cutover. ACH/Affirm availability and fee policy must be
decided and tested before retiring that surface. The new recorder already
handles delayed-success notifications and refuses unpaid completions.

Staff tools: `/PaymentMigration`. Its configuration report is read-only.
Reconcile only accepts new portal sessions, retrieves them from Stripe, and
reuses the same receipt writer. It never accepts a payment amount.

## Configuration

| Setting | Purpose |
| --- | --- |
| PORTAL_STRIPE_SECRET_KEY | Separate provider key for the new integration. Do not replace the legacy STRIPE_SECRET_KEY during testing. |
| PORTAL_STRIPE_WEBHOOK_SECRET | Signing secret for the new endpoint, separate from the legacy signing secret. |
| PORTAL_STRIPE_TEST_CUSTOMER_ID | Required in test mode. Only this customer's documents can receive test payments. Use disposable test records in an isolated test app. |
| PORTAL_BASE_URL | Trusted HTTPS app origin. Never derived from a request Origin header. |
| PORTAL_STRIPE_RECORDING_READY | Keep false until the endpoint is configured. Enable in the isolated test environment to perform runtime tests. |
| PORTAL_PAYMENTS_ENABLED | Keep false in production until cutover checks pass. Controls authenticated in-app checkout. |
| GUEST_CHECKOUT_ENABLED | Keep false in production. Requires the other portal gates as well. |

Do not enter keys into source files or chat. Use Base44's secret settings.
The readiness page reports configuration booleans, never secret values.
The code does not declare or change app visibility.

## Endpoint and event contract

Proposed custom-domain endpoint:
`https://portal.eedpower.com/api/functions/portalStripeWebhook`.
Verify Base44's actual published function URL and anonymous Stripe delivery;
the configuration report alone cannot prove that the private app's edge
allows delivery. Configure snapshot events for:

- checkout.session.completed
- checkout.session.async_payment_succeeded

Use that endpoint's own signing secret. A raw signed body is mandatory.
The handler retrieves the Session from Stripe, checks app identity, mode,
currency, paid status, document reference, and quoted principal amount.
It records only USD one-time payments whose principal equals the actual
charge. A redirect, receipt-page query, or old sync body never credits funds.

Do not disable webhook recording when disabling checkout creation.
Already-paid/in-flight sessions must still be delivered and reconciled.
Keep the old viewer and its callbacks running for old sessions, including
pending bank payments. Never feed a legacy session into the new recorder
by changing its metadata.

## Recording and recovery

Invoice receipts and balance fields are written in one conditional
`updateMany`. The query matches the previous payments, amount, total,
credits, status, and update timestamp. Concurrent changes require a reread.
Receipt IDs include both Session and PaymentIntent IDs. Real overpayments
remain recorded in amount_paid rather than being silently discarded.
They require staff reconciliation/refund review.

Estimate conversion uses a persistent claim before invoice creation.
An ambiguous create failure retains the claim. No timeout steals it.
If an invoice committed, staff reconciliation finds it by estimate/customer
and resumes. If no invoice exists, staff must investigate the failed create
and prepare/link one before retrying. Multiple linked invoices or inconsistent
historical payment totals stop for review instead of guessing.

Selected option package prices become fixed invoice service charges;
discounts, shipping, tax, credits, machining, and due-on-completion survive
conversion. Jobs are linked with addToSet, and legal-document links are
repaired on replay. The recorder does not approve work or deduct inventory.
Existing approval/deposit workflows remain responsible for job activation.

## Required runtime tests before production enablement

Local tests mock Stripe and Mongo-style atomic updates. They do not prove
Base44's deployed conditional-update behavior or a real signature roundtrip.

1. Use an isolated Base44 test app with disposable customer/documents and
   test keys. Keep live keys and real customer balances unchanged.
2. Confirm signed delivery to the published new endpoint and a signature
   rejection with no data changes.
3. Complete a deposit and a full payment. Confirm the exact credited amount,
   one invoice, one receipt, job link, legal link, and deposit status.
4. Replay the same paid event, concurrently deliver it, and concurrently
   deliver two different paid sessions. Check no lost/duplicate receipts.
5. Interrupt invoice preparation and replay through the recovery tool.
   Confirm a committed invoice is reused, and an unknown create never
   automatically creates another invoice.
6. Send an unpaid completed Session followed by delayed success. Only the
   paid status may credit money. Failed/expired returns must not claim paid.
7. Verify cross-customer and revoked guest-link receipt checks fail closed.
8. Verify cash/check receipts still reconcile normally, and their pending
   intentions do not mark anything paid.
9. Confirm old emailed links, old checkout returns, pending bank payments,
   and both old callbacks remain functional. The new handler must ignore
   them, and old handlers must ignore the new source.
10. Review enabled payment methods, surcharge policy, refunds/disputes,
    pending machining billing, deposit workflow health, and any invoices
    with preexisting inconsistent payment arrays before switching traffic.

Only after those checks should production keys, signing secret, recording
readiness, and authenticated checkout be enabled. Public visibility and
guest launch remain a separate Stage 7 decision after the full public-route
security audit. To roll back, disable new session creation and restore the
existing billing handoff; retain both recorders for their in-flight sessions.
