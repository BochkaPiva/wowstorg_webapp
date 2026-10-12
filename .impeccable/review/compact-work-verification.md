# Compact work controls and return navigation — completion evidence

Status: complete for the authorized incumbent refinement; final finish disposition: ship at the explicitly narrowed source-mechanical correction scope. Existing typography, light working surfaces, thematic headers and artwork remain the visual authority. DESIGN.md and `.impeccable/design.json` received a scoped merge; PRODUCT.md context drift was not repaired.

## Implementation and persistence

- `/work`: one full-width compact strip containing a single-line search, smaller native type/phase/sort selectors and a named bookmark action in the same row. Fields and save action retain 44px targets; responsive reflow keeps search and save together. Conditional dates, saved views, archive options, handlers and storage remain connected.
- Shared `BackLink` and `BackButton` are exported by `src/app/_ui/BackLink.tsx`; styling lives in `back-link.module.css`. AppShell renders one quiet arrow and destination name beneath the toolbar and above page content. `src/lib/section-return.ts` supplies pure default-parent and actual-href label helpers; supplied safe detail returns take precedence.
- Source integrations remove duplicated page returns from admin, inventory, warehouse repair/losses, order/project detail, estimate, catalog and cart surfaces. Cart keeps its separate contextual continuation to Catalog through BackLink. Catalog inspector and notification internal returns use BackButton. Pagination, ordering and semantic direction icons retain their own roles.
- The six-block surface contract is `.impeccable/surfaces/work-controls-and-return-navigation.md`. DESIGN.md records component geometry and scoped responsive behavior without replacing incumbent primitives. The sidecar adds self-contained SVG return/filter previews and interaction/breakpoint extensions. The unified-work-queue feature note records this refinement.
- No shipping raster is created or changed by this task. Existing artwork provenance remains in `public/brand/headers/README.md`; review captures are QA evidence, not product assets. No API, env or schema changes require regenerated inventories or migrations.

## Verification

Parent workflow reports `npm run build:verified` PASS: 438 tests across 67 files, lint baseline 164 existing errors with 0 regressions, production dependency audit 0 vulnerabilities, and successful production build. After the final placeholder color correction, a separate production build completed with exit code 0. The documenter did not rerun these checks; its JSON parsing and scoped whitespace check passed.

The finish review inspected `compact-work-qa/desktop.png`, `mobile.png`, `mobile-dates.png`, `admin-users.png`, and `admin-loyalty.png`. These render actual page/header/control sources with synthetic auth/API fixtures; they support only their visible header/filter composition. `mobile-dates.png` is scrolled to dates. The loyalty fixture displays a data error while its changed header/return remains visible. Mobile captures predate the fixture PostCSS recapture, as noted by the reviewer; matching control selectors were inspected in source. These captures are not live authenticated end-to-end evidence.

`compact-work-qa/admin-customers.png` is INVALID: an initially incorrect fixture yielded a blank page. It is retained as a failed QA artifact and excluded from verification. The fixture was corrected, but capture access became unavailable after a tool change; the native computer-use fallback could not determine the browser URL and did not progress. Customers and other uncaptured integrations therefore have source review only.

The sole finish finding was placeholder contrast. The final declaration in `src/app/work/work.css` is `color: var(--wow-muted, #686863)` with opacity 1, matching the existing global token. Against the inspected white background its computed contrast is 5.6016:1. The color-only correction was confirmed from final source; the original valid captures precede it. There is no fresh rendered confirmation of that final foreground color. The initial review's contrast finding and requested recapture are superseded only to the narrow extent stated in `compact-work-finish-verdict.md`, not by a new visual pass.

One layout detector before edits returned an empty finding list. No second detector, extra polish cycle or fresh defect hunt was performed. See `compact-work-finish-review.md` for the original review and `compact-work-finish-verdict.md` for the final source-mechanical ship disposition. That verdict was written while the final build was still running; the parent subsequently confirmed exit code 0 as recorded above.

## Remaining limits

Real authenticated route navigation, all role states, production data/backend mutations, keyboard interactions and every uncaptured integration were not exercised by these synthetic screenshots. Safe return and handler continuity are source evidence where not visibly captured. Final placeholder raster confirmation remains unperformed. This documentation pass changed no application source and performed no commit, push or deployment.
