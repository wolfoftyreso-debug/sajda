# Sökning och förfining — teknisk evidenslogg

Datum: 2026-09-11. **Slutstatus: godkänd avgränsad testrelease.** Detta är en utvecklings- och previewlogg, inte ett produktionsgodkännande. Gateway-generering och förfining har verifierats live; [den stabila testlänken](https://sajda-test-hypbit.vercel.app/) visar den nya releasen.

## Implementerat

- En kreativ sökning visar tio resultat först. Nästa knapp visar ytterligare tio från samma svar, utan ny sökning eller extra AI-anrop. Exakta domänkontroller behåller sin begränsade fullständiga lista.
- Användaren kan uttryckligen välja vad som ska ändras och upp till fem namn att bygga vidare på. Förfiningen återanvänder den genomförda sökningens beskrivning, tema, kriterier, ändelser, leverantörer och sökläge, inte osparade ändringar i formuläret.
- Fel, tomma svar och helt overifierade uppföljningar får inte ersätta en tidigare verifierad lista. Dubbelklick, avbrytning, sena svar och återförsök har regressionsskydd. Feedback och ursprunglig brief hålls i sidminnet; en omladdning återställer inte privata briefar från resultatsnapshoten.
- Med aktuellt uttryckligt AI-samtycke kan en enda Gateway-förfrågan skapa högst 24 distinkta namnetiketter. Regler används som tydligt markerad reservväg. Modelltext får inte bestämma tillgänglighet, pris, juridisk säkerhet eller ekonomiskt värde; dessa egenskaper får inte härledas ur namngenereringen.
- Hela den tillåtna synliga beskrivningen skickas nu till namngenereringen, utan den tidigare tysta kapningen vid 100 tecken. Gränser för tecken och HTTP-byte gäller fortfarande. API/MCP:s publicerade kontrakt är oförändrade.

Se [flöde och begränsningar](SEARCH-REFINEMENT.md) samt [AI-integritet](AI-PRIVACY.md). AI-kvoten är fortsatt högst tre anrop per IP och UTC-dygn, standardbudgeten 50 per miljö och dygn samt högst två samtidiga reservationer. Minutspärren togs bort för att tillåta snabb iteration inom samma befintliga dagsbudget; ingen budgethöjning eller kvotåterställning ingår.

## Versioner och CI

| Version | Förändring | Verifierad CI |
| --- | --- | --- |
| `8f0cb979` | Kontextuell namngenerering, explicit feedback, mindre första resultatvy och regressionsskydd | [Verify #33](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34543328542) och [iPhone build #15](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34543328475): samtliga steg godkända. |
| `db7ee3e8` | Säker Gateway-felkategori och dokumenterad explicit 2.5-modellkonfiguration | [Verify](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34544353354): samtliga steg godkända. Ingen ny iPhone-körning utlöstes av dessa server-/dokumentationsfiler. |
| `ccfc464` | Uppdelade valideringssteg och strikt, anonym diagnos av avvisade namn | [Verify](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34544912618): godkänd. Preview READY; livefelet avgränsat till `label_charset`. |
| `678e47c` | Säker normalisering av latinska accenter/versaler, filtrering av ogiltiga enskilda namn och bevarad strikt struktur | [Verify](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34545945420): godkänd. 27/27 fokuserade tester godkända; fyra nya regressionstester. Verklig AI-generering och förfining godkända. |

iPhone-körningen omfattade native build/synkronisering, Debug- och Release-kompilering utan distributionssignering samt start i en faktisk iPhone-simulator. Det är inte ett signerat TestFlight-bygge eller verifiering på en fysisk telefon.

## Deployer och HTTP-/databaskontroller

Tre färdigbyggda previews kontrollerades separat med `scripts/check-runtime.mjs`, autentiserad Vercel-transport och `SAJDA_REQUIRE_DATABASE=true`:

- [Första previewen](https://sajda-3fr5angxf-hypbit.vercel.app), deployment `dpl_4BcMWoGCYwoSpjNxRczXzLbC5nY2`: **55/55 godkända**, databashälsa **200, connected**.
- [Diagnostikpreviewen](https://sajda-a76tupkho-hypbit.vercel.app), deployment `dpl_Xmfk15VQBp1ukKD16erpyvdPgTBm`: **55/55 godkända**, databashälsa **200, connected**.
- [Slutpreviewen](https://sajda-ddrv99byr-hypbit.vercel.app), deployment `dpl_CKNZAjYE8KHUeusPw4vkDrXzrWBz`: **55/55 godkända**, databashälsa **200, connected**, verifieringsprocess exit 0.

Varje körning omfattade 42 HTML-vägar inklusive 22 SEO-vägar, säkerhetsheaders, riktiga 404-svar, OpenAPI, obehöriga privata API-anrop, skyddad cron, CORS och ogiltig indata. Databassvaret omfattar en läsande strukturell schemakontroll. Detta bevisar inte fullständiga konto-, e-post- eller betalflöden. Kontrollerna gjorde inga kontoändringar eller AI-anrop.

Slutpreviewen för `678e47c` är READY. Testaliasens ägarskap och tidigare previewmål kontrollerades före flytten. `sajda-test-hypbit.vercel.app` flyttades därefter från `sajda-n6z62u0fm` till `sajda-ddrv99byr`; en ny Vercel-inspektion bekräftade exakt deployment-ID och `target: preview`. Inga skyddsregler eller produktionsalias ändrades.

## Faktisk browserkontroll

En verklig regelbaserad sökning gav **50 resultat: 43 verifierade och sju med okänd status**. Resultatvyn visade först tio och därefter tjugo. Feedback, vald favorit och beskrivning bevarades när gäst-/kontomodalen stängdes och när språket växlades svenska → engelska.

Desktop-/mellanbreddsflödet kontrollerades vid **686 CSS-pixlar**. Därefter kontrollerades rätt aktiv flik på `sajda-a76tupkho` vid faktisk viewport **390 × 844 CSS-pixlar**, med `scrollWidth: 375`: ingen horisontell overflow. Den verkliga regelsökningen `garden studio` gav då **45 resultat: 37 bekräftat lediga och åtta okända**, varav tio renderades. Feedbackknapparna radbröts inom kortet; **För generiska** kunde väljas och **Hitta nya förslag** blev aktiv. Landning och samtyckesvy hade också kontrollerats vid 390 pixlars bredd. Inga av dessa browseranrop använde AI. Det är avgränsad browserverifiering, inte fullständig mobil-, tillgänglighets- eller fysisk iPhone-testning.

På slutpreviewen `sajda-ddrv99byr` öppnades startsidan i en riktig webbläsare. Inmatning av `example.com` växlade korrekt till exaktkontroll. Den genomförda kontrollen visade endast `example.com`, markerad **Upptagen**, med noll lediga/okända resultat. AI var av och djupgranskningens knapp var avstängd eftersom ingen domän var bekräftat ledig. Inget konto, betalning eller köp användes i denna kontroll.

Efter aliasflytten öppnades även den stabila adressen i webbläsaren: rätt nya skript `/assets/index-CJM8Q2Ws.js`, startsida på svenska och `scrollY: 0`. Vid 1 280 px bredd var dokumentets `scrollWidth` 1 265 px, utan horisontell overflow. Den befintliga sessionen gav fortfarande navigeringslänken **Mitt konto**; detta är en sessionsobservation, inte en ny full inloggnings-/behörighetsrevision.

En avgränsad fråga efter felloggade händelser på slutpreviewen hittade den redan kända Node-varningen `DEP0169` om `url.parse()` under `/api/auth/get-session`, vars svar var HTTP 200. Den varningen är inte åtgärdad i denna release och ska inte beskrivas som ett kraschande inloggningsflöde eller som verifierat felfri produktion.

## Namnkvalitet och Gateway — håll isär evidensen

[Offlinebenchmarken](NAMING-QUALITY-BENCHMARK.md) innehåller 20 realistiska syntetiska briefar, tio engelska och tio svenska. **20/20 strukturella kontroller passerade**: giltighet, dubbletter, längd, undantagna ord och determinism. Variation redovisas utan kvalitetsgräns. Den körde inga externa API:er. Blind mänsklig utvärdering är **NOT_EVALUATED**; strukturella pass bevisar varken relevans, överlägsen namnkvalitet eller köpvärde.

Full lokal `npm run check` på `ccfc464` passerade lint, klient-/servertyper, språk, SEO-policy, Neon-gräns, Node-syntax och UI-kontrakt: **1 074 tester, 1 069 godkända, fem avsiktligt överhoppade, noll fel**.

Full `npm run check` på `678e47c` gav **1 078 tester, 1 073 godkända, fem avsiktligt överhoppade, noll fel**, inklusive godkända UI-kontrakt. Oberoende läsande granskning hittade ingen konkret defekt i normaliseringens säkerhets-/valideringsgräns.

De faktiska modellförsöken måste redovisas separat:

- Gemini **3.1 Flash Lite** gav verkligt **HTTP 403** via Gateway. Inte godkänd modellkörning.
- Explicit konfigurerad **2.5 Flash Lite** gav **HTTP 200**, men svaret avvisades med den då gemensamma statusen `invalid_output`. Transportframgång är inte godkänd namngenerering.
- `ccfc464` skiljer fasta loggstatus `invalid_envelope`, `invalid_json` och `invalid_schema`. Ett verkligt syntetiskt anrop gav HTTP 200 och `invalid_schema` / `label_charset` (3 604 ms Gateway-tid). Namnvalideringen loggar endast fasta kategorier, aldrig råa namn, prompts eller felmeddelanden. Detta identifierade en alltför skör batchvalidering.
- På `678e47c` lyckades två verkliga produktanrop i direkt följd, med aktuellt samtycke och en syntetisk svensk kafferosteribrief: **åtta AI-genererade namn → återkoppling → åtta nya AI-genererade namn, noll upprepningar**. Båda svaren angav `source: ai`; endast det andra angav `refinementApplied: true`. Vardera omgången hade vid kontrollen fem registerbekräftat lediga och tre registerbekräftat upptagna namn, inga okända. Alla namn följde formatkontraktet och hade `estimatedValue: 0`.
- Vercels korrelerade loggar angav `completed`, HTTP 200, med Gateway-tider **2 802 ms** respektive **1 997 ms**. Hela tvåanropsproben tog **16 827 ms inklusive autentiserad CLI-transport**, inte en uppmätt browserlatens. Ingen automatisk retry, budgethöjning eller kvotåterställning gjordes. Dessa resultat bevisar integration och tillämpad återkoppling, inte att den andra listan subjektivt är bättre, juridiskt fri eller fortfarande ledig senare.

Det diagnostiska anropet och den lyckade tvåstegsproben använder QA-anslutningens tre ordinarie AI-anrop för UTC-dygnet 2026-09-11. Kvoten återställs enligt ordinarie tidsgräns, inte genom deployment eller en manuell återställning. AI-kvoten ändrar inte tillgänglighetskontrollernas sanningskrav; när AI inte kan användas ska reservmotorn visas som regelbaserad.

## Kommersiell status och återstående gränser

Tidigare beslutad produktprissättning är fortsatt **Gratis $0, Bas $9, Premium $19 och Trading $49 per månad**. Denna release ändrar inte dessa priser, betalningskonfiguration, liveabonnemang eller produktionsdeployment. Ingen riktig debitering eller ny betalningsverifiering ingår.

`.se` och `.nu` är fortsatt blockerade från kreativ-/Swipe-sökning och får inte gissas som lediga. En tillåten, autentiserad HTTPS-källa kräver konto, klarlagd avtals-/användningsrätt och lyckad deployed kontroll. [Connectorutredningen](SE-NU-CONNECTOR.md) beskriver återstående steg; inget konto eller avtal har antagits finnas.

Gateway-grinden, slutlig HTTP-/databaskontroll, CI och verifierad flytt av testaliasen är passerade. Fortsatt användartestning behövs för namnkvalitet och återkopplingens träffsäkerhet; den förberedda blinda utvärderingen är inte utförd. Produktion och betalningsaktivering är inte en del av denna release.
