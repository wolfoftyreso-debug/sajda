# Sajdas konkurrens, prissättning och produktstrategi

## Genomförd första produktförändring, 13 september 2026

Efter analysen har följande byggts och testats som en avgränsad preview-pilot:

- Privat namnprojekt med brief, målgrupp, stil, språk, budgetönskemål och ordnade
  favoriter från kontots sparade domäner. Arkivering, återkomst och export finns.
- Ett sparat projekt kan fylla sökformuläret; användaren granskar och startar
  själv. Budgeten är ännu inte ett automatiskt filter mot verifierade offerter.
- Startsidan prioriterar idé och kriterier före Swipe. Prisvyn grupperar
  Free/Basic/Premium och skiljer ut Trading som specialistverktyg.
- Navigering på webb och app ger direkt väg till projekt och sparade namn.
- Kontobyte tömmer privat sökkontext och stoppar sena svar. Ingen privat brief
  placeras i sök-URL eller den gamla kontoobundna resultatcachen.

Priserna är fortsatt 0/9/19/49 USD per månad; betald checkout är inte öppnad.
Projektpiloten är inte en ny betald behörighet. Samarbete, automatiska bevakningar,
privat projektminne via MCP och jämförande kvalitetsvinster är inte verifierade
leveranser. Nästa prioritering är att mäta faktiska namnval och verifierad kostnad,
inte att marknadsföra allmän överlägsenhet. Tekniskt underlag och testgränser finns
i [Name projects](NAME-PROJECTS.md).

## Samlad bedömning

Sajda har en möjlig position som ett prisvärt, oberoende arbetsrum för namnval. Positionen är däremot inte ledig: gratisverktyg har blivit betydligt bättre, registratorer bygger AI-gränssnitt och specialister erbjuder både bevakning och investerarunderlag. Ett lågt abonnemangspris för en namngenerator räcker inte. Det centrala värdet måste vara att en kund faktiskt kommer fram till ett användbart, granskat namn inom sin budget.

Den rekommenderade huvudmarknaden är återkommande founders och små produkt-/webbyråer. Engångsgrundare behöver en stark gratis ingång och en enkel möjlighet att köpa hjälp under ett namnprojekt. Trading är ett separat specialistbehov med högre krav på data, aktualitet, licenser och kostnadskontroll. Det bör inte dominera startsidan eller göra vanliga namnval svårare.

Fem slutsatser styr prioriteringen:

1. **Gratis är huvudkonkurrenten till Basic.** Namn, favoriter, grundläggande feedback och MCP finns redan utan abonnemang.
2. **Premium behöver vinna ett arbetsflöde.** Projektminne, gemensamma beslut, verifierbar budget och bra språkbedömning behöver tillsammans minska arbetet för kunden.
3. **Trading för $49 är inte ett lågpriserbjudande i hela marknaden.** Unique Domains annonserar nu $19 och SpamZilla $37. Olika kvoter och datakällor gör funktions- och användningsjämförelsen viktigare än prisetiketten.
4. **”Bättre” är en hypotes som måste mätas.** Inga jämförande namnkvalitets-, användar- eller investeringsutfall har ännu styrkt ett generellt överlägsenhetspåstående.
5. **Driftsäkerhet är en del av värdet.** Rätt pris, sparat arbete, fungerande inloggning, tydliga gränser och levererade aviseringar är viktigare än fler gränssnitt för samma osäkra data.

## Avgränsning och evidens

Analysen avser internationell domänupptäckt, namngivning, prisjämförelse och domänresearch, med en svensk/nordisk fördjupning. Offentliga källor kontrollerades den **13 september 2026**. Sajdas nuläge utgår från repositoryts implementation, inte enbart från produktbeskrivningar. Betalda konkurrentabonnemang och konkurrenters transaktioner har inte testats.

**Dokumentverifierat** betyder att en aktuell primärkälla publicerar uppgiften; det är inte en oberoende kvalitetsmätning. **Bedömning** betyder analys av underlaget. **Förslag** betyder en funktion, kvot eller prisnivå som ännu behöver byggas eller prövas. **Okänt** används när åtkomst, precision, villkor eller efterfrågan inte kunnat beläggas. Att en funktion inte nämns på en sida visar inte att den saknas.

Priser nedan är annonserade produktpriser, inte genomförda checkout-offerter. Domänköp, mänskliga namngivningsprojekt, datalicenser och SaaS-abonnemang är olika kostnader. Moms, lokal skatt och kampanjvillkor får inte antas lika. Årspris delat med tolv är inte ett månadsabonnemang. Produktantal, databasstorlek och registreringar får inte likställas med kunder, aktiva köpintentioner eller marknadsandel.

## 1. Konkurrenskartan

| Konkurrenslager | Viktiga aktörer | Vad kunden redan kan få | Sajdas tänkbara vinst |
|---|---|---|---|
| Gratis namnupptäckt | Instant Domain Search, Namelix, Shopify, Looka, Atom | Förslag, tillgänglighetskontroller och olika former av förfining | Ett bättre genomfört namnval, verifierad budget och tydlig kontinuitet |
| Projekt och beslutsstöd | Unique Domains, Atom, delvis IDS | Shortlist, analyser, delning och arbetsytor med olika omfattning | Lägre friktion, relevanta inkluderade användningsmängder, nordisk kvalitet och oberoende köpval |
| Registrering och byggplattformar | Cloudflare, Porkbun, Namecheap, GoDaddy/Airo | Domänköp, hantering och allt mer AI-/agentstöd | Jämföra flera val innan användaren binder sig till leverantör |
| Prisjämförelse | TLD-List, Webguide, Domanpriser | Introduktion, förnyelse och flerårskostnad | Knyta jämförelsen till den exakta kandidaten och hela projektbudgeten |
| Investerar- och historikdata | ExpiredDomains, SpamZilla, DomCop, NameBio, DomainTools | Inventarier, historik, filter och specialistunderlag | Personlig prioritering och en tydlig, källbelagd granskningsprocess |
| Förvärv och försäljning | Atom, Afternic, Sedo, DropCatch | Utbud, förmedling, auktion och genomförande | Hjälpa kunden välja om och var en affär är rimlig; inte låtsas ersätta marknadsplatsen |

Kartan är en segmentering, inte en ranking eller en mätning av söksynlighet. Överlappande produkter inom samma grupp får inte summeras till separat marknadsandel utan verifierad ägar- och trafikmodell.

## 2. De närmaste produktkonkurrenterna

### Instant Domain Search

IDS lanserade en samtalsbaserad namnassistent den 1 september 2026 och ett gratis verktyg för utgångna domäner den 2 september. Namnassistenten beskrivs som gratis även utan konto. Det innebär att Sajda inte kan sälja själva dialogen eller en kvalitetssorterad dropplista som nya kategorier. [S1](https://instantdomainsearch.com/learn/updates/business-name-generator-naming-assistant), [S2](https://instantdomainsearch.com/learn/updates/expired-domains-tool).

Den nyare kontobeskrivningen anger gratis synkning och bulkgränser på 500 anonymt respektive 5 000 med konto. Äldre uppgifter om 1 000 bör därför inte vara jämförelsens aktuella referens. Delade projektlistor och vissa professionella produkter beskrivs som roadmap i den källan. Deras MCP är också gratis enligt den egna lanseringen. [S3](https://instantdomainsearch.com/learn/updates/introducing-user-accounts), [S4](https://instantdomainsearch.com/learn/updates/domain-search-mcp).

**Bedömning:** IDS är den viktigaste gratisreferensen för snabbhet och första användning. Ett konkret område att testa är kostnadsbeslutet: IDS registratorguide förklarar att sökresultatets pris avser registrering och hänvisar vidare för förnyelse. Sajda kan göra det lättare att fatta samma beslut utan extra manuella kontroller. Det är ett flödesgap, inte en funktion ingen annan har. [S5](https://instantdomainsearch.com/learn/guides/best-domain-registrars-2026).

### Unique Domains

Den aktuella prissidan visar **Full Access $19/månad**, 200 månadskrediter och gratis Explorer med 40. Även Explorer har obegränsade projekt. Betalplanen beskriver radar, watchlists, portfölj och analyser; en full analys kostar fem krediter och annan användning delar saldot. Full Access är en användarplats med delningslänkar; teamplatser och API är kommande. Äldre uppgifter om $29-engångspass och $79/månad ersätts av den förnyat kontrollerade sidan. Köpflöde och kvalitet har inte testats. [S6](https://unique.domains/pricing).

**Bedömning:** detta är en mycket nära konkurrent till Sajdas föreslagna arbetsrum. Basic kan inte motiveras av ett sparat projekt ensamt. Premium-samarbete bör betyda faktisk fleranvändarhantering, inte bara delningslänkar. Sajda behöver visa kundvärde för samma arbetsuppgift och användningsvolym, inklusive extraköp. Trading $49 måste erbjuda ett substantiellt bättre eller mer omfattande underlag för den avsedda kunden; priset kan inte beskrivas som lägre här.

### Namelix, Shopify och Looka

Namelix beskriver gratis namngenerering som lär av sparade favoriter. Shopify erbjuder en gratis namngenerator som leder vidare till butiksetablering. Looka kombinerar gratis namnverktyg med domän-/sociala kontroller och en väg till visuell identitet. Namngivning kan alltså finansieras av ett efterföljande köp; Sajda konkurrerar inte bara med andra fristående SaaS-tjänster. [S7](https://namelix.com/), [S8](https://www.shopify.com/tools/business-name-generator), [S9](https://looka.com/business-name-generator/).

**Bedömning:** Sajda bör hjälpa kunden oavsett registrator, designverktyg och byggplattform. Att utveckla ett helt eget logoverktyg eller en generell webbplatsbyggare skulle sprida resurserna. En tydlig överlämning av det valda namnet, underlaget och nästa steg är ett bättre första mål. Lookas exakta betalpriser verifierades inte och används inte som ekonomiskt jämförelseankare.

### Atom

Atom beskriver gratis AI-namngivning, förfining, shortlist och indikativa kontroller. Namntävlingar med mänskligt arbete annonseras från **$299 per projekt**, med högre paket för ytterligare granskning och samarbete. Det är en annan leverans än en automatiserad månadsprodukt; Sajda får inte påstå likvärdig tjänst till en bråkdel av priset utan belägg. [S10](https://www.atom.com/naming), [S11](https://www.atom.com/pricing.php).

Atom beskriver även kontobunden MCP med OAuth och separata behörigheter för affärer. Kontoanslutning i AI-assistenter är därför inte en unik marknadsposition. Sajdas vinkel bör vara ett privat beslutsminne och ett oberoende leverantörsval. Marknadsförd kompatibilitet är inte samma sak som att varje AI-klient har testats. [S12](https://www.atom.com/atom-mcp-server).

## 3. Trading: jämför rätt produkt och rätt kostnad

| Tjänst | Dokumenterad prisbild | Betydelse för Sajda |
|---|---|---|
| ExpiredDomains | Gratis konto | Betalvärdet kan inte vara en stor lista i sig |
| Unique Domains | $19/månad och krediter | Nära pris- och arbetsflödeskonkurrent; inkludering och kvalitet måste jämföras |
| SpamZilla | $37/månad | Sajda $49 är dyrare; historik- och spamgranskning behöver motsvarande substans |
| DomCop | Årsplaner $816/$1 152/$1 416; motsvarar $68/$96/$118 per månad | Dyrare årsbaserad referens, men inte samma fakturering eller nödvändigtvis samma underlag |
| DomainTools | Personal $99/månad | Researchreferens, inte en fritt återpublicerbar SaaS-datalicens |
| NameBio | Försäljningsdata/API med separata åtkomstvillkor | Möjlig datakälla och konkurrent; produkttillstånd måste lösas före integration |

Källor: [ExpiredDomains](https://www.expireddomains.net/register/), [Unique Domains](https://unique.domains/pricing), [SpamZilla](https://www.spamzilla.io/pricing/), [DomCop](https://www.domcop.com/pricing), [DomainTools pris](https://secure.domaintools.com/join/) och [licens](https://www.domaintools.com/domain-research/pricing), samt fördjupning och exakta villkorslänkar i [Trading-underlaget](research/2026-09-13-trading-competitors.md).

En stark Trading-produkt skiljer på fyra saker: en kandidat att undersöka, en verifierbar registreringsmöjlighet, en förvärvsmöjlighet med ett faktiskt pris och ett spekulativt värdeantagande. De får inte presenteras som samma köpsignal.

Teknisk historik kan hjälpa till att förstå ett namn men bevisar inte efterfrågan. Ett dött webbhotell, en gammal länk eller uteblivet DNS-svar visar inte att domänen får registreras. Ett högt namnscore är inte ett marknadspris. En försäljningsdatabas innehåller rapporterade affärer, inte alla osålda domäner; ett högt genomsnittligt försäljningspris säger därför inte hur sannolik nästa försäljning är.

**Rekommendation:** positionera Trading som en tidsbesparande gransknings- och portföljprodukt. Visa upp till 30 kandidater som verkligen klarar kriterierna. Ha en egen kö för ofullständigt underlag och avstå från ord som ”exklusiv” när samma offentliga kandidat visas för många kunder. Låt användaren ange en tes och följ senare upp faktiska köp, kostnader och bud utan att blanda dem med antaganden.

## 4. Sverige, Norden och leverantörsjämförelsen

Webguide uppger jämförelse av åtta leverantörer och 682 toppdomäner med registrering, förnyelse, kampanj- och momshantering. TLD-List visar även en treårig jämförelse. Domanpriser beskriver femårskostnad och särskild hantering av okänd moms eller för gamla observationer. Långsiktig kostnad är följaktligen viktig men inte obearbetad mark. [S13](https://webguide.se/domaner/), [S14](https://tld-list.com/), [S15](https://domanpriser.se/sa-fungerar-domanpriser/).

Det mer precisa målet för Sajda är **ett exakt namn, dess relevanta ändelser och hela köpbeslutet i samma vy**. Separera publicerat standardpris för en ändelse från aktuell offert för just namnet. Visa vilka leverantörer som kontrollerats. ”Lägst bland tre kontrollerade erbjudanden” är möjligt att belägga; ”billigast på marknaden” kräver ett annat underlag.

En femårsberäkning kan vara registrering plus fyra årliga förnyelser när villkoren verkligen motsvarar en initial ettårsperiod. Den är en beräkning med dagens priser, inte en prisgaranti. Tvååriga minimiperioder, premiumförnyelse, paketkrav, valuta och skatt måste hanteras innan alternativ jämförs. Saknas en nödvändig uppgift ska totalen visas som ofullständig.

Nordisk språkförståelse är en möjlig spets: uttal, stavningssäkerhet, sammansättningar, å/ä/ö och betydelser på grannspråk. Men översatta menyer eller ett AI-genererat omdöme bevisar inte bättre lokalspråkskvalitet. Den måste testas mot kunniga bedömare och konkreta verksamheter. Utöver den internationella gratisreferensen bör .se/.nu-ingången jämföras med Internetstiftelsens sökning och det lokala släppflödet Droppa. [S16](https://internetstiftelsen.se/sok-doman/), [S17](https://droppa.se/).

## 5. Omvärld: fem förändringar som påverkar produkten

### Domänmarknaden är stor, men är inte Sajdas betalmarknad

DNIB:s rapport för andra kvartalet 2026 anger 401,6 miljoner registrerade domäner. Det visar storleken på domänbeståndet, inte antalet kunder som vill betala för namnresearch. En domän kan vara parkerad, defensivt registrerad, förnyad i många år eller del av samma ägares portfölj. [S18](https://www.dnib.com/articles/the-domain-name-industry-brief-q2-2026).

Sajdas marknad bör räknas underifrån: relevanta namnprojekt per kund och år, andel som får värde av tjänsten, betalningsvilja och varaktighet. Inga verifierade kundvolymer eller omsättningsprognoser presenteras här. Att multiplicera världens domäner med $19 skulle skapa en missvisande marknadsstorlek.

### AI-assistenter flyttar upptäckten närmare byggandet

Cloudflare beskriver domänsökning, exakt tillgänglighet/pris och registrering via API, även tillgängligt för agentdrivna verktyg. Porkbun dokumenterar också domänoperationer och en egen MCP-server. Registratorerna kan alltså möta kunden inne i utvecklingsflödet. [S19](https://developers.cloudflare.com/registrar/registrar-api/), [S20](https://porkbun.com/api/json/v3/documentation).

**Bedömning:** Sajdas connector behöver vara mer än en wrapper runt en leverantör. Den bör bära kundens brief, återkoppling, gränser och beslut mellan verktyg. Öppet protokoll är distribution; privat projektkontinuitet och bra resultat är produkten. Affärer ska förbli explicita användarbeslut med aktuell offert och rätt behörighet.

### Registratorer och byggplattformar finansierar gratis discovery

Cloudflare marknadsför registrering och förnyelse utan påslag på registry-/ICANN-avgifter. GoDaddy beskriver agentdrivet stöd som kopplar ihop idé, domän och etablering. Detta ökar trycket på en fristående namntjänst att skapa värde som inte redan ingår i nästa köp. [S21](https://www.cloudflare.com/products/registrar/), [S22](https://aboutus.godaddy.net/newsroom/news-releases/press-release-details/2025/GoDaddy-Brings-Agentic-AI-to-Small-Businesses-with-Launch-of-Airo-ai/default.aspx).

### Fler ändelser ökar behovet av beslutsstöd

ICANN öppnade 2026 års ansökningsomgång för nya generiska toppdomäner den 30 april. Det avser ansökningar om att driva ändelser, inte att samtliga föreslagna ändelser omedelbart går att registrera. Produktmässigt talar det för en uppdateringsbar modell för villkor, språk och kostnad snarare än statiska listor med ”bästa ändelser”. [S23](https://www.icann.org/en/announcements/details/icann-opens-application-window-for-new-generic-top-level-domains-30-04-2026-en).

### Datatillstånd är en produktionsförutsättning

Internetstiftelsen skiljer mellan sin vanliga sökning och Free/DAS, som kontrollerar .se/.nu-tillgänglighet och har angivna trafikgränser. Tjänsterna får inte behandlas som samma kommersiella backend. ExpiredDomains förbjuder automatiserad åtkomst till medlemsområdet. En publik webbplats eller ett betalt personabonnemang ger inte automatiskt återpubliceringsrätt till en ny SaaS-produkt. [S24](https://internetstiftelsen.se/domaner/registrera-ett-domannamn/regler-och-beskrivning-av-domannamnssokningar/), [S25](https://www.expireddomains.net/faq/).

Varje datakälla behöver en dokumenterad rätt att hämta, mellanlagra, visa och eventuellt återdistribuera innehållet via MCP. Att robots.txt tillåter en sida är inte i sig en fullständig licens. Saknas avtal eller källa bör produkten visa luckan och erbjuda en officiell länk, inte producera en skenbart verifierad analys.

## 6. Kundsegment och betalningsvilja

Följande segment är produktstrategiska hypoteser, inte resultat av intervjuer eller en uppmätt prospektdatabas.

| Segment | Situation och köpare | Vad kan motivera betalning? | Viktig invändning | Prioritet |
|---|---|---|---|---|
| Återkommande founder/produktbyggare | Samma person bygger flera idéer | Mindre omtag, bättre finalister, sparat projektminne | Kan använda gratis AI och registrator | Högst |
| Liten webb-/produktbyrå | Utvecklare/designer använder; byråägare betalar | Snabbare kundbeslut och separata kundprojekt | Vill undvika ännu ett komplext verktyg | Hög |
| Förstagångsgrundare | En intensiv namnperiod | Bli färdig med rätt namn och förstå kostnaden | Svagt behov av långt abonnemang | Hög för gratis/Basic, lägre retention |
| Domäninvesterare | Återkommande urval och förvärv | Färre svaga kandidater, bra bevis, kostnadskontroll | Har redan etablerade dataverktyg | Selektiv Trading-pilot |
| Stort bolag/varumärkesteam | Flera beslutsfattare och formella krav | Styrning, rättigheter, upphandling | Kräver juridik, säkerhet och servicenivåer | Senare |

Den enklaste första kundresan är: beskriv vad du bygger, ange budget, få ett litet bra urval, reagera, jämför finalister och spara beslutet. Trading kan nås separat av den som faktiskt söker investerarverktyg. Det skapar tydligare värde än att en ny founder först måste tolka researchlägen, kreditmodeller och börsliknande vyer.

## 7. Rekommenderad paketering och prisprövning

Nulägets katalog är Free $0, Basic $9, Premium $19 och Trading $49 per månad. De är utvecklingspriser, inte bevis på betalningsvilja. Betalda abonnemang är ännu inte öppna. Prisförslagen nedan är inte aktiva erbjudanden.

| Paket | Leverans att bygga mot | Kommersiell rekommendation |
|---|---|---|
| Free | Verklig sökning, tillgängliga prisbevis, grundläggande sparande, prova ett projekt | Behåll gratis; första användningen måste kunna ge ett riktigt resultat |
| Basic | Ett aktivt namnprojekt med brief, feedback, finalister och beslutsunderlag | Behåll $9 som pilothypotes; testa även projektpass när leveransen är bevisad |
| Premium | Flera projekt, återanvändbara preferenser, samarbete, djupare granskning, aviseringar, projektåtkomst via MCP | Behåll $19 som huvudkandidat; det kräver ett genomfört flöde i nivå med starka alternativ |
| Trading | Personliga urval, tydligt inkluderad research, verifierad historik/offerter och portföljutfall | Pröva $29 mot $49 i avgränsad pilot; lägre pris bara om data- och användningsbudgeten håller |

För Trading är **$29 en föreslagen prishypotes**, inte ett nytt publicerat pris. Det är lägre än SpamZillas listpris men högre än Unique Domains grundpris. En sådan jämförelse säger inget om likvärdig leverans. $49 bör behållas som lanseringskandidat endast om inkluderad användning eller granskningskvalitet visar tydligt mervärde. Utökade dataköp ska vara uttryckliga, inte överraskande överdebitering.

Fyra nivåer behöver inte betyda fyra lika stora säljbudskap på startsidan. Visa gratis starten, Basic för ett projekt och Premium för återkommande byggande. Lägg den specialiserade Trading-jämförelsen ett steg längre in. Om användartester fortfarande inte kan skilja Basic från Premium bör man pröva färre köpval innan fler funktioner läggs till.

Att ångra en swipe bör inte vara huvudargumentet för Premium. Bevarat arbete, begriplig felhantering och hederliga prisuppgifter ska inte vara premiumsäkerhet. Efter uppsägning bör kunden kunna läsa och exportera sitt eget arbete; fortsatt automatisk bevakning kan däremot upphöra enligt tydliga villkor.

## 8. Lönsamhet och kapacitet

Prisvärdhet kräver att Sajda kan leverera löftet även när kunder använder tjänsten. Mät kostnaden för en godkänd shortlist eller levererad granskningsrapport, inte bara ett modell-anrop. Lägg samman generation, register-/prisfrågor, crawling, lagring, e-post, betalningsavgifter och rörlig support.

En illustrativ målsättning är minst 70 procent täckningsbidrag efter rörliga kostnader, beräknat på intäkten exklusive skatt. Det är ett föreslaget mål, inte uppmätt marginal. Före fasta kostnader ger det följande totala rörliga kostnadsramar:

| Nettointäkt per månad | Högst 30 procent rörlig kostnad |
|---|---:|
| $9 | $2,70 |
| $19 | $5,70 |
| $29, prishypotes | $8,70 |
| $49 | $14,70 |

Ramen är inte enbart AI-budget. Om licenser eller support överskrider den behöver pris, inkludering eller leverans ändras. Fasta kostnader, kundanskaffning, utveckling och vinst ligger fortfarande utanför denna förenklade kalkyl.

Nuvarande standardbegränsningar för AI och Trading är delvis globala skydd, inte fullständiga kundkvoter. Trading tillåter normalt två nya körningar per konto och tio globalt per dygn; fem fullt nyttjande konton kan alltså fylla dygnets startbudget. Ett betalt löfte kan inte byggas direkt på den konstruktionen.

Rekommenderad modell: återanvänd tillåten offentlig källinsamling, separera privata projekt, tilldela kvoter per konto och begränsa samtidighet. Mät dyr granskning som en begriplig leverans. Kundens saldo bör inte förbrukas av ett uteblivet slutresultat, även om interna skyddsräknare registrerar försöket. Visa återstående kapacitet och när den återställs. Prissätt inte ”obegränsade” långa körningar före belastnings- och kostnadstest.

## 9. Produkt- och algoritmutveckling

### Ett beständigt namnprojekt

Projektet ska bära verksamhet, målgrupp, språk, budget, föredragna ändelser, förbjudna ord och kundens reaktioner. En shortlist är inte bara favoriter: den behöver motivering, källdatum, status och vad som återstår att kontrollera. Ny sökning ska kunna förklara vilka preferenser den tar med sig. Privatekonomiska eller affärskänsliga briefar ska inte återanvändas i publika Trading-listor.

### Begränsningar före poäng

En kandidat som bryter ett hårt krav ska inte kunna vinna genom ett högt kreativitetsscore. Skilj först mellan namn som går att överväga, namn vars status är okänd och namn som faller utanför budgeten. Prisbevis måste avse rätt domän, valuta och period. Om totalbudgeten inte kan verifieras ska systemet säga det; ett registreringspris är inte automatiskt ett komplett femårspris.

### Urvalskvalitet och variation

Ranka inte enbart korthet. Bedöm relevans för briefen, uttal, stavning, igenkänning, särskiljning och användarens uttryckliga preferenser. Begränsa nästan identiska varianter i samma urval. Ett namn under flera ändelser kan vara en jämförelsegrupp, inte fem separata kreativa träffar. Språkmodellens motivering får inte användas som bevis för tillgänglighet, varumärkesfrihet eller ekonomiskt värde.

### Kostnad och osäkerhet

Visa kända registrerings-, förnyelse- och tilläggskostnader med tidsstämpel och leverantör. Jämförelser bör uttrycka ”med dagens publicerade villkor” och skilja exakta offerter från generella prislistor. En äldre offert kan vara användbar historik men får inte återanvändas som ett färskt köpbevis.

### Uppföljning som faktiskt fungerar

Bevakning kräver schemaläggning, tillåtna källor, tillståndsförändringar, deduplicerade meddelanden, leveransspårning och begripliga inställningar. Ett sparat namn är inte en bevakning. Ett datum i journalen är inte en skickad påminnelse. Börja med en begränsad verifierad leveransfrekvens och mät både missade förändringar och falska larm innan snabbare paket säljs.

## 10. Bevisa att Sajda är bättre

En jämförande utvärdering ska genomföras innan ett generellt bättre-värde-påstående publiceras. Följande är ett föreslaget protokoll, inte genomförda resultat.

**Namnurval:** börja med minst 40 varierade briefar: svenska och engelska, lokala tjänster, SaaS, konsumentprodukter, e-handel, strama budgetar och olika ändelsekrav. Jämför mot IDS, Namelix och relevanta segmentalternativ som Shopify eller Atom. Använd samma brief, tydligt avgränsad tidsbudget och dokumentera version/datum samt om konto krävs. Ändra inte prompts i efterhand endast för Sajda.

**Bedömning:** blindad och slumpad visningsordning för namnförslagen. Låt målgruppsnära bedömare och språkkompetenta personer välja faktiska finalister. Mät andel urval med minst tre användbara kandidater, tid till shortlist, variation och språkliga problem. Tillgänglighet och pris återkontrolleras vid samma mättillfälle, eftersom domänstatus ändras. Redovisa osäkerhet och delresultat per segment; 40 briefar är en pilot, inte bevis för global överlägsenhet.

**Projektflödet:** testa med riktiga founders och små byråer om de kan återvända, förstå föregående beslut och få med en medgrundare/kund utan manuell kopiering. Mät slutfört namnval och återkommande projekt separat. En kund som väljer namn och sedan slutar använda tjänsten kan ha lyckats fullt ut.

**Trading:** starta en tidsstämplad observationsperiod med förregistrerade urvalsregler. Följ även avvisade och osålda kandidater, inte bara lyckade exempel. Registrera kända kostnader och verkliga händelser. Kort observationsperiod kan testa datakvalitet och handlingsbarhet men inte etablera långsiktig avkastning. Undvik att backtesta en gammal rekommendation med information som inte fanns när den gavs.

**Föreslagna produktgrindar:** inga kända falska bekräftelser i releaseproven; minst 80 procent av pilotbriefarna ska kunna ge tre kandidater bedömarna vill utvärdera vidare; minst 70 procent mål för täckningsbidrag vid uppmätt normal användning. Dessa är interna mål, inte aktuella resultat eller marknadspåståenden. Större jämförelser kräver tillräcklig stickprovsstorlek och redovisad spridning.

## 11. Distribution och förtroende

Sajda bör finnas där namnvalet uppstår: i utvecklarverktyget, hos den lilla byrån och i founder-arbetet. Gratis connector kan ge första värdet. Kontoansluten fortsättning bör erbjuda samma privata projekt, inte en ny identitet eller separat betalplan. Testa faktiska klientflöden innan en klientlogotyp används som kompatibilitetslöfte.

Produktledd söktrafik är en kompletterande kanal: domänsökning, generator, verifierbar prisjämförelse och relevanta namnprojekt. Publicera inte många nästan identiska landningssidor för att ersätta produktkvalitet. Privata briefar, sparade listor och användarnas sökningar ska inte bli indexerbart innehåll. Prioritera en stabil offentlig domän och ett trovärdigt konto-/prisflöde före omfattande innehållsexpansion.

Neutralitet kräver praktiska regler: ersättning får inte ändra den organiska rankningen; sponsring ska märkas; prisbevis ska kunna granskas; saknade registratorer och okända villkor ska synas. En leverantörsintegration är värdefull men räcker inte för att påstå en fullständig marknadsjämförelse.

## 12. Varumärke, rättigheter och risk

**Sajda.com är fortfarande en publik islamisk plattform**, enligt den egna webbplatsen. Det etablerar en konkret namn-/entity-kollision. Det visar inte i sig vem som har vilka juridiska rättigheter till en domänresearchtjänst. Innan större varumärkesinvestering krävs fastställd produktionsdomän, identifierad juridisk operatör och relevant namn-/varumärkesgranskning. [S26](https://sajda.com/en).

Domäntillgänglighet ska hållas isär från företagsnamn och varumärkesskydd. PRV beskriver att skyddet är knutet till varor och tjänster samt att flera databaser behöver sökas för en bild av relevanta rättigheter i Sverige. Sajda bör erbjuda indikativa varningar och officiella vägar vidare, inte juridisk klarering. [S27](https://www.prv.se/sv/Varumarke/Vad-ar-ett-varumarke/).

Trading bör dessutom utesluta uppenbara varumärkesefterbildningar och säkerhetskänsliga möjligheter som skulle kunna användas för att överta någon annans konton eller e-post. Att stora företag tappat en länk ska inte i sig vara en positiv investeringssignal. Granskningsunderlaget behöver bedöma legitim användning och risk, inte exploaterbarhet.

## 13. Sajdas nuläge och releasegränser

| Område | Underlag som finns | Vad som inte får antas färdigt |
|---|---|---|
| Sökning och priser | Offentlig connector har en dokumenterad livekontroll med tio resultat och exakta Cloudflare-prisobservationer | Full täckning, lägsta pris över marknaden eller generell klientkompatibilitet |
| Konto och sparande | En kontobunden sparad lista och centrala medlemskontroller | Fullständiga projekt, samarbete eller automatiska aviseringar |
| MCP/API | Offentlig discovery och privata scoped kontooperationer är separerade | Friktionsfri OAuth-anslutning i alla assistenter |
| Trading | Radar, tekniska observationer, scenarier och privat journal finns i koden | Kalibrerad efterfrågan, oberoende värdering eller verkligt avkastningsbevis |
| Commerce | Priskatalog, accessmodeller och delar av integrationerna finns | Öppna Basic/Premium-abonnemang eller verifierad full betalningslivscykel |
| Kommunikation | Avsedd mejlarkitektur och gränssnitt finns | Levererade konto-/bevakningsmejl i produktionsmiljön |

Den nya namnprojektsgrunden är ett separat, avstängt backendsteg tills migration, behörigheter, klientflöde och driftsättning har verifierats. Den förändrar inte gratis sparande och aktiverar inte någon betalnivå. Se [implementationsgränser](NAME-PROJECTS.md).

## 14. Prioriterad genomförandeordning

| Ordning | Leverans | Godkännandekrav |
|---|---|---|
| 1 | Privata namnprojekt: brief, budget, språk, finalister | Ägarisolering, versionskontroll, återförsök, beständigt sparande; ingen dataförlust |
| 2 | Kontobaserad kapacitet och kostnadsmätning | Gratis första värde fungerar; betalande kunder delar inte ett orimligt litet globalt tak |
| 3 | Urvalsutvärdering och exact-name-kostnad | Dokumenterad förbättring i målsegmentet; okända priser hålls separata |
| 4 | Premium-projektminne och gemensamt beslut | Begripliga roller, delning som kan återkallas, fungerande återbesök |
| 5 | Verkliga aviseringar | Schemalagda kontroller, inga dubbla larm, leverans och fel synliga |
| 6 | Trading-källor, portfölj och prisprövning | Tillåtna data, verifierbara observationer, uppmätt kostnad per rapport |
| 7 | Paketering och lansering | Slutförd auth-/betalnings-/mejl-/runtime-verifiering och ärliga publika löften |

Detta är en beroendeordning, inte ett löfte om att varje del ryms inom ett bestämt antal dagar. Produktgrunden och utvärderingen bör gå före breddad marknadsföring. Ny research bör fokusera på de osäkerheter som faktiskt kan ändra prioriteringen: användarnas shortlistval, återkommande behov, datarättigheter, driftskostnad och betalningsvilja.

## Slutsats

Sajda kan bli ett bättre och mer prisvärt val för utvalda kunder. Det är ännu inte en verifierad generell position. Gratisalternativen är starka, nära konkurrenter har låga priser och flera av de föreslagna funktionerna finns redan på marknaden.

Den mest försvarbara vägen är att hjälpa en founder gå från en verklig verksamhetsidé till ett namn den vill använda, med dokumenterad kostnad och ett beslut som går att fortsätta arbeta med. Premium för $19 är en rimlig huvudkandidat om det arbetsflödet blir tydligt bättre. Trading behöver ett eget bevis på datakvalitet och tidsbesparing. Ett avancerat utseende eller en lång körning är inte i sig det beviset.

## Källförteckning

Samtliga webbkällor lästes 13 september 2026. Odaterade sidor kan ändras; priser ska återkontrolleras före extern publicering eller köp. Nummer hänvisar till källorna nära respektive påstående.

1. Instant Domain Search. [Business Name Generator — Now an AI Naming Assistant](https://instantdomainsearch.com/learn/updates/business-name-generator-naming-assistant). 1 september 2026.
2. Instant Domain Search. [The New Expired Domains Tool](https://instantdomainsearch.com/learn/updates/expired-domains-tool). 2 september 2026.
3. Instant Domain Search. [Introducing Accounts](https://instantdomainsearch.com/learn/updates/introducing-user-accounts). 21 juli 2026.
4. Instant Domain Search. [Search Domains From Your AI Assistant](https://instantdomainsearch.com/learn/updates/domain-search-mcp). 2 juli 2026.
5. Instant Domain Search. [Best Domain Registrars in 2026](https://instantdomainsearch.com/learn/guides/best-domain-registrars-2026). September 2026.
6. Unique Domains. [Pricing](https://unique.domains/pricing). Odaterad aktuell sida; äldre prisversion avvisad efter förnyad kontroll.
7. Namelix. [Business Name Generator](https://namelix.com/). Odaterad.
8. Shopify. [Business Name Generator](https://www.shopify.com/tools/business-name-generator). Odaterad.
9. Looka. [Business Name Generator](https://looka.com/business-name-generator/). Odaterad; [betalpriser](https://looka.com/pricing/) ej beloppsverifierade.
10. Atom. [Name Your Company](https://www.atom.com/naming). Odaterad.
11. Atom. [Pricing Packages](https://www.atom.com/pricing.php). Odaterad.
12. Atom. [Domains, Now Agent-Ready](https://www.atom.com/atom-mcp-server). Odaterad.
13. Webguide. [Domänpriser](https://webguide.se/domaner/). Prisytan anger kontroll 12 september 2026.
14. TLD-List. [Compare Domain Prices](https://tld-list.com/). Odaterad; [API-dokumentation](https://tld-list.com/docs-api) innehåller även legacy-material, inte verifierat aktuellt återförsäljningsavtal.
15. Domanpriser. [Metod och transparens](https://domanpriser.se/sa-fungerar-domanpriser/). Redaktionellt granskat 30 augusti 2026.
16. Internetstiftelsen. [Sök domän](https://internetstiftelsen.se/sok-doman/). Odaterad aktuell produktsida.
17. Droppa. [Hitta .se-domäner](https://droppa.se/). Odaterad.
18. DNIB, sponsrat av Verisign. [The DNIB Quarterly Report Q2 2026](https://www.dnib.com/articles/the-domain-name-industry-brief-q2-2026). 2026, avser andra kvartalet.
19. Cloudflare. [Registrar API](https://developers.cloudflare.com/registrar/registrar-api/). Uppdaterad 24 april 2026; [API-referens](https://developers.cloudflare.com/api/resources/registrar/).
20. Porkbun. [API Documentation](https://porkbun.com/api/json/v3/documentation). Odaterad aktuell dokumentation.
21. Cloudflare. [Registrar](https://www.cloudflare.com/products/registrar/). Odaterad.
22. GoDaddy. [GoDaddy Brings Agentic AI to Small Businesses with Launch of Airo.ai](https://aboutus.godaddy.net/newsroom/news-releases/press-release-details/2025/GoDaddy-Brings-Agentic-AI-to-Small-Businesses-with-Launch-of-Airo-ai/default.aspx). 2025.
23. ICANN. [ICANN Opens Application Window for New Generic Top-Level Domains](https://www.icann.org/en/announcements/details/icann-opens-application-window-for-new-generic-top-level-domains-30-04-2026-en). 30 april 2026.
24. Internetstiftelsen. [Regler och beskrivning av domännamnssökningar](https://internetstiftelsen.se/domaner/registrera-ett-domannamn/regler-och-beskrivning-av-domannamnssokningar/). Odaterad aktuell villkorssida.
25. ExpiredDomains. [FAQ](https://www.expireddomains.net/faq/). Odaterad aktuell åtkomstinformation.
26. Sajda. [Accurate Prayer Times, Quran, Athan and Qibla Direction](https://sajda.com/en). Odaterad; annan produktkategori än domänverktyget.
27. PRV. [Vad är ett varumärke?](https://www.prv.se/sv/Varumarke/Vad-ar-ett-varumarke/). Odaterad aktuell myndighetsvägledning.
28. ExpiredDomains. [Sign Up for a Free Account](https://www.expireddomains.net/register/). Odaterad.
29. SpamZilla. [Pricing](https://www.spamzilla.io/pricing/). Odaterad aktuell prislista, slutligt skatteutfall inte testat.
30. DomCop. [Pricing](https://www.domcop.com/pricing) och [FAQ](https://www.domcop.com/faq). Odaterade aktuella sidor; årsbetalning och nivåskillnader.
31. DomainTools. [Join](https://secure.domaintools.com/join/) och [Domain Research Pricing](https://www.domaintools.com/domain-research/pricing). Odaterade aktuella pris- och licenssidor.
32. NameBio. [API Documentation](https://api.namebio.com/docs/). Uppdaterad 18 juli 2026; produktåtkomst kräver separat tillstånd.

Fördjupad källdokumentation: [namnverktyg och founder-flöden](research/2026-09-13-founder-competitors.md), [Trading, datalicenser och investerarverktyg](research/2026-09-13-trading-competitors.md).

Internt verifieringsunderlag: `shared/plans.ts`, `src/i18n/pricingCopy.ts`, `shared/account-membership.ts`, `api/_shared/account-membership.ts`, `api/_shared/ai-allowance.ts`, `api/_shared/lost-domains-store.ts`, `docs/AI-CONNECTOR.md`, `docs/TRADING-PORTAL.md` och `docs/COMMERCE.md`. Dessa beskriver implementation och verifieringsgränser, inte konkurrenters marknadsdata.
