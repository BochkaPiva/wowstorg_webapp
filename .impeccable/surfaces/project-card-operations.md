# Project card · Operate

## PURPOSE
Run an event from one workspace: budget first, orders and people connected, last agreements available at a glance. Extend the existing Wowstorg identity; do not replace global design tokens.

## STRUCTURE
Estimate is essential and first in new projects. Proposal builder is optional. Orders occupy the full row by default, including the collapsed state. Existing saved layouts remain user choices. Shared block headers are compact and consistent.

## FIRST VIEWPORT
One project heading and compact module headers, not stacked duplicate titles. Contractor content starts with a small composition summary and actions, then a single search/category toolbar and compact grouped people. Name, responsibility, participation, contact and latest communication are immediately legible.

User refinement: no exposed row of unlike action buttons. Secondary actions belong in one anchored ellipsis menu, including contractor edit/remove/board/timing and linked-order open/remove/reorder. The order save action only appears when there are draft changes, with the same control height as its menu trigger.

## SIGNATURE INTERACTION

Estimate refinement: drag a section by its compact header, including its name, instead of a separate six-dot button. Native browser drag follows the task-board interaction, with a header-only preview and a before/after insertion line matching the resulting order. Click still expands/collapses or renames; inputs, delete and ellipsis actions cannot initiate a drag. Alt+Up/Down reorders a focused header; Escape/outside drop/end/blur must clear transient feedback. Preserve ordinary touch scrolling, read-only guards and the existing persistence/financial model. No new visual world or raster assets.
Expand communication within a contractor row, record the latest conversation and its status, save in place, then see the latest agreement updated across the workspace. Order-specific prices edit beside quantity, preview totals and save through the protected existing order workflow; catalogue prices never change.

## MATERIAL / STATES
White surfaces, fine warm-neutral dividers, purple selection and yellow primary action; incumbent UI typography. Restrained state feedback, no decorative animation. Disabled modules expose no dead-end actions. Archive read-only, revision conflicts retain drafts, retry is idempotent, keyboard/mobile controls remain usable.

## QUALITY BAR
Verify creation with only estimate/orders, order-price preview/save/error/conflict and approval reset, contractor add/edit/cancel/restore and paginated communication, board absent/present, cross-module refresh, full-screen scrolling, desktop 1440/mobile390/user2048. Mock browser fixtures are labelled QA and complemented by real database/API tests and candidate CI/deployment checks.

## BUILT RECORD
Estimate-first registry, builder optional, Orders default12 and collapse respecting width. Shared widget titles have one compact row, descriptions remain title hints. Flat contractor groups use44×52 portraits,15px names,13px responsibility/contact, one anchored ellipsis and inline11–12px conversation preview. The journal expands within the row and wraps on mobile. Order actions are one36px menu trigger and same-height Save only while dirty. Inline project layers are isolated below the app header; fullscreen portals remain separate. No new global tokens/assets. Full independent review disposition ship over all9 QA captures; no material fixes. Documentation recorded locally after helper hit usage limit, preserving global DESIGN.md.

Estimate header drag: native HTML drag starts from the compact header/title, with no separate six-dot handle; `setDragImage` uses only the header. A purple before/after insertion line matches the resulting order; the source fades to opacity 0.65 over 150ms, with transitions disabled for reduced motion. Ordinary header/title clicks retain collapse/rename; inputs, menu and delete controls cannot start drag. Alt+Up/Down reorders a focused header with polite status feedback. Drop, Escape, dragend and blur clear transient state; a zero-delay reset suppresses only the immediate release click and preserves later keyboard activation. Reorder preserves the user's expanded/collapsed choice and existing read-only/busy, demo-section, pricing and persistence guards. Sources: `src/lib/use-estimate-section-drag.ts`, `src/app/projects/[id]/ProjectEstimatePanel.tsx`, `src/app/globals.css`. Final review disposition: ship after resolving the sole click-suppression finding; evidence is `.impeccable/review/estimate-header-drag/{workspace,dragging,saved}-{1440,2048,390}.png`, `verification.md` and `finish-review.md`. Reported verification: local build passed with 110 files / 784 tests, including 15 hook tests; mock-API browser mouse/keyboard scenarios passed at all three widths. The 390px run does not prove physical-phone touch drag. This surface refinement adds no global palette, typography or assets.
