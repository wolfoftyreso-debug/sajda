# Sajda — lanseringsrevision: SEO, juridik och App Store

Granskad **13 september 2026**.

## Beslut

**NO-GO för publik lansering, betalaktivering och App Store-inlämning i nuvarande läge.** Kontrollerad intern testning kan fortsätta, men detta är inte ett godkännande att ta in fler konsumenter eller börja debitera.

Det finns en fungerande teknisk grund och flera vältestade skydd. De viktigaste stoppen är en otillgänglig produktionsadress, ofullständiga juridiska uppgifter och ännu inte verifierade Apple-, mejl- och betalningsflöden. Fler SEO-sidor löser inte dessa stopp.

Detta är en teknisk och juridisk beredskapsgranskning, inte ett juridiskt utlåtande, en fullständig säkerhetscertifiering eller Apples godkännande. Juridisk bedömning utgår från möjlig svensk/EU-konsumentlansering; bolag, försäljningsländer och avtalsmodell är ännu inte fastställda.

## Omfattning och evidens

Granskningen omfattar aktuell arbetskopia, inklusive tidigare ej committade projektförändringar, samt preview:
https://sajda-134q1vgm0-hypbit.vercel.app

- **VERIFIED:** aktuell kod eller reproducerat testresultat.
- **OBSERVED:** direkt observerat HTTP-/leverantörssvar vid granskningen.
- **INFERRED:** slutsats från dessa observationer, inte ett separat genomfört kundtest.
- **UNKNOWN:** underlag eller verklig verifiering saknas.

Verktyg som faktiskt användes: repository/Git för implementation, lokala testverktyg, Vercel CLI för skrivskyddad driftkontroll och webbläsningsverktyg för aktuella primärkällor. Inga direktanslutna App Store Connect-, Sentry-, Stripe-, Resend- eller Search Console-verktyg fanns tillgängliga. Semrush behövdes inte för denna tekniska lanseringsgrind och användes inte.

**Endast revisionsdokument skapades.** Ingen produktkod, databas, DNS, betalning, mejlleverans, miljökonfiguration eller deployment ändrades. Gamla simulator-/betalningsrapporter räknas inte som ny verifiering av denna version.

## Prioriterade lanseringsstopp

| ID | Nivå och omfattning | Fynd | Vad som måste verifieras för att stänga fyndet |
| --- | --- | --- | --- |
| L1 | P1 — publik webb och app | Samtliga 22 SEO-sidor anger en canonical-värd som ger Vercel 404. Aktuell preview kräver Vercel-inloggning. | Stabil publik HTTPS-adress, lyckad produktionsdeploy, nåbara juridik-/supportsidor samt korrekt canonical, API, auth och mejllänkar. |
| L2 | P1 — publik tjänst med personuppgifter | Juridisk operatör och fullständig integritetsinformation saknas. Registreringen nämner villkor utan klickbara länkar. | Verifierade bolagsuppgifter, publicerad korrekt policy/villkor och begriplig information där data samlas in. |
| L3 | P1 — konto och App Store | Kontoradering finns, men är beroende av mejlad kod. Verklig leverans och radering på releasebackend är inte verifierade. | Mottaget verifierings-/återställnings-/raderingsmejl, fungerande länkar, kontrollerad radering och dokumenterade lagringsundantag. |
| L4 | P1 — före konsumentbetalning | Kommersiella villkor, skattehantering och ångerflöde är ofärdiga. Kodtester är inte genomförda kundbetalningar. | Tydligt totalpris/avtal, tillämpligt ångerflöde med mottagningsbevis och riktig sandboxlivscykel inklusive återbetalning/behörighet. |
| L5 | P1 — App Store | Appens konto-API är avstängt på aktuell preview. Aktuell signerad release, fysiskt iPhone-test och App Store Connect-underlag saknas. | Publik fungerande appbackend, signerat korrekt arkiv, enhetstest, riktiga integritetsdeklarationer och fungerande granskningskonto. |
| L6 | P1 — före IAP | Production/Sandbox-routing är olöst för den slutliga kandidaten. Köpskärmen visar inte paketens innehåll/kvoter. | Säkert separerad Apple-miljöhantering, tydlig paketering och riktiga TestFlight/Sandbox-köp, återställning, förnyelse och återkallelse. |

Ingen P0-exploit påvisades inom denna avgränsade revision. Det betyder inte att hela produktens attackyta eller produktionsmiljö är säkerhetscertifierad.

## SEO: rätt grund, fel publik destination

**OBSERVED:** alla 22 granskade SEO-dokument pekar på `https://sajda-eight.vercel.app`. Publika anrop till värdens startsida, `/se`, `/legal`, `/robots.txt` och `/sitemap.xml` gav **404 DEPLOYMENT_NOT_FOUND**. Det är den effektiva canonical-adressen; kodens reservvärde `sajda.dev` ska inte förväxlas med den.

Vercels skrivskyddade lista för projektets production-miljö returnerade en deployment i **ERROR** och ingen READY-production i det svaret. Den undersökningen bevisar inte statusen för andra projekt.

Previewens **302 till Vercel SSO och noindex är korrekta testmiljöskydd**. Ta inte bort dem för att få ett grönt SEO-resultat. Etablera i stället en riktig produktionsrelease. En publik integritetspolicy får vara noindex, men måste kunna läsas utan utvecklarens inloggning.

Godkänt i denna revision:

- 22 förgenererade svenska sidor med en H1, metadata, giltig JSON-LD och internlänkar.
- 14 extra kontroller av bland annat redirect, riktig 404, sitemap/robots och kodade frågeparametrar.
- Privata projekt/sökningar hålls utanför index; projektsvaret är även private/no-store.
- 41 riktade tester samt statisk SEO- och policykontroll.

Den godkända HTTP-sviten kontrollerar konsekvent canonical-deklaration, **inte att dess destination fungerar**. Det separata publika anropet avslöjade just den luckan. Konsistenta canonical-signaler behövs även efter domänbytet. [Google om canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

**P2:** produkten är engelskspråkig i grunden, men den indexberättigade ytan består bara av 22 svenska sidor. Startsida, pricing och developers är permanent noindex. Skapa senare en liten separat engelsk publik ingång; indexera inte privata sökningar. Språkversioner behöver egna riktiga adresser, inte bara ett UI-språkval. [Google om språkversioner](https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites).

Produktionssnapshoten anger fortfarande noindex; aktuell livevariabel har inte exporterats. Indexering ska aktiveras uttryckligen först när releasegrindarna är stängda. Search Console, fältdata för Core Web Vitals och Googles valda canonical är **UNKNOWN**. Avsaknad av Open Graph-bild är P3, inte ett indexeringsstopp.

## Juridik och integritet

### Operatör och information vid registrering

**VERIFIED:** `src/pages/Legal.tsx:93–104` beskriver generisk lagring och tjänsten, men anger inte en fullständig personuppgiftsansvarig, rättsliga grunder, lagringskriterier och rättighets-/klagomålsinformation. Kontaktadressen `dev@hypbit.com` fastställer inte vilket bolag som är avtalspart.

Operatörens namn, etableringsadress och e-post ska vara lätt tillgängliga, med organisations-/momsuppgifter när tillämpligt. [E-handelslagen 8 §](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2002562-om-elektronisk-handel-och-andra_sfs-2002-562/).

Policyn behöver knyta faktisk behandling till ansvarig, ändamål, rättslig grund, mottagare, eventuella överföringar, lagring och användarens rättigheter. Det gäller även en kostnadsfri kontotjänst. [GDPR artikel 13 hos IMY](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/dataskyddsforordningen-i-fulltext/).

`src/pages/Auth.tsx:828` visar en vanlig textrad om villkor och integritet, utan länkar. Lägg korrekt information direkt vid registrering. En integritetspolicy är inte i sig ett allmänt samtycke till varje behandling; fastställ rätt grund per ändamål, inte en slentrianmässig obligatorisk GDPR-kryssruta. [IMY om rättslig grund](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/).

### Konkreta skillnader mellan policy och implementation

- **Namnprojekt och Trading-scenarier** lagras privat på kontot med brief, budget, valda namn och analysantaganden. De saknas i den äldre datainventeringen.
- **30 minuter är en återställningsgräns, inte garanterad radering.** `searchSession.ts:34–35` ignorerar för gamla gästresultat men tar inte bort råvärdet. Policyn lovar mer än koden.
- **Cloudflare** tar emot exakta domäner i den konfigurerade connectorns prisförfrågningar men saknas i mottagarinventeringen.
- **Arkivering är inte radering.** Projektexport är inte fullständig kontoexport. Rättighetsärenden kan kräva en dokumenterad operatörsprocess; en ny exportknapp är inte automatiskt hela lösningen.
- Leverantörsavtal, regioner, internationella överföringar, loggar, säkerhetskopior och supportbrevlådans retention är **UNKNOWN**. Kontoradering kan inte lovas radera redan exporterade filer eller alla externa kopior.

Den separata implementationrapporten anger kodrader, lagringsnycklar och exakt vad som skickas till varje känd mottagare. Avtal och skydd för tredjelandsöverföringar behöver kontrolleras mot verklig drift, inte leverantörernas logotyper. [IMY om överföringar](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/overforing-till-tredje-land/).

### Konsumentavtal och ångerfunktion

Katalogen anger **Free 0, Basic 9, Premium 19 och Trading 49 USD/månad**. `docs/COMMERCE.md` säger att endast Trading har webbetalningsimplementation och att skatte-/avtalsfrågorna återstår. Priskatalogen är inte bevis på aktiverad försäljning.

Före konsumentbeställning behövs tydliga egenskaper, totalpris/skatter, faktureringsperiod, löptid, uppsägning, reklamation och tillämplig ångerrätt. Sajda är en löpande digital tjänst; dra inte automatiskt slutsatsen att omedelbar åtkomst undanröjer ångerrätten. [Distansavtalslagen 2 kap.](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-200559-om-distansavtal-och-avtal-utanfor_sfs-2005-59/).

Sedan **19 juni 2026** ska berörda onlineavtal med ångerrätt ha en lättillgänglig ångerfunktion och elektroniskt mottagningsbevis. Ingen sådan separat process hittades i implementationen. Vanlig abonnemangsuppsägning, kontoradering och återbetalning är andra operationer. Bedöm vem som är avtalspart och hur webb respektive Apple-köp ska hanteras. [Konsumentverket om lagändringen](https://www.konsumentverket.se/nyhet/lagandring-gor-det-enklare-att-angra-kop-pa-natet/).

### Villkorade kontroller före bred lansering

- **Cookies:** ingen generell cookie-bannerbrist har konstaterats. Inventera faktisk lagring; nödvändiga funktioner och valfri mätning har olika förutsättningar. Statistik är inte automatiskt nödvändig. [PTS om cookies](https://pts.se/internet-och-telefoni/kakor-cookies/).
- **AI:** namngiven Google Gemini/Vercel Gateway, tydligt input och uttryckligt val är positiva. Fastställ roller och relevanta transparenskrav enligt artikel 50 som gäller från 2 augusti 2026; detta är inte ett påstående att varje namnförslag måste vattenmärkas. [EU-kommissionens FAQ](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act).
- **Tillgänglighet:** avgör om svensk tillgänglighetslag för e-handel omfattar operatören och om tjänsteundantag är tillämpligt. Bolagsstorlek är okänd. VoiceOver, textförstoring och fulla köpflöden på enhet är inte verifierade. [PTS om tillgänglighetslagen](https://pts.se/digital-inkludering/lagen-om-vissa-produkters-och-tjansters-tillganglighet/vanliga-fragor-och-svar-om-tillganglighetslagen/).
- **Datakällor:** robots- och källgodkännande är inte licensbevis. Trading-vyn visar käll-/licensinformation som CSV-exporten inte behåller. Kontrollera faktiskt återanvänt materials rättigheter; revisionen fastställer inte upphovsrättsintrång i domänfakta.
- **Namn och marknadsföring:** varumärkesclearance för Sajda och kommersiella källavtal är inte verifierade. PRV/EUIPO/WIPO-kontroll behöver relateras till marknad och tjänsteslag. En ledig domän är inte automatiskt ett fritt varumärke. [PRV om varumärkesundersökning](https://www.prv.se/sv/Varumarke/Vad-ar-ett-varumarke/).
- Trading ska beskrivas som domänresearch med daterade observationer och osäkerhet. Döda länkar är inte köpbevis och scenarier är inte garanterade vinster. Lokal marketplace-draft får inte presenteras som en fungerande transaktionsmarknad.

## App Store: förberedd implementation, inte inlämningsklar app

**OBSERVED:** POST till `/api/native/account` och `/api/native/commerce` på aktuell preview ger **503 native_not_enabled**. Det är en avsiktlig konfigurationsgrind, inte en konstaterad auth-bypass. CI/native-konfiguration pekar dessutom på äldre skyddade previewadresser.

**VERIFIED i kod:** serverstyrda rättigheter, StoreKit-brygga, återställning, in-app-kontoradering, Keychain-transport och frivillig AI finns. Apple kräver fortfarande fungerande backend, granskningsåtkomst och färdiga beteenden i den inskickade versionen. [Apple inför granskning](https://developer.apple.com/app-store/review/).

Före inlämning:

1. Koppla den exakta kandidaten till en fungerande publik appbackend och genomför inloggning, sparande, återbesök och radering på fysisk iPhone.
2. Färdigställ offentlig policy, App Privacy-svar, support, ålders-/exportuppgifter och granskningskonto. Välj inte ”Data Not Collected” för dagens kontobaserade modell. [Apple om App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy).
3. Bygg och validera ett signerat arkiv. Sedan 28 april 2026 krävs Xcode 26+/iOS 26 SDK+; deployment target 17.4 är en separat kompatibilitetsinställning. Granska det verkliga arkivets SDK-manifest. Avsaknad av en egen manifestfil bevisar inte ensam en överträdelse. [Apple SDK-krav](https://developer.apple.com/news/upcoming-requirements/).
4. Om köp ingår: lös `native-commerce-config.ts:31`. Den binder produktionsbackend till Apple Production, medan TestFlight alltid köper i Sandbox. Bevara verifiering och separerade rättigheter; lita inte på klientens val av miljö. [Apple Sandbox](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox).
5. Visa vad varje paket faktiskt innehåller vid köp; `NativeCommercePanel.tsx:66` visar nu namn/pris men inte kvoter/nytta. Verifiera rättigheter, restore, förnyelse, refund och återkallelse med riktiga Apple-testtransaktioner. Även samtidiga förstaköp via Stripe och Apple behöver täckas innan båda öppnas. [Apple om abonnemang](https://developer.apple.com/app-store/subscriptions/).

Native-prissidans text om att restore/hantering saknas är P2 eftersom kontosidan redan har dessa funktioner. Egen email/password-inloggning innebär inte automatiskt att Sign in with Apple saknas. Capacitor innebär inte automatiskt avslag. Slutlig bedömning görs av Apple.

## Tester och begränsningar

| Kontroller denna revision | Utfall | Vad det inte bevisar |
| --- | --- | --- |
| SEO-testsvit | 41 godkända; policy/statisk kontroll godkänd | Googles indexering, ranking eller Core Web Vitals |
| Preview-SEO HTTP | 22 dokument + 14 extra kontroller godkända | Fungerande publik canonical-destination |
| Integritet/konto/projekt/kontakt | 100 godkända, 0 skippade | Verklig mejlleverans eller radering i produktionsdatabas |
| Native/IAP/auth/AI | 83 godkända, 0 skippade | Apple-köp, signering eller fysisk enhet |
| Webbcommerce | 54 godkända, 0 skippade | Genomförd Stripe-sandboxtransaktion |
| Åtta negativa runtimegränser | Sex förväntade skyddssvar; två native-503 | Åtta fungerande kundflöden |

Sviter överlappar delvis och ska **inte summeras** som unika tester. Det befintliga native-runtime-skriptet blev inte godkänt: det förväntade 401 där nativegrinden gav 503. Uppföljningen bekräftade orsaken utan att ändra konfiguration.

Riktiga App Store-/Stripe-transaktioner, levererade mejl, signerat slutarkiv, aktuell fysisk iPhone, publik produktionsresa, komplett juridisk bolagskontroll och Search Console är **inte verifierade**.

## Nästa fem åtgärder i rätt ordning

1. **Operatör + engineering:** fastställ juridiskt bolag och produktionsdomän; få en READY-production med publika policy-/supportadresser.
2. **Operatör/jurist + engineering:** fastställ databehandling och kundavtal; publicera korrekta dokument och länkar, rätta de verifierade policy-/lagringsmismatcharna.
3. **Engineering + drift:** verifiera verklig Resend-leverans till kontrollerade adresser, konto-/raderingsflöde, driftsloggar och betalningens failure/retry/ångerprocess. Håll ny försäljning stängd tills detta fungerar.
4. **Engineering + Apple-kontoägare:** färdigställ releasebackend, Apple-miljöhantering, paketinnehåll, signerat arkiv och fysisk enhets-/Sandbox-verifiering.
5. **Releaseansvarig:** kör anonym produktionssmoke och SEO-HTTP igen; aktivera endast godkänd indexyta, slutför Search Console och App Store-underlag. Lägg därefter till den engelska publika ingången.

För juridiska dokument behövs fortfarande **bolagsnamn, organisationsnummer, land och företagsadress**. Inga uppgifter har hittats på eller ersatts med antaganden.

## Detaljunderlag

- [SEO och offentlig drift](research/launch-seo-2026-09-13.md)
- [Integritet, lagring och källor](research/launch-privacy-implementation-2026-09-13.md)
- [App Store, native-runtime och IAP](research/launch-appstore-2026-09-13.md)
