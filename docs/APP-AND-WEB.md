# Sajda: webbplats, iPhone-app, API och MCP

Produktkrav från användaren, 2026-09-10. Detta är den beslutade målbilden,
inte en rapport om en redan byggd eller publicerad iPhone-app.

## En motor, fyra ingångar

Sajda ska vara både en webbplats och en iPhone-app samt erbjuda ett API och en
MCP-server som egna delar av produkten. Appen ska ha hela produktens
funktionalitet, med samma kontobundna data och paketbehörigheter. API och MCP
ska ge program och AI-assistenter kontrollerad åtkomst till samma motor, inte
separata imitationer av sök- eller Trading-logiken. SEO och marknadsföring hör
till webbplatsen, inte till appupplevelsen eller MCP-verktygsresultat.

- Samma Sajda-konto för sökning, sparande, Swajp och Trading på båda plattformar.
- API- och MCP-åtkomst ska också bindas till rätt Sajda-konto och uttryckliga
  rättigheter. Ett anrop via en AI-assistent får inte kringgå paket eller kvoter.
- Gemensam backend på Vercel, Neon Postgres och befintlig AI Gateway. Ingen ny
  Supabase-backend och ingen separat databas eller inloggning för Trading.
- Delade domänmodeller, valideringsregler, algoritmer och serverbehörigheter.
- Separata webb- och appskal; mobil skärmbredd är inte ett sätt att avgöra om
  SEO ska visas. Mobilwebben ska behålla sina publika sidor.
- Bevara Sajdas visuella identitet, men utforma appnavigation, tangentbord,
  safe areas, gester, fokus och återgång för iPhone.

## Funktionsgränsen

| Område | Webbplats | iPhone-app |
| --- | --- | --- |
| Exakt sökning, namnförslag, filter, register- och priskontroll | Ja | Samma produktfunktioner |
| Swajp, valda ändelser, spara och behörighetsstyrd ångra | Ja | Samma produktfunktioner |
| Sparade namn, projekt, historik och bevakningar | Ska fungera fullt ut | Samma kontodata och funktioner |
| Trading, rapporter, filter, export och explicita körnings-/prisåtgärder | Ja, enligt behörighet | Samma funktioner och servergränser |
| Marknadsplats och produktens operativa utvecklarverktyg | Ja | Funktionerna får inte försvinna som "marknadsföring" |
| Konto, paket, fakturering, återställning, support och integritet | Ja | Ja, med plattformsanpassade flöden |
| SEO-landningar, guider för sökmotorer och företagspresentation | Ja | Inte som appskärmar |
| Produktförklaring och metodik | Fulla sidor vid behov | Kort, relevant hjälp nära funktionen |

"All funktionalitet" betyder funktionell likvärdighet för samma roll/paket,
inte gratis tillgång till betalda funktioner eller att varje webbsida ska bäddas
in. Prisbevis, osäkerhet, risker och nödvändig support/juridik får inte döljas
under förevändningen att appen inte ska ha SEO.

## Nästa tekniska byggsteg

1. Separera gemensamma produktfunktioner från webbens innehåll och navigation.
   Appbygget ska inte importera SEO-sidmallar, sitemap-/prerendergenerering,
   marknadsföringsfooter eller webbinstallationsflödet.
2. Bygg ett separat appskal. Återanvändning av React-gränssnitt via Capacitor
   är en teknisk kandidat, inte ett redan verifierat native-beslut.
3. Implementera och testa uttrycklig native autentisering/API-transport. Bevara
   webbens same-origin- och CSRF-skydd; lägg inte till wildcard-CORS eller
   exponerade webb-sessionstokens för att få ett appskal att fungera.
4. Lägg plattformsberoende funktioner bakom små gränssnitt: autentisering,
   externa köp-/leverantörslänkar, delning/export, notifieringar och appåtergång.
5. Skapa iOS-bygge, signering och TestFlight-distribution. Verifiera flöden på
   fysisk iPhone innan en appversion beskrivs som fungerande.

## API och MCP är produktgränssnitt, inte bara dokumentation

Det stabila API-kontraktet ska vara versionshanterat och beskrivet med OpenAPI.
MCP ska vara ett tunt protokollager över samma tjänster och kontroller, med
tydliga verktygsbeskrivningar och strukturerade resultat. HTTP-transport och
protokollversioner ska väljas och integrationstestas mot riktiga MCP-klienter;
en vanlig JSON-endpoint är inte i sig en fungerande MCP-server.

Följande är avsedd förmåga, inte ett påstående om redan publicerade endpoints:

| Förmåga | Läsning respektive åtgärd | Kontroller |
| --- | --- | --- |
| Exakt domänkontroll och namnsökning | Register-/AI-anrop med resurskostnad | Inmatningsgränser, kvot, tidsstämplar, verklig status |
| Prisjämförelse och kvalitetsbedömning | Läsa eller uttryckligen uppdatera underlag | Källor, aktualitet, valuta och osäkerhet |
| Sparade namn och projekt | Läsa, spara, uppdatera | Kontoägarskap och separata läs-/skrivrättigheter |
| Bevakningar | Läsa, skapa, ändra, avsluta | Konto, paket, explicita mutationer och dubblettskydd |
| Trading-rapporter | Läsa rapport, kandidater och körningsstatus | Trading-behörighet och privat ägarskap |
| Trading-körningar och prisuppdatering | Starta, stoppa eller begära uppdatering | Explicit handling, idempotens, budget och åtkomstkontroll |
| Kontots rättigheter och förbrukning | Läsa tillåten kapacitet | Ingen nyckel-/tokenexponering och ingen rättighetseskalering |

Säkerhets- och releasekrav:

- API-nycklar ska vara återkallningsbara, begränsade och lagrade som verifierbara
  hashvärden, inte klartext. De får inte bakas in i iPhone- eller webbbygget.
- Fjärr-MCP behöver ett separat, granskat auktoriseringsflöde för klienter; ge
  inte en AI-assistent webbens sessionscookie eller leverantörernas hemligheter.
- Samma behörighetskontroll och beständiga förbrukningsregler ska användas över
  klienter och serverinstanser. Transportbyte får inte ge nya gratisbudgetar.
- Läsa rapport eller lista verktyg får inte starta en långkörning. Långvarigt
  arbete ska ge en beständig jobbreferens och separat status/resultatläsning.
- Register-, pris- och skrapdata är data, inte instruktioner till AI-klienten.
  Okänt får aldrig omvandlas till ledigt, billigt eller en säker köpsignal.
- Köp, debitering, ägaröverföring och destruktiva kontoåtgärder ingår inte
  automatiskt bara för att en generell MCP-adapter finns.
- Testa verklig discovery och verktygsanrop, felaktig/återkallad åtkomst,
  korsanvändaråtkomst, kvoter, timeout och dubblettanrop före publicering.

## Verifierat nuläge i koden

- `src/App.tsx` blandar produkt-, konto-, SEO- och företagssidor; samma
  `SajdaFooter` används på nästan alla rutter.
- `src/integrations/neon/managed-client.ts` och `auth.ts` använder webbens
  origin och cookies. `api/auth.ts` lämnar inte ut sessionstokens. En lokalt
  paketerad app kan därför inte få fungerande auth genom att enbart ändra URL.
- `vite.config.ts` och `src/pages/Install.tsx` beskriver en PWA/webbinstallation,
  inte ett iOS-projekt. Install-sidans påståenden om offline/native är inte
  belägg för en fungerande iPhone-app och behöver korrigeras vid plattformsdelningen.
- `/my-domains`, `/history` och `/top-10-today` är i den nuvarande Vercel-vägen
  spärrade med `AccountFeatureUnavailable`. Utvecklarnas nyckelhantering är
  också begränsad. Funktionsparitet måste åtgärda dessa luckor, inte kopiera dem.
- Inget native-projekt, signerat iOS-bygge eller TestFlight-test verifierades
  i denna genomgång. Ingen runtime, betalning eller deployment ändrades.
- API-grunden finns i `api/openapi.ts`, `api/v1/public/domains.ts` och
  `api/v1/domains.ts`. Den privata vägen har en operatörsprovisionerad hashlista;
  `api/_shared/developer-api-keys.ts` stänger fortfarande den pensionerade
  självbetjäningsvägen. Den är inte ett färdigt, kontobundet API-nyckelsystem.
- Ingen MCP-server/protokollhanterare hittades i den aktiva koden. API och MCP
  ska inte marknadsföras som fullständiga innan implementation och klienttest.

## Appens releasekrav

- Samma konto och sparade data efter plattformsbyte, omstart och återinloggning;
  utloggning och byte av användare ska tömma privat lokalt tillstånd.
- Funktioner och gränser styrs av servern, även efter förnyelse, återkallad
  behörighet, köpåterställning och avbrutet betalflöde.
- Befintliga Stripe-webbflöden får inte kopieras rakt in i appen. Apples
  gällande köpregler, distributionsmarknader och eventuella undantag måste
  verifieras innan köpflödet väljs. Automatisk dubbelprenumeration ska förhindras.
- Kontoåterställning, verifieringslänkar, köpåtergång, delning och notifieringar
  ska öppna rätt skärm utan tokens i URL eller oavsiktliga nya Trading-körningar.
- Långa Trading-jobb ska köras server-side och kunna återupptas i gränssnittet
  efter att appen stängts; en iPhone-timer får inte vara schemaläggaren.
- Inget påstående om livekontroll offline. Cachat underlag måste behålla sin
  verkliga tidsstämpel och skiljas från aktuell tillgänglighet och aktuellt pris.
- Funktionell kontoborttagning, tillgänglig support, integritetsuppgifter och
  nödvändiga granskningskonton ska finnas före App Store-granskning.
- Mobil emulering i en webbläsare är inte ett godkänt iPhone/TestFlight-test.

## Primära teknik- och distributionskällor

- [Capacitor: befintliga webbprojekt och native runtime](https://capacitorjs.com/docs)
- [Capacitor iOS: Xcode, bygge och enhetstest](https://capacitorjs.com/docs/ios)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/):
  köp och flera plattformar i 3.1, appfunktionalitet i 4.2 samt kontoborttagning
  i 5.1.1. Kontrollerade 2026-09-10; granska igen inför release.
- [MCP:s officiella arkitektur](https://modelcontextprotocol.io/docs/learn/architecture):
  protokoll, strukturerade verktyg och fjärrtransport. Kontrollerad 2026-09-10;
  aktuell dokumentation pekade på version 2026-07-28. Klientkompatibilitet måste
  verifieras separat och inte antas från dokumentationen.
