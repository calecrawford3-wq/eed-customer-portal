# Customer onboarding: owner acceptance checklist

## Implemented increment: invitation navigation
- [ ] Send a fresh invitation to a customer without an existing Base44 login. Verify the branded Create your portal password screen opens.
- [ ] Register and complete Base44 OTP verification. Confirm sign-in and return to the portal.
- [ ] Send invitation to an existing registered customer. Use Sign In; confirm no duplicate account or password reset.
- [ ] Send an invitation with an intended /CustomerPortal?document=estimate&id=... destination. Confirm it opens only after authentication and ownership checks.
- [ ] Verify unsupported, cross-origin, or non-portal redirect destinations are ignored.
- [ ] Confirm email addresses in the invitation are instructions, not proof of customer ownership.
- [ ] Confirm actual Base44 auth behavior, verification and invitation expiry in the published environment.

## Not yet implemented or verified
- [ ] Secure platform-issued, single-use activation token that automatically recognizes the invited customer. No such token has been confirmed in available app SDK calls.
- [ ] Prefilled email based on server-verified invitation token. Do not use a URL email parameter as identity proof.
- [ ] Resumeable onboarding checklist, racing profile, cars/drivers, track management, tutorial and permanent My Account.
- [ ] Customer A/B API isolation, guest access, mobile and screen-reader acceptance for new profile entities.
- [ ] Stripe and legacy billing launch acceptance remain separate and pending.

Do not publish, switch domains, or enable live payment without explicit owner approval.

## Increment: saved contact and racing profile
- [ ] Verify first/last name, international phone, billing and shipping addresses are prefilled where available and saved to the same customer.
- [ ] Confirm leaving and reopening the setup card retains completed contact and racing data.
- [ ] Confirm required contact details prevent marking contact setup complete, while estimates and payments remain accessible.
- [ ] Confirm optional racing questions can be skipped and resumed.
- [ ] Verify SMS consent is independent of phone entry; no phone verification is claimed.
- [ ] Verify staff sees updated Customer fields, while private shop notes, financial settings and ownership remain unchanged.
- [ ] Verify existing customers can review profile without being forced to create a new login.
- [ ] Perform direct API cross-customer write attempts; confirm stored owner link blocks access.
- [ ] Verify production Base44 accepts the new Customer schema fields.

## Garage, tour, account and security implementation (direct-code increment)
- [ ] As Customer A, create two cars and two drivers, select a primary driver and associate additional drivers.
- [ ] Attempt to link an engine owned by Customer B. Must be rejected, with no engine ownership/workflow change.
- [ ] Associate, replace and remove a Customer A engine. Verify historical PortalCarEngineHistory rows remain and the old association receives ended_at.
- [ ] Upload JPEG, PNG or WebP car photo under 5 MB, save, reload and confirm photo persists. Verify unsupported or oversized photos fail.
- [ ] Archive a car or driver, verify active list hides it and historical record remains for staff.
- [ ] Create the same driver name twice and verify duplicate rejection.
- [ ] Use custom track names and a suggested track; verify values persist after refresh.
- [ ] Review customer racing profile and garage on staff Customer Detail. Confirm staff cannot view other customers through customer-only API calls.
- [ ] Use portal tour Next/Back/Skip/Finish, verify section navigation and replay. Confirm only Finish saves completed flag.
- [ ] Change SMS consent and notification preferences; verify estimate and build-update notices honor them. Invoice preference is stored but transactional billing notices may still be sent.
- [ ] Confirm no customer can write role, pricing, tax-exempt, internal notes, payment status, shop workflow, or engine ownership through profile/garage endpoints.
- [ ] Confirm invite new user, existing user, OTP, password reset, and document return in published Base44 auth environment.
- [ ] Verify cross-account access to cars, drivers and photos, including guest invoice and payment links, with two real test accounts.
- [ ] Verify mobile layout, keyboard navigation, screen reader labels, and production email deliverability.

Automated test results are not a substitute for live published-app authentication, upload, delivery and payment checks. Do not switch production domains or enable live payments without owner approval.
