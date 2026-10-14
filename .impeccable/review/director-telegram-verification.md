# Director Telegram tasks — local verification

Recorded: 14 October 2026. Scope: the director settings block in `/admin/telegram` and director-origin labels on `/tasks`. Mode: Operate. This report documents a local extension of the incumbent visual system; it does not introduce a new global identity or normative token set.

## Finish verdict

**Ship — local UI scope.** The fresh finish reviewer (`impeccable_director_finish_reviewer`) reported no material must-fix within this scope. The verdict concerns the new settings block and card source treatment; it is not a production deployment or live Telegram-delivery certificate.

The documenter read the incumbent `PRODUCT.md`, `DESIGN.md`, the surface brief, the settings component/CSS and relevant task-card code, and opened all four component captures below. Behavioral and database results were supplied by the coordinating implementation workflow; this documentation pass did not rerun those checks.

## Implemented design

The settings block uses existing Onest typography, white WOW surfaces, neutral borders, purple keyboard focus and one yellow save action. The labelled native controls and form actions have 44px targets; mobile field text is 16px. The desktop form has two columns and a command guide to the right. The guide stacks below the form at 1050px; fields stack at 600px. Loading, error and success messages use text with status/alert semantics. A failed CAS save keeps the local values available.

The director is selected from actual active Wowstorg users. The UI explains the private-chat, text-only path, the first-line title and subsequent description, and `/task`, `/mytasks`, `/cancel`. Menu verification is secondary and requires a saved assignment and configured bot. Private Telegram IDs belong to the setup form; task-card origin metadata exposes the director's display name, not their Telegram ID.

The initial gold card color comes from the shared `DIRECTOR_TASK_COLOR`. A permanent text badge «Директор» is rendered from origin metadata independently of card color; the live card adds a decorative inline crown. Scoped dark text makes the gold title and controls readable in the existing board themes. Archive rendering includes the source badge and gold contrast rules, but archive was inspected in code only.

These are descriptive facts about this surface. `DESIGN.md` and `.impeccable/design.json` were not changed. No generated image or new production raster asset was added.

## Visual evidence and provenance

The implementation workflow captured these local fixture components in native headless Edge against the local Next production-build server on port 3128. Viewport labels refer to browser widths, not image pixel widths. The documenter opened each image and confirmed the panel/card content matches the inspected source.

| Capture | Browser width | Subject |
| --- | --- | --- |
| [director-settings-1440.png](director-settings-1440.png) | 1440px | Two-column settings form and right-hand command guide |
| [director-settings-390.png](director-settings-390.png) | 390px | Single-column settings form, stacked actions and guide |
| [director-task-1440.png](director-task-1440.png) | 1440px | Gold task card with permanent director badge |
| [director-task-390.png](director-task-390.png) | 390px | Gold task card with wrapped title and readable badge |

These are component screenshots, not full-page captures. They use explicitly labelled QA names and fixture data. They establish the local settings/card layout at those widths; they do not establish a full-page audit of existing admin areas, all board states, archive rendering, or every theme variant. PNG files are verification artifacts, not shipped product assets. No real Telegram message or production database write occurred during these fixture browser checks.

## Reported functional evidence

The coordinating implementation workflow reported native headless Edge checks at both 1440px and 390px:

- Save settings, reload and recover saved values; menu-verification POST succeeds against the fixture API.
- The director source badge remains before and after a native column drag.
- After drop, the card returns to opacity 1 while awaiting the server acknowledgement.
- Gold-card title computed color is `rgb(43, 33, 16)`, matching the scoped `#2b2110` rule.
- Six fixture API writes, zero page errors and zero unexpected requests; no real Telegram messages or production database writes.

These checks exercise browser behavior with mocked API responses. They do not prove real Bot API delivery or the production HTTP → Prisma → PostgreSQL path.

## Reported schema and local gate evidence

The isolated PGlite PostgreSQL/WASM check applied all 77 migrations successfully. The two new tables have RLS enabled without FORCE RLS; `anon` and `authenticated` cannot read them. Checks covered foreign keys, unique receipts and receipt survival after task deletion. This is isolated schema evidence, not a migration of the production database.

The latest full local gate reported 101 test files and 718 passing tests, zero lint errors with 59 warnings, zero production dependency vulnerabilities and a successful Next build. That run includes unrelated, uncommitted ESLint cleanup in the working tree. Its results must not be presented as validation of a shipped commit that excludes those changes; verify the actual release candidate separately.

## Release evidence — 14 October 2026

- Release candidate `c60e39a7c5506786dcfd46b3b873c58585518ec8` excludes the unrelated ESLint cleanup. [Quality workflow 38517846800](https://github.com/BochkaPiva/wowstorg_webapp/actions/runs/38517846800) completed successfully: both quality and fresh-database/access-boundary jobs.
- Candidate quality gate: 99 test files / 694 passing tests; baseline retains 10 historical lint errors with zero regressions; production dependency audit reports zero vulnerabilities; Next 16.4 compilation and TypeScript succeed. The remaining dev-dependency audit findings and historical lint cleanup are separate work, not resolved by this feature.
- The HTTP smoke passed on disposable PostgreSQL 17.11: real cookies/role rejection, director settings PATCH, private webhook → Prisma task creation, concurrent duplicate deliveries, foreign-sender rejection, concurrent same-column moves producing one MOVED activity, source DTO privacy and receipt survival preventing deleted-task recreation. Bot tokens were empty; this did not send actual Telegram messages.
- Migration `20261014090000_telegram_director_tasks` applied through Prisma to the established working Supabase project `uatjywrbmwxbxfdvepab`; all 77 migrations are up to date. Prisma schema diff reports no difference. Database access check: 90 public tables, zero unprotected tables, zero API-role-accessible tables and zero API-callable routines.
- Security advisor reports only INFO “RLS Enabled No Policy”, consistent with the intentional server-only access boundary ([Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). New tables have no missing-FK-index advisory. Their unused-index notices are expected before first use; no index was removed.
- Production code deployment remains pending at this documentation commit. The coordinating workflow must verify the deployed SHA and READY status separately.
- Real director assignment, scoped Telegram menu and actual private status-message delivery remain pending live setup/verification. Tests do not select a real director or notify them.

Update these entries only after the coordinating workflow records direct evidence for the relevant commit, CI run, database or deployment. A local **Ship** design verdict leaves those release checks pending.

## Follow-up — description visibility and team notification (14 October 2026)

The reported task “Тест” was checked read-only in the working database: its description was already “Тестовое задание”. No data recovery or migration was required. The active card omitted the description, and the default history tab did not display it.

The fix adds a three-line plain-text card preview and the full description above the history, preserving newlines and wrapping long unbroken URLs. Empty descriptions add no block. The details tab still owns editing. Existing board colors are inherited, gold text remains dark; mobile full-description text is 16px. No motion or global design-system change was added.

Native headless Edge fixture checks passed at 1440px and 390px: card text equals the full fixture data but is visually clamped to three lines; clicking opens the full unchanged description; long text and URL do not overflow horizontally; Escape closes the drawer; source badge and drag reset remain intact. Six allowed fixture API writes, zero page errors and zero unexpected requests. The four changed component captures were opened and inspected: `director-task-1440.png`, `director-task-390.png`, `director-description-drawer-1440.png`, `director-description-drawer-390.png`. These remain component captures, not a full-page audit. The existing CSS detector warnings concern inherited board motifs; the new local text styles reuse its palette and typography.

Only a newly created, committed director task schedules a separate `notifyDirectorTaskCreated` callback to the established warehouse/task topic. It is independent of the director's private acknowledgement, includes author/title/description/board/column/link, and bounds escaped text without splitting entities or emoji. Receipt replay, prompts, rejected senders and deleted tasks do not trigger a team message. Unit tests mock Telegram; no past task is broadcast by the fix.

Local gate passed: 102 files / 729 tests, zero lint errors and 59 warnings, zero production dependency vulnerabilities, successful Next.js/TypeScript build. This includes unrelated uncommitted cleanup; the isolated release candidate must be checked in CI separately. Production delivery of a new team notification requires a real new director task after deployment; no test spam was sent to the working chat.

## Follow-up — native bot controls and explicit appointment notice (14 October 2026)

Director copy now uses short, actionable messages without sticker implementation details. A persistent Telegram keyboard offers “Новая задача” and “Мои поручения”; task input has “Отменить ввод”. Read-only inline views paginate six requests at a time, separate open/completed requests, and show description, assignees and deadline. Private status notices open the relevant details. Commands remain compatible.

The admin panel adds “Оповестить о назначении”. It sends a plain-language guide and the native keyboard only when explicitly clicked, after saving the assignment. The API checks the current saved revision/director, active Wowstorg role and private chat mapping; it does not accept an arbitrary recipient. Actual Telegram acceptance is awaited and failures do not produce a success message. Saving or deployment alone sends no appointment announcement.

Native headless Edge fixture verification passed at 1440px and 390px, including saved selection, explicit menu check, appointment notice, card description and drag-reset regression checks: eight fixture writes, zero page errors and zero unexpected requests. The new component captures `director-appointment-1440.png` and `director-appointment-390.png` were opened and inspected. Buttons fit at both widths. These captures do not establish Telegram-client rendering or actual delivery; no real messages were sent.

Local `build:verified` passed: 104 test files / 745 tests, zero lint errors / 59 warnings, zero production dependency vulnerabilities and successful Next.js/TypeScript compilation. The working tree still includes unrelated uncommitted cleanup; shipped-candidate CI must be verified independently. Added tests cover native keyboard actions, callback ownership/private-chat checks, bounded lists/details, unchanged-message edits, notice stale-selection rejection, send failure and retry. The disposable PostgreSQL HTTP smoke also exercises callback routing without creating a second task. No schema migration or environment-variable change is required.

## References

- Surface contract: [director-telegram-tasks.md](../surfaces/director-telegram-tasks.md).
- Existing global design: [DESIGN.md](../../DESIGN.md); product context: [PRODUCT.md](../../PRODUCT.md).
- Feature and setup: [telegram-director-tasks.md](../../brain/features/telegram-director-tasks.md).
- Implementation: `src/app/admin/telegram/DirectorSettingsPanel.tsx`, `src/app/admin/telegram/director-settings.module.css`, `src/lib/director-task.ts`, `src/app/tasks/page.tsx`, `src/app/tasks/task-board.css`.
