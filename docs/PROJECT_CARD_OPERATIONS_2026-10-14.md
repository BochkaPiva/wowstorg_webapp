# Project-card operational update · 14.10.2026

## Shipped scope

Estimate-first defaults; optional event builder; full-width default Orders and preserved width when collapsed. Existing explicitly configured module layouts are retained. Contractor rows use compact categories, participation status, contact snapshot, latest conversation and a progressively disclosed internal journal. Edit/remove/board/timing use a single action menu; disabled modules expose no dead-end action. Cancellation preserves communication history and remains reversible.

Order tariffs can be edited from the linked estimate section through the existing protected warehouse-edit API. The catalogue is untouched. A stale timestamp returns 409, reserves and archive/status guards remain transactional, and changed Grinvich terms return for agreement. Quantity-only edits preserve the previous individual tariff. The UI previews shared pricing/discount calculations, saves warehouse comments and exposes Save only for unsaved changes; open/remove/reorder are in one ellipsis menu.

Background contractor changes refresh the roster/history without reloading the estimate. Background project reads retain unsaved context, blockers and other top-level drafts. Project content owns a stacking context below the app header; native contextual menus and fullscreen portals keep their bounded overlay behavior.

## Verification before publication

- `npm run build:verified`: strict local lint 0 errors, full tests and production dependency audit passed; Next production build passed. Local totals include an unrelated unfinished React-debt cleanup and are not candidate-CI totals.
- Focused domain/routes/pricing/popover/default checks: 39 tests passed.
- `project-card-browser-check.mjs`: 1440, 2048 and 390px. Native Edge browser, all APIs intercepted with labelled QA fixtures, no working DB writes. Contractor edit, journal response retry reusing UUID, cancel/restore, stale draft preservation, order tariff save, hidden idle Save, bounded menus, focused estimate below app header, fullscreen return and full-width collapsed Orders passed. No page errors or unexpected API calls.
- All 9 current workspace/communication/tariff captures inspected, then independently reviewed: **ship**. Detector ran once; palette/type-ramp advisories in dense incumbent estimate styles are not a blanket clean result.
- `http-smoke.mjs`: real Next HTTP → Prisma → separate PostgreSQL 17.10 test DB. New module defaults, role boundary, scoped communication, CAS, UUID replay, immutable journal, archive guards, individual tariff/catalogue isolation, reapproval and refreshed estimate read model passed. No Telegram sends or production fixture records.
- Fresh schema comparison: no differences. Fresh access check: 91 public tables, 0 unprotected, 0 Data API accessible, 0 public API-callable routines. Candidate CI repeats on PostgreSQL 17.11.

## Production migration

Target verified: Supabase `uatjywrbmwxbxfdvepab`. Consistent logical backup of public + maintenance restored into a separate local DB; counts matched for all 91 pre-migration tables. Private backup and proof remain under git-ignored `data/security/project-card-20261014.pgdump*`; this does not claim a Storage/auth/full-Supabase backup.

Preflight Prisma status found only one pending migration; datasource diff showed only the new journal table, its indexes and FKs. `20261014120000_project_contractor_communication` tested against a fresh DB and the restored copy, then applied with `prisma migrate deploy`. DDL, constraints, RLS and browser-role revokes are atomic. No historical SQL/data update rerun. Production status: all 78 migrations applied. Access check: 91 public tables, 0 unprotected/API accessible/API-callable. Supabase security advisor reported only expected informational RLS-with-no-policies for intentionally server-only tables, no warning/error.

Production release SHA, GitHub checks and Vercel READY state are verified separately after push; browser fixtures alone are not production delivery proof.
