# Inventory Audit System Plan (Leak Detection)

## 1) Goal

Introduce a safe inventory audit system that detects unexplained discrepancies ("утечки данных/остатков") without breaking existing flows.

Requested product result:

- separate admin section with audit statistics and reports,
- dashboard status: everything OK vs discrepancies found,
- automatic audit every day (safe mode),
- manual run by button,
- strict preservation of current functionality and data integrity.

## 2) Current Project Reality (important constraints)

Based on current code and data model:

- inventory state is distributed across:
  - `Item.total`, `Item.inRepair`, `Item.broken`, `Item.missing`,
  - active orders (`ISSUED`, `RETURN_DECLARED`) and reserved quantities,
  - incident/loss lifecycles (`Incident`, `LossRecord`).
- stock-changing operations are already transactional in critical routes:
  - check-in transition to incidents/losses,
  - incident repair/utilize,
  - loss found/write-off.
- reminders already use protected cron endpoint style (`x-cron-token`) in `src/app/api/reminders/run/route.ts`.

This allows adding audits as read-mostly, low-risk logic.

## 3) Product Scope (final behavior)

## 3.1 Admin Section (new)

New admin page, for example:

- `/admin/inventory-audit`

Contains:

- current overall health badge (`OK` / `WARNING` / `CRITICAL`),
- last auto-check time and result,
- button `Запустить проверку сейчас`,
- list of snapshots/check runs,
- detailed discrepancy table with filters:
  - all / warnings / critical,
  - by item,
  - by category/state.

## 3.2 Dashboard Signal

In Wowstorg dashboard:

- compact status block:
  - `Весь реквизит в норме` (green),
  - or `Есть расхождения: N` (red/amber),
- link to audit page.

No blocking behavior; informational + operational navigation only.

## 3.3 Scheduling

- auto-check every day via protected cron endpoint,
- manual trigger from admin button,
- both use same audit service (single source of truth).
- duplicate protection:
  - advisory lock in cron handler prevents parallel runs,
  - "one run per Omsk day" guard skips duplicate triggers.
- retention cleanup:
  - old runs are auto-deleted after retention window (`INVENTORY_AUDIT_RETENTION_DAYS`, default 21),
  - detailed rows are removed via FK cascade together with run headers.

## 4) Data Model Additions (safe, additive)

Add dedicated audit tables (no destructive changes to existing models):

1. `InventoryAuditRun`
   - `id`
   - `kind` (`AUTO` | `MANUAL`)
   - `status` (`OK` | `WARNING` | `CRITICAL` | `FAILED`)
   - `startedAt`, `finishedAt`
   - `createdByUserId?` (for manual runs)
   - `summaryJson` (counts, totals, high-level metrics)
   - `errorText?`

2. `InventoryAuditItemResult`
   - `id`
   - `runId` (FK)
   - `itemId`
   - `severity` (`OK` | `WARNING` | `CRITICAL`)
   - `expectedJson`
   - `actualJson`
   - `deltaJson`
   - `explanationJson` (resolved reasons / unresolved reasons)

3. Optional `InventoryAuditSnapshot` (if baseline snapshots are required as separate entity)
   - can be omitted in v1 if run itself stores computed baseline+actual.

Why additive tables:

- keeps current order/inventory logic untouched,
- easy rollback by ignoring audit features,
- no coupling to transactional operational paths.

## 5) Core Audit Algorithm (v1, deterministic)

For each active inventory item (`internalOnly=false`, `isActive=true`):

Compute `actual` from `Item` buckets:

- `total`
- `inRepair`
- `broken`
- `missing`
- `baseAvailable = max(0, total - inRepair - broken - missing)`

Compute `operational context`:

- `reservedNow` from existing reserve logic (`getReservedQtyByItemId`),
- `inRentNow` from orders with statuses `ISSUED` / `RETURN_DECLARED`,
- open incidents/losses aggregates.

Compute `expected` invariants:

1. Bucket non-negativity:
   - each bucket must be `>= 0` (critical if violated).
2. Bucket consistency:
   - `inRepair + broken + missing <= total` (critical if violated).
3. Availability consistency:
   - `baseAvailable` equals formula result.
4. Optional stronger checks:
   - impossible states between open incident/loss quantities and bucket sizes.

Classification:

- `CRITICAL` for impossible arithmetic/state,
- `WARNING` for suspicious but possible drift (example: open-loss totals near bucket limits),
- `OK` otherwise.

Important:

- v1 does **not** mutate data.
- v1 does **not** auto-fix.
- v1 is read-only analytics + diagnostics.

## 6) Why this is safe

System does not alter existing flows:

- no changes to order lifecycle transitions,
- no changes to reserve algorithm behavior,
- no changes to check-in business rules.

All audit logic is isolated:

- separate service layer,
- separate API routes,
- separate DB tables.

## 7) API Design

## 7.1 Manual Run

- `POST /api/admin/inventory-audit/run`
  - role: WOWSTORG
  - creates run, computes results, stores run+items, returns summary.

## 7.2 Last Status

- `GET /api/admin/inventory-audit/status`
  - role: WOWSTORG
  - returns latest run summary for dashboard.

## 7.3 Runs List

- `GET /api/admin/inventory-audit/runs?limit=...`

## 7.4 Run Details

- `GET /api/admin/inventory-audit/runs/:id`

## 7.5 Auto Cron

- `POST /api/admin/inventory-audit/cron`
  - protected by header token (`x-cron-token`) similar to reminders route,
  - triggers same service with `kind=AUTO`.

## 8) UI Design Notes

## 8.1 Admin Page

Main blocks:

- current status card (big),
- manual run button + running state,
- timeline/list of runs,
- discrepancy table with severity badges.

Table columns:

- item name,
- severity,
- expected summary,
- actual summary,
- delta,
- explanation (human-readable).

## 8.2 Dashboard

Compact card in Wowstorg dashboard right column:

- badge `OK` / `WARNING` / `CRITICAL`,
- last check timestamp,
- CTA: `Открыть аудит`.

## 9) Rollout Plan (no-risk sequence)

Phase 1: Data + Service (hidden)

- add migrations for audit tables,
- implement service with unit tests,
- no UI exposure.

Phase 2: Protected APIs (hidden)

- manual run/status/details endpoints,
- cron endpoint.

Phase 3: Admin UI

- build page under `/admin/...`,
- show run history and detail.

Phase 4: Dashboard status

- add compact status card only after API proves stable.

Phase 5: Ops enablement

- schedule cron daily (off-peak Omsk time),
- monitor first weeks.

## 10) Risks and proactive mitigations

1. False positives

- Mitigation:
  - start with strict arithmetic invariants only,
  - mark uncertain cases as `WARNING`, not `CRITICAL`.

2. Heavy queries on large data

- Mitigation:
  - batch aggregation,
  - indexed foreign keys (`itemId`, `runId`),
  - limit details pagination.

3. Concurrency during live operations

- Mitigation:
  - compute with "as-of now" semantics,
  - store run timestamps,
  - avoid long transactions.

4. Operational confusion

- Mitigation:
  - clear severity definitions,
  - explanatory texts per discrepancy type.

## 11) Test Plan (mandatory before enabling dashboard signal)

Functional:

- manual run success on clean data,
- auto cron authorization and execution,
- dashboard shows latest status correctly.

Integrity:

- simulated underflow/invalid bucket -> `CRITICAL`,
- normal active rentals do not produce false criticals.

Performance:

- run time on production-like dataset within acceptable threshold.

Regression:

- order creation/edit/check-in/repair/loss flows remain unchanged.

## 12) Acceptance Criteria

Feature is accepted when:

- admin can run audit manually and see full report,
- auto-run executes daily and stores results,
- dashboard displays current audit health,
- existing core flows are unaffected,
- no data mutations are performed by audit logic,
- critical mismatches are detectable and traceable.

## 13) Out of scope (v1)

- automatic corrective actions,
- realtime push alerts,
- cross-warehouse multi-tenant segmentation,
- predictive anomaly models.

These can be added safely in v2 after stable v1 operation.

## 14) Flow Coverage Matrix (explicit)

This matrix explicitly maps all requested issuance/return flows to audit checks.  
Key principle: audit is not tied to UI path; it validates final state invariants that every flow must satisfy.

### 14.1 Quick issuances (both sides)

- Coverage point:
  - active orders are included in `reservedNow` (`getReservedQtyByItemId`) for today,
  - bucket arithmetic (`total`, `inRepair`, `broken`, `missing`) is validated after each run.
- Detects:
  - impossible bucket states after quick issuance/cancel/check-in chains,
  - bucket under-allocation relative to open incidents/losses.

### 14.2 Issuance to third parties (external customers)

- Coverage point:
  - same order-status based reservation and open-loss/open-incident aggregation,
  - no dependency on `greenwichUserId`; customer type does not bypass checks.
- Detects:
  - drift in missing/repair buckets after external order returns,
  - arithmetic inconsistencies independent of actor side.

### 14.3 Issuance to Greenwich done manually by Wowstorg

- Coverage point:
  - audit relies on stored operational facts (order status + item buckets), not initiator UI,
  - open incident/loss invariants are checked identically.
- Detects:
  - mismatches caused by manual operational updates,
  - undercounted repair/loss buckets against unresolved records.

### 14.4 Standard Greenwich issuance by request

- Coverage point:
  - request/approval/issuance lifecycle converges to same tracked states used by audit,
  - reservation today + bucket consistency are verified.
- Detects:
  - post-check-in inconsistencies (including delayed return processing effects),
  - invalid sums `inRepair + broken + missing > total`.

## 15) Flow-specific test checklist (mandatory)

For each of 4 flows above, execute scenarios:

1. open -> issued
   - expect no critical when buckets are valid.
2. issued -> return declared -> check-in clean
   - expect bucket consistency and `OK`/`WARNING` only.
3. issued -> check-in with incident/loss
   - expect open incident/loss reflected by minima checks.
4. issued -> cancel (where allowed by flow)
   - expect no residual impossible states.
5. mixed same-item overlap across flows
   - expect reservation arithmetic remains consistent (no false `CRITICAL`).

Pass condition:

- no regressions in existing order logic,
- audit results reproducible and explainable for each scenario.

