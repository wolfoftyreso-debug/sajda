# Moderniseringsrapport – 2026-08-20

## Levererat

### Algoritm och datakvalitet

- Ersatt moln-/LLM-beroende kandidatgenerering och värdering med en lokal,
  deterministisk motor (`2.0.0`). Varje resultat har version, signaler och en
  tydlig begränsning: prioriteringssignal i USD, inte marknadsvärdering.
- Rättat svarskontraktet mellan `user-domain-scan` och `value-domains`.
  Skanningen läser nu `{ valuations: [...] }` korrekt i stället för att falla
  tillbaka till samma multipel för alla domäner.
- Ersatt DNS-baserad ledighetslogik med RDAP. Endast auktoritativ RDAP `404`
  blir `available`; avbrott, hastighetsbegränsning och ej stödd TLD blir
  `unknown`. Det förhindrar falskt ledig-markering av registrerade `.se`/`.nu`
  utan DNS-delegering.
- IANA:s RDAP-bootstrap hämtas dynamiskt, så endpoints är inte hårdkodade och
  blir inaktuella.

### Säkerhet och data

- Alla Edge Functions använder explicit autentisering, begränsad CORS,
  strikt JSON-inmatning, gränser för batchar och databaserad användarkvot.
- Publika service-role-vägar har ersatts med en privat `JOB_SECRET` för worker
  och schemalagda jobb. En användare kan inte längre starta någon annans scan.
- En append-only migration inför `user_domain_history`, privat cache,
  jobblås/idempotens, RLS-förstärkningar, integritetsregler och säkra index.
- Det gamla cloud-curl-cronjobbet avaktiveras. Legacyhistorik utan ägare låses
  ned i stället för att felaktigt tilldelas en användare.

### Lokal produktionsdrift

- Lagt till Docker-build för den statiska webben, host-Caddy-mall,
  self-hosted Function-deploy, privat Node-worker, systemd-enhet,
  backupscript och secrets-exempel.
- Webben köar scan-jobb; workern utför dem på servern efter att användaren har
  stängt browsern. Bara Caddy är avsedd att lyssna på LAN/publica portar.
- Det gamla cloud-fallbacket har tagits bort. Webben kräver en explicit lokal
  Supabase-URL och anon/public key vid build.

### Klient och beroenden

- Vite 8, aktuell React-SWC-plugin, Supabase JS 2.112.3, React Router 7,
  TypeScript 5.9, uppdaterade säkra transitive beroenden och låsfil.
- Äldre plattformstaggar, molnmetadata och driftsinstruktioner är borttagna.
- Routes laddas lazy för betydligt mindre initial JavaScript-bundle.

## Verifierat här

| Kontroll | Resultat |
| --- | --- |
| `npm ci --dry-run --ignore-scripts` | Godkänd |
| `npm run lint` | Godkänd, 0 fel (18 befintliga utvecklingsvarningar) |
| `npm run typecheck` | Godkänd |
| `npm run check:functions` | Godkänd för 8 Edge Functions |
| `npm run test:functions` | 6/6 godkända |
| `npm run build` | Godkänd, PWA byggd |
| `npm audit` | 0 sårbarheter |

## Operativa gränser före skarp öppning

- Den här arbetsmaskinen saknar Docker, Supabase CLI och system-Deno. Därför
  har en faktisk self-hosted stack, databasrestaurering och live-RDAP mot den
  lokala servern inte kunnat startas här. De stegvisa smoke-testerna i
  `LOCAL-PRODUCTION.md` måste utföras på målservern.
- `registrar-scraper` är avsiktligt avstängd tills ett kontrakterat
  registrar-API finns. Pris är därför en etiketterad heuristik, inte offert.
- `send-daily-notification` skriver en verifierbar sammanfattning men skickar
  inte e-post/push förrän en granskad SMTP- eller VAPID-adapter konfigureras.
- RDAP kräver kontrollerad utgående nätåtkomst eller ett internt speglat,
  auktoritativt registerflöde. Det är inte ett helt offline-system.

Följ [LOCAL-PRODUCTION.md](LOCAL-PRODUCTION.md) för cutover, backup och
återställning.
