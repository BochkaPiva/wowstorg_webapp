# Fullscreen project proposal scroll — 09.10.2026

Scope: fix scrolling when the proposal editor opens from the project widget. No redesign, schema, API, or persistence changes.

Cause: unlayered `.project-workspace-widget__body { overflow: hidden }` overrides Tailwind's layered `overflow-auto`. A mobile rule intended for the free-board canvas also applied to every expanded widget.

Fix: explicit expanded non-board body scroll ownership (`overflow: auto`, `min-height: 0`, overscroll containment); scope the mobile hidden-overflow rule to `FREE_BOARD`. Collapsed/inline cards keep their clipping; the project background stays locked.

Browser verification: real application components with synthetic read-only API fixtures; Edge headless, widths 2486, 1440, 390, height 900. Before fix, all three scroll bodies had `overflowY: hidden` while content exceeded the viewport (3832px desktop / 7314px mobile). After fix, all three have `overflowY: auto`; wheel changes inner scrollTop, the final section is reachable, background scrollY stays unchanged, closing unlocks the project page, and the free board retains hidden outer overflow. No page errors. This does not verify production data.

Run: `node .impeccable/review/proposal-fullscreen-scroll-qa.cjs`; diagnostic-only baseline: append `--observe`.

Used `impeccable` adapt/craft-floor to preserve the existing interface and verify viewport behavior; `verification` to trace project launcher → fullscreen shell → long proposal content.

Final checks: `npm run build` succeeded; `npm test -- --silent` passed 312 tests across 53 files; `git diff --check` passed. Not pushed/deployed in this task.
