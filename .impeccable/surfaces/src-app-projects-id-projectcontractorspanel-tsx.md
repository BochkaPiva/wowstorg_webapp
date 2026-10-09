# Подрядчики проекта — реальная команда мероприятия

Mode: Operate. Extend the incumbent WowStorg visual world; preserve the black shell, calm white work surfaces, yellow primary actions and purple links/selection. This brief describes the local roster surface, not a global redesign.

## Task and boundaries

The colleague opening a project must see who participates, what each person does, how to contact them and where/when they arrive. «Команда мероприятия» belongs to the configurable «Подрядчики проекта» widget and works inline or in the existing fullscreen workspace.

Catalog, proposal and actual project team remain separate. The roster holds a contact snapshot, responsibility, status, arrival note, internal agreements and an optional association with one saved timing item. It does not carry prices, change proposal/estimate finances, reserve availability or notify a contractor. Default participation status is «На согласовании»; «Подтверждён», «Работа выполнена» and «Не участвует» are explicit employee choices, not inferred bookings. See `brain/decisions/017-project-contractor-roster.md`.

## Layout and hierarchy

The toolbar places a block title (23px), active/confirmed counts (13px) and the secondary «Из КП» beside the yellow «+ Подрядчик». Each white row uses a thin neutral border, 14px radius and 18px padding: contained portrait, name (17px), text status, responsibility (14px), contact links (13px), then timing/arrival metadata (12px). Cancelled rows remain visible on a quieter neutral surface and are excluded from active totals.

Timing/arrival information has a restrained neutral left divider (1px), not a status stripe. Agreement text is progressively disclosed through native `details`/`summary`. Long names, responsibilities, contact links and notes wrap; authored line breaks are preserved. These are local row rules, not additional global tokens.

At 700px and below panel padding becomes 18px, row padding 14px, the toolbar wraps, and form/picker grids become one column. Contact/action groups wrap naturally. Existing Onest typography and semantic status colors remain; status wording provides meaning independently of color.

## Adding and editing

«+ Подрядчик» opens a local composer with catalog search (up to 12 matches) and «Вне каталога» for a manual contact. Catalog selection copies the current contact into an editable project form. The form requires name and responsibility and exposes contact person, phone, email, status, timing item, arrival and internal agreements. Fields and save/cancel controls have visible focus; principal controls are at least 44px high.

«Из КП» explicitly imports the primary contractors of a selected variant. Alternative/optional/excluded services do not imply participation. Repeated import reports added/skipped counts and preserves existing responsibilities, contacts, statuses and agreements, including cancelled participants. An empty roster explains how to add people; absent proposal data points to the project constructor.

Edits use the loaded revision. A conflict keeps entered fields visible and asks the user to refresh/reconcile; a newer row revision is shown beside the open form. Requests show a saving state and disable that form's controls. Errors use a text alert with recovery, success notices a status message, and initial loading uses the existing module skeleton.

## Timing, fullscreen and guards

The timing selector lists saved items of this project and offers «Без привязки». If none exist, it asks the user to save the timing first. Saved associations show their label on the person row; the timing table displays names of associated active participants. Cancelling participation excludes the name from timing context. Removing a saved timing item clears the association while preserving the participant and arrival note.

Inline/fullscreen instances refresh on the scoped roster-change event. Fullscreen uses the existing workspace's own scrolling, Escape/close behavior and focus handling. Dirty forms ask before cancellation, collapse or switching fullscreen state; pending saves prevent closing, and browser unload is guarded. Archived projects are read-only: add/import/edit controls are hidden and server guards enforce the archive boundary. Reading contacts, status and agreements remains available.

## Evidence and remaining scope

Sources: `src/app/projects/[id]/{ProjectContractorsPanel.tsx,project-contractors.module.css,ProjectSchedulePanel.tsx,ProjectWorkspaceDashboard.tsx}`, `src/lib/projects/project-contractors.ts` and ADR 017. The finish reviewer accepted the paired `.impeccable/review/roster-project-{desktop,mobile}.png` captures, alongside the catalog/projects-header/queue-header pairs (eight total). Visual API fixtures were synthetic; production database behavior is not inferred from those screenshots.

The parent implementation workflow reported all 286 tests passing and `npm run build` completing with exit code 0. This documentation pass reviewed source and existing review evidence; it did not repeat those checks.

The sole visual review correction was the timing/arrival divider, changed to a neutral 1px line. The former colored 2px stripe is deliberately not canonized. Root `DESIGN.md` and its sidecar are unchanged; multiple timing associations, contractor availability, payouts/documents and notifications require separate work. PDF/PPTX typography is also outside this extension.
