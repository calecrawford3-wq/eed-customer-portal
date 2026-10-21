# Elite database integrity work for Base44

This document is a database-layer handoff. Do not enforce these by a client-side `filter` followed by `create`: that pattern is race-prone. Review existing production records for duplicates before adding constraints. Do not delete or merge any records automatically.

## 1. Job identity and number allocation (highest priority)

- A Job represents one service visit, **not** a permanent one-job-per-engine record. The same customer engine can have multiple sequential jobs. `ensureJobForEngine` currently returns the first Job with matching `customer_engine_id`, including old picked-up jobs; fix lifecycle-aware lookup so a new check-in creates a new visit without hijacking history.
- Guarantee at most one Job for a given nonempty `estimate_id`, including simultaneous `reconcileJobFromEstimate` calls. Use a unique partial index/constraint, atomic upsert, or a server-side transaction.
- For engine-only check-in, introduce a unique **check-in/visit identifier** (not `customer_engine_id` alone), and atomically upsert by that identifier. Define visit creation on check-in and close it at pickup.
- `maxJobSeq` in `shared/jobLifecycle.ts` and `ensureJobForEngine` currently scans job numbers and adds one. Replace with an atomic counter/sequence or UUID-backed collision-safe allocator; preserve existing JOB-nnnnnn labels. Add unique constraint on nonempty `job_number`.
- Test two concurrent creates for the same estimate/visit, two distinct concurrent visits, and repeat check-in of an engine after a prior pickup.

## 2. Machining completion and service history

- Enforce one `ServiceHistoryEntry` for each nonempty `(entry_type='machining_task', source_id=MachiningTask.id)` at the database level. Do not use an ordinary check-then-create alone.
- Atomically claim first completion, create/upsert the history row, and link `history_entry_id`. On partial failure, retry must repair a completed task with missing history/link; never silently treat it as a completed correction without history.
- Preserve all correction audit entries on concurrent edits (compare-and-set/transaction or append-only correction events). Concurrent writes must not lose corrections.
- Test simultaneous first completions, replay after history creation but before task link, replay after task status update but before history creation, and concurrent corrections.

## 3. Inventory reservation guarantees

- Add unique constraint on active reservation per `(estimate_id, part_id)` or implement an atomic upsert that cannot duplicate active reservations. Preserve consumed/released history.
- Verify `Part.reservation_lock` compare-and-set and stale-lock recovery under actual Base44 storage semantics; the application currently uses `updateMany` and checks the lock value.
- Test simultaneous approvals of the same estimate, approvals of different estimates competing for one part, approval withdrawal during reservation, part removal, partial PO receipt, repeated receipt webhook, and build completion retries.
- Invariant: total active reserved per part <= on-hand, except explicitly modeled shortages; never deduct physical stock twice.

## 4. Guest-payment email cooldown

- `sendPublicGuestPaymentEmail` uses a conditional `updateMany` to claim a send slot. Verify Base44 returns a reliable `updated` count for this entity and predicate, especially when `guest_payment_email_sent_at` is absent.
- On mail-provider failure, decide whether the cooldown remains (safe anti-spam behavior) or allow a controlled retry. Avoid issuing multiple emails in parallel.

## 5. Migration / deployment

1. Export backups and audit duplicates without modifying records.
2. Resolve duplicates with owner review, preserving invoice/payment and engine history links.
3. Add database guarantees and atomic sequences/upserts.
4. Update server functions to use those guarantees, add concurrency integration tests, then stage and publish.

## Separate TypeScript debt

`npm run typecheck` currently reports 5,492 errors, mostly legacy JSX prop typing. `npm run lint` and `npm run build` pass. Do not disable `checkJs` or exclude entire pages to artificially report a clean typecheck. Fix component typing and generated declarations incrementally.
