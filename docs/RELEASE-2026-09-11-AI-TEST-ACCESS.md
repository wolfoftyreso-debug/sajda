# AI-teståtkomst och tydliga begränsningar

Datum: 2026-09-11. Avgränsad uppföljning efter [förfiningsreleasen](RELEASE-2026-09-11-REFINEMENT.md). Produktion, livebetalning och registratoravtal ingår inte.

## Ändrat

- Ett serverstyrt testundantag kan sätta 1–20 AI-anrop per IP och UTC-dygn i Preview/Development. Standard och produktion är fortfarande tre. Ogiltig konfiguration nekar AI säkert.
- Den aktuella Preview-miljön har `SAJDA_AI_TEST_IP_DAILY_LIMIT=20`. Global dagsbudget, samtidighetsgräns, tidsgränser, samtycke och Vercels penningtak är inte ändrade. Detta är inte 20 garanterade sökningar: namn, förfining och djupgranskning delar AI-utrymmet, och övriga åtkomstgränser gäller fortfarande.
- UI skiljer på förbrukat dagsutrymme, upptagen AI och annan AI-fallback på engelska, svenska, spanska, franska och kinesiska. Lokala regelresultat får inte märkas som AI-genererade; inga automatiska återförsök läggs till.
- Om en förfining ger tomma eller enbart obekräftade resultat behålls den tidigare listan och dess källa. Ett separat meddelande förklarar det misslyckade AI-försöket utan att märka om gamla AI-kort som regelbaserade. Detta är testat i 20 monterade kombinationer av språk, kapacitetsorsak och resultattillstånd.
- Ändelseväljaren förklarar varför `.se`, `.nu` och `.io` saknas. Officiell manuell `.se/.nu`-kontroll öppnas utan sökidé eller referrer. Detta aktiverar inte automatisk tillgänglighetskontroll.

## Databas och miljö — verifierat

`0017_ai_test_allowance.sql` applicerades enbart mot granskad Preview-databas: Neon-projekt `spring-paper-89655503`, vars värd och projekt skiljer sig från produktionens konfiguration. Migreringskedjan och SHA-256 `383ef175c5e842e5338d621494b50791401973013ce05bd130f7eb280e3955c7` kontrollerades före den enda väntande migreringen.

Ändringen och migreringsposten skrevs i samma transaktion. Fingeravtrycket av samtliga sex befintliga kvotrader var identiskt före och efter. Inga kvoter, identiteter eller miljönamn nollställdes eller byttes. Efterkontroll bekräftade validerad CHECK, övriga constraints och migreringskedja 0000–0017.

Ett separat verkligt PostgreSQL-test klonade tabellens CHECK-regler till en temporär tabell och rullade tillbaka: testgräns 20, produktionsgräns tre, globalt hårdtak 100 samt ogiltiga identiteter/miljönamn. **1/1 godkänt**, utan ändring av verkliga räknare. Det äldre opt-in-provet som skriver utvecklingskvoter kördes inte.

Vercel bekräftade att den nya miljövariabeln gäller **Preview endast**. Globalvariabeln och hemligheter skrevs inte över. Produktionens databas kontaktades inte.

## Återstående gränser

- Automatisk `.se/.nu` kräver tillåten HTTPS-API-åtkomst hos en registrator samt verifierad deployed kontroll. Dokumenterade DAS-värdar klarade inte HTTPS-värdnamnsvalidering vid kontrollen; ingen TLS-kontroll kringgicks och inget konto skapades. Se [källutredningen](SE-NU-CONNECTOR.md).
- `.io` saknar också granskad automatisk källa i den nuvarande kapabilitetslistan.
- En tekniskt godkänd namngenerering bevisar inte subjektiv namnkvalitet, juridisk frihet eller investeringsvärde. Blind mänsklig namnutvärdering är inte utförd.
- Sänkning eller borttagning av testundantaget återanvänder förbrukade räknare och kan därför omedelbart neka ytterligare AI-anrop. Återställ aldrig räknare som rollback-metod.

## Slutverifiering

Kodversion: `7546c71f8b25c619628dc6e310adb8c2aefd07b4`, pushad till GitHub `main`.

- Lokal slutkontroll `npm run check`: **1 130 tester, 1 124 godkända, sex opt-in-integrationer överhoppade, noll fel**. Lint, TypeScript, språk (72 ordlistor, noll nyckel-/platshållarfel), SEO-policy, Neon-gräns, Node-syntax, Vercel-typer och UI-kontrakt godkända. Det temporära verkliga databastestet ovan kördes separat.
- [GitHub Verify](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34549507666): godkänd på exakt kodversion ovan.
- [iPhone build](https://github.com/wolfoftyreso-debug/sajda/actions/runs/34549507681): godkänd på samma kodversion, inklusive native-bygge, Debug-/Release-kompilering och simulatorstart. Inte signerat TestFlight, fysisk iPhone eller betalningsverifiering.
- [Ny Vercel Preview](https://sajda-dyaa7z3cw-hypbit.vercel.app/), `dpl_6cUpN2dMPnkvxtaTpUHXbk7pqn2K`: READY efter genomfört Vercel-bygge. Paketgranskningen rapporterade noll kända sårbarheter men visade befintliga deprecations-/install-script-varningar; inga beroenden ändrades i denna release.
- Ett verkligt, uttryckligen tillåtet AI-anrop med syntetisk svensk kafferosteribrief gav **åtta AI-genererade namn**, HTTP 200, `source: ai`, utan automatisk retry. Hela produktproben inklusive CLI-transport tog **9 103 ms**. Korrelerad Gateway-logg: `completed`, HTTP 200, **3 060 ms**. Tillgänglighet kontrollerades separat och inga ekonomiska värden uppfanns.
- Läsande databasuppföljning visade **fyra globala anrop och fyra för den mest använda IP-identiteten under aktuellt UTC-dygn**. Den gamla tregränsen passerades alltså med de bevarade räknarna; ingen identitets-/miljöväxling eller nollställning användes.
- Verklig browser: svenska och engelska ändelsetexter visades, nio stödda ändelser var valbara och `.se/.nu/.io` exkluderade. Manuella länken saknade query/hash och hade `noopener noreferrer` samt `no-referrer`. Vid **390 × 844** var `scrollWidth` **375**; notisen och länken höll sig inom kortet. Desktop kontrollerades vid 1 280 px. Testets språk/viewport återställdes. Ingen browserbaserad AI-kvotförbrukning eller kontomutation gjordes.

- Slutlig läsande HTTP-runtimekontroll: **55/55 godkända**, databashälsa **200, connected**. Privata API-gränser, routing, metadata, headers, CORS och ogiltig indata ingår; detta är inte fullständiga betalnings- eller e-postflöden.
- Den stabila [testlänken](https://sajda-test-hypbit.vercel.app/) flyttades från `sajda-ddrv99byr` till `sajda-dyaa7z3cw` efter dessa grindar. Browsern laddade nya `/assets/index-0nlMdYxk.js`, visade `scrollY: 0` och efter sessionskontroll **Mitt konto**. Inga produktionsalias eller skyddsregler ändrades.

### Observerad inloggningsbegränsning

En initial browserläsning på den nya, separata previewadressen gav `/api/auth/get-session` **429** och visade därefter inloggningslänken. Ett enda senare läsande anrop gav **200**. Den stabila testadressen visade fortfarande **Mitt konto** efter hydrering. Ingen cookie eller användare raderades i denna kontroll.

Källgranskning visar en befintlig svaghet: `AuthProvider` sätter klientens session till null även vid tillfälliga återläsningsfel och `AccountLink` skiljer inte sådana fel från utloggat läge. Detta är inte åtgärdat i AI-teståtkomstfixen; rate-limit-orsaken är inte slutligt reproducerad. Läsning av den installerade Better Auth-versionen visar att get-session delar 60-anropskvot per IP/sökväg över previewdomäner och att kontinuerliga anrop kan hålla dess inaktivitetsbaserade fönster öppet. Dubbla sessionsläsningar i medlemsuppdatering och Trading-pollning är en möjlig bidragande orsak, inte bevisad runtimekorrelation. Föreslagen separat P2-åtgärd är samordnade, synlighetsstyrda sessionsläsningar och tydlig tillfälligt-okänd UI-status; inte avstängda serverkontroller eller kvotnollställning. Den befintliga Node-varningen `DEP0169` finns också kvar. Ingen inloggnings- eller produktionsgrind ska räknas som fullständigt verifierad från denna avgränsade kontroll.

**Slutstatus: verifierad AI-teståtkomst och tydligare begränsningar i Preview. Inte ett produktionsgodkännande.**
