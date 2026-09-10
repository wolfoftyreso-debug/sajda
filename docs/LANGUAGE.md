# Language selection and editorial standards

English is the canonical product language. Swedish, Spanish, French and
Simplified Chinese should express the same behavior in natural language, not
copy English sentence structure. Use US English, direct Swedish and Spanish,
French `vous`, and concise Simplified Chinese. Keep product names (Sajda,
Swipe, Trading), API identifiers, provider evidence and currency values intact.

Use consistent distinctions: saving is not monitoring, a registry result is
not a price or valuation, and an app sign-in record is not an identified device.
Localize numbers and dates without converting or inventing monetary values.

The website and iPhone product shell share the same language provider.

1. Keep a supported language explicitly selected in Sajda.
2. Otherwise use the first supported entry in `navigator.languages`, with
   `navigator.language` as a fallback source. Regional variants such as
   `sv-SE`, `es-MX`, `fr-CA` and `en-GB` resolve to their supported base language.
3. If no preference is supported or available, use English.

Supported interface languages: English, Swedish, Spanish, French and
Simplified Chinese. Chinese locale variants use the existing Simplified
Chinese interface; this is not a separate Traditional Chinese translation.
There is no geolocation, IP lookup, timezone inference or external API call.

On the web these preferences are the ones exposed by the browser, which can
have its own language setting or restrict the list for privacy. They are not
an unconditional direct read of the operating system's configuration.
See [Navigator.languages](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages).

Automatic detection is never written to storage. `languagechange` updates an
automatic selection, while a manual selection remains in force. A blocked
storage API does not disable language detection or in-memory manual selection.

## Existing preferences and localized URLs

The existing `name-quest.language.v2` key is preserved. An older build also
wrote its default English on mount; those values cannot be distinguished from
a deliberate English choice. They are therefore retained instead of silently
overriding a returning user's choice. Fresh users without a valid saved choice
follow their device/browser preference. Invalid stored values are ignored.

`/se` and `/se/...` are intentionally Swedish pages, independent of the product
preference. Their effective UI language and HTML language stay Swedish, but
visiting them no longer saves Swedish as the user's choice. Leaving that URL
family restores the product's manual/device language. Their localized page
metadata is not replaced by generic product metadata.

## iPhone

`Info.plist` declares `en`, `sv`, `es`, `fr`, `zh-Hans` in
`CFBundleLocalizations` and retains `CFBundleDevelopmentRegion=en`.
This declares the languages for the app's manually localized web interface,
as required by [Apple's language-selection documentation](https://developer.apple.com/library/archive/qa/qa1828/_index.html).
No additional native bridge or hardcoded Swedish locale is introduced.

## Verification

`tests/language-preference.test.ts` runs locale negotiation plus the real
shared provider, web/native selectors and router with explicit browser/storage
fixtures. It covers all supported languages, ordered fallback, invalid values,
blocked storage, manual English, remounts, device changes, listener cleanup,
Swedish routes and server-side English fallback. Native contract tests verify
the language declarations. Simulated preferences are not evidence of a physical
iPhone changing its Settings language; that remains a device QA step.

Verified 2026-09-10 for source `89914b9`: 38 targeted checks passed, and the
full suite passed 841 tests with 3 intentional skips. Web and native bundles
built; GitHub Verify passed and Xcode compilation passed. At this check the
simulator-start job was still running, so no changed-device-locale simulator
result is claimed. In the actual local browser, selecting English, visiting
the Swedish search page, returning through its link and reloading all preserved
the English choice. The test tab was restored afterward.

Preview `sajda-ej6rmdoxx-hypbit.vercel.app` was deployed and its actual served
entry bundle contains the new device-language negotiation. HTML uses English
fallback; `/se/sok-doman` retains Swedish HTML and preview noindex. Health
returned 200. The stable test alias points to this preview, still protected by
Vercel; no production configuration or live user data was changed.

## Editorial revision — 2026-09-10

Reviewed the five-language search, result cards, Swipe, saved domains, account,
plans/billing, native navigation/consent, marketplace, developer portal, Trading
evidence, help, system-status, security and legal UI. Removed incomplete
English fallback from Spanish/French/Chinese Trading details. Source-language
evidence and domain names are preserved; Trading's limited Swedish/English
lexical model is explicitly described, not presented as a multilingual model.

Verification and password-reset email now follow the language of the action.
Only the five supported `x-sajda-language` values reach the auth hooks; unknown
or absent values use English. HTML language, subject, action and plain text
are localized. Recipients, token rules and safety checks remain unchanged.
Idempotency binds the exact rendered payload so retries deduplicate while a
different-language request cannot conflict with the previous payload.

`npm run check:language` checks 65 English-source object dictionaries for
missing keys and interpolation-token mismatches. It is part of `npm run check`.
This AST check is not a linguistic quality score and does not cover every JSX
literal, imported dictionary or template function. The separate Trading tests
cover 178 English-keyed phrases with four explicit translations. Mounted
component tests cover core cards, account/native UI and Trading evidence states.

Local verification: full check passed (868 tests passed, three existing skips),
including lint, types, locale contracts and UI/security regressions. Web and
native product bundles built. Browser checks covered all five homepage
languages, Swedish/English pricing, English login/reset instructions, and
320/390-pixel layouts with no horizontal page overflow in the checked views.
Provider delivery was mocked: no real multilingual email delivery, human
native-speaker review or physical-iPhone language-switch QA is claimed.

Deployment evidence for this revision is recorded separately after publishing.
