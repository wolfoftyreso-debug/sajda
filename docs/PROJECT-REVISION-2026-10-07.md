# Sajda — ny helhetsrevision, 7 oktober 2026

## Bedömning

**Redo för fortsatt kontrollerad utveckling och preview-test. Inte godkänt för
kommersiell produktionslansering eller App Store.** Detta är en granskning av
Sajda, inte den separata marketplace/design-atlas som nämnts i chatten.

Granskad utgångspunkt: `7303ebd90408f84c42f7d0a6832abe76bb09d0e4`,
`codex/launch-hardening`. Tre parallella agentgranskningar omfattade produkt,
backend/säkerhet och release/iOS/SEO. Huvudagenten granskade ändringarna och
kontrollerade miljö, databas, HTTP, MCP och webbläsare. Dessa är inte tre
oberoende mänskliga revisorer eller en juridisk/säkerhetscertifiering.

Sajda är ett namngivnings- och domänforskningsverktyg med varumärkespaket,
självskattning, offentliga kunskapskällor, sparade projekt och en avgränsad
Trading-arbetsyta. Det är ännu inte ett verifierat globalt varumärkesregister,
en komplett CI-förvaltare, juridisk clearance eller heltäckande bevakning.

## Bekräftade fel som rättats

| ID | Grad | Observerat problem | Rättning och acceptans |
| --- | --- | --- | --- |
| REV-01 | P1 | En redan öppen Basic-checkout kunde återanvändas när kunden valde Premium eller Trading. | Kontrollerar vald plan och pris vid varje reservation/återanvändning. Öppen checkout för annan plan ger explicit 409, aldrig fel betalningslänk. Provider-bekräftad utgång tillåter nytt köp för rätt plan. Samma-plan-retries förblir idempotenta. |
| REV-02 | P2 | Native `/pricing` länkade tillbaka till samma sida; verkliga Apple-reglage fanns på kontosidan. | Paketvyn innehåller jämförelse, köp, återställning och hantering. Apple-priser kommer från StoreKit; endast faktiskt lanserade funktioner beskrivs. Ingen Stripe-köplänk i native-vyn. |
| REV-03 | P2 | Sparade projekt med kinesiska eller flera namnspråk föll tyst tillbaka till engelska. | Ursprungliga krav visas och behålls. Generering kräver uttryckligt val av ett stödd huvudspråk; ingen kvot/nätverksbegäran före valet. Exakt domänkontroll behöver inget genereringsspråk. |
| REV-04 | P2 | Det lokala varumärkesarbetsbladet försvann vid navigation utan varning eller export. | Gäst- och kontoavgränsat navigations-/omladdningsskydd. Avbryt lämning behåller arbete. Privat HTML-export behåller källor, ursprungliga datum och checked/reported/listed/unknown. Export är inte kontosparande eller ny verifiering. |
| REV-05 | P2 | Arbetsbladets dokumenttitel beskrev domänsökning; ett redundant presentationskort sköt formuläret långt ned på mobil. | Lokaliserad granskningsmetadata och borttaget överflödigt kort. Befintliga navigationsvägar finns kvar, och sidan förblir noindex. |
| REV-06 | P2 | Webbrenderingsfel saknade en egen begriplig återhämtningsvy. | Fem språk, manuellt avgränsad omladdning, sök-/kontoväg och fokusåterställning. Inga råa undantag/stackar i appens felpresentation. Diagnostik är en uttryckligen lokal webbläsarreferens, inte påstådd servertelemetri. |
| REV-07 | P2 | Historisk release-evidens kontrollerade SHA-format, inte att den gällde aktuell ren kodversion. | Separat `check:release-ready`: uttrycklig web/iOS-kontext, aktuell Git-SHA/branch, ren arbetsyta, literal GO och stödda grindar. iOS kräver även App Store-grinden. Historiska NO-GO-kvitton är oförändrade. |

Andra passet upptäckte en regressionsrisk i REV-01: ett alltför tidigt avslag
skulle låsa en redan utgången checkout. Detta rättades innan leverans. En
annan preliminär invändning avfärdades: Sandbox/Production-isoleringen för
Apple är avsiktlig, inte ett belagt säkerhetsfel.

## Funktions- och mognadskarta

| Område | Vad som finns | Verifieringsgräns / återstående arbete |
| --- | --- | --- |
| Domänsökning | Idé/exakt sökning, ändelser, bounded provider-checks och resultatförklaringar. | En korrekt kontrollerad domän bevisar inte att alla TLD:er eller providers fungerar. |
| Prisjämförelse | Källmärkta standard-TLD-priser och separat exakt-offer-kontrakt. | Standardpris är inte en bekräftad offert för ett premium-/upptaget namn. Flera registrars är länkar utan verifierad offert. |
| Namngenerering | Sju namnspråk; tydlig requested/returned/partial/none och förklaring. | Ingen garanti om tio tillgängliga namn eller språklig/juridisk lämplighet. |
| Varumärkespaket | Domäner, föreslagna sociala handles, marknadsplan och kandidatindex. | GitHub är den självständigt kontrollerade sociala profilkällan. Företagsnamn/varumärken kräver manuell separat kontroll. |
| Brand Index | Versionsatt metod, delsignaler och fyra tillitsklasser. | Kontrollerad registerstatus är inte ägande. Självrapporter och Wikidata-påståenden höjer inte en oberoende verifierad ägarpoäng. |
| Befintligt varumärke | Namnuppslag, val av källentitet och lokalt arbetsblad. | Arbetsbladet kan nu exporteras men är inte ett lagrat kontoreportage eller löpande bevakning. |
| Saved / projekt | Kontoägda domänsnapshots, projekt och kortlistor med concurrency/retry-skydd. | Sparade snapshots behöver bättre datum/källa/unknown-kontrakt och uttrycklig omkontroll. |
| Swipe | Ändelseval och ett stegs premium-undo. | Mounted/server-regler testas; fysisk touch/iPhone och betalt E2E är inte verifierade här. |
| Trading | Research-v3, källor, riskfilter, kontroller, scenarier och journal. | 24 källsidor/600 kandidater/30 rapportposter är tak, inte utlovade fynd eller marknadsvärden. Produktionsmotorn är avstängd. |
| Trading-scenarier | Användarens egna antaganden och deterministisk kalkyl. | Inte empiriskt kalibrerade prognoser, köpsignaler eller avkastningsgarantier. Journalen saknar full retention-livscykel. |
| REST / privat MCP | Konto/API-nyckelgränser, retrieval och mutationskontrakt. | Katalog/schema är inte bevis att varje extern provider eller kontooperation fungerar i produktion. |
| Publik MCP | Sex read-only-verktyg, två prompts, två resurser, 13 dokumenterade hosts. | Installationsfiler/logotyper testade; ingen verklig installation i samtliga hostappar verifierad. Ingen bakgrundsåtkomst till privata chattar. |
| Auth | Better Auth + Neon, samma konto mellan nivåerna; recovery/native-session-gränser. | Alla fyra sociala providers är avstängda i faktiskt preview-svar. Konto-email/signup/reset kräver leveransprov. |
| Commerce | Stripe-state, webhook/idempotens, serverentitlements och native StoreKit-flöde. | Ingen ny riktig Stripe-/Apple-transaktion genomfördes i denna revision. Basic har samma lanserade servercapabilities som Free. |
| Email / kontakt | Validerad, avgränsad backend och leverans-/felkontrakt. | Avsändarkonfiguration är inte verifierad inboxleverans, sender-DNS eller fungerande återställningslänk. |
| iOS | Separat native-bundle, ingen webb-SEO/service worker, native auth/export/köparkitektur. | Windows-bundlebygge är inte Xcode, signerad arkivfil, TestFlight, VoiceOver eller fysisk Safari. |
| SEO | Kuraterad svensk `/se`-arkitektur och tekniska policy-/buildtester. | Global/engelsk SEO-arkitektur saknas. Produktion är avsiktligt noindex tills lanseringsgrindarna stängs. |
| Säkerhet / drift | Ägar-/miljöisolering, inmatningsgränser, private API-fences och säkra request-ID:n. | Ingen belagd ny auth-bypass/IDOR/P0 upptäckt i granskad yta; detta bevisar inte frånvaro av alla sårbarheter. Ingen heltäckande remote frontend-monitoring verifierad. |

## Färsk miljö- och integrationskontroll

Miljöexporterna lästes separat från färska, ignorerade Vercel-exportfiler,
utan lokal `.env.local`-overlay. Inga credentials ingår i detta dokument.
Skyddade Secret-värden kunde inte hämtas; det betyder inte att de saknas i
deployed runtime. Historiska kvitton återanvänds inte som dagens godkännande.

| Inställning | Preview, faktiskt exporterat | Production, faktiskt exporterat |
| --- | --- | --- |
| Canonical | `https://sajda.dev` | `https://sajda-eight.vercel.app` |
| Auth URL | Ej explicit i exporten | `https://sajda-eight.vercel.app` |
| Avsändare | `Sajda <noreply@hypbit.com>` | `Sajda <noreply@mail.sajda.com>` |
| Namnprojekt | Aktiverat | Aktiverat |
| Lost Domains | Aktiverat | Avstängt |
| Lost Domains cron | Ej explicit i exporten | Avstängt |
| Stripe mode / Trading-checkout | `test` / `true` | Ej explicit i exporten |
| Basic/Premium-checkout | `false` / `false` | Ej explicit i exporten |
| SEO-indexering | Ej explicit; preview-policy | `noindex` |

En ej exporterad flagga ska tolkas genom kodens default, inte som bevis om
providerinställningar. Miljöskillnaderna måste samordnas med slutlig ägd
domän och callbacks före produktion; inga flags/DNS/providerobjekt ändrades.

- Färska skrivskyddade Neon-kontroller i båda miljöerna: **22 migreringar
  applicerade, noll väntande**, med checksumkontroll. Ingen migration utförd.
- Protected preview vid utgångspunkten: health 200/databas ansluten;
  auth-providers 200/Google, X, GitHub, Apple samtliga avstängda;
  capabilities 200. Detta är CLI-HTTP, inte ett inloggat kundflöde.
- Publik MCP 1.7.0: SDK-discovery och separat isolation/install-kit-probe
  passerade; 13 SVG-logotyper och ZIP-checksumma kontrollerades.
- Live evidence-proben passerade paket/RDAP-kontroller, men **misslyckades
  på Wikidata-profilen**. Lokal IKEA-sökning och protected-preview-sökning
  gav `lookup_unavailable`. Ett separat bounded primärkälleprov gav HTTP
  200 med JSON-felet `maxlag` och `Retry-After: 5`. Detta är ett faktiskt
  degraderat upstream-prov, inte ett godkänt uppslag eller ett påhittat kodfel.
  Befintlig backoff bibehölls; inga retry-loopar kringgick källans gräns.
- Färsk `npm audit --omit=dev --json`: **noll kända advisories** i
  produktionsberoenden. Inte en penetrationstestning/certifiering.
- Vercel MCP project/runtime-läsning nekades av connector-behörigheter.
  Auktoriserad CLI användes istället. En bounded error-log-query utan
  poster innebär inte att all drift är felfri.

## Slutlig lokal regression och webbläsarprov

- `npm run check:ci` efter frysta kodändringar: **1 936 tester, 1 928
  passerade, noll fel, åtta överhoppade**. De åtta är uttryckligen opt-in
  databasmutationsprov; de aktiverades inte mot kunddata. Lint, TypeScript,
  99 språkdictionaries, UI-kontrakt, Node-syntax, Vercel-typer och
  SEO-/public-bundle-policy passerade.
- Webbygget passerade och det credential-fria lokala HTTP-provet passerade
  **71 kontroller**. Lokal health 503/not_configured är förväntad i den
  isolerade servern utan databas, inte en godkänd databasanslutning.
- Slutligt `build:native` passerade med HTTPS-preview som konfigurerad
  API-origin. Detta verifierar bundle och policy, inte nätverksåtkomst från
  en signerad iPhone-app till en skyddad preview.
- Faktiskt klickprov i Codex in-app browser mot den isolerade lokala
  implementationen: språkbyte, exakt ogiltigt namn, pris-/auth-gränser,
  Trading-gästvy, misslyckat Wikidata-uppslag, skapande av syntetisk scope,
  lokal självrapport och navigation/avbrott. Efter självrapporten var
  checked fortfarande noll och independently verified fortfarande saknad.
- Det slutliga arbetsbladet har rätt lokaliserad dokumenttitel och saknar
  det redundanta introduktionskortet. Tangentbordsaktivering av Tillbaka
  öppnar varning; Fortsätt redigera behåller rapportens originaldatum och
  återställer fokus till samma länk. Uttrycklig lämning leder till uppslag.
- Layoutkontroll av arbetsblad och dialog vid begärda viewports
  **320, 375, 390, 430, 768 och 1 440 × 844 CSS-px**: ingen horisontell
  sidöverskjutning eller kontroll utanför den tillgängliga bredden. När
  scrollbar fanns var dokumentbredden 15 px mindre. Mobil skärmbild av
  avbrottsdialogen sparades lokalt som QA-evidens, inte som produktinnehåll.
- HTML-exportens invariants och native cancel/failure verifierades i
  automatiska tester. Browserklicket gav korrekt "download started" och
  lämningsskyddet låg kvar. Browserverktygets väntan på nedladdningsfil
  timeoutade; faktiskt hämtad fil kan därför **inte** räknas som verifierad
  i detta browserprov.

Inte testat här: fysisk iPhone/iPad/Safari/VoiceOver, 200 % zoom, mörkt läge,
alla signerade kontoresor, riktig inboxleverans, Stripe/Apple-transaktioner,
hela Trading-köns kapacitet eller verklig installation i alla AI-klienter.

## Använda verktyg och avgränsningar

- Repository och GitHub: kodhistorik, regressionsprov och befintlig CI.
- Vercel: färsk miljöexport och protected HTTP via auktoriserad CLI när
  MCP-läsningen nekades. Inga skydd sänktes eller bypass-hemligheter exporterades.
- Neon: befintlig anslutning för read-only schema-/checksumkontroller.
- Browser: verkliga UI-handlingar med syntetiska lokala uppgifter; inga
  köp, mejl, externa publiceringar eller kontomutationer.
- Publik MCP/Wikidata: riktig SDK-/HTTP-evidens som skiljer fungerande
  discovery/isolation från misslyckad upstream-funktion.
- Mobbin/Semrush: inte använda ceremonielt; denna revision gjorde inga
  marknads-/keyword-påståenden som kräver deras data. Inga privata Drive-,
  Gmail- eller Slack-data genomsöktes. Ingen fungerande Stripe-/Resend-/
  Sentry-connector påstås ha använts; faktiska externa grindar kvarstår.

## Återstående konkreta fynd och beslut

| ID | Typ/grad | Evidens | Nästa steg med verifierbart kriterium |
| --- | --- | --- | --- |
| OPEN-01 | P2, saknad produktfunktion | BrandIndexAssessment håller arbetsblad/observationer i React-state; projekt sparar shortlist-konfiguration, inte rapporthistorik. | Kontoägd versionsatt brand workspace + immutable evidence history. Refresh/login/API ger samma ursprungliga datum; stale förblir stale; annan ägare saknar åtkomst. |
| OPEN-02 | P2, datakontrakt | `saved-domain-input.ts` ersätter saknat pris/värde/confidence med 0; äldre DB-kolumner har NOT NULL/default 0. | Additivt snapshot-kontrakt med explicit unknown, valuta/period/källa/observed_at. Migrera inte gamla nollor till verifierade fakta. UI/API/MCP måste vara överens. |
| OPEN-03 | Kommersiell lanseringsgrind | Basic/Free har samma faktiska `save_domains`-capability och inga egna högre sökgränser/bevakning. | Bygg verklig Basic-nytta före försäljning: exempelvis avgränsad projektkapacitet/återkommande kontroller med tydliga servergränser. Ändra inte Free till en artificiell betalvägg. |
| OPEN-04 | P2, saknad verifieringskapacitet | Oberoende verified-score är null; company/trademark är manuell; matchande profil är inget kontrollbevis. | Expirerande konto- och domänbunden TXT/website-challenge. Fel domän/replay/annan ägare nekas. Resultatet säger endast kontroll av exakt den domänen. |
| OPEN-05 | P2, retention-livscykel | Trading-journalens 100 poster har inget arkiv/delete-flöde; projektens gräns 50 räknar även arkiverade. | Reversibel arkivering och explicit borttagning med optimistic versions/retry-kvitton; tydlig kapacitet/retention. API/MCP/UI-paritet. |
| OPEN-06 | Operativ risk, inte belagd incident | Cron tar högst tre work-items var femte minut samtidigt som större research-körningar accepteras. | Simulera flera fulla körningar och definiera admission/kö-/SLA-budget. Visa uppmätt slutförandetid innan någon SLA utlovas. |
| OPEN-07 | Operativ risk | Minute-bucket rate-limit-scopes saknar samlad retentionstädning. | Godkänd retention + verifierad cleanup; mät faktisk tillväxt. Ingen DB-explosion/outage påstås här. |
| OPEN-08 | Externt live-prov misslyckat | Wikidata maxlag ovan; begränsat till en community-källa. | Provider-specifik diagnostik/freshness och sanningsenlig degradering; eventuell alternativ primär källa utan att omklassificera cached/asserted data till verified. |
| OPEN-09 | Externa lanseringsgrindar | Domän/callback-drift; social OAuth av; sender-/betal-/legal-golden-path saknar verifiering. | Stabil ägd origin, avsändar-DNS, riktiga kontomejl, fyra OAuth-flöden, sandbox-checkout→webhook→entitlement→retry/cancel, samt operatörens legal/retention/vendorbeslut. |
| OPEN-10 | App Store-grind | Saknat Developer-/signeringsunderlag; TestFlight/backend reachability inte kontrollerad; native reconciliation cron ej aktiverad. | Separat nåbar Sandbox-miljö, signering, StoreKit-produkter, köp/restore/renewal/revocation på faktisk app; därefter planerad reconciliation. Behåll miljöisoleringen. |

## Rekommenderad byggordning

1. Lagra varumärkesarbetsyta och originalobservationer i kontot med API/MCP-paritet.
2. Lägg till explicit omkontroll från Saved och korrekt unknown/valuta/datum-kontrakt.
3. Verifiera faktisk kontroll av enskilda domäner — inte globalt ägande eller juridisk clearance.
4. Gör Basic/Premium kommersiellt meningsfulla med verkliga serverstyrda förmågor.
5. Stäng externa auth/email/commerce/domän/Apple-grindar och kör riktiga kundresor.

Normal CI, en READY-preview och schema-giltiga rapporter ersätter inte dessa
grindar. Ingen ny produktionspromovering, betalning, kontoradering, massutskick,
DNS-ändring eller juridisk godkännandeförklaring gjordes i denna revision.
