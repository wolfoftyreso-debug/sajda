# Legal and App Store launch review — 2026-09-17

Scope: current dirty working tree; web and native product/data flows. This is an engineering and source-based legal readiness review, not legal advice, an App Store approval, completed privacy declarations or verification of production retention. Existing user changes were preserved. No purchase, email, external account mutation, contract acceptance or Apple enrolment was performed.

## Operator follow-up — 2026-09-24

The owner confirmed **Landvex AB** as Sajda's responsible company. Its [official company information](https://landvex.com/company), checked on 2026-09-24, identifies the Swedish entity as registration number **559141-7042**, address **Antennvägen 2, 135 48 Tyresö, Sweden**, registered office **Tyresö**, and publishes Swedish telephone **+46 10 198 58 81**. The legal page now displays these particulars, the existing Sajda support/privacy email `dev@hypbit.com`, and the company-information link in all five languages. This is company-published evidence, not an independently obtained registration certificate. The operator choice comes from the owner; the company's separate US entity is not represented as Sajda's operator.

This resolves the unnamed-operator finding. It does not establish controller/processor roles for every flow, legal bases, international-transfer safeguards, retention periods, subscription terms, merchant-account ownership or App Store declarations. No provider or retention commitments were inferred from the company's general website. GDPR Article 13 and the current Swedish Distance Contracts Act were rechecked against the primary sources linked below on 2026-09-24; the remaining disclosure and consumer-withdrawal findings still apply.

## Decision

**Not ready for unrestricted public/commercial launch on legal evidence currently available.** No P0 exploit was established in this bounded review. The P1 items below require verified operator facts or release-environment evidence; copy changes cannot supply those facts.

| Priority | Finding and scope | Remaining launch evidence |
| --- | --- | --- |
| P1 — personal-data service | Landvex AB and its company-published particulars are now identified. Public policy still lacks a complete purposes/legal-bases mapping, retention criteria and transfer safeguards. | Operator reviews controller/processor roles, purposes, legal bases, recipients, retention including logs/backups/support, international transfers and rights handling; confirm operational ownership of published contact channels. Publish a coherent notice where data is collected. |
| P1 — consumer sales | The operator is identified, but product terms do not constitute complete subscription/consumer terms. A functioning Stripe portal does not establish a statutory withdrawal workflow. | Reconcile the Landvex AB seller identity with payment accounts and contractual flows; verify offer/features/quotas, total taxes/price, period/renewal, cancellation, complaint handling, statutory remedies and applicable withdrawal rights. Implement and test applicable online withdrawal and durable acknowledgement before consumer sales. |
| P1 — Apple distribution | Apple Developer account/agreements and final release declarations are not established. | Complete enrolment, trader status/contact verification, signed archive and device review; supply working review access, support/privacy URLs and release-specific App Privacy answers. Root/mobile review owns native setup and IAP lifecycle evidence. |
| P1 — production data lifecycle | Source includes email-confirmed account deletion, Stripe cleanup and Apple cancellation warnings. Source tests do not establish email delivery, production deletion, backup retention or provider contracts. | Verify release backend and actual verification/recovery/deletion delivery with a controlled account; confirm deletion and retention exceptions. Validate vendor agreements/settings and operational request-handling process. |

GDPR Article 13 requires controller/contact information, purposes and legal bases, recipients and transfer information where applicable, retention information, rights and complaint information. The contact address alone cannot complete this notice. Source: [GDPR, Article 13](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679); guidance: [IMY — data-subject rights](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/de-registrerades-rattigheter/).

For applicable Swedish consumer distance contracts, pre-contract disclosures and withdrawal rules must be evaluated against the actual offer. Since 19 June 2026, an applicable online withdrawal function must remain accessible during the withdrawal period and issue a durable acknowledgement with receipt time. Cancellation of future renewal is a different action. Do not assume a SaaS subscription is automatically exempt as delivered digital content. Sources: [Swedish Distance Contracts Act, Chapter 2 §§ 2–4, 9–12](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-200559-om-distansavtal-och-avtal-utanfor_sfs-2005-59/), [Konsumentverket — 2026 withdrawal change](https://www.konsumentverket.se/nyhet/lagandring-gor-det-enklare-att-angra-kop-pa-natet/).

## Safe changes made

- `src/pages/Legal.tsx`: five-language account/service disclosures now name actual account infrastructure, account/session categories, email delivery and external domain checks. The 30-minute guest snapshot is described as a restore window, not guaranteed erasure.
- `src/i18n/legalDataCopy.ts`: five-language factual disclosures for stored project briefs/brand configurations, Trading scenarios/research, contact messages, billing identifiers and deletion boundaries. Added account/deletion and support links plus explicit trademark non-clearance.
- `docs/APP-PRIVACY-INVENTORY.md`: reconciled projects, scenarios, optional Cloudflare recipient and bounded entity-type filtering with source.
- `api/_shared/brand-lookup.ts`: prevent known human Wikidata records and records without usable classification from being returned or cached as brand candidates; apply the same check to direct and redirected profile requests. Search now makes a maximum of two bounded source calls under one deadline. `brand-lookup-budget.ts` charges two units upfront so the 30-request per-instance hourly ceiling does not increase.
- `tests/brand-lookup.test.ts`: regression coverage for human/missing/malformed types, direct/redirected profiles, filtering before caching, provider errors and weighted admission. MCP fixture now models the classification request and checks the current exact tool catalogue instead of obsolete counts.

The entity safeguard uses Wikidata P31 (instance of), excluding Q5 (human). It preserves typed nonhuman identities and does not assert that community classifications are accurate or that all source text lacks personal information. Unclassified legitimate brands may be omitted; no names are guessed into the results. Sources: [Wikidata P31](https://www.wikidata.org/wiki/Property:P31), [Wikidata Q5](https://www.wikidata.org/wiki/Q5).

## Apple review mapping

Current Apple guidance requires accessible privacy disclosures, in-app account deletion, and explicit permission before third-party AI sharing. Source has an opt-in Google Gemini/Vercel control and an account deletion panel; live behavior still needs release verification. The public-database people-lookup risk under 5.1.1(viii) motivated the type guard; this is not a blanket prohibition on company data.

Digital feature unlocks generally require IAP; external payment/link rules vary by storefront and entitlement. Keep the existing native Apple path and recheck the selected markets. Review requirements also cover completeness and accurate metadata. Source: [Apple App Review Guidelines, 2.1, 3.1, 5.1](https://developer.apple.com/app-store/review/guidelines/).

Apple permits a confirmation code sent to an existing account address for deletion. Deleting an app account does not itself stop an Apple subscription; the flow must explain billing and allow deletion independently. Source: [Apple — offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

EU distribution also requires an accurate trader-status assessment and verified contact details where applicable. Source: [Apple — EU DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements).

## Other launch checks

- Cookies/local storage: no third-party analytics SDK found is not proof that production injects none. Inventory actual cookie/storage purposes and assess necessity; browser clearing controls are not a substitute for consent when required. [PTS — cookies](https://pts.se/internet-och-telefoni/kakor-cookies/).
- Names/trademarks: availability and community assertions do not establish rights. Product text now states this explicitly. Review the Sajda name, assets and market claims separately; no trademark clearance was performed. [PRV — preparing a trademark application](https://www.prv.se/sv/varumarke/forbered-dig-infor-varumarkesansokan/).
- Research/exports: prior audit flagged source-license attribution in exported research. Current export license/attribution completeness remains a separate review item; this subtask did not change exports. See [prior provenance findings](research/launch-privacy-implementation-2026-09-13.md).
- Accessibility: existing aspirational copy is not a compliance statement. Assess applicable service accessibility obligations for actual consumers and release scope, and test the final web/native surfaces.

## Implementation evidence and verification

Reviewed account/auth, deletion and billing cleanup, contact delivery, AI permission, name-project/Trading schemas, domain quote recipient and brand-lookup adapters against the public text. Important evidence paths: `api/_shared/account-server.ts`, `account-deletion.ts`, `account-deletion-billing.ts`, `account-email.ts`, `api/contact.ts`, `shared/name-projects.ts`, `shared/trading-scenarios.ts`, migrations 0018/0019, `src/lib/searchSession.ts`, `src/components/AccountDeletionPanel.tsx` and `src/i18n/aiPrivacyCopy.ts`.

Focused adapter/budget/privacy tests: **38 passed**. Updated MCP tests and final type/lint checks are reported with the task handoff. Whole-repository verification/deploy is owned by the root task. No successful real purchase, real account deletion, public release or App Store submission is implied by these tests.

Follow-up fixture repair, 2026-09-24: the mounted registrar-price UI test failed because its `DomainCard` fixture rendered router links without a router. The fixture now uses `MemoryRouter`, matching the application's routing context; the existing all-language FX and provider-link assertions pass (**1 passed**). This changes no product pricing behavior.

Follow-up checks: focused ESLint passed for `Legal.tsx`, `legalDataCopy.ts` and `registrar-usd-ui.test.ts`; language contracts report **94 English-source dictionaries, 0 key/placeholder mismatches**. Full-suite verification remains with the root task after its concurrent changes are complete.

## Launch UX follow-up — 2026-09-24

- The shared authentication footer now links neutrally to product terms and privacy information instead of claiming that every sign-in/recovery action accepts a privacy policy. Removed five unused copies of the former claim. Optional-AI consent remains a separate explicit control; no authentication or consent state is changed by reading the footer.
- The privacy page includes rights, a direct request route that does not require sign-in, safe identity-verification guidance and a link to IMY's complaint instructions in all five interface languages. It does not require users to contact Sajda before complaining, nor guarantee every request is exempt from the legal conditions on the relevant right. Sources rechecked: [GDPR Articles 12–22 and 77](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679), [IMY rights](https://www.imy.se/privatperson/dataskydd/dina-rattigheter/) and [IMY complaints](https://www.imy.se/privatperson/utfora-arenden/lamna-ett-klagomal/).
- Pricing now exposes direct, localized product-terms, privacy and contact links without enabling unfinished purchases or changing any price.
- [Internal release decisions](LEGAL-RELEASE-DECISIONS.md) consolidates known facts, source-observed validity/cleanup boundaries and the minimum remaining authorized operator decisions. It is not published as customer terms. Missing retention, legal-basis and vendor-transfer facts remain missing; this follow-up does not close those launch gates.
- Verification: **15 focused tests passed, 0 skipped**, including mounted Legal/Auth/Pricing in all five languages and a no-provider-call boundary; focused ESLint and whitespace checks passed. No claim of live mailbox delivery, browser/mobile production verification or legal approval is made by these checks.
