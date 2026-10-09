# Подрядчики проекта — реальная команда мероприятия

Mode: Operate. Extend the incumbent WowStorg visual world; preserve the black shell, calm white work surfaces, yellow primary actions and purple links/selection. This brief describes the local roster surface, not a global redesign.

## Direction contract

THESIS: A handover-ready team, grouped by editable work categories, not an undifferentiated list.
OWN-WORLD: Existing white surfaces, neutral dividers, Onest text, purple selection and yellow add action; restrained 150ms feedback, reduced motion respected.
STORY: Find a responsibility, contact the person, change status, edit agreements or remove participation without losing history. Board objects reference the same records.
FIRST VIEWPORT: Compact toolbar; category jump filters and search; category headings with counts; dense portrait/contact rows with direct status, edit, board and remove controls. Cancelled people fold below the active team.
FORM: User-pinned local Operate extension, code-led; no seed required. Signature interaction: reversible removal and live contractor editing from a board card.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Task and boundaries

The colleague opening a project must see who participates, what each person does, how to contact them and where/when they arrive. «Команда мероприятия» belongs to the configurable «Подрядчики проекта» widget and works inline or in the existing fullscreen workspace.

Catalog, proposal and actual project team remain separate. The roster holds a contact snapshot, responsibility, status, arrival note, internal agreements and an optional association with one saved timing item. It does not carry prices, change proposal/estimate finances, reserve availability or notify a contractor. Default participation status is «На согласовании»; «Подтверждён», «Работа выполнена» and «Не участвует» are explicit employee choices, not inferred bookings. See `brain/decisions/017-project-contractor-roster.md`.

## Layout and hierarchy

The toolbar places a block title (23px), active/confirmed counts (13px) and the secondary «Из КП» beside the yellow «+ Подрядчик». Search and category filters sit above category headings with counts. The first editable category determines the person's group; remaining categories appear as small text tags. Groups sort by Russian name, with «Без категории» last; each person appears once. Search matches name, responsibility, phone and contact person. If a selected category disappears after editing or removal, the view falls back to «Все».

Active groups use flat white rows with thin neutral bottom dividers, zero row radius and vertical padding (18px), rather than individually boxed cards. A row contains a portrait (64 × 76px), name (17px), direct status selector, responsibility (14px), contact links (13px), then timing/arrival metadata (12px). A visible «На доску» action and labelled edit/remove SVG buttons sit alongside the person. Group headings (17px) are separated by generous local gaps (28px). Cancelled people are excluded from active/category counts and folded under «Не участвуют»; their quieter cards retain a neutral border, radius (14px) and restore action. Search also applies to this folded history.

Timing/arrival information has a restrained neutral left divider (1px), not a status stripe. Agreement text is progressively disclosed through native `details`/`summary`. Long names, responsibilities, contact links and notes wrap; authored line breaks are preserved. These are local row rules, not additional global tokens.

At 700px and below panel padding becomes 18px, the toolbar wraps, and composer/picker grids become one column. Grouped active rows retain their divider rhythm; portraits, text, contact links and actions wrap, with edit/remove actions aligned below the person text. Existing Onest typography and semantic status colors remain; status wording provides meaning independently of color. Edit/remove targets are 44 × 44px; category filters and the compact status selector use their observed local heights (40px and 36px), not a fabricated universal control size.

## Adding and editing

«+ Подрядчик» opens a local composer with catalog search (up to 12 matches) and «Вне каталога» for a manual contact. Catalog selection copies the current contact and service categories into an editable project form. The form requires name and responsibility and exposes comma-separated categories, contact person, phone, email, status, timing item, arrival and internal agreements. It accepts up to 12 category names; the first sets the group. Fields and save/cancel controls have visible focus and are at least 44px high.

The row's edit button opens the shared form in a bounded contextual editor, not beneath the row. Its native top-layer popover remains inside the workspace's DOM/focus scope while escaping clipping. The current unanchored placement occupies the right side of the visual viewport below the app or fullscreen widget header: width at most 390px and viewport minus 24px, scrollable height bounded by available viewport space, one-column fields and sticky save/cancel actions. On small screens it fits within 12px edges. Opening another editor first runs the dirty/pending-save guard; outside clicks do not dismiss it. Escape or the explicit close control runs the same guard and focus returns to the initiating control when appropriate. Border, modest ambient shadow and purple focus treatment express temporary editing depth; they do not change the global visual system.

«Из КП» explicitly imports the primary contractors of a selected variant. Alternative/optional/excluded services do not imply participation. Repeated import reports added/skipped counts and preserves existing responsibilities, contacts, statuses and agreements, including cancelled participants. An empty roster explains how to add people; absent proposal data points to the project constructor.

Status changes are available directly on the row and save against its loaded revision. «Убрать из состава» first shows an inline confirmation explaining that contacts and agreements remain; confirmation changes status to «Не участвует», without physical deletion. «Вернуть в состав» explicitly restores «На согласовании». The edit form temporarily disables the row's direct status/removal actions. Archived projects replace status selectors with readable status text and hide mutation actions.

Edits use the loaded revision. A conflict keeps entered fields visible and asks the user to refresh/reconcile; a newer row revision is shown beside the open form. Requests show a saving state and disable that form's controls. Errors use a text alert with recovery, success notices a status message, and initial loading uses the existing module skeleton.

## Timing, fullscreen and guards

The timing selector lists saved items of this project and offers «Без привязки». If none exist, it asks the user to save the timing first. Saved associations show their label on the person row; the timing table displays names of associated active participants. Cancelling participation excludes the name from timing context. Removing a saved timing item clears the association while preserving the participant and arrival note.

Inline/fullscreen instances and board links refresh on the scoped roster-change event. Overlapping roster refreshes accept only the latest request's response, so an older response cannot roll the view back. Fullscreen uses the existing workspace's own scrolling, Escape/close behavior and focus handling. Dirty forms ask before cancellation, collapse or switching fullscreen state; pending saves prevent closing, and browser unload is guarded. Archived projects are read-only: add/import/edit/status/remove actions are hidden or replaced with text and server guards enforce the archive boundary. Reading contacts, status and agreements remains available.

## Scoped board extension

«На доску» opens the configured «Свободная доска» fullscreen and inserts a linked card for the project participation record. If that widget is absent, the row explains how to add it through project-card settings. The board's «Добавить объект проекта» picker has eight type tabs and project search: task (`TASK`), order (`ORDER`), file (`FILE`), estimate section (`ESTIMATE_SECTION`), project contractor (`CONTRACTOR`), contact (`CONTACT`), timing item (`SCHEDULE_SLOT`) and proposal (`PROPOSAL`). The responsive picker uses one/two/three columns, bounded scrolling and descriptive empty states. Already-present sources show «Уже на доске» and cannot be inserted again; inactive sources show «Неактивен».

These cards reuse the incumbent board's canvas, movement, selection, grouping, connectors, zoom, save queue and undo/redo. Purple selection and connections communicate board interaction; restrained cards and existing SVG controls carry the current visual world. This is a project entity map, not a second catalog, estimate or booking system. Removing a board card removes its representation and related board connections, not the source entity or contractor participation. The newest four types use weak `payload.entityId` references validated against this project on write; their geometry/history can remain when the source becomes unavailable. Contractor cards reference `ProjectContractor`, never the catalog record in place of actual participation.

Opening a linked card shows project-object details. Contractor details load the current roster and display categories, status, responsibility, contact links, timing, arrival and agreements; «Изменить участие» reuses the same roster form and revision guard. Successful saves refresh both roster and board summary. Other entity types offer «Открыть блок проекта», which opens their native project widget fullscreen; closing returns to the board. Orders also expose their existing order page. A missing native widget produces guidance to enable it through «Настроить карточку». Archived projects permit reading details and source blocks but no board or participation mutations. Board undo shortcuts ignore an open details dialog so editing cannot also undo the canvas.

## Evidence and remaining scope

Sources: `src/app/projects/[id]/{ProjectContractorsPanel.tsx,project-contractors.module.css,ProjectSchedulePanel.tsx,ProjectFreeBoard.tsx,ProjectBoardEntityDetails.tsx,ProjectWorkspaceDashboard.tsx}`, `src/app/_ui/ContextPopover.tsx`, `src/lib/{popover-position.ts,projects/project-contractors.ts,projects/project-free-board.ts}` and ADR 017. This pass records the built local surface and its board interaction; root `PRODUCT.md`, `DESIGN.md` and the global design sidecar remain unchanged.

The parent workflow inspected nine review captures: `.impeccable/review/team-{groups-desktop,groups-mobile,groups-user-2048,editor-desktop,editor-mobile,board-picker-desktop,board-picker-mobile,board-details-desktop,board-details-mobile}.png`. Browser QA used synthetic API fixtures and passed all eight linked types, status changes, reversible removal, search, dirty-close/revision conflicts, «На доску», duplicate protection, contractor detail editing, native-widget return and archived read-only behavior. The independent finish review verdict was `ship`, with no material fixes required. Existing palette/type advisories and two inherited gray-on-color icon detector false positives were reviewed; this brief does not promote advisories or detector findings into new design rules.

The parent workflow reported 53 test files / 312 passing tests, successful Prisma schema validation and final `npm run build` completion with exit code 0 (compile, TypeScript and 100 static pages). Browser QA was repeated successfully after the final refresh/filter/dialog guards. This documentation pass did not repeat those checks. Production database writes, SQL application and live imports were not tested. Rollout requires `docs/sql/deploy_project_contractor_categories.sql` after the existing roster deployment and backup; Vercel deployment does not apply this database change automatically.

The earlier colored timing stripe is deliberately not canonized: the built timing/arrival divider remains neutral (1px). Multiple timing associations, contractor availability, payouts/documents and notifications require separate work. PDF/PPTX typography remains outside this extension. All review captures are browser QA artifacts of the code-led Operate extension, not generated shipping raster assets or a new visual identity.
