# Inventory position CRUD

Mode: Operate. Targets: `src/app/inventory/positions/page.tsx`, `new/page.tsx`, `PositionEditor.tsx`, `position-workspace.module.css`.

The warehouse team maintains prices and quantities on a laptop, with quick corrections also possible on a phone. The user explicitly chose editing by expanding the list row, automatic collapse after saving, one complete creation form and compact sorting. The existing SectionHeader, dinosaur, Onest typography and purple/yellow controls are the visual authority.

## Direction contract

THESIS: Maintain the inventory from its list; a row opens into a complete editor and closes after acknowledgement.

OWN-WORLD: Existing white surfaces, neutral separators, purple selection, yellow save action, native labelled fields and consistent line icons.

STORY: Find and sort a position, expand it, change data and save. Create with photo, categories, prices and stock in one form.

FIRST VIEWPORT: Established dinosaur header; one compact filter strip; aligned list columns for item, stock, price and editing. Creation opens above the list.

FORM: Precisely specified local extension of the incumbent inventory surface. Seed: not applicable; no concept tournament.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

No global visual identity change. No new production raster. Preserve CAS, linked stock history and collection membership. Upload failure after item creation must retry the existing item rather than create a duplicate.

## Built behavior

The implementation keeps the incumbent SectionHeader and places a single compact search/visibility/sort/inactive strip above the list. Desktop rows align identity, usable/total stock, rental price and actions. An expanded row has a light purple summary and a white editor immediately below it; creation uses the same editor above the strip. The separate `/inventory/positions/new` route also uses that editor and returns to the list after saving.

The editor groups name, description, type, prices and stock in the main column; photo and visibility occupy the right column. Category and Collection selections use native expandable groups with checkboxes. At widths up to 800 px, list rows become sequential blocks with explicit stock/price context. Up to 600 px, the editor becomes one column, stock remains a two-column group, and photo/visibility follow the main fields. Preview photographs are contained; list thumbnails use a compact crop.

Only one editor is open at a time. Filter changes and opening another editor are disabled during editing. Successful save refreshes the list, collapses the form and returns focus to the launching button. Draft-closing confirmation, field/photo errors, acknowledged-data retry and explicit delete confirmation are part of this surface. A saved position hidden by the current filters receives an explanation and «Показать все» action. The local compact density and values describe this surface; they do not replace global tokens.

Finish disposition: ship at local UI scope, no material fixes. Evidence and limits: [inventory CRUD verification](../review/inventory-crud/verification.md). No new production raster; the chair in QA captures is a test fixture.
