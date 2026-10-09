# Каталог подрядчиков — второй этап V2

Mode: Operate. Preserve the existing WowStorg visual world and approved V2 specification.

Primary task: scan photos, services and prices, then start a standalone proposal with the chosen service. Details, contacts and administrative fields open in a separate modal following the requisites ItemModal pattern. The underlying catalog retains its grid width and column count. Photos remain contain, not cropped. Contacts and internal notes do not occupy the card. Search/category/page requests are server-driven. Mobile details stack inside the viewport-bounded modal with their own scroll.

Scope delivered 08.10.2026: keyset listing, contextual view/edit/new-service, seed launch, conditional price forms, draft guards and error recovery. Contacts editing, history display, advanced context filters and production migration remain outside this slice.

Evidence: `.impeccable/review/catalog-ui-qa.cjs` and catalog screenshots (synthetic API fixtures, no production records). Visual pass preserves the black shell, calm neutral work area, yellow primary action and purple selection. No new animation or heavy dependency.

## Delivered extension — 09.10.2026

The catalog still supports finding services, creating a standalone proposal and opening contacts. Actual participation in an event belongs to the separate project roster; catalog cards do not claim a booking or confirmation.

### Layout and disclosure

- Default grid and matching skeleton: four equal-width columns above 1250px, three at 1001–1250px, two at 601–1000px, one at 600px and below. These are viewport breakpoints, not new global layout tokens.
- Opening contractor details preserves the default grid. The separate native dialog centers above the catalog; it does not add a grid column or a preceding mobile inspector block.
- Collapsed cards show two service previews. On desktop the title/description area reserves the same height and each preview occupies 112px, keeping service positions and card footers aligned. At 600px and below the heading and service area return to natural height.
- «Ещё N услуг» expands all loaded services inside that card; «Свернуть услуги» restores the preview. The control exposes `aria-expanded` and `aria-controls`. Expanded titles use natural wrapping and card height can grow. «Контакты», the photo and contractor name open the same detail modal.
- Card photos retain the 4:3 frame and `object-fit: contain`; the whole photograph is visible. Names and service previews have bounded wrapping, with complete details available in the modal or expanded services. Prices retain tabular figures.

### Shared list header

Catalog, projects and warehouse queue now use `src/app/_ui/SectionHeader.tsx`: a white surface with a neutral border, 16px radius, 24px padding, title (30px), short description (14px) and grouped actions. At 800px actions move below the copy; at 560px padding becomes 18px and the title 26px. Optional tabs sit below a thin neutral divider; filters keep their page-specific layout beneath the header. This is a shared pattern for these three list pages, not a replacement for every page header.

### Evidence and scope

The finish reviewer accepted all eight desktop/mobile captures: `roster-catalog-{desktop,mobile}.png`, `roster-project-{desktop,mobile}.png`, `roster-projects-header-{desktop,mobile}.png` and `roster-queue-header-{desktop,mobile}.png`, under `.impeccable/review/`. API responses used synthetic fixtures; this visual review did not write production records. Implemented evidence is `src/app/contractors/{page.tsx,contractors.module.css}` and `src/app/_ui/{SectionHeader.tsx,section-header.module.css}`.

This brief records the local extension. Root `DESIGN.md` and `.impeccable/design.json` were not refreshed. Its earlier catalog auto-fill/minimum-320px and three-service descriptions are stale for this surface; use the local rules above and current source. PDF/PPTX typography remains a separate backlog item.

## Contextual correction — 09.10.2026

The owner's current request supersedes the 08.10 inline-inspector direction and the earlier 09.10 grid-shrinking disclosure. Those were delivered stages, not current rules. This local Operate correction retains the established white/neutral surfaces, yellow primary action, purple selection and application typography; no new visual world, font or decorative animation is introduced.

### Contractor detail modal

`CatalogDialog` uses native `dialog.showModal()`, a protected dark backdrop and body scroll lock. The surface is limited to 1040px or viewport width minus 32px, and viewport height minus 32px (`100dvh`), with contained internal scrolling. White fill, 14px corners and the structural overlay shadow separate it from the unchanged catalog. Close/Escape/backdrop dismissal routes through the existing saving/unsaved-field guard; focus returns to the opener.

The view puts a whole photograph on the left and description, services, contacts and team notes on the right. Photo/details columns use a .9/1.1 ratio with a 32px gap. Detail photography uses a 3:4 frame capped at 560px high; at 700px and below the content stacks, the gap becomes 20px, padding becomes 18px, and the image becomes square with a 300px height cap. The header and close action stay reachable during modal scrolling. Contractor/category creation and existing contractor/service edit forms remain available inside this same dialog; this correction adds no contact editor or history UI.

### Current evidence and boundaries

Fresh full-page captures `.impeccable/review/context-catalog-desktop.png` and `context-catalog-mobile.png` use 1440×1000 and 390×844 viewports. Their full-page heights exceed one screen; the overlay/backdrop occupies the first viewport only. `.impeccable/review/contextual-picker-qa.cjs` checks modal bounds, grid preservation and focus return using synthetic intercepted data, without production writes. `.impeccable/review/contextual-finish-review.md` records the complete surface review and a `ship` verdict after the named focus correction. The parent workflow reports 292 tests in 52 files passed and final `npm run build` exit 0, including that focus correction. Documenting this brief reran no QA.

Implementation evidence: `src/app/contractors/{page.tsx,CatalogDialog.tsx,CatalogInspector.tsx,contractors.module.css}`. The final section of ADR 015 records this modal/contextual correction. No schema or API change and no new migration is required by this iteration; previously documented production-schema prerequisites still apply. Root DESIGN/sidecar were not refreshed, and their inline-inspector descriptions are stale for this surface.
