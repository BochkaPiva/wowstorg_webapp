# Director Telegram tasks

Scope: local extension of `/admin/telegram` and task-card source markers. Mode: Operate. Audience: Wowstorg administrators and the director; no new product identity or generated assets.

## Direction contract

THESIS: Set up one accountable sender and destination, not a second task-management system.
OWN-WORLD: Existing white operational surfaces, 44px native fields, purple focus, one yellow save action. The task board keeps its own light/dark grammar; gold signals director origin, a permanent readable label carries meaning.
STORY: Choose director, private ID, board and inbox; then use Telegram Menu → /task → one text message. Moves report back privately.
FIRST VIEWPORT: A self-contained block below the bot header. Four fields in a two-column form, commands guide to the right; mobile stacks fields and guide. Main save stays beside menu verification; conflicts preserve input.
FORM: Local extension, code-led; no direction seed required (seed key: not-applicable-local-extension).
FINISH: local finish review, verdict and scoped observed component decisions/evidence are recorded in `.impeccable/review/director-telegram-verification.md`. The incumbent `DESIGN.md` is preserved as the global reference; no durable system change has been approved, and this local extension does not authorize changing it or `.impeccable/design.json`. QA screenshots carry fixture provenance in the verification report; no new shipping raster is introduced.

Constraints: no credentials in the browser; bot commands scoped to director chat; names selected from actual active Wowstorg users; no animation or redesign of existing test/rating areas. Browser QA uses labelled fixtures and no production writes.

## Observed local implementation

The settings panel uses the incumbent Onest typography and WOW surface, line, ink, muted, yellow and purple variables. Its white bordered container has a 12px radius. Four labelled native fields are 44px high, with purple focus-visible outlines; both actions have a minimum height of 44px. The save action is yellow and menu verification is secondary. Local descriptive measurements here are not new global tokens.

Desktop form fields occupy two equal columns beside a 250px command guide. At 1050px the guide moves below the form; at 600px fields become a single column, panel padding becomes 18px and field text becomes 16px. The guide explains `/task`, `/mytasks` and `/cancel`, text-message structure, the source marker and private status reports. Loading, success and errors have text and status/alert semantics. CAS conflicts preserve form input; menu verification waits for a saved assignment and a ready bot.

Director origin is read from `directorRequest`, independently of user-editable task color. The shared initial gold is `DIRECTOR_TASK_COLOR` (`#f5c542`); readable title and controls on that background use the local dark brown (`#2b2110`). The permanent text badge reads «Директор», with an inline decorative crown on the live card and the director's name in its title. It survives moves and user-selected colors. The archive has the same source label and a scoped gold contrast treatment, verified from code only in this pass. Existing board themes, drag behavior and motion remain the source of truth.

Sources: `src/app/admin/telegram/DirectorSettingsPanel.tsx`, `src/app/admin/telegram/director-settings.module.css`, `src/lib/director-task.ts`, `src/app/tasks/page.tsx`, `src/app/tasks/task-board.css`. Local finish verdict: **Ship**; deployment readiness and verification limits are recorded separately in the report.
