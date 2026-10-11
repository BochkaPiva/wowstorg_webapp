disposition: ship

# Work launch and proposal export verification — 11.10.2026

## persistence

Workflow finish review: pass for the scoped Operate extension. Existing `PRODUCT.md`, `DESIGN.md` and root sidecar remain intact; the six-block direction contract is retained in [`work-launch-and-proposal-export.md`](../surfaces/work-launch-and-proposal-export.md). Reported context drift was not repaired as part of this task. This verdict covers the new launch, proposal start and export typography, not the entire application.

All six authoritative captures are valid: [`desktop`](work-launch-qa/desktop.png), [`mobile`](work-launch-qa/mobile.png), [`mobile-dialog`](work-launch-qa/mobile-dialog.png), [`proposal-start`](work-launch-qa/proposal-start.png), [`picker`](work-launch-qa/picker.png), [`mobile-picker`](work-launch-qa/mobile-picker.png). Desktop viewport is 1440×1000; mobile is 390×844. The labeled harness renders actual `WorkQueuePage`, `WorkQueueHeader`, `WorkCreateDialog` and `ProposalWorkspace` components with synthetic shell, authentication, routing and API responses. It uses no working database; estimate/project destinations are harness placeholders.

Shipping raster provenance is present in `public/brand/dino-catalog.webp.json` for the reused mascot. Template backgrounds derive from the user-provided `МАКЕТ.pptx`; the exact Oks Free and template provenance are documented in `src/server/projects/proposal-template-v1/README.md`. Workflow asset scan reports zero missing provenance files.

## fidelity

Workflow finish review: pass. Existing white working surfaces, Onest, purple navigation/selection and one yellow primary launch match OWN-WORLD. The compact three-action header matches THESIS and FIRST VIEWPORT. The mobile stack and hidden mascot are the deliberate adaptation; the native creation dialog protects focus and presents the actual required fields.

The synthetic browser flow confirmed all three create requests and editor navigation, initial title focus, dialog Escape dismissal, first-category creation opening the filtered picker, and checking/unchecking a service. The proposed first step uses the existing receipt/outbox and a confirmed section ID. No new routes, migrations or environment variables were introduced by this extension.

The current export fixture has eight pages in both `demo.pdf` and `demo.pptx`. Generated render evidence is [`pdf-all.png`](../../tmp/proposal-export-qa/pdf-all.png), [`pptx-all.png`](../../tmp/proposal-export-qa/pptx-all.png) and [`cover-two-line-pptx.png`](../../tmp/proposal-export-qa/cover-two-line-pptx.png). Old page-9 files in the temporary folder belong to earlier fixtures and do not describe the current demo. Service heading/body/price hierarchy is 40/24/32px, continuation pages preserve readable type, and the budget footer at y=610 clears the supplied graphic. Both formats use the same measured page plan; v1 snapshots keep their original geometry.

PDF embeds the complete OpenType/CFF font and uses unshaped metrics consistent with disabled ligatures/kerning. PPTX has editable native text, explicit run/default/end-paragraph Oks Free properties and absolute line spacing. The recipient needs Oks Free installed; PPTX does not embed it. Opening the resulting files in native PowerPoint, Google Slides and LibreOffice remains unverified. Synthetic browser/API evidence and generated renders do not prove real session, database or production storage behavior.

## ceiling

Workflow finish review: reached for this extension. Direct launch into the right editor, simple first-category selection, preserved contextual picker and readable client export fulfill the recorded direction. The incumbent visual world remains the authority; no additional imagery, motion or broad application redesign is part of this result.

## material_fixes

Workflow finish review: none remaining. Parent workflow reports `npm run build:verified` passed: 430 tests in 65 files, lint baseline of 164 existing findings with zero regressions, dependency audit zero vulnerabilities, and successful Next build. After the final footer change, seven focused export tests and a final `npm run build` passed. These results are recorded from the implementation workflow; this documentation pass did not rerun them.

## keep

Keep the three explicit launch actions with КП as the single primary action; category selection opening the real contextual picker; native focus/dismissal behavior; exact user-supplied template/font assets; editable PPTX and full-font PDF; client-safe projection; and preserved v1 snapshot rendering. Source facts were extracted from `src/app/work/{WorkQueueHeader,WorkCreateDialog,page}.tsx`, `src/app/work/work.css`, `src/lib/work-create.ts`, `src/app/proposals/ProposalWorkspace.tsx` and `src/server/projects/proposal-export-{document,render}.ts`.
