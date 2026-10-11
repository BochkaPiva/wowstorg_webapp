# Work launch and client-ready proposal export

Mode: Operate. Local extension of the established Wowstorg surface, not a new visual identity. Queue read model, filters, transactions and proposal outbox remain unchanged. Creation uses existing authenticated endpoints. No order creation here.

## Direction contract

THESIS: Start the right work directly: proposal, estimate or project, without hunting through navigation.

OWN-WORLD: Existing light surfaces, Onest, purple navigation, one yellow primary action; reuse the existing dinosaur, no new imagery or decorative motion.

STORY: Choose a deliverable, supply its name and optional customer, enter its real editor. Projects require a customer. A proposal's first category opens service selection immediately.

FIRST VIEWPORT: Compact white header with title and three launch controls on the left, restrained mascot on the right; links to existing lists below. Queue filters remain directly beneath.

FORM: Scoped extension, no concept seed required. Native creation dialog protects focus; editable PPTX and PDF share a versioned typographic plan with a large service headline and quieter metadata.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Shipped implementation — 11.10.2026

The direction contract is implemented within the incumbent `DESIGN.md`; root design tokens and `.impeccable/design.json` are preserved. Context loading reported stale product evidence, which was reported without a drift repair. This brief records only the `/work` launch, proposal first step and export typography extension.

The white launch surface uses existing Onest and global Wowstorg colors. Its headline is `clamp(25px, 2.5vw, 36px)`, the three controls are at least 46px tall, and only «Составить КП» is yellow. «Составить смету» and «Начать проект» remain white secondary controls. Purple links lead to КП, projects and contractors. The existing catalog dinosaur is a restrained desktop accent; its reuse provenance is in `public/brand/dino-catalog.webp.json`. At 650px the mascot is hidden and launch actions become full-width stacked controls. No decorative motion is added; the 140ms color transition respects reduced motion.

Native `dialog.showModal()` opens the creation form and focuses the title. Title is required; customer is optional for a temporary proposal or estimate and required for a project. Known customers use their ID; an unmatched name stays draft context for КП/estimate and follows existing project customer creation semantics. In-flight creation is guarded against double submission and dismissal; an uncertain response directs the user to the list before retrying. The form uses the existing `/api/proposals`, `/api/standalone-estimates` and `/api/projects`, then navigates to the corresponding editor with `/work` as return context. There is no order launch, new endpoint, schema or environment variable.

An empty proposal asks «Что предложим клиенту?». Choosing a real catalog category adds its section through the existing receipt/outbox, waits for the confirmed server ID and opens that section's contextual picker with the category selected. «Свой раздел» retains the custom path. Checkbox selection/removal, focus and Escape follow the existing picker behavior.

New immutable exports use `wowstorg-template-v2`; v1 snapshots retain their original page plan. Both PDF and editable PPTX reuse the supplied `МАКЕТ.pptx` and exact Oks Free file. The shared 1280×720 plan gives service titles 40px, descriptions 24px and prices 32px, with quieter contractor/quantity labels. Long titles and descriptions continue on additional pages; the budget footer starts at y=610 clear of the template graphic. Photographs fit without cropping. PDF embeds the full OpenType/CFF font and disables shaping features unsupported by its renderer. PPTX assigns native editable Oks Free text with absolute line spacing; the font is not embedded and must be installed by the recipient. Existing client allowlist, checksum and export access rules are preserved.

## Finish evidence

FINISH discharged: workflow finish review disposition **ship** for this scoped extension; five review sections pass with no remaining material fix. Six valid browser captures cover desktop 1440×1000 and mobile 390×844, including creation dialog, empty proposal and desktop/mobile picker. The eight-page PDF/PPTX demo and two-line PPTX cover were inspected in generated renders. Asset provenance is recorded; no new generated image is shipped. Detailed evidence and explicit verification limits are in [`work-launch-verification.md`](../review/work-launch-verification.md).
