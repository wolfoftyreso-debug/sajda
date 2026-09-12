# Provider logo sources

Checked 2026-09-11. These third-party marks identify their respective providers in Sajda's comparison UI; they do not imply an affiliation or endorsement. They are not Sajda-owned artwork.

## NameSilo

- Official page: https://www.namesilo.com/
- Published asset linked by that page: https://www.namesilo.com/static/assets/img/logo-light.svg
- Local file: `src/assets/providers/namesilo.svg`.
- The original 45×45 square silo-symbol path was extracted unchanged from the 239×45 wordmark. Its original `#031B4E` fill and geometry are preserved. The adjoining wordmark/tagline are omitted because the provider name is already displayed next to the compact mark.
- Inspected as rendered SVG in the browser. The bundled SVG contains only static vector geometry, with no scripts, embedded raster images, fonts or external references.

NameSilo uses Vite's static `new URL(..., import.meta.url)` asset handling so both web and native bundles contain the file. No runtime request to the logo vendor is required for this mark.

## InternetBS

- Official page: https://faq.internetbs.net/hc/en-gb/articles/4517071110429-Internetbs-Company-Info
- Published header image: https://faq.internetbs.net/hc/theming_assets/01HZKQZF4DVTSEGDQT3SKR6K05
- The official help centre renders this wordmark at an intrinsic 400×70 pixels. Sajda references the original image URL and uses the existing wide-logo layout to preserve its proportions.
- Local export was denied in the current browser session. No download workaround was used; the image remains hosted by the provider. This logo therefore requires a network connection and retains the normal image-error fallback. It is not an offline-bundled asset.

The existing image component sends no referrer to external logo hosts. Provider names remain visible beside the images, and monograms remain error fallbacks rather than the normal presentation.

## Verification

- Seven focused provider-logo tests pass, including both sizes and image-error fallbacks. InternetBS requires a dark surface for its white wordmark.
- TypeScript and scoped ESLint pass. Web/Vercel and native product bundles build successfully; this is not a signed iOS build.
- In the local browser at 390 px, both images load (NameSilo: 45×45, InternetBS: 400×70), the provider names remain visible, and the page has no horizontal overflow. Toggling InternetBS off and on also works.

## Publication status

Not published in this session. The GitHub tree write was rejected because tool approval is unavailable, so no remote commit or branch update was made. The installed Vercel CLI entry point could not be executed in the current environment. The Vercel dashboard shows no connected Git repository; an automatic deployment must not be assumed. No production settings or test alias were changed. All four changed source/test/documentation files remain in the local workspace for a later authorized release.
