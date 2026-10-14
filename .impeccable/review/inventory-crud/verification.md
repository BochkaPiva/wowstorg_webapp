# Inventory position CRUD — verification

Date: 2026-10-14. Mode: Operate. Local surface scope: `/inventory/positions` and `/inventory/positions/new`.

## Disposition and authority

The independent finish review returned **ship** for the local UI scope, with no material fixes. It opened all nine captures listed below and judged the incumbent world against `DESIGN.md` and the user's old screenshots. No separate QUALITY BAR card was available; this is a limitation of the finish evidence, not a claim that a separate bar was reviewed.

This documentation pass read `PRODUCT.md`, `DESIGN.md`, the [surface contract](../../surfaces/inventory-position-crud.md), the implemented list/editor/form/CSS/new-page files, and [the feature card](../../../brain/features/inventory-position-crud.md). It opened all nine captures. Behavior and build results below were supplied by the parent workflow; they were not rerun during documentation.

The change extends the existing inventory world: black AppShell, light workspace, plum SectionHeader with the existing inventory dinosaur, Onest text, purple selection/edit controls and yellow primary save/create action. Global `DESIGN.md` and `.impeccable/design.json` remain the existing authority. No identity replacement or new production raster was needed.

## Captured visual evidence

Native headless Edge full-page captures were made after resetting scroll to the top and validating eager image decode. Viewport widths were 1440, 1920 and 390 px. Each capture uses QA-labelled fixture data.

| State | 1440 px | 1920 px | 390 px |
| --- | --- | --- | --- |
| List | [list-1440.png](list-1440.png) | [list-1920.png](list-1920.png) | [list-390.png](list-390.png) |
| Inline edit | [edit-1440.png](edit-1440.png) | [edit-1920.png](edit-1920.png) | [edit-390.png](edit-390.png) |
| Complete creation form | [create-1440.png](create-1440.png) | [create-1920.png](create-1920.png) | [create-390.png](create-390.png) |

Desktop captures show an aligned position/stock/rental-price/action list beneath one compact filter strip. The open editor remains attached to its highlighted row; creation appears above the filter strip and list. Main fields and stock sit beside photo/visibility on desktop. At 390 px, rows and the editor become sequential blocks, stock fields retain two columns, photo/visibility follow the main fields, and save/cancel remain at the end. The long QA item name wraps without losing the row's actions. These captures establish layout in these states; they do not establish every loading, conflict, empty or error state visually.

The chair image is an SVG QA test fixture captured into `fixture.png` for the file-input test. It is test evidence, not a shipped product photo or new production raster. The SectionHeader dinosaur is reused from the incumbent asset family with its existing provenance.

## Implemented behavior

- Search submits after a 300 ms debounce, or immediately with Enter/«Найти». Visibility, sorting and inactive-state controls share the compact strip. Sorting copies the full loaded list and supports name, price, usable stock and creation/update date.
- «Редактировать» loads a fresh server snapshot into the inline form. Save uses `expectedUpdatedAt`, refreshes the list and closes the form. Another editor and filter changes are disabled while the form is open. Closing a changed form requests confirmation. Focus restoration after replacing the list was not independently verified.
- Creation uses the same complete form for description, type, rental/purchase prices, all stock states, categories, real Collection membership, photo and visibility. The separate creation URL returns to the list after saving. The existing full card remains accessible.
- Errors keep the draft visible. If position data was acknowledged before photo/final-read failure, retry continues with the same position and does not repeat the acknowledged data write. Subsequent field changes retain the acknowledged revision check. Numeric validation rejects negative/fractional stock and invalid input; rental price accepts a decimal comma.
- Delete has explicit inline confirmation and displays the existing API's linked-history rejection. A saved position excluded by current filters receives an explanation and «Показать все» action. Category and collection membership remain part of the saved payload.
- PATCH retains existing CollectionItem membership rows and their positions, deletes only removed memberships and adds only new ones. This later data-integrity fix did not change UI source or the approved captures.
- Fields have visible labels, controls retain native semantics, edit buttons expose expanded state, feedback uses status/alert roles, and local focus styling is visible. These are observed implementation facts, not a complete assistive-technology certification.

## Reported checks

The parent workflow passed inline save/collapse, price sorting, linked-delete error, complete single-form creation, failed-photo retry without duplicate creation, and live search at all three widths. It recorded **15 intercepted fixture writes**, **0 page errors** and **0 unexpected requests**. API interception protected production data; these checks establish browser behavior against fixtures, not live database/storage mutation results.

`npm run build:verified` passed in the local working tree: **106 test files / 757 tests**, **0 errors / 60 warnings**, **0 production dependency vulnerabilities**, and successful Next.js 16.4 / TypeScript compilation. That working tree includes unrelated uncommitted cleanup. Those totals do **not** certify the eventual shipped candidate or an isolated inventory-only commit. This documentation-only pass made no source/test changes and did not repeat the build.

The detector ran once on target source/CSS. Its findings were advisory differences from the canonical global type/radius/color scale; the compact local scale is grounded in incumbent components. No primary detector failures were reported. The findings did not require global token changes.

## Remaining verification limits

- The added disposable-loopback PostgreSQL HTTP smoke covers API creation, category/Collection membership, initial LossRecord, CAS, blocked deletion and foreign-key rollback. It also seeds CollectionItem position 9 and asserts saving the same membership keeps 9. Its new runtime execution is still pending CI; this report does not mark it passed.
- Field and photo saves use existing protected endpoints. Actual Supabase upload was not tested because no production mutations were performed. Browser fixture success does not verify production Storage configuration, permissions or delivery.
- No schema migration or environment-variable change belongs to this extension. Existing transaction, stock-history and authorization contracts remain applicable.
- The separate creation URL was inspected in source; the nine captures show creation within the list. The finish disposition applies to the documented local UI scope, not deployment, release-candidate certification or live production CRUD.
