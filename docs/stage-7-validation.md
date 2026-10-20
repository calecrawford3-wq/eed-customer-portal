# Stage 7 validation and release gate

Status: IN PROGRESS. Do not merge or publish until checked against a test Base44 environment.

## Implemented in this branch
- Re-read machining task statuses before moving a job to assembly.
- Require an override reason and attempt to record it in engine service history.
- Retain override dialog and reason when transition fails.
- Refresh machining station and service-history queries after task actions.
- Prevent deletion of completed or billed/linked machining tasks through planning UI.
- Surface invoice synchronization errors rather than silently ignoring them.
- Archive jobs instead of deleting them from Job Card.

## Must verify against backend and live test data
- ServiceHistoryEntry accepts `machining_override` entry_type and associated fields.
- `completeMachiningTask` creates durable corrections and engine history without duplicates.
- `syncMachiningTaskBilling` is idempotent across retries and simultaneous requests.
- Inventory consumption and purchase-order receiving are idempotent server-side.
- Machining override cannot bypass backend authorization or task validation.
- Archive state preserves customer portal and build-book navigation.
- Labor costs, measurement validation, and profitability snapshot remain consistent.
- Concurrent task edits do not cause lost updates.

## Manual regression checklist
1. Create a test job with two required machining tasks; attempt to advance while one is incomplete. It must refuse without override.
2. Override with a reason. Verify assembly stage, service history entry, and no duplicate entry on retry.
3. Force a failed stage update. Verify dialog remains open and no misleading success toast.
4. Complete, reopen, and correct a machining task. Verify history and station refresh.
5. Try deleting a completed or billed task. It must be blocked.
6. Save and edit a billable task. Verify exactly one invoice line with correct amount after multiple syncs.
7. Simulate invoice-sync failure. Verify visible error and ability to reconcile.
8. Archive a job and verify invoice, build, estimate, and portal references remain intact.
9. Retry inventory consumption and PO receipt; verify stock counts change once.
10. Run `npm run build`, `npm run lint`, and `npm run typecheck`.

**Backend dependency:** This GitHub repository contains the React/Vite frontend; the Base44 server functions invoked above were not located in the checked paths. Client-only checks cannot guarantee exactly-once billing, inventory, or audit integrity. Verify server-side implementations before calling Stage 7 complete.
