# Scroll start verification — 2026-09-09

Request: start newly opened pages at the top.

Fixed native history restoration competing with router scroll, plus query-only
and same-URL visits not triggering a reset. BFCache returns are handled; delayed
hash targets retain bounded observation and cleanup. Search-entry presets keep
their prepared fields without automatically moving/focusing the new page.
Explicit in-page actions and section links still navigate to their targets.

Verified before/after in the real browser: old preview retained scrollY ~749
after reload. Updated preview returned scrollY 0 after reload from a nonzero
offset, same-page footer navigation, route changes, back, forward, authentication
entry and password-reset mode change. `/legal#privacy` reached its section with
the intended 96px scroll margin. Final homepage was left at scrollY 0 in Swedish.

- Preview: https://sajda-a2sf4r3yz-hypbit.vercel.app/
- Runtime source: `fa4742c`; Vercel READY; health reports database connected.
- 8 focused scroll tests passed. Full suite: 629 tests, 627 passed, 2 skipped.
- Typecheck, targeted ESLint, UI contracts and local Vercel build passed.
- Trading flag retained on this preview; no account, crawl or database changes.
- Existing user Trading run tab was preserved, not navigated or restarted.
- No production promotion. BFCache lifecycle covered in component tests, not a
  separately verified native Safari BFCache session.
