# Stage 12: Security, customer workflow and mobile acceptance
Status: CODE TESTS AUTOMATED; LIVE ACCEPTANCE NOT EXECUTED.
No production deployment, payment activation, invitations, or customer notifications were performed.

## Customer isolation and security (launch-blocking)
- [ ] Create two separate customer accounts A and B with distinct email addresses and engine records.
- [ ] A can view only A's builds, invoices, estimates, credits, legal documents, findings and shared photos.
- [ ] From A, request B's build ID, invoice ID, finding ID and approval ID via normal portal controls and direct API requests. All cross-account requests must fail without disclosing private data.
- [ ] Change stored customer_id after signing in. Confirm stale session claims cannot retain access to the previous customer.
- [ ] An unlinked user sees no customer documents or staff records.
- [ ] Admin preview may select customers, but customers cannot send customer_id overrides.
- [ ] Inspect network responses for internal costs, margins, measurements, private notes, private photo file_uris, tokens, Stripe keys, and temporary passwords. None may be present.
- [ ] Confirm private FindingPhoto records are never signed for customer or public links. Only explicitly shared photos appear.
- [ ] A finding attached to the wrong job must not appear through a cross-job approval link.
- [ ] Confirm expired/revoked guest payment links cannot read a document or initiate checkout.
- [ ] Confirm guest payment links cannot approve estimates, authorize additional work, or create a login.
- [ ] Verify public approval links do not expose internal data and cannot authorize a changed version.
- [ ] Verify RLS on all source entities in deployed Base44, not just frontend route hiding.
- [ ] Verify request rate limits and audit logs for public token and auth endpoints.

## End-to-end workflows
- [ ] Customer sign-up, email verification, sign-in, sign-out and password reset work on the real portal domain.
- [ ] Customer sees engine build progress, public build tasks and safe findings, never internal shop notes.
- [ ] Estimate approval or rejection works and does not create duplicate jobs/invoices.
- [ ] Additional work approval/decline works once per current version; revised work requires new approval.
- [ ] Shared photos display; private photos remain hidden, including in printable build books.
- [ ] Card/ACH/Affirm quotes, fees, deposit, invoice payment, pending settlement and receipts pass Stage 8/9 checklist.
- [ ] Email and SMS preferences, opt-out, retry, delivery history and invite flows pass Stage 11 checklist.
- [ ] Test legacy billing links and documents without breaking old customer access.
- [ ] Test no-network, expired session, double-tap, refresh during submission and interrupted checkout.

## Mobile devices
- [ ] iPhone Safari at 320, 375 and 430 CSS pixel widths; Android Chrome at 360 and 412 CSS pixel widths.
- [ ] Portrait and landscape: no horizontal page overflow, clipped buttons or inaccessible form fields.
- [ ] Portal navigation tabs wrap or scroll without obscuring content.
- [ ] Engine progress, findings photos, approval dialogs, estimate/invoice line items and print/PDF previews are usable.
- [ ] Payment method selection, fee totals, checkout redirect and return to portal work on iPhone and Android.
- [ ] Onscreen keyboard does not obscure submit buttons; touch targets are comfortable and not crowded.
- [ ] Error messages are readable and visible to screen readers; zoom to 200% does not hide essential controls.
- [ ] Validate external invoice PDF links, opening in a new tab, printing and downloads.
- [ ] Confirm Safari private browsing and installed PWA do not accidentally cache sensitive documents.
- [ ] Test slow cellular data and retry/reconnect behavior.

## Test evidence / owner sign-off
- [ ] Capture pass/fail, test account IDs, browser/device, screenshots and reproducible failures. Never save full payment details or secrets.
- [ ] Re-run automated tests and live acceptance after any high-risk fix.
- [ ] Confirm remaining Stage 8–11 owner checklists have been completed.
- [ ] No critical or high-severity security defects remain.
- [ ] Explicit owner authorization before Stage 13 publish or production activation.

## Code audit results
- Hardened getPortalBuildBook to require stored customer ownership, match job ownership, and remove legacy photo arrays/private notes from responses.
- Hardened getPortalData to use the durable stored customer ownership link, not stale session claims.
- Added defense-in-depth filters to customer findings and approval photo serialization.
- Set no-store headers on customer build books, findings and public approval response.
- Added automated security regression tests. These do not replace deployed RLS, browser, or live concurrency testing.
