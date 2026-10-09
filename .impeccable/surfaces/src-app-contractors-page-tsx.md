# Каталог подрядчиков — второй этап V2

Mode: Operate. Preserve the existing WowStorg visual world and approved V2 specification.

Primary task: scan photos, services and prices, then start a standalone proposal with the chosen service. Administrative fields are progressively disclosed in one nonmodal inspector; no interruption modal for routine editing. Photos remain contain, not cropped. Contacts and internal notes do not occupy the card. Search/category/page requests are server-driven. Mobile inspector precedes the grid and shares the page's vertical scroll.

Scope delivered 08.10.2026: keyset listing, contextual view/edit/new-service, seed launch, conditional price forms, draft guards and error recovery. Contacts editing, history display, advanced context filters and production migration remain outside this slice.

Evidence: `.impeccable/review/catalog-ui-qa.cjs` and catalog screenshots (synthetic API fixtures, no production records). Visual pass preserves the black shell, calm neutral work area, yellow primary action and purple selection. No new animation or heavy dependency.

## Delivered extension — 09.10.2026

The catalog still supports finding services, creating a standalone proposal and opening contacts. Actual participation in an event belongs to the separate project roster; catalog cards do not claim a booking or confirmation.

### Layout and disclosure

- Default grid and matching skeleton: four equal-width columns above 1250px, three at 1001–1250px, two at 601–1000px, one at 600px and below. These are viewport breakpoints, not new global layout tokens.
- With the inspector open, the grid uses two columns above 1000px and one at 1000px and below. The inspector is a separate 340–400px column, becoming a preceding block at 800px and below.
- Collapsed cards show two service previews. On desktop the title/description area reserves the same height and each preview occupies 112px, keeping service positions and card footers aligned. At 600px and below the heading and service area return to natural height.
- «Ещё N услуг» expands all loaded services inside that card; «Свернуть услуги» restores the preview. The control exposes `aria-expanded` and `aria-controls`. Expanded titles use natural wrapping and card height can grow. «Контакты» opens the existing nonmodal inspector.
- Photos retain the 4:3 frame and `object-fit: contain`; the whole photograph is visible. Names and service previews have bounded wrapping, with complete details available in the inspector or expanded services. Prices retain tabular figures.

### Shared list header

Catalog, projects and warehouse queue now use `src/app/_ui/SectionHeader.tsx`: a white surface with a neutral border, 16px radius, 24px padding, title (30px), short description (14px) and grouped actions. At 800px actions move below the copy; at 560px padding becomes 18px and the title 26px. Optional tabs sit below a thin neutral divider; filters keep their page-specific layout beneath the header. This is a shared pattern for these three list pages, not a replacement for every page header.

### Evidence and scope

The finish reviewer accepted all eight desktop/mobile captures: `roster-catalog-{desktop,mobile}.png`, `roster-project-{desktop,mobile}.png`, `roster-projects-header-{desktop,mobile}.png` and `roster-queue-header-{desktop,mobile}.png`, under `.impeccable/review/`. API responses used synthetic fixtures; this visual review did not write production records. Implemented evidence is `src/app/contractors/{page.tsx,contractors.module.css}` and `src/app/_ui/{SectionHeader.tsx,section-header.module.css}`.

This brief records the local extension. Root `DESIGN.md` and `.impeccable/design.json` were not refreshed. Its earlier catalog auto-fill/minimum-320px and three-service descriptions are stale for this surface; use the local rules above and current source. PDF/PPTX typography remains a separate backlog item.
