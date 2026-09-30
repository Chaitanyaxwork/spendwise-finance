# SpendWise design brief

## Direction
**Quietly confident fintech, elevated for the daily money review:** a restrained, precise, human finance interface that feels trustworthy enough for real money while remaining approachable in an MBA portfolio. It communicates clarity and agency—not gamification, trading, or judgement.

## Design movement
Contemporary editorial finance dashboard: warm-neutral canvas, disciplined grid, clear typographic hierarchy, compact data visualizations, deliberate whitespace, and carefully composed cards with subtle depth. Favor useful structure and real data over decoration.

## Core principles
1. **Clarity before decoration.** Financial meaning is visible at a glance; every KPI and chart carries a clear label and period.
2. **Calm control.** Surface warnings and errors clearly without alarmist color or celebratory noise.
3. **Consistent evidence.** Comparisons, budget progress, insights, and charts derive from the same current records or the connected analytics API.
4. **Respectful by default.** Demo data is labeled, forms explain their states, and no interface implies secure storage until a backend is connected.
5. **One responsive system.** Navigation, cards, charts, tables, and dialogs reflow rather than merely shrink.
6. **INR throughout.** Display Indian Rupees with one shared `en-IN`/`INR` formatter, including charts, forms, comparisons, and demo examples.

## Color philosophy
Use a soft warm-white/off-white canvas; dark ink and slate for primary/secondary text; deep teal/forest for primary actions, active navigation, and favorable progress; muted sage for supporting data; restrained amber for approaching limits; and brick/rose only for overspending or destructive/error states. Keep chart colors distinct but low-saturation and ensure text/control contrast. Avoid large gradients, neon, and extensive dark surfaces.

## Layout paradigm
Desktop uses a fixed, quiet navigation rail with the SpendWise brand, all requested destinations, a visible active state, and a profile/logout area; the content canvas uses a spacious grid and compact top bar. The dashboard leads with a personalized greeting, current-month context, quick actions, and four comparison-aware KPIs. Follow with income-vs-expense, spending-trend, and category views; then recent activity, budget/goal progress, recurring items, anomaly alerts, cash-flow forecast, and financial health. Secondary pages use a consistent title/action row, concise summaries, and one focused workspace. On mobile, navigation becomes a keyboard-accessible drawer, summary cards use two columns, charts and panels stack, and transaction data remains usable without clipping.

## Signature elements
- The existing SpendWise ascending-ledger mark and wordmark, paired with the tagline “Your money. Your insights. Your future.”
- A compact period-comparison indicator beside each KPI, with clear positive/negative/neutral semantics.
- Consistent chart legends and contextual periods; never encode meaning with color alone.
- Budget and goal progress paired with exact used/remaining or current/target values.
- Visible “Demo data” status when using the local sample adapter and distinct backend/error states in API mode.
- Clear, restrained focus rings, validation copy, skeletons, empty states, toasts, and destructive confirmations.

## Interaction philosophy
Actions are direct and reversible where practical. Use visible labels, keyboard-accessible navigation, focusable controls, accessible dialogs, clear destructive confirmations, and validated form states. Demo-mode updates persist only in the browser. Financial CRUD reports success only after the adapter/server confirms it. Search/filter/sort/table/chart views share the same source. Loading, empty, success, error, and unauthorized states are distinct. Motion is short and subtle and respects `prefers-reduced-motion`.

## Animation
Use brief opacity/transform transitions for menus, dialogs, focus and feedback. Do not animate balances or charts in a way that implies a financial outcome. Respect reduced-motion preferences. No ambient motion or parallax.

## Typography system
Use a highly readable sans-serif system stack for interface text and amounts. Employ weight, scale, spacing, and tabular numerals to distinguish values and KPI changes. Keep body copy comfortable on small screens; labels remain readable rather than relying on tiny all-caps copy. The brand wordmark remains live text in the UI.

## Brand essence and voice
**Brand:** SpendWise. **Tagline:** “Your money. Your insights. Your future.” The voice is practical, optimistic, calm, and nonjudgmental. Prefer precise, sourced wording over vague judgement. Distinguish backend-generated insight, transparent calculations, and sample data; do not assert an anomaly, forecast, health score, or recurring bill unless the connected source supplies it or the UI clearly labels a demo observation.

## Logo and signature brand color
Preserve the existing flat vector ledger/chart mark, favicon, project icon, and deep teal/forest signature color. Use deep teal sparingly for the main action, active navigation, and favorable progress. No tiny details, gradients, glow, texture, 3D, baked-in wordmark, or generic stock imagery.
