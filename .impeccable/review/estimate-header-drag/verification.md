# Estimate header drag · verification

Scope: replace only the six-dot estimate-section handle with header/title drag. Preserve existing action ellipses, formulas, API persistence, archive guards and ordinary touch scrolling. No schema/API/env changes and no production-data writes during QA.

## Evidence

- `npm run build:verified`: ESLint 0 errors / 59 incumbent warnings; 110 files / 784 tests passed; production dependency audit 0 vulnerabilities; Next.js 16.4 production build passed. Local counts include preserved, unrelated unfinished lint cleanup; candidate CI is reported separately.
- `tests/estimate-section-drag.test.tsx`: 15 tests, including protected input/delete controls, native header preview, insertion edge, unchanged/demo/external drops, cleanup on dragend/outside drop/blur/new pointerdown/Escape, immediate release-click suppression and delayed keyboard summary/title activation after completion/cancellation, read-only/busy and keyboard reordering.
- `project-card-browser-check.mjs --header-drag`: real mouse title drag and keyboard input in Edge on 1440 / 2048 / 390 viewport widths; all HTTP APIs intercepted with labelled synthetic QA fixtures. Both section PATCH payloads checked; mocked persistence reload restores order; prices remain unchanged. No page errors or unexpected API requests. Native OS drag image is not recorded in screenshots; `setDragImage(header, ...)` supplies it.
- Narrow viewport verifies responsive mouse/keyboard behavior, not physical-phone touch dragging. Native HTML drag does not block ordinary touch scrolling; no pointer/touch capture or `touch-action:none` added.
- Manual Impeccable detector ran once against changed UI targets. Broad pre-existing monolith/global-style advisories (including gray-on-color and typography) are outside this interaction-only refinement; this is not a claim of zero global design warnings.
- All nine final full-page captures begin at document top, use decoded images, and are in this directory: `workspace`, `dragging`, `saved` at each width. The native drag capture retains source/target state, then restores the target under the pointer to complete the drop.

## Independent review

Initial finish review requested one material fix: bound stale click suppression so later keyboard activation is not swallowed. Implemented a zero-delay reset with timer cleanup; added delayed keyboard regressions and browser Enter/rename checks, rebuilt and recaptured. Final verdict is recorded in `finish-review.md`.
