# Sajda för iPhone: implementation och verifieringsläge

Uppdaterad 2026-09-10. Ett separat produktbygge och ett Capacitor-projekt för iOS
finns i koden. JavaScript-bygget, Swift-kompilering i Xcode, gränssnittet i mobil
webbläsarvy och serverns autentiseringsgränser har testats. Ingen signerad iPhone-version eller
TestFlight-distribution har verifierats. Full funktionsparitet är ett fortsatt
krav, inte en uppnådd release-status.

Första iOS-bygget kräver iOS 17.4 eller senare. Capacitors äldre basnivå räcker
inte i sig som kompatibilitetslöfte för produktens gemensamma webb-API:er.
Versionsgolvet motsvarar bland annat WebKits moderna avbrottshantering
([Safari 17.4](https://webkit.org/blog/15063/webkit-features-in-safari-17-4/)).

## Webb och app har olika ingångar

| Del | Webbplats | Paketerad app |
| --- | --- | --- |
| Ingång | `index.html` → `src/main.tsx` → `src/App.tsx` | `native.html` → `src/main.native.tsx` → `src/app/NativeApp.tsx` |
| Byggkonfiguration | `vite.config.ts` och befintliga webbbyggskript | `vite.native.config.ts` och `scripts/build-native.mjs` |
| Gemensamt | `AppProviders`, `ProductRoutes`, konto-, medlemskaps- och sökkontexter | Samma produktkomponenter och servergränser |
| Publiceringsinnehåll | SEO-sidor, guider, företagssidor, footer och webbinstallation | Inget sådant sidinnehåll importeras av appens ingång |
| Navigation | Befintlig webbnavigation | Fast Sök, Swajp, Sparat, Trading, Konto; Mer och Hjälp i apphuvudet |

`VITE_SAJDA_SURFACE=native` väljer uttryckligen apppresentationen via
`src/lib/appSurface.ts`. Mobil skärmbredd, user agent eller installerad PWA
används inte för detta beslut. Mobilwebben behåller sitt webbinnehåll.

Appen har korta sök-, Trading- och marknadsplatsrubriker. Alla söklägen,
ändelser, leverantörsval, avancerad brief, filter och resultatkomponenter
återanvänds. Native sökinställningar kan öppnas utan att slå på avancerad brief.
Swajps kortlek får den återstående skärmhöjden ovanför appnavigationen.
Skalet reserverar safe areas och flyttar fokus vid sidbyte.
Apphuvudet använder ett kompakt språkval med fem fullständigt namngivna
alternativ. Webbens separata språkknappar är oförändrade. Språkbyte och
återläsning testas genom den riktiga språkprovidern; den slutliga
simulatorbilden visar det nya apphuvudet utan överlapp.

Mer innehåller marknadsplats, utvecklarverktyg, befintliga kontofunktioner,
paket, hjälp, support, integritet, villkor, säkerhet och driftsstatus.
`/how-it-works` går till kort apphjälp. Webbsidor som `/story`, `/se/...` och
`/install` är inte appskärmar. Appen visar en ärlig felsida om sådana adresser
öppnas direkt.

## Samma konto via en uttrycklig iOS-transport

Swift-implementationen finns i `ios/App/App/SajdaNativePlugin.swift` och är
registrerad genom `SajdaViewController`. Den är ansluten till JavaScript genom
`src/lib/nativeTransport.ts`; `AuthContext` och `integrations/neon/auth.ts`
väljer apptransporten i native-bygget.

1. Appen skapar slumpmässig state och en PKCE-verifierare, och öppnar
   `/connect/native` i `ASWebAuthenticationSession` med en S256-challenge.
2. Webbens vanliga Sajda-inloggning används. En explicit anslutningsknapp
   beskriver konto-, medlemskaps-, sparade namn- och API-nyckelåtkomst.
   Ett besök på sidan skapar ingen behörighet.
3. Servern kontrollerar webbcookie, samma origin, kontoid och verifierad e-post.
   En kortlivad engångskod skickas till den fasta callbacken
   `com.hypbit.sajda://auth/callback` tillsammans med state.
4. Swift validerar callback och state, löser in koden med verifieraren och
   lagrar appens credential i Keychain med
   `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. Bearercredentialen lämnas
   inte till React, `localStorage`, sessionsobjekt eller delningsadresser.
5. `URLSession` skickar behöriga kontoanrop till `/api/native/account`.
   Den använder en tillåten HTTPS-origin från det paketerade bygget, saknar
   cookielagring och följer inga redirects. Publika produktanrop skickar
   ingen bearercredential.

`api/_shared/native-auth.ts` lagrar hashvärden för engångskoder och appsessioner.
Kodinlösen är en atomisk databasoperation. Appsessionen är bunden till konto,
miljö och den ursprungliga webbsessionen, och kan inte gälla längre än denna.
Återkallade/utgångna sessioner, borttagna konton och förlorad e-postverifiering
stänger åtkomsten. Misslyckad serververifiering blir inte en lokal inloggning.

`api/native/account.ts` väljer endast uttryckligt tillåtna kontoåtgärder:
medlemskap, sparade domäner, Swajp-behörighet, Trading och utvecklarnas
API-nyckelhantering. Anropskontot måste stämma med credentialens konto.
Serverintern delegering använder objektidentitet i en `WeakMap`, inte ett
HTTP-headerfält som en klient kan förfalska. Befintliga tjänster kontrollerar
fortfarande ägarskap, paket, kvoter och idempotens.

`productFetch` sköter publika sökningar, Deep Review, valutareferens, fakta,
kontakt och status. Dess native-väg godtar endast specificerade relativa
API-adresser och metoder. Webbens vanliga `fetch` och cookies behåller sitt
beteende. Den separata loopback-verifieraren är avstängd i native-bygget;
Capacitors lokala hostname ska inte slå på utvecklingsverktyg.

## Bygga och förhandsgranska

På denna Windows-arbetsyta:

```powershell
$env:SAJDA_NATIVE_API_ORIGIN='https://sajda-test-hypbit.vercel.app'
npm run build:native
npm run sync:ios
```

Appikon och startbild har exporterats från Sajdas befintliga SVG-identitet,
inte från Capacitors standardgrafik. Återskapa dem med
`npm run generate:native-assets` om originalidentiteten ändras.

Byggskriptet skapar `dist-native/index.html`, versionerade produktfiler,
Sajdas tre SVG-identitetsfiler och `sajda-native-config.json` med den publika
backendadressen. Det anropar ingen SEO-generator och paketerar ingen
service worker, webbmanifest, sitemap eller robots-fil. Backendadressen är
byggkonfiguration, inte en credential eller en genväg förbi deploymentskydd.

`capacitor.config.ts` har `webDir: "dist-native"` och saknar `server.url` och
`allowNavigation`. iOS kör de paketerade produktfilerna.

```powershell
npm run dev:native -- --host 127.0.0.1 --port 8096 --strictPort
```

Öppna `http://127.0.0.1:8096/app` för lokal gränssnittsgranskning. Devservern
behåller native-ingången även vid omladdning av `/pricing`, `/auth` och andra
appvägar. Den visar logotypfiler vid utveckling utan att kopiera webbens
publika katalog till appbygget. Appinloggning är avstängd i webbläsarvisningen
med en tydlig förklaring; iOS-transporten ersätts inte med webbcookies eller
låtsad kontodata.

På en Mac med Xcode, efter `build:native` och `sync:ios`:

```sh
npm run open:ios
```

`.github/workflows/ios.yml` kompilerade det faktiska Swift-projektet med Xcode
26.6 för både arm64- och x86_64-simulator i
[GitHub-körning 34442691513](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34442691513).
Loggen bekräftar `BUILD SUCCEEDED` och en uppladdad simulatorartefakt.
En simulatorartefakt kan inte installeras som en signerad app på en fysisk iPhone.
Även installation, appstart och skärmbild är verifierade i
[simulatorkörning 34442691513](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34442691513):
varje fas avslutades med status 0 och den granskade skärmbilden visar Sajdas
paketerade sökskärm och appnavigation, inte en blank startskärm eller Safari.
Detta verifierar inte systeminloggning, externa nätverksflöden eller en fysisk
iPhone. Två tidigare startförsök avbröts/tidsbegränsades; separata fasloggar och
deadlines finns nu, och kompilerad app sparas även om ett startprov misslyckas.

## Vad som har kontrollerats

- `npm run build:native` lyckades. Utdata saknade chunks för SEO-sidor,
  SajdaStory, HowItWorks, SajdaMethodology, SajdaFooter och Install samt
  webbens crawler- och PWA-filer.
- Native-skalet granskades i en separat webbläsarvy vid 390 × 844: sökning,
  navigation, Mer, konto/inloggning, paket och Swajp. Inget horisontellt
  överflöde eller överlapp med Swajps kortlek hittades på dessa skärmar.
  Omladdad `/pricing` använde `main.native.tsx`, hade ingen footer eller
  canonical-länk och hade samma dokumentbredd som viewporten.
- `tests/native-product-shell.test.ts` testar gemensamma rutter, synlig
  navigation, ärliga spärrar, säkra återgångar, inloggningsavbrott och att
  native Trading varken hämtar webbfakturering eller startar Stripe.
- `tests/native-auth-security.test.ts` testar PKCE, förfalskad delegering,
  scopes, kanoniska API-vägar, blockerad fakturering, begränsad JSON och
  fail-closed sessioner. Dess databastransport är simulerad och gör inga
  externa anrop. En lokal 54-stegskontroll och ett slutprov med 58 kontrollpunkter
  mot deployad Vercel-preview med riktig utvecklings-Neon har verifierat serverflöden,
  inklusive engångskodinlösen, felaktig verifierare, återspelning och återkallning.
  Vercel-kontrollen använde administratörens autentiserade CLI och verifierar
  inte att en extern iPhone kan nå den skyddade preview-miljön.
- `tests/native-language-switcher.test.ts` verifierar alla fem språk,
  sparat språkval, tillgängligt namn, ogiltiga val och att webbens språkval
  behåller sitt befintliga beteende.
- Typecheck och riktad ESLint samt befintliga konto-, paket-, fakturerings-
  och Trading-komponenttester passerade under arbetet.

## Kvar före iPhone-release

- Verifiera systemwebbläsare, callback, Keychain, utloggning, återinloggning,
  kontobyte och serveråterkallelse på en fysisk iPhone. Kompilering och mobil
  webbläsarvy verifierar inte detta.
- StoreKit, köpåterställning och plattformsanpassad prenumerationshantering
  saknas. Native `/pricing` visar befintligt paket och att köp ännu inte
  stöds. Klient och server blockerar webbens Stripe-kassa och portal via
  native-gränssnittet. Kontrollera regler och distributionsmarknader inför
  ett separat köpbeslut; förebygg dubbla prenumerationer.
- Kontoborttagning saknar ett fullständigt produktflöde. Support och
  integritetssidor finns, men ersätter inte kontoborttagning före release.
- `/history`, `/my-domains` och `/top-10-today` är fortfarande spärrade på
  Neon-vägen. Projektfunktioner och fullständiga bevaknings-/notisflöden är
  inte implementerade genom att dessa länkar finns i Mer.
- Marknadsplatsen använder fortfarande tydligt märkta lokala utkast på
  Neon-vägen. Kontogemensamma publika annonser, verifierade överlåtelser,
  försäljning och betalning är inte färdiga. Legacy-adminverktygen är inte
  anslutna till Neon-kontots roller.
- Verifiera export/delning och leverantörslänkar i iOS, tangentbord, safe
  areas, VoiceOver, återgång från bakgrunden och återanslutning efter
  nätverksavbrott. Ingen livekontroll eller aktuellt pris utlovas offline.
- Verifiera att Trading-jobb fortsätter genom serverns schemaläggare när
  appen är stängd och återupptar rätt rapport utan en ny körning. Native
  åtkomst gör inte en klienttimer till en bakgrundsschemaläggare.
- Slutför Apple Developer-signering, App Store Connect,
  integritetsdeklarationer, granskningskonto och TestFlight-test.

Serverns native-funktion är dessutom uttryckligen miljöstyrd med
`SAJDA_NATIVE_ENABLED=true` och kräver de relevanta Neon-migreringarna.
Ett lyckat lokalt appbygge aktiverar inte dessa serverinställningar.
