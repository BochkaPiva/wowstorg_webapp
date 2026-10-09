# Contextual contractor/proposal windows — 09.10.2026

Story: catalog details open in an isolated photo/detail modal; event service selection opens next to its trigger without replacing the composition; selection changes use the existing immutable serial outbox and return to the same canvas.

## Evidence

- `npm test`: 292 tests passed in 52 files.
- Scoped ESLint: exit 0 for the edited TSX/helpers/tests.
- `npm run build`: successful compilation/type checking/static generation; final refresh includes initial-focus selector correction.
- `contextual-picker-qa.cjs`: intercepted synthetic APIs only, no real sessions/DB/uploads. Browser → request payload → fixture model → response → local projection verified. API/data production availability was not tested.
- Tests prove: catalog grid width unchanged, native modal focus return, visible composition geometry unchanged, immediate reversible checkboxes while ADD is pending, removal uses acknowledged real item ID (never a `queued:` ID), rechecking cancels unsent removal, search, desktop/mobile screen bounds, scroll reachability of Save, dirty Escape cancellation, saved client note, embedded project Search focus/Tab/Escape order, zero page errors/overflow.
- Unit coverage includes viewport flipping/short screens and lost-response reload resolution without mutating the submitted ADD request.
- Detector once, exit 0. Only existing palette/type ramp advisory drift against global DESIGN; no primary findings.
- Fresh full finish review: `contextual-finish-review.md`, ship. Named initial-focus correction separately scored resolved, ship.

## Captures

`context-{catalog,picker,settings}-{desktop,mobile}.png`: 1440×1000 and 390×844 viewports, full document screenshots. Top-layer surfaces/backdrops occupy only the visible viewport, not the rest of the full-document image.

## Release scope

No API/env/schema changes or new dependency. No migration needed for this correction; prior deployment prerequisites remain unchanged. Not pushed/deployed as part of this request.
