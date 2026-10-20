# Stage 7: public-launch security review

Status: **preparation in progress, not approved for public launch**.
In-app Stripe account setup is deferred by the owner. No visibility,
checkout flag, production secret, webhook destination, or old viewer redirect
was changed by this commit.

## Fixed in this pass

- Public bearer-token endpoints reject objects, arrays, numbers, and empty
  credentials before database lookups. A JSON query operator is not a token.
- The legacy invoice API no longer returns raw AppSettings, Customer, Invoice,
  or Engine records. Responses exclude SMTP passwords, Zoho refresh tokens,
  admin override passwords, customer contact/address/serial fields, part costs,
  supplier details, and guest-payment tokens. Display/payment fields needed
  by existing document links are retained.
- Legacy estimate base charges now have field allowlists too. Draft documents
  cannot be retrieved by those endpoints. Engine lookups require customer
  ownership. Comparison stages must belong to one customer.
- Legal-document ID lookups require authenticated, current customer ownership
  or staff access. Token access is restricted to the exact supplied legal
  capability. Owner reads no longer disclose signing tokens.
- Authenticated signing resolves the current stored User-to-Customer link,
  rather than a possibly stale session claim.
- The machining-billing endpoint is staff-only. Its trusted payment callback
  calls an extracted internal core directly. Billing totals use a conditional
  update, preventing a stale sync from overwriting a concurrent payment.
- Seventeen internal workflow/notification/sync endpoints now require staff
  identity or caller-scoped authorization validated by Base44. The check uses
  the ordinary client to read the RLS-protected AppSettings record. It never
  trusts the existence of asServiceRole, request-body roles, token decoding,
  or header presence. If neither authorization path succeeds, it refuses.
- Settings → Billing links to Payment Setup & Launch Checks, so staff no
  longer need to remember the migration page URL.

## Configuration-data exposure review

The old invoice endpoint returned the full AppSettings record. That schema
can contain smtp_password, po_smtp_password, zoho_mail_refresh_token, and
admin_override_password. Source inspection cannot establish whether any
credential was populated or actually retrieved. Review access logs and rotate
any populated credentials that could have been returned. Do not publish keys
or credential values in the review report.

## Blocking reviews still open

1. **Stripe configuration and actual runtime verification.** Stage 6 local
   tests pass, but signed test deliveries, deployed atomic-update semantics,
   failed conversion recovery, payment methods/fees, and provider mode remain
   unverified. Existing billing remains the live payment surface.
2. **Caller-scoped automation authorization on Base44.** Open Settings →
   Billing → Payment Setup & Launch Checks and click Verify Workflow Access.
   This performs a read-only backend-to-backend probe. Then run one safe test
   workflow and one backend-to-backend call in a test environment. Confirm
   platform service tokens can perform the ordinary-client protected read.
   If the platform strips caller Authorization, the new guard fails closed;
   use a documented verified service-caller mechanism rather than restoring
   the old anonymous fallback. Check scheduled task health after publishing.
3. **Vendor purchase-order links.** New emails now use stored random tokens
   expiring after 90 days. GET only displays confirmation; POST validates the
   capability and conditionally advances status without regressing received,
   partial, or cancelled orders. Legacy predictable links remain compatible
   only on records without a new token or expiry. Before public launch, resend
   outstanding orders with new links and set ALLOW_LEGACY_PO_LINKS=false.
   Verify the deployed /functions/acknowledgePO route in a safe test order.
4. **Phone-provider callback.** Correction: receiveVoipSms already authenticated
   against VOIP_MS_API_PASSWORD. It now prefers VOIP_SMS_WEBHOOK_SECRET; once
   set, the old password is rejected. Leave the new secret unset until the
   VoIP.ms callback URL can be updated together with it. Existing api_key and
   API_KEY aliases remain supported. GET success/retry returns plain `ok`, as
   required by VoIP.ms callback retry. Raw credentials and message content are
   no longer logged. Failed duplicate reads return 503 without creating a
   message. Existing ID deduplication is not an atomic uniqueness guarantee:
   simultaneous callbacks can still race. Verify real SMS and photo-only MMS
   after publishing. No provider configuration was changed during development.
5. **Legacy viewer security and compatibility.** Its independent schemas,
   public functions, approval routes, snapshots, fees, and signed callbacks
   require the same audit. New portal guest links never accept approval-capable
   legacy tokens, and the viewer cannot be retired while old payments are
   pending.
6. **Remaining function inventory.** The starting inventory had 117 functions;
   this pass adds two read-only authorization probes. This pass fixes the listed public and internal paths, not a
   proof that every function is safe. Audit remaining auth, webhook, email,
   catalog, and external integration routes before launch.
7. **Real customer and guest identities.** Test Customer A versus Customer B
   with direct API requests, an unlinked account, revoked ownership, a signed-
   out guest, revoked/expired guest tokens, and staff preview. UI filtering
   alone is not evidence of isolation.

## Cutover order

1. Finish the blocking reviews and deploy/test without changing visibility.
2. Configure the new Stripe connection and validate in an isolated test
   environment. Do not replace the key used by current billing while testing.
3. Enable authenticated new checkout only after a production configuration
   check and controlled payment verification.
4. Verify signed-out token routes on a public test deployment. Keep staff and
   customer data behind server-side checks.
5. Approve public visibility and guest checkout as separate launch actions.
6. Redirect old billing links only after the equivalent portal routes and
   payment flows work. Keep old webhook recording for its in-flight payments.
7. Retire snapshot sync and the viewer only after old sessions and pending
   bank payments are settled and compatibility has been verified.

Rollback: disable new session creation and restore the legacy billing handoff.
Do not disable recording for sessions that already charged a payer.
