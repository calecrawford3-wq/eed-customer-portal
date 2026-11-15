// Shared customer/staff copy for identity verification. Kept in one place so the
// wording never drifts into claiming an SSN or credit check.
export const IDENTITY_SETUP_GUIDANCE = 'Identity verification needs Stripe Identity enabled on the connected Stripe account before in-house financing can be approved or activated. '
  + 'In the Stripe dashboard open Identity (Verify) and complete the platform setup, then use "Check availability". '
  + 'If Identity is not available on this account, do not approve or activate in-house financing: either enable it, or record a documented owner exception after completing an alternate lawful verification outside this system.';

export const IDENTITY_NOT_A_CREDIT_CHECK = 'A document and selfie check confirms who the borrower is. It is not an SSN check, not a credit check and not a creditworthiness decision.';