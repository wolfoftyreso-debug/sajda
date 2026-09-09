# Sajda design hand-off

This folder is a working design export from the current product. It is intentionally built from editable vectors and text rather than a flattened screenshot.

## Open in Figma

1. Open Figma and choose **Import**.
2. Select `Sajda-product-handoff.svg`.
3. Figma imports the four labelled boards as editable layers. Ungroup a board to edit individual controls, copy components, or add new flows.
4. Keep `Sajda-tokens.json` alongside the file as the source of truth for colour, type, spacing, radii and motion.

## Boards

- **Foundations** — colours, typography, spacing, buttons and field states.
- **Search discovery** — English-first home/search direction.
- **Swipe deck** — the locked, gesture-first name-discovery view.
- **Marketplace listing** — a concise seller/listing pattern.

The native Figma connector needs to be reconnected before Sajda can publish a live `.fig` file into the account. This SVG is import-ready now and is the editable fallback, not a substitute for a flattened image.

## Design rules preserved from the product

- Light cool-white canvas, ink typography and one action blue.
- Blue is an action colour, not an all-purpose background.
- Semantic green remains for confirmed availability only.
- Four-pixel spacing rhythm; modest 12–20 px radii.
- English is the base content language; components must accommodate SV, ES, FR and ZH.
- Respect `prefers-reduced-motion`; motion communicates state rather than decoration.
