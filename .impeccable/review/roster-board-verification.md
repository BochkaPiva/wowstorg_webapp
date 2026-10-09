# Project contractor groups and connected board — 2026-10-09

## Verified

- `npm test -- --reporter=dot`: 53 files / 312 tests pass.
- `npm run build`: production compilation, TypeScript, 100 static pages pass.
- `npx prisma validate`: schema valid; generated client updated locally.
- Scoped ESLint: no errors; six existing unused destructuring warnings in roster service.
- `git diff --check`: no whitespace defects.
- Actual board batch route unit tests: project-scoped lookup for CONTRACTOR/CONTACT/SCHEDULE_SLOT/PROPOSAL, foreign item rejection, authentication before work, archive guard, idempotent replay, unchanged-orphan movement and invalid-retarget rejection. No real DB touched.
- Browser script `roster-board-qa.cjs`: isolated intercepted APIs; category groups/search/status/remove/restore, protected dirty/CAS editing, all eight entity choices, direct roster-to-board insertion, duplicate prevention, contractor detail editing, nested native Escape, timing widget navigation and return, archive read-only; no page errors.
- Captures: `team-groups-{desktop,mobile,user-2048}.png`, `team-editor-{desktop,mobile}.png`, `team-board-picker-{desktop,mobile}.png`, `team-board-details-{desktop,mobile}.png`. Main inspected all nine; independent impeccable finish reviewer: ship, no material fixes.
- Detector once on changed UI targets: local palette/type advisories vs global DESIGN and two inherited board icon gray-on-color findings. No unrelated design overhaul undertaken.

## Rollout gate

Apply `docs/sql/deploy_project_contractor_categories.sql` after backup and the original `deploy_project_contractors.sql`, before deploying this client. Expected result: `PROJECT_CONTRACTOR_CATEGORIES_READY`.

Production DB schema/data, live SQL execution, storage/photo retrieval and production rollout were not performed or verified. Native client screens were tested with fixtures, not real project records. Synthetic board metadata contains English status fixture values; real read model maps roster status to Russian labels.

Category first entry determines the unique roster group; other categories remain tags. Remove means reversible CANCELLED participation, not catalog deletion. Board cards reference sources; deleting a board item never deletes the source. Remaining entities open their existing module rather than duplicating an editor/business model.
