# Stage 11: Customer onboarding and notification acceptance
Status: PENDING OWNER / LIVE ENVIRONMENT TESTS. No messages or invitations were sent by this development pass.

## Onboarding
- [ ] Create a customer without an email. Confirm no invitation is sent and the portal access badge says No email.
- [ ] Create a customer with an email. Confirm the app does not automatically email or invite them without staff action.
- [ ] Open that customer's Portal Access badge and select Invite. Verify a real invitation is delivered, login works, and the correct customer record links to the account.
- [ ] Resend an invitation to an unactivated customer. Confirm the customer can sign in and that the badge updates correctly.
- [ ] Try an existing active account. Confirm it does not create a second login.
- [ ] Try two customers with the same email. Confirm the invitation is blocked until the duplicate is resolved.
- [ ] Change a customer's email in another tab before inviting. Confirm stale email input is rejected.
- [ ] Simulate email delivery failure. Confirm the badge does not incorrectly mark the customer invited.
- [ ] Sign in as a normal customer and attempt staff invitation and signup-email endpoints. Both must deny access.
- [ ] Verify password reset, email verification, mobile Safari, and custom domain /login return path.
- [ ] Verify the customer's engines, estimates, invoices, and findings are visible, but another customer's data is not.

## Customer notifications
- [ ] Set each event to Off, Ask Me, and Automatic in Settings. Verify all three behaviors for estimate ready, additional work, stage change, and completion.
- [ ] Verify email delivery from the configured sender and SMS from the configured VoIP.ms number.
- [ ] Confirm customer SMS opt-out blocks texts even if a staff member requests SMS.
- [ ] Confirm missing or malformed email/phone causes a clear skip or error without reporting successful delivery.
- [ ] Retry a successful event. Confirm it does not send again.
- [ ] Retry a failed email or SMS. Confirm only the failed channel is attempted.
- [ ] Force two simultaneous sends for one event. Confirm only one delivery per channel. This is a launch-blocking concurrency check.
- [ ] Verify link destinations for estimates, additional-work approval, job progress, and completion on mobile.
- [ ] Confirm notification history shows correct delivery statuses and customer, with no leaked internal notes.
- [ ] Confirm any automatic notification sends happen only after the underlying customer-visible event is committed.

## Backfill / bulk invites
- [ ] Run backfill without confirm_send. Confirm preview-only, zero sends.
- [ ] Review target customer list and approve a limited batch before explicitly sending. Never run an unreviewed bulk invite.
- [ ] Verify completed/shipped build filtering, no-email skip, already-invited skip, and batch cap.

## Release
- [ ] Confirm production sender identity and SMS delivery.
- [ ] Obtain explicit owner approval before enabling automatic customer notifications, sending bulk invites, or publishing.
