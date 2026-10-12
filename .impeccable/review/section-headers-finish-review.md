disposition: ship

Current disposition covers the two scored fixes only. Initial review below is preserved as historical evidence; its two contradicted rows and material-fix list are superseded by the verdict pass at the end.

Scope: header extension. Seven required captures opened and valid; work and analytics use real page components with synthetic shell/auth/API, gallery uses the actual shared component. Other authenticated route integrations are source evidence only. No approved comp or QUALITY BAR card is owed for the user-pinned incumbent extension; the source-backed Grinvich header in the gallery is the visual authority. Source integrations were sampled, not exhaustively audited.

## persistence

Pass for the incumbent extension: PRODUCT.md and DESIGN.md exist, and `.impeccable/surfaces/section-headers.md` records all six contract blocks. FORM explicitly records the authorized incumbent extension, so a concept seed and comp approval are inapplicable. Existing DESIGN.md supplies the fonts, light working ground, yellow action and operational hierarchy; the final documenter should append the shared plum header palette and 40/34/28px heading scale as scoped variants. Do not treat advisory detector findings on those intentionally inherited values as a request to alter unrelated page bodies. Five new purpose-specific WebPs and exact prompt sidecars are present; the packet reports embedded provenance for them and reused PNGs. Final build remains owed after corrections.

## fidelity

| Element / promise | Result | Evidence |
| --- | --- | --- |
| TYPE | match | Actual captures retain locally supplied Madefor Display/Onest, white bold headings, clear scale and legible Russian labels. Long administration and loyalty titles fit in the gallery mobile capture. |
| MATERIAL | match | New transparent raster scenes show distinct tasks: queue planning, project coordination, contractor presentation, inventory scanning, and administration. They blend directly into the header without a separate picture frame. |
| GROUND | match | Deep plum gradient matches the incumbent Grinvich header's visual family; light working surfaces remain beneath it. |
| THESIS / OWN-WORLD | match | Work, gallery and analytics share recognizable title, action, tab and mascot composition while keeping section identity. |
| STORY / truthful context | match | Queue metrics name the current selection and derive from payload meta; source hides them during loading/error. Synthetic values are explicitly labeled in the capture shells. Analytics error exposes a retry action. |
| FIRST VIEWPORT: grouped controls | match | Primary actions and selected tabs are legible and grouped; detailed filtering stays below on a light surface. Native work dialog shows the requested creation task and visible keyboard focus. Gallery-only actions are intentionally synthetic and are not judged as route behavior. |
| FIRST VIEWPORT: mobile containment | contradicted | `mobile.png` loses its right gutter: the work hero, filter block and empty surface reach beyond the capture's right edge. Analytics mobile preserves both gutters, confirming a work layout issue rather than the chosen header design. |
| FIRST VIEWPORT: overlays remain unclipped | contradicted | `analytics-mobile.png` shows the date popup outside the left viewport, cutting off date labels, input values and explanatory text. Desktop popup is intact. |
| Mobile illustration prominence | adaptation | Art recedes behind the mobile copy and controls as the surface brief explicitly requires; desktop retains the section-specific scene as a visible focal element. |
| FORM | match | Shared SectionHeader, native controls, calm state feedback and no added decorative animation follow the incumbent-extension contract. |

## ceiling

Reached at the requested header scope: strong title hierarchy, integrated distinct raster scenes, coherent plum/yellow controls, and clear separation from the light working area. No additional ornamental devices are required by the reference. Authenticated page bodies and unsupported states are outside this review's evidence and verdict.

## material_fixes

1. Overlay / FIRST VIEWPORT: in `src/app/admin/analytics/analytics.module.css:108`, remove or override the mobile `.datePopup { left:auto; right:0; }` rule now that the date control is anchored on the left; use left alignment and a viewport-bounded width, preserving a shrinkable/stacked date-input layout. Both date fields and the basis note must remain fully visible and usable in `analytics-mobile.png`.
2. Responsive containment / FIRST VIEWPORT: in `src/app/work/work.css:1` and the mobile `.work-filters` rule around line 1729, constrain the work grid and its children to the available inline size (`min-width:0`, `minmax(0,1fr)` tracks and shrinkable filter fields as needed). Correct the intrinsic-width source rather than masking document overflow. In `mobile.png`, hero, controls and empty state must keep the same visible right gutter as the left and every header control must remain readable.

## keep

Keep the incumbent plum contrast, white title hierarchy, yellow primary-action treatment, truthful selection metrics, five distinct transparent dinosaur scenes, existing filter/permission/handler semantics and restrained mobile artwork while resolving only the two listed layout defects.

## verdict

1. Resolved — analytics mobile overlay: refreshed `analytics-mobile.png` shows the complete popup inside the viewport, with both labeled date inputs and the entire basis note visible. `analytics-desktop.png` retains the intact desktop popup.
2. Resolved — work mobile containment: authoritative `mobile-viewport.png` shows both 14px gutters, a complete rounded hero edge, readable grouped actions/tabs and the filter surface contained within the available width. The full-page backend still omits the native scrollbar width in `mobile.png`; the direct viewport capture resolves that capture ambiguity. The supplied clientWidth/scrollWidth equality corroborates visible containment. The remaining refreshed captures are valid and show no regressions attributable to this fix batch.

## remaining

Clear for the two scored layout findings. Final verified build and scoped design documentation remain the parent workflow's completion steps; this verdict does not extend evidence to authenticated routes reviewed only in source.

disposition: ship
