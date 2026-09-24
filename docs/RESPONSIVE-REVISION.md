# Responsive layout revision

## Layout rules

- Keep the existing Sajda visual identity; change layout constraints rather than
  hiding horizontal overflow globally or shrinking all text.
- The search shell has a 1280px maximum width. Its content remains narrower;
  navigation uses a second row below 1280px. The headline grows continuously
  from 30px to 48px rather than jumping at the 640px breakpoint.
- Informational-page headers wrap at intermediate widths. Sticky headers on
  Developers, Security, Legal and How It Works start at 1280px, where they fit
  below the existing 96px anchor offset.
- Auth uses a compact phone layout, a centered 560px form at 600–1023px, and
  its branded two-panel layout from 1024px. Its own language/legal footer is
  sufficient; the global marketing footer is not repeated there.
- Shared inputs and textareas retain a 16px base font on tablets. Inputs have
  a 44px default height. Explicit component overrides still take precedence.
- Default dialogs stay inside the dynamic viewport and scroll vertically.
  Close controls are 44px. Full-height custom drawers explicitly override
  the default maximum height; Swipe's wishlist retains its full-height layout.
- Trading sensitivity tiles use two columns until 1024px and wrap long values.
  The research report filters use two columns on tablets and four from 1280px.
- Swipe header controls wrap instead of shrinking below their intended size.
  Long translated calls to action wrap within their cards.
- Footer link columns use the full available content width. Mobile bottom-nav
  clearance stops at the same 768px breakpoint as the navigation itself.

## Repeatable checks

`scripts/check-responsive-browser.mjs` mounts real page components in a
serve-only local fixture, with auth, account state, scans and provider calls
isolated. All external requests and mutations are blocked. It records page
width, offscreen/clipped text, overlapping navigation controls, grid widths,
input font sizes and screenshots under `tmp/responsive-browser`.

The default width matrix is 360, 390, 768, 820, 1024, 1180 and 1440px. Focused
passes also exercise 320px, short 600px-high landscape windows, longer Swedish,
French and Spanish labels, and breakpoint boundaries. Dialog tests open and
scroll the actual component, verify focus, press Escape and verify focus return.

Run with an installed Edge browser and Playwright available through
`SAJDA_PLAYWRIGHT_ROOT` (a directory containing its `node_modules`):

```powershell
node scripts/check-responsive-browser.mjs
```

Optional environment variables narrow a regression pass:

- `SAJDA_RESPONSIVE_ROUTES`: comma-separated route paths.
- `SAJDA_RESPONSIVE_WIDTHS`: comma-separated pixel widths.
- `SAJDA_RESPONSIVE_LANGUAGES`: comma-separated language codes.
- `SAJDA_RESPONSIVE_HEIGHT`: viewport height in pixels.
- `SAJDA_RESPONSIVE_CASES`: JSON array of `{route, language, width}`.
- `SAJDA_RESPONSIVE_WISHLIST=true`: test the Swipe drawer's full-height override.
- `SAJDA_RESPONSIVE_LABEL`: output directory label.

Use the final rerun of a failed case, not its original failure screenshot, when
evaluating the current implementation. Keep prior failures as diagnostic evidence.

## Verification boundaries

These are browser viewport tests, not tests on physical Apple hardware. They
do not verify Safari's on-screen keyboard, hardware safe areas, App Store
packaging, actual account login, billing, email delivery or live search quality.
Those behaviors are not changed by this layout revision. Read-only deployed
route/asset checks separately confirm that the new build reached Vercel.

For a protected preview, set `SAJDA_TEST_ORIGIN` to its deployment URL and
`SAJDA_VERCEL_CLI` to the authorized CLI entry point, then run
`node scripts/check-responsive-preview.mjs` and
`node scripts/check-auth-preview.mjs`. These checks read deployed HTML, CSS,
page modules, logo assets and the anonymous session endpoint. They neither
disable deployment protection nor create accounts, keys, emails or payments.

Related regressions: auth presentation, native language/navigation, native auth
security, Trading language, UI contracts and language dictionary contracts.

### Local evidence, 2026-09-13

- 179 measurements and 139 screenshots; 155 latest unique combinations after
  failed cases were fixed and rerun. Thirteen product routes plus shared-dialog
  fixtures, four languages (EN/ES/FR/SV), twelve widths from 320 to 1920px.
- No outstanding accidental clipping, overlapping header controls or runtime
  exceptions in those cases. Intentional sort-label ellipsis is recorded
  separately, not incorrectly treated as a layout defect.
- 24 final Swipe measurements include empty/populated wishlists, full-height
  bounds, scroll-to-bottom, Escape and returned focus.
- 67 auth, native language/auth security, Trading language and Swipe regression
  tests pass. Typecheck, focused lint, UI contracts, 88 language dictionaries,
  Vercel build, SEO output policy and Neon public-bundle policy pass.

Final screenshots and JSON live under `tmp/responsive-browser/final-*`; these
local artifacts and fixture tests are excluded from deployment.

### Deployed verification

Preview `https://sajda-itf3vhktc-hypbit.vercel.app` reached Vercel `READY`.
The 13 responsive route/artifact checks and 10 auth route/asset/anonymous-session
checks pass. The actual preview was also viewed in the connected browser:
homepage at 390/768/1440px, auth at 820px, with no page-wide horizontal overflow
and no captured browser errors. The auth inputs were 52px high with 16px text.
Temporary viewport overrides were reset. No account or provider mutation was
performed, and this is not a physical-device or completed-login test.
