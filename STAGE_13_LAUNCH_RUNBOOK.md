# Stage 13: Controlled launch and rollback runbook
Status: PREPARED, NOT AUTHORIZED TO DEPLOY. Owner sign-off and real-world acceptance are outstanding.
Prepared from the Stage 8–12 checklists. Never assume automated tests replace live provider tests.

## 0. Release constraints
- No production publish, custom-domain switch, live payment enablement, bulk invites, customer notifications or legacy-billing redirect without explicit owner approval.
- Preserve billing.eedpower.com and all historical invoices and outstanding payment links until Stage 14 cutover is separately approved.
- Treat any incorrect customer data exposure, duplicate charge/credit, lost paid invoice or unauthorized approval as a launch stopper.
- Test Stripe and live Stripe credentials, webhooks, session IDs and data must remain isolated.

## 1. Evidence required before go/no-go
- [ ] Owner signs off on STAGE_8_9_OWNER_ACCEPTANCE.md, including signed webhook delivery, ACH pending/settled, duplicates, concurrent payments, and recovery.
- [ ] Owner signs off on Stage 10 findings approval/revision and invoice/job synchronization evidence.
- [ ] Owner signs off on STAGE_11_OWNER_ACCEPTANCE.md for invite delivery, email/SMS opt-out, retries and concurrent notifications.
- [ ] Owner signs off on STAGE_12_OWNER_ACCEPTANCE.md for two-account isolation, private photos, deployed RLS and iPhone/Android tests.
- [ ] Stripe account ID, business name, live mode, merchant fee terms and registered webhook destination verified in Stripe dashboard.
- [ ] Custom domain HTTPS certificate, login redirects, callback URLs and mail sender identity verified.
- [ ] Snapshot/export critical invoices, estimates, customers, jobs, payments, guest tokens and settings; confirm rollback/recovery owner and access.
- [ ] Record Base44 restore checkpoint and current deployed version; confirm rollback procedure on a non-production environment.
- [ ] Reconcile all in-flight Stripe sessions and pending ACH before switching any payment routes.
- [ ] Confirm staffed monitoring window, support contact and customer communications are prepared.
- [ ] Owner explicitly approves deployment scope, date and pilot population.

## 2. Read-only preflight
- Open admin Settings → Payments and run **Run Launch Preflight**.
- Also run **Test Connection** and **Check Payment Readiness**.
- Preflight only reports configuration; it deliberately returns safe_to_publish=false and live_launch_authorized=false until manual release occurs outside this endpoint.
- Review all blockers and the acceptance evidence. Never use a single environment flag as proof of runtime validation.
- Record preflight date/time, app checkpoint, Stripe account ID privately, tester and outcome. Do not paste credentials into the log.

## 3. Pilot rollout after explicit approval
1. Publish only the owner-approved code version. Do not redirect old billing.
2. Validate staff sign-in, app domain, customer profile linking and two-customer isolation on the published deployment.
3. Invite only a small owner-approved pilot cohort. No automatic bulk invitations.
4. Validate estimate → customer approval → findings → revised approval → job/invoice, with no duplicated records.
5. Verify card and ACH test transactions in the proper Stripe environment and reconcile receipt amounts to invoice principal; enable live checkout only after production account/webhook verification and explicit owner authorization.
6. Test guest payment without granting approval rights. Verify live checkout return and webhook processing.
7. Enable notification automations only when owner-approved and after delivery/opt-out tests.
8. Observe logs and reconcile invoice totals, provider sessions, duplicate webhooks, errors, delivery failures and customer complaints before widening the pilot.
9. Record pilot go/no-go and only then plan wider customer access. Retain legacy billing until Stage 14.

## 4. Stop / rollback criteria
Immediately stop expansion for:
- Any cross-customer exposure, leaked internal notes/private photos/tokens, or privilege escalation.
- Any successful payment not recorded, duplicate charge/receipt, incorrect balance, or Stripe webhook verification failure.
- Any repeated invite/notification delivery without consent, or wrong-recipient email/SMS.
- Any broken login, checkout, invoice approval or guest link affecting pilot customers.

Rollback sequence (owner/authorized admin):
1. Pause new portal checkout and guest checkout using the server-side gates; do not delete webhook secrets or disable webhook receipt of in-flight sessions.
2. Pause new invites, bulk notifications and pilot expansion. Keep support channels open.
3. Preserve provider event IDs, invoice snapshots, app logs and failed request identifiers.
4. Reconcile already-paid and pending transactions through the signed Stripe event/reconciliation flow. Never mark paid based on browser redirects.
5. Restore the last verified Base44 checkpoint or previously approved deployed version only after evaluating database/schema compatibility; code rollback alone does not undo data changes.
6. Keep legacy billing links working. Notify affected pilot customers if appropriate.
7. Retest ownership, payments, and delivery before seeking fresh approval to resume.

## 5. Release record (fill in when tests happen)
- Planned deployment date and window:
- Approved Base44 checkpoint / deployed version:
- Approving owner and timestamp:
- Pilot customer IDs (internal reference only):
- Stripe mode / verified account (redacted):
- Signed webhook test result and event IDs:
- Two-customer security and mobile test evidence:
- Backups and rollback rehearsal evidence:
- Outstanding defects and severity:
- Go/no-go decision:
- Post-pilot reconciliation and incident notes:

## 6. Stage 14 handoff
Only after Stage 13 pilot sign-off, plan a separate legacy billing migration/redirect with inventory of old URLs, unpaid invoices, pending payments, customer bookmarks and reversible routing. No redirects were implemented by this Stage 13 preparation.
