# Starta hela Sajda lokalt mot den befintliga Supabase-driften

Den här vägen kör den riktiga React-applikationen, med inloggning, historik,
bevakningslista och den befintliga `user-domain-scan`-funktionen. Den är en
kompatibilitetsbro för en tidigare Supabase-instans, inte en demo.

```powershell
npm run start:local
```

Öppna sedan http://127.0.0.1:8080 och logga in med ditt befintliga konto.
Lämna `VITE_SCAN_EXECUTION_MODE` odefinierad för den hostade Supabase-
driften: då startar klienten den autentiserade Edge Function direkt, precis
som den ursprungliga appen gjorde.

## Lokal tillgänglighetsverifiering

När den fulla appen körs på `127.0.0.1` verifieras slutresultat ytterligare av
den lokala webbservern. Ett namn visas som **Tillgänglig** endast när den här
kontrollen får ett auktoritativt svar:

- `.com` kontrolleras mot Verisign RDAP över HTTPS.
- `.se` kontrolleras mot Internetstiftelsens WHOIS.
- `.io` kontrolleras mot NIC.IO:s WHOIS.

`.nu` visas tills vidare som **Ej verifierad** och måste kontrolleras hos
registratorn. Detsamma gäller vid timeout, rate limit eller nätverksfel; appen
gissar aldrig att en domän är ledig. Datorn behöver därför utgående HTTPS samt
WHOIS (TCP port 43) till registry-servrarna.

Registreringspris och screeningvärde är separata saker. I det lokala
sökläget hämtas Loopias offentliga detaljprislista och kortet visar bara ett
tidsstämplat pris när den exakta TLD-raden kan tolkas säkert; annars står det
"Ej hämtat". Pris från leverantören är inte en låst offert: kampanjvillkor,
premiumdomäner, moms och slutlig kassa kan ändra beloppet. I detta läge går
både köp- och prisunderlagslänkar till Loopia för samtliga stödda TLD:er.

För en självhostad Supabase-server med worker sätter du i stället
`VITE_SCAN_EXECUTION_MODE=worker`. Då ska den fulla self-hosted-stackens
worker, funktioner och databasmigreringar vara driftsatta först.

`npm run start:local-search` behåller den fristående RDAP-sökaren endast för
felsökning när den hostade backendmiljön inte är tillgänglig.

## Lokalt testläge utan inloggning

För tillfällig testning utan konto skapar du en lokal, ej versionshanterad
`.env.local` med:

```dotenv
VITE_LOCAL_TEST_MODE=true
```

Bygg därefter om och starta den lokala servern:

```powershell
npm run build
npm run start:local
```

Det här läget fungerar **endast** på `127.0.0.1`, `localhost` eller `::1`.
Det öppnar bara domänsökningen och använder den lokala verifieraren; ingen
Supabase-inloggning, historik, bevakningslista eller molnskrivning används.
Konto-, historik- och Top 10-sidor skickas tillbaka till söksidan för att
undvika den äldre molndatan under testet. I testläget visas bara `.com`,
`.io` och `.se`, eftersom de har auktoritativ lokal kontroll. Ta bort raden eller sätt den till
`false`, bygg om och starta om när du vill återgå till normalt inloggat läge.

Det kreativa testläget siktar på 50 förslag. Den lokala motorn kontrollerar
upp till 80 kandidater för att kunna sortera bort upptagna namn innan de 50
visas. Den visar aldrig ett timeout- eller okänt svar som ledigt.
