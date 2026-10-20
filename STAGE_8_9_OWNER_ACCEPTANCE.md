# EED Customer Portal: Stage 8–9 owner acceptance tests
Status: NOT EXECUTED. Development tests are not Stripe runtime verification.
Do not enable production checkout until these tests pass.

## Stage 8: Stripe connection and fee settings
- [ ] Log in as an admin; confirm Settings → Payments is admin-only.
- [ ] Add portal Stripe test secret and signed webhook secret in Base44 secure environment (not AppSettings).
- [ ] Confirm the connected Stripe account ID and business name match Elite.
- [ ] Confirm webhook endpoint URL and event coverage for checkout.session.completed and checkout.session.async_payment_succeeded.
- [ ] Run Test Connection and Check Payment Readiness. Record screenshots and actual results.
- [ ] Set PORTAL_STRIPE_TEST_CUSTOMER_ID to a dedicated non-production test customer.
- [ ] Verify card checkout on a test invoice and an estimate deposit.
- [ ] Verify ACH eligibility, bank authorization, delayed settlement, failure and success notifications.
- [ ] Verify Affirm eligibility, merchant agreement, checkout and final payment status.
- [ ] Check that fee quote is shown before redirect and exactly matches Stripe's charge.
- [ ] Confirm no debit-card surcharge and no unapproved Affirm surcharge.
- [ ] Confirm ACH fee policy and cap with Stripe and applicable legal/payment terms before enabling pass-through.
- [ ] Confirm production domain, success/cancel URLs, old invoice links and mobile Safari.
- [ ] Confirm secrets are never returned in API responses, displayed in Settings or accessible to customers.
- [ ] Leave production payment flags off until all checks are signed off.

## Stage 9: Payment recording
- [ ] Stripe test: deposit paid once, creates/links exactly one invoice, marks deposit correctly.
- [ ] Stripe test: full balance paid, zero balance, no duplicated credits or notifications.
- [ ] ACH pending: no invoice credit before Stripe confirms payment_status=paid.
- [ ] ACH failed: no invoice credit; failed status displayed.
- [ ] Resend same signed webhook several times; exactly one receipt is recorded.
- [ ] Send separate successful payments concurrently; both credits survive.
- [ ] Attempt stale invoice/estimate checkout after staff edits; new checkout must reject stale quote.
- [ ] Complete an older session after balance changes; receipt must not be lost; any overage flagged for staff review.
- [ ] Trigger interruption after estimate invoice creation; staff reconciliation recovers without duplicate invoice.
- [ ] Verify cash/check staff entries still work and guest intent cannot mark an invoice paid.
- [ ] Confirm processing fee is tracked separately and amount_paid equals invoice principal only.
- [ ] Confirm admin-only reconciliation and cross-customer denial in two independent customer accounts.
- [ ] Confirm Base44's real updateMany supports conditional matching, atomic $set and $addToSet under concurrency.
- [ ] Confirm live/test Stripe isolation and legacy billing integration stay intact.
- [ ] Record Stripe Session IDs and screenshots for each pass; redact all customer and payment secrets.

## Launch gate
- [ ] Owner verifies each result.
- [ ] No known high-severity issues remain.
- [ ] Explicit approval to deploy and enable live payment flags.
