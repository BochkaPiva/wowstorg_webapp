# Catalogue exploration · 15 October 2026

The 14 October integrated-header implementation is rejected by the user. On 15 October the user chose option 1, the horizontal timeline, asked whether dates scroll, and approved trying a working local version. Approved visual: `.impeccable/mocks/decision/catalog-timeline-v3.png`. This replaces the previous banner; no deployment is authorized in this iteration.

## Design read

Operate surface for event-rental staff: a bold, memorable yet fast catalogue, not a marketing landing page. Preserve Madefor/Onest character, light workspace, black shell, purple selection, yellow main action and purple dinosaur identity. Replace composition and interaction rather than retouching the discarded banner. DESIGN_VARIANCE 8, MOTION_INTENSITY 3, VISUAL_DENSITY 6; motion must explain state, never delay input. GPT Taste's expressive composition and broad typography apply; its mandatory marketing AIDA, scroll hijacking, simulated execution and random font replacement do not fit this product or the user's speed requirement. Design Taste is outside its core dashboard scope; use its redesign audit, anti-template and hierarchy advice only. No pretending to execute Python.

## Product truth / corrections

- Preparation date appears independently in ordinary catalogues for both roles. An explicit choice survives transfer to the cart; the old warehouse day-before fallback applies only when no choice exists.
- Rental start and end retain direct Утром/Вечером choices, no time dropdowns. Date selection can open a calendar except in the open-calendar direction.
- Days must read with the period, never float above other values. Single-day remains full-day in eventual implementation.
- Use coherent demo dates: preparation 20 October 2026; rental 21 October morning through 23 October evening = 3 days. Label demo content. Do not invent stock or availability claims.
- No airport/luggage/cart scene. Event light, technical case, stage, director clipboard are the mascot's context.

## Grounded structural shortlist

1. Horizontal schedule + dedicated preparation pin.
2. Open calendar canvas + live date summary.
3. Editable natural-language event sentence.
4. Search-first catalogue with a compact bottom booking dock.
5. Event production timeline with an integral rental bar and distinct preparation milestone.
6. Catalogue atelier with a persistent right-hand brief.
7. Two-day endpoint editorial composition around a central equipment scene.

Surface roll d7e600d5 round 1 selected 5, 2, 6, in that presentation order. Three physically different layouts, not restyled versions of the same row. Old search-first/integrated/inline-banner candidates do not return. Challenger material was evaluated for fit: zoo-map geography has no truthful relation to dates; retro slide-rack and train departures risk the airport/travel confusion the user explicitly rejected. Borrow no visual costume. The useful discipline retained is persistent chronology and one coherent control grammar, already grounded in event planning.

## Primary references researched

- https://linear.app/docs/timeline : visible chronology, milestones and direct date management; adapt to rental boundaries, not a copied project roadmap.
- https://rauno.me/craft : inline conversion, toolbar morph, precise controls; inspiration for compact state transitions, not imported skins.
- https://family.co/ : tactile, authored interactive personality; brand reference only, no crypto functionality.
- https://emilkowal.ski/ui/you-dont-need-animations : fast purposeful feedback and frequency-aware motion.
- https://react-aria.adobe.com/DateRangePicker : accessible segmented date-entry/range-calendar behavior; implementation reference, not a new dependency this turn.

## Generation and approval

Main thread generates all three full-fidelity desktop UI comps, anchored by an existing app screenshot for identity only. Each receives exact prompt provenance. Decision page holds equal-salience options and explicit risks. Return to user for selection; no implementation or publication of a rejected option.

## Selected working contract

- White open composition, black broad heading, yellow cart action, purple rental interval and separate preparation milestone. The technician mascot is event equipment, not airport luggage.
- Existing application shell, fonts, factual copy, product cards, roles, availability and pricing rules stay intact. The earlier user preference is style and composition with adaptation, not pixel-copying the image's fictional shell/data.
- Background scrolling is view-only. Mouse drag, native trackpad/touch and week arrows browse the axis. The calendar DOM remains bounded to 121 cells while its window moves.
- Dragging a marker previews the exact dates and billable days; dates commit only on release. Escape, pointer cancellation, lost capture or window blur cancel. Keyboard arrows and precision date fields are alternatives, never drag-only controls.
- All three precision calendars stay within the viewport and restore focus on Escape. Preparation cannot exceed the rental start, and the end cannot precede the start. Existing single-day full-day billing remains unchanged.
- Time switches show both Утром/Вечером choices, no dropdowns. Their thumb is the only animated control (160ms, disabled for reduced motion). Date positions never tween during virtual-window rebasing.
- The live user rejected the detached shorter axis and changing counter placement. The corrected desktop day canvas spans the full header behind the technician, with a local fade and reserved interactive clearance only for controls.
- Compact precision fields tether to their marker positions; clamping/collision packing keeps them readable at the edges. Direct time choices share their respective endpoint field's position and have visible association labels. Mobile keeps a deliberate compact grid.
- Duration is a single absolute live status in the interval lane (top 84px, height 34px), integrated into the visible bar when space permits and placed beside a short interval or at the visible edge otherwise. It never inserts/removes a row. The source is shared with billing, not a second calculation.
- Demo mode remains undated, quick supplements retain their inherited read-only period, and project-prefill/cart scopes remain separate.

## Verification boundary

Local production build, full Vitest suite and strict ESLint are run. Eight browser scenarios cover both roles, project/demo/supplement and 390/1440/1536/2117 widths, plus time/single-day/cart states. Browser APIs use labelled synthetic fixtures: these checks establish browser behavior and request parameters, not a live database submission. No migration or new endpoint is involved.
