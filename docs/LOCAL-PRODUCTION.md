# Archived legacy self-host guide

> This document describes the previous Supabase self-hosted architecture. It
> is retained only as migration history and is **not** a supported Sajda
> deployment path. Use [Vercel deployment](./VERCEL-DEPLOYMENT.md) and
> [Neon + Vercel architecture](./NEON-VERCEL.md) for new environments.

# Lokal produktionsdrift

Den här guiden beskriver den avsedda, säkra driften av Sajda på en
lokal Linux-server. Den ersätter den tidigare molnkopplade modellen.

## Målarkitektur

```text
Klienter ──HTTPS──> Caddy (enda publika ingressen)
                         ├─> Sajda web (statisk Vite-build)
                         └─> Supabase Kong ─> Auth / REST / Realtime / Storage / Functions
                                                     │
Privat worker ─────────────service key + JOB_SECRET─┘
                                                     └─> PostgreSQL

RDAP/IANA (utgående, kontrollerad nätåtkomst eller intern spegel)
```

Postgres, Kong, Studio och Edge Functions får inte exponeras direkt mot LAN
eller Internet. Låt Caddy vara enda ingången på port 80/443. Studio ska vara
avstängd externt eller nås enbart via VPN/admin-nät.

Använd den officiella self-hosted Supabase Docker Compose-stacken i produktion,
inte `supabase start`: CLI-stacken är för lokal utveckling/test. Läs de
officiella referenserna före varje stackuppdatering:

- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/guides/self-hosting/self-hosted-functions
- https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https
- https://supabase.com/docs/guides/self-hosting/restore-from-platform

## Förutsättningar

- Linux-server med Docker Engine och Docker Compose plugin. Avsätt minst 8 GB
  RAM, snabb SSD och separat, krypterad backup-lagring.
- FQDN eller interna DNS-namn för webben och Supabase API:t, till exempel
  `namequest.example.internal` och `supabase.namequest.example.internal`.
- Caddy på värden eller en väl administrerad motsvarighet för TLS.
- En beslutad egresspolicy: RDAP behöver IANA:s bootstrap-fil och registry-RDAP
  för faktiskt tillgänglighetssvar. Vid helt stängt nät kan bootstrap-filen
  speglas internt, men varje TLD behöver fortfarande en godkänd
  registry-/registrar-datakälla.
- Node 22.12–24.x och npm 11 för bygg/worker.

## Ny installation

1. Hämta och versionspinna den officiella self-hosted Supabase Compose-stacken
   i exempelvis `/opt/supabase`. Följ dess installationsinstruktioner och skapa
   dess `.env`. Pinna version/image-digests i ert driftdokument.
2. Generera **helt nya** JWT-, anon- och service-role-nycklar för den lokala
   installationen. Återanvänd aldrig nycklar eller cron-token från den gamla
   molninstansen. Användarna loggar in på nytt när JWT-signeringen byts.
3. Bind Kong mot loopback eller privat Docker-nät, exempelvis
   `127.0.0.1:8000:8000`. Exponera inte databasen, Studio eller Function
   Runtime med värdportar.
4. Kopiera `infra/selfhost/functions.env.example` till
   `/opt/supabase/.env.functions`. Sätt riktiga värden:

   ```dotenv
   SUPABASE_URL=http://kong:8000
   SUPABASE_SERVICE_ROLE_KEY=<ny lokal service_role-nyckel>
   JOB_SECRET=<minst 32 slumpmässiga byte>
   ALLOWED_ORIGINS=https://namequest.example.internal
   ```

   Filen ska ägas av driftkontot, ha restriktiva filrättigheter och aldrig
   läggas i Git eller ett front-end-build.
5. Kopiera `infra/selfhost/docker-compose.functions.override.yml` till
   `/opt/supabase/` och inkludera den i den officiella stackens `COMPOSE_FILE`
   (eller i motsvarande `docker compose -f`-kommando). Den ger enbart
   Functions-containern tillgång till `.env.functions`.
6. Starta den officiella Supabase-stacken enligt dess dokumentation. Kopiera
   därefter funktionskoden och återskapa Functions-containern:

   ```sh
   /opt/name-quest/infra/selfhost/deploy-functions.sh /opt/supabase
   ```

   Vid miljövariabeländring måste Functions-containern återskapas igen; ett
   `restart` räcker inte alltid för att läsa in nya värden.
7. För en helt tom databas, kör projektets SQL-migreringar i filnamnsordning.
   För en flytt från en existerande instans: återställ först en testad export
   och kör därefter endast den nya append-only-migreringen
   `20260820173000_production_hardening.sql`. Använd följande kontrollerade
   kommando efter att legacy-schemat redan finns:

   ```sh
   /opt/name-quest/infra/selfhost/apply-production-hardening.sh /opt/supabase
   ```

   Det gamla `domain_history` kopieras inte automatiskt, eftersom historiska
   rader saknar ägare. Den låses i stället ned och ny användarhistorik lagras i
   `user_domain_history` med RLS och unik `(user_id, domain)`.
8. Skapa den första administratören manuellt från en skyddad databas-session,
   efter att administratörens Auth-användare finns. Gör aldrig första signup
   automatiskt till administratör:

   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('<auth-user-uuid>', 'admin')
   ON CONFLICT (user_id, role) DO NOTHING;
   ```

## Webb och HTTPS-proxy

1. Kopiera `.env.selfhost.example` till en privat build-env på servern och fyll i:

   ```dotenv
   VITE_SUPABASE_URL=https://supabase.namequest.example.internal
   VITE_SUPABASE_ANON_KEY=<lokal anon-nyckel>
   VITE_SCAN_EXECUTION_MODE=worker
   NAME_QUEST_WEB_BIND_ADDRESS=127.0.0.1
   NAME_QUEST_WEB_PORT=8080
   ```

   `VITE_*` byggs in i JavaScript och är inte hemliga. Där får bara URL och
   anon/public key finnas.
2. Bygg och kör den statiska webbcontainern:

   ```sh
   docker compose --env-file /etc/name-quest/web.env -f docker-compose.app.yml up -d --build
   ```

3. Anpassa `infra/caddy/Caddyfile.production.example`, lägg filen i Caddys
   konfiguration och ladda om Caddy. Den proxar webbtrafik till `127.0.0.1:8080`
   och Supabase till `127.0.0.1:8000`. Caddy hanterar WebSocket för Realtime.
   För intranät kan `tls internal` användas när Caddys rotcertifikat är betrott
   på klienterna; använd normala ACME-certifikat för publika DNS-namn.

## Worker och schemalagda jobb

Webbläsaren begär en skanning via den autentiserade
`request_user_scan`-funktionen. Den validerar indata, begränsar mängden
begäranden i databasen och lägger till en serverutfärdad dispatch-markering.
Den lokala workern claimar **enbart** sådana markerade rader atomiskt och kör
skanningen privat med `JOB_SECRET`. Skanningen fortsätter därför när
användaren stänger sidan, utan att en vanlig browser-insert kan bli
privilegierat workerarbete.

Vid uppgradering till denna kömodell: stoppa den gamla workern, applicera
`20260826100000_harden_user_scan_dispatch.sql`, deploya den uppdaterade
`user-domain-scan`-funktionen och webbbygget, och starta först därefter den
uppdaterade workern. Äldre `queued`-rader är avsiktligt `legacy` och
claimas inte automatiskt; granska eller avsluta dem administrativt i stället
för att återköa dem.

1. Kopiera `infra/worker/worker.env.example` till
   `/etc/name-quest/worker.env` och fyll i lokala hemligheter. För worker på
   värden används `SUPABASE_INTERNAL_URL=http://127.0.0.1:8000`.
2. Installera `infra/systemd/name-quest-worker.service`, skapa användaren
   `namequest`, äg katalogerna `/opt/name-quest`, `/etc/name-quest` och
   `/var/lib/name-quest` korrekt, och starta sedan tjänsten med systemd.
3. Låt `ENABLE_SCHEDULED_JOBS=false` tills `nightly-domain-scan` har provats
   manuellt. Sätt sedan `true` och återskapa/starta om workern. Tiden följer
   `Europe/Stockholm` och standardtimmen är 02:00.

`registrar-scraper` returnerar avsiktligt 501 tills en avtalad, godkänd
registrar-API-adapter finns. Bygg inte en produktsanning på HTML-skrapning eller
på en heuristisk prisuppgift.

## Säkerhetskontroller före öppning

- Verifiera att alla user-funktioner kräver giltig Supabase-JWT och att alla
  interna funktioner kräver rätt `x-job-secret`. `verify_jwt=false` i
  `supabase/config.toml` finns enbart för den separata jobbhemligheten; varje
  handler gör sin egen verifiering.
- Verifiera att `ALLOWED_ORIGINS` innehåller exakt webb-URL:en, utan `*`.
- Testa negativ RLS: användare A får inte läsa/uppdatera användare B:s scans,
  resultat, domäner eller historik. Testa även att ett browseranrop inte kan
  anropa `valuate-all-domains`, `nightly-domain-scan` eller notification-jobb.
- Testa kögränsen: ett direkt PostgREST-`INSERT` till `user_scans` ska
  nekas, `request_user_scan` ska acceptera högst två giltiga begäranden per
  användare och tio minuter, och workern ska ignorera både `legacy`-rader
  och rader utan dispatch-markering.
- Bekräfta att en RDAP-timeout blir `unknown`, aldrig `available`. Bekräfta
  särskilt `.se`/`.nu`; frånvaro i DNS är inte registerbevis för ledighet.
- Testa scan→worker→resultat och kontrollera att värderingar faktiskt används.
  Kontraktet är `{ "valuations": [...] }`; huvudflödet läser nu det omslaget
  explicit i stället för att behandla svaret som en array.
- Kör backup och återläsningstest innan produktionsöppning.

## Backup, återställning och uppdatering

Kör `infra/selfhost/backup-postgres.sh /opt/supabase /srv/backup/name-quest`
från ett begränsat driftkonto, skicka backupen krypterat till en separat plats
och lagra SHA-256-filen tillsammans med den. Ta regelbundet en backup av
Supabase Storage också; databasdumpen täcker inte objektfiler.

Återläsning ska först repeteras mot en separat, tom testmiljö. Dokumentera
återställningstid och verifiera Auth, Storage, RLS och en faktisk skanning.
Kör aldrig ett `pg_restore --clean` mot produktionsdatabasen som en rutinåtgärd.

Vid uppdatering: ta backup, uppgradera den officiella Supabase-stackens pinnade
release enligt dess release notes, återskapa Functions efter deploy, kör
`npm ci && npm run check && npm run build`, och utför canary-scan före full
öppning.

## Vad algoritmen lovar — och inte lovar

- Kandidater genereras lokalt och deterministiskt, med algoritmversion i varje
  resultat. Modebegränsningar är 12/20/24/25 kandidater för
  light/medium/heavy/deep så att en Function-körning är förutsägbar.
- IANA:s aktuella RDAP-bootstrap används i stället för en hårdkodad TLD-lista.
  Endast RDAP `404` räknas som tillgänglig; 2xx är upptagen och övrigt är
  osäkert.
- Värdet är en förklarbar USD-prioriteringssignal med längd, TLD, uttalbarhet,
  ord- och kommersiella signaler. Det är inte en marknadsvärdering, ett
  registrarpris, råd att köpa eller en varumärkesbedömning.
- Kontrollera alltid slutlig ledighet, slutligt pris, registreringsvillkor och
  varumärkesrisk hos en godkänd registrar/registry innan köp.
