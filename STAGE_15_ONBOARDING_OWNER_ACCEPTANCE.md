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
