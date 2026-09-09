/**
 * The small, deliberately curated first layer of Sajda's public Swedish SEO
 * surface. This is a build-time manifest, not a keyword-to-page generator.
 *
 * Add a route here only after it has a distinct user intention and a matching
 * product experience. Search-result URLs, filters, personal projects, and
 * other transient states intentionally do not belong here.
 */

export const DEFAULT_SEO_ORIGIN = "https://sajda.dev";

/**
 * Stable, index-eligible Swedish routes. Canonicals intentionally omit a
 * trailing slash so the router, sitemap, and generated files agree.
 */
export const SEO_PAGES = Object.freeze([
  {
    path: "/se",
    title: "Hitta en bättre domän | Sajda",
    description:
      "Sajda hjälper dig att hitta, kontrollera och utvärdera domännamn innan du väljer var du vill köpa.",
    h1: "Hitta en domän som är värd att bygga vidare på.",
    lead:
      "Börja med en idé eller ett exakt namn. Sajda ger dig en tydlig väg från första tanke till registreringskontroller och köpvägar.",
    actionLabel: "Öppna domänsökningen",
    actionPath: "/",
    breadcrumb: ["Sajda"],
    sections: [
      {
        heading: "Ett sammanhållet domänbeslut",
        body:
          "Börja med ett exakt namn eller en idé. Fortsätt sedan med de alternativ som är värda att kontrollera, spara och jämföra.",
      },
      {
        heading: "Byggt för nästa steg",
        body:
          "Sajda samlar namnarbete, statuskontroller och vägen vidare i samma arbetsflöde. Du väljer själv om och var ett namn ska köpas.",
      },
    ],
    links: [
      { label: "Sök en domän", path: "/se/sok-doman" },
      { label: "Generera domännamn", path: "/se/domannamn-generator" },
      { label: "Företagsnamn", path: "/se/foretagsnamn-generator" },
      { label: "Välja domännamn", path: "/se/guide/valja-domannamn" },
      { label: "Domänguide", path: "/se/guide" },
      { label: "Vad kostar en domän?", path: "/se/guide/vad-kostar-en-doman" },
      { label: "Välj domänändelse", path: "/se/toppdomaner" },
      { label: ".se-domän", path: "/se/toppdomaner/se" },
      { label: ".com-domän", path: "/se/toppdomaner/com" },
      { label: "Så fungerar Sajda", path: "/se/sa-fungerar-sajda" },
    ],
  },
  {
    path: "/se/sok-doman",
    title: "Sök domän och kontrollera tillgänglighet | Sajda",
    description:
      "Skriv ett exakt domännamn och låt Sajda kontrollera tillgängligheten via relevant registryväg.",
    h1: "Sök en domän. Se vad som faktiskt går att kontrollera.",
    lead:
      "Skriv en exakt adress och fortsätt till Sajdas sökverktyg. Där separeras registrystatus från pris och köpväg, så att svaret går att lita på.",
    actionLabel: "Sök ett domännamn",
    actionPath: "/",
    breadcrumb: ["Sajda", "Sök domän"],
    sections: [
      {
        heading: "Kontrollera först, välj sedan",
        body:
          "En bra domän börjar med ett namn som kan användas. Sajda hjälper dig att kontrollera det exakta namnet innan du lägger tid på resten av beslutet.",
      },
      {
        heading: "Om namnet redan är taget",
        body:
          "Fortsätt med närliggande ändelser eller bygg ett nytt namnspår. Ett upptaget namn behöver inte vara slutet på idén.",
      },
    ],
    links: [
      { label: "Hitta domännamn", path: "/se/hitta-domannamn" },
      { label: "Generera domännamn", path: "/se/domannamn-generator" },
      { label: "Domän och varumärke", path: "/se/guide/doman-och-varumarke" },
      { label: "Vad kostar en domän?", path: "/se/guide/vad-kostar-en-doman" },
    ],
  },
  {
    path: "/se/domannamn-generator",
    title: "Domännamnsgenerator med registrykontroll | Sajda",
    description:
      "Beskriv en idé och få domännamn att utforska i Sajdas sökverktyg, med registrykontroller på valda ändelser.",
    h1: "Skapa domännamn som går att pröva på riktigt.",
    lead:
      "En namnriktning blir värdefull först när den kan granskas mot riktiga ändelser. Beskriv idén och fortsätt till ett sökflöde med tydliga val.",
    actionLabel: "Börja hitta namn",
    actionPath: "/",
    breadcrumb: ["Sajda", "Domännamnsgenerator"],
    sections: [
      {
        heading: "Mer än en lång lista",
        body:
          "Ett användbart förslag ska vara lätt att förstå, gå att uttala och passa det du faktiskt bygger. Välj en riktning och fortsätt därifrån.",
      },
      {
        heading: "Kontrollera medan idén är levande",
        body:
          "När ett namn sticker ut kan du kontrollera domänalternativet direkt och spara de spår du vill återvända till.",
      },
    ],
    links: [
      { label: "Hitta domännamn", path: "/se/hitta-domannamn" },
      { label: "Företagsnamnsgenerator", path: "/se/foretagsnamn-generator" },
      { label: "Välja domännamn", path: "/se/guide/valja-domannamn" },
      { label: "Korta domännamn", path: "/se/guide/korta-domannamn" },
    ],
  },
  {
    path: "/se/foretagsnamn-generator",
    title: "Företagsnamnsgenerator med domänkontroll | Sajda",
    description:
      "Beskriv företaget och utforska namnspår som kan kontrolleras mot relevanta domänändelser i Sajda.",
    h1: "Ge företaget ett namn som håller när verksamheten växer.",
    lead:
      "Skriv vad företaget gör, vem det är till för och vilken känsla det ska bära. Sajda hjälper dig att arbeta från namnspår till domänalternativ utan att blanda ihop olika rättigheter.",
    actionLabel: "Starta ett namnprojekt",
    actionPath: "/",
    breadcrumb: ["Sajda", "Företagsnamnsgenerator"],
    sections: [
      {
        heading: "Utgå från verksamheten",
        body:
          "Beskriv vad företaget gör, vem det är till för och hur namnet ska kännas. Då kan du välja mellan beskrivande, korta och mer varumärkesdrivna spår.",
      },
      {
        heading: "Domänstatus är ett eget steg",
        body:
          "Ett ledigt domännamn är inte samma sak som ett registrerbart företagsnamn eller varumärke. Sajda visar domänalternativet och hjälper dig vidare till en egen kontroll.",
      },
    ],
    links: [
      { label: "Generera domännamn", path: "/se/domannamn-generator" },
      { label: "Välja domännamn", path: "/se/guide/valja-domannamn" },
      { label: "Domän och varumärke", path: "/se/guide/doman-och-varumarke" },
      { label: "Sök .se-domän", path: "/se/toppdomaner/se" },
    ],
  },
  {
    path: "/se/hitta-domannamn",
    title: "Hitta domännamn med riktning | Sajda",
    description:
      "Hitta ett domännamn genom att börja i affären, produkten eller känslan och fortsätt sedan till registrykontroller.",
    h1: "Hitta ett namn med riktning, inte bara variation.",
    lead:
      "Ett bra domännamn ska vara möjligt att säga, skriva och utveckla vidare. Börja med det som är viktigt i erbjudandet och öppna sökningen när du vill pröva alternativen.",
    actionLabel: "Utforska namnspår",
    actionPath: "/",
    breadcrumb: ["Sajda", "Hitta domännamn"],
    sections: [
      {
        heading: "Börja med vad namnet ska göra",
        body:
          "Ett kort, internationellt eller mer beskrivande namn löser olika uppgifter. Välj det spår som passar projektet innan du bedömer enskilda förslag.",
      },
      {
        heading: "Gör förslagen användbara",
        body:
          "Kontrollera de namn du gillar, jämför relevanta ändelser och behåll bara kandidater som är värda nästa beslut.",
      },
    ],
    links: [
      { label: "Domännamnsgenerator", path: "/se/domannamn-generator" },
      { label: "Välja domännamn", path: "/se/guide/valja-domannamn" },
      { label: "Korta domännamn", path: "/se/guide/korta-domannamn" },
      { label: ".com-domän", path: "/se/toppdomaner/com" },
    ],
  },
  {
    path: "/se/toppdomaner/se",
    title: "Sök .se-domän | Sajda",
    description:
      "Undersök ett .se-domännamn med svensk marknad i åtanke och se den status som Sajda säkert kan visa.",
    h1: "Sök en .se-domän med svensk marknad i åtanke.",
    lead:
      ".se är ofta ett naturligt val när verksamheten, kunderna eller förtroendet i första hand är svenskt. Skriv namnet och pröva adressen i Sajda; om en säker offentlig verifiering saknas visas statusen som okänd.",
    actionLabel: "Undersök .se-domän",
    actionPath: "/",
    breadcrumb: ["Sajda", "Toppdomäner", ".se"],
    sections: [
      {
        heading: "När .se är en bra riktning",
        body:
          "Välj .se när namnet främst ska kännas hemma för svenska kunder, medarbetare eller medlemmar. Det gör syftet och marknaden lättare att läsa direkt i adressen.",
      },
      {
        heading: "Kontrollera namnet vid beslutstillfället",
        body:
          "Domänstatus och villkor kan förändras. Sajda visar kontrollens aktuella underlag när det går att bekräfta säkert, och markerar annars statusen som okänd. Bekräfta alltid slutlig tillgänglighet och pris hos den leverantör du väljer.",
      },
    ],
    links: [
      { label: "Sök en domän", path: "/se/sok-doman" },
      { label: ".com-domän", path: "/se/toppdomaner/com" },
      { label: ".se eller .com", path: "/se/guide/se-eller-com" },
      { label: "Vad kostar en domän?", path: "/se/guide/vad-kostar-en-doman" },
      { label: "Domänförnyelse", path: "/se/guide/domanfornyelse" },
    ],
  },
  {
    path: "/se/toppdomaner/com",
    title: "Sök .com-domän | Sajda",
    description:
      "Kontrollera ett .com-domännamn i Sajda och fortsätt till en tydlig registrystatus och köpväg.",
    h1: "Sök en .com-domän för ett namn som ska röra sig längre.",
    lead:
      ".com är en etablerad global ändelse, men den är inte alltid rätt för varje verksamhet. Skriv namnet och pröva det i en direkt .com-kontroll.",
    actionLabel: "Sök en .com-domän",
    actionPath: "/",
    breadcrumb: ["Sajda", "Toppdomäner", ".com"],
    sections: [
      {
        heading: "När .com är rätt val",
        body:
          "Välj .com när projektet ska kunna läsas internationellt, eller när en global målgrupp är viktig redan från början. Namnets tydlighet är fortfarande viktigare än ändelsen ensam.",
      },
      {
        heading: "Se hela alternativet",
        body:
          "Kontrollera det exakta namnet, titta på närliggande alternativ och fatta beslut nära köptillfället. Tillgänglighet, pris och villkor kan ändras mellan två kontroller.",
      },
    ],
    links: [
      { label: "Sök en domän", path: "/se/sok-doman" },
      { label: ".se-domän", path: "/se/toppdomaner/se" },
      { label: ".se eller .com", path: "/se/guide/se-eller-com" },
      { label: "Vad kostar en domän?", path: "/se/guide/vad-kostar-en-doman" },
      { label: "Flytta domän", path: "/se/guide/flytta-doman" },
    ],
  },
  {
    path: "/se/guide/se-eller-com",
    title: ".se eller .com? Pröva båda domänändelserna | Sajda",
    description:
      "Väg .se mot .com utifrån verksamhet och marknad, och fortsätt med båda ändelserna förvalda i Sajdas domänsökning.",
    h1: ".se eller .com? Börja i var namnet ska fungera.",
    lead:
      "Det finns ingen universell vinnare. .se kan vara naturligt för en svensk kärnmarknad, medan .com kan vara relevant för ett mer internationellt namn. Pröva båda innan du bestämmer dig.",
    actionLabel: "Kontrollera ditt namn",
    actionPath: "/",
    breadcrumb: ["Sajda", "Guide", ".se eller .com"],
    sections: [
      {
        heading: "Välj .se när Sverige är centrum",
        body:
          "En .se-domän signalerar ofta en svensk målgrupp. Den passar när verksamheten, språket och den viktigaste kundresan huvudsakligen finns i Sverige.",
      },
      {
        heading: "Välj .com när namnet ska resa längre",
        body:
          "En .com-domän kan vara enklare när projektet ska fungera över språkgränser. Det är inte en kvalitetsstämpel i sig – namnets tydlighet och tillgänglighet väger fortfarande tungt.",
      },
    ],
    links: [
      { label: "Sök en .se-domän", path: "/se/toppdomaner/se" },
      { label: "Sök en .com-domän", path: "/se/toppdomaner/com" },
      { label: "Välja domännamn", path: "/se/guide/valja-domannamn" },
      { label: "Vad kostar en domän?", path: "/se/guide/vad-kostar-en-doman" },
    ],
  },
  {
    path: "/se/guide/vad-kostar-en-doman",
    title: "Vad kostar en domän? Förstå priset före köp | Sajda",
    description:
      "Förstå vad som påverkar en domäns kostnad och fortsätt till Sajdas domänsökning för att kontrollera ett exakt namn.",
    h1: "Vad kostar en domän? Titta längre än första årets pris.",
    lead:
      "Kostnaden beror på ändelse, leverantör och villkor. Ett kampanjpris kan vara relevant, men förnyelsen och vad som faktiskt ingår är ofta lika viktigt att förstå.",
    actionLabel: "Kontrollera en domän",
    actionPath: "/",
    breadcrumb: ["Sajda", "Guide", "Vad kostar en domän?"],
    sections: [
      {
        heading: "Jämför rätt sak med rätt sak",
        body:
          "Samma namn under .se och .com är olika domäner. Börja med rätt ändelse, läs sedan både första perioden och vad som gäller efter den.",
      },
      {
        heading: "Prisuppgift behöver ett underlag",
        body:
          "Sajda visar pris med källa och tidpunkt när ett aktuellt underlag finns anslutet. Den slutliga kassan, valutan och villkoren bekräftas alltid hos vald leverantör.",
      },
    ],
    links: [
      { label: "Domänförnyelse", path: "/se/guide/domanfornyelse" },
      { label: "Sök en domän", path: "/se/sok-doman" },
      { label: "Sök .se-domän", path: "/se/toppdomaner/se" },
      { label: "Sök .com-domän", path: "/se/toppdomaner/com" },
    ],
  },
  {
    path: "/se/guide/domanfornyelse",
    title: "Domänförnyelse: så planerar du nästa period | Sajda",
    description:
      "Förstå vad domänförnyelse innebär, vad du behöver kontrollera och hur du börjar med en exakt domän i Sajda.",
    h1: "Domänförnyelse är ett beslut som förtjänar en kontroll i tid.",
    lead:
      "En domän fortsätter normalt bara att fungera när den förnyas enligt den valda leverantörens villkor. Se över datum, kontaktuppgifter och pris innan du hamnar nära ett avbrott.",
    actionLabel: "Kontrollera en domän",
    actionPath: "/",
    breadcrumb: ["Sajda", "Guide", "Domänförnyelse"],
    sections: [
      {
        heading: "Se över ditt konto i tid",
        body:
          "Förnyelsedatum, kontaktuppgifter, pris och inställningar hör hemma hos den leverantör som håller registreringen. Vänta inte tills adressen riskerar att påverkas.",
      },
      {
        heading: "Håll isär avtal och domänstatus",
        body:
          "En registrykontroll visar inte ditt kundavtal eller din faktura. Sajda kan hjälpa dig undersöka den exakta adressen, medan avtalsuppgifterna bekräftas hos din leverantör.",
      },
    ],
    links: [
      { label: "Vad kostar en domän?", path: "/se/guide/vad-kostar-en-doman" },
      { label: "Flytta domän", path: "/se/guide/flytta-doman" },
      { label: "Sök en domän", path: "/se/sok-doman" },
      { label: ".se eller .com", path: "/se/guide/se-eller-com" },
    ],
  },
  {
    path: "/se/guide/valja-domannamn",
    title: "Välja domännamn: en tydlig metod | Sajda",
    description:
      "Välj domännamn med fokus på tydlighet, uttal och användning. Börja ett namnspår i Sajdas sökverktyg.",
    h1: "Välj ett domännamn som människor kan hitta tillbaka till.",
    lead:
      "Ett bra namn behöver inte säga allt. Det behöver vara tydligt i sin situation, gå att skriva och fungera när människor ser eller hör det för första gången.",
    actionLabel: "Börja ett namnspår",
    actionPath: "/",
    breadcrumb: ["Sajda", "Guide", "Välja domännamn"],
    sections: [
      {
        heading: "Börja i användningen",
        body:
          "Tänk på vem som ska säga, skriva och rekommendera namnet. Ett bra namn fungerar i sin verkliga kundresa, inte bara i en lista med förslag.",
      },
      {
        heading: "Låt varje kontroll göra sitt jobb",
        body:
          "Domänstatus, företagsnamn och varumärke är olika frågor. Pröva namnspåret, kontrollera adressen och gör sedan relevanta officiella kontroller.",
      },
    ],
    links: [
      { label: "Korta domännamn", path: "/se/guide/korta-domannamn" },
      { label: "Hitta domännamn", path: "/se/hitta-domannamn" },
      { label: "Företagsnamnsgenerator", path: "/se/foretagsnamn-generator" },
      { label: "Domän och varumärke", path: "/se/guide/doman-och-varumarke" },
    ],
  },
  {
    path: "/se/guide/flytta-doman",
    title: "Flytta domän: vad du behöver kontrollera först | Sajda",
    description:
      "Förstå grunderna när du ska flytta en domän mellan leverantörer och kontrollera den exakta domänen i Sajda.",
    h1: "Flytta en domän med kontroll över namn, åtkomst och tidpunkt.",
    lead:
      "En domänflytt hanteras av din nuvarande och nya leverantör. Börja med att förstå vilken domän det gäller, vem som har åtkomst och vilka regler som gäller för just ändelsen.",
    actionLabel: "Kontrollera en domän",
    actionPath: "/",
    breadcrumb: ["Sajda", "Guide", "Flytta domän"],
    sections: [
      {
        heading: "Säkra åtkomst innan något ändras",
        body:
          "Kontrollera vem som har åtkomst till kontot och e-posten som kan behövas för godkännanden. DNS, e-post och webbplats kan vara separata delar.",
      },
      {
        heading: "Följ rätt process för ändelsen",
        body:
          "Flyttregler, auktorisering och eventuella begränsningar bestäms av ändelsen och de leverantörer som berörs. Sajda startar eller genomför inte en flytt.",
      },
    ],
    links: [
      { label: "Domänförnyelse", path: "/se/guide/domanfornyelse" },
      { label: "Vad kostar en domän?", path: "/se/guide/vad-kostar-en-doman" },
      { label: "Sök en domän", path: "/se/sok-doman" },
      { label: ".com-domän", path: "/se/toppdomaner/com" },
    ],
  },
  {
    path: "/se/guide/doman-och-varumarke",
    title: "Domän och varumärke: två olika kontroller | Sajda",
    description:
      "Förstå skillnaden mellan domän, företagsnamn och varumärke innan du går vidare med ett namn i Sajda.",
    h1: "En ledig domän är inte ett besked om varumärket.",
    lead:
      "Domänregistrering, företagsnamn och varumärkesrätt är olika frågor. Börja gärna med ett namnspår och en domänkontroll, men låt alltid rätt källa pröva respektive fråga.",
    actionLabel: "Undersök ett domänspår",
    actionPath: "/",
    breadcrumb: ["Sajda", "Guide", "Domän och varumärke"],
    sections: [
      {
        heading: "Domänen är en teknisk adress",
        body:
          "En domänkontroll gäller en specifik adress och ändelse vid kontrolltillfället. Den ger inte ett besked om rätten att använda samma ord som företag eller varumärke.",
      },
      {
        heading: "Gör officiella kontroller före lansering",
        body:
          "Sajda hjälper dig med domänspåret. Företagsnamn och varumärken behöver kontrolleras i relevanta officiella register och bedömas i sitt verkliga sammanhang.",
      },
    ],
    links: [
      { label: "Företagsnamnsgenerator", path: "/se/foretagsnamn-generator" },
      { label: "Välja domännamn", path: "/se/guide/valja-domannamn" },
      { label: "Sök en domän", path: "/se/sok-doman" },
      { label: "Sök .se-domän", path: "/se/toppdomaner/se" },
    ],
  },
  {
    path: "/se/guide/korta-domannamn",
    title: "Korta domännamn: hitta en tydlig riktning | Sajda",
    description:
      "Utforska korta domännamn med fokus på uttal, stavning och användning. Fortsätt till Sajdas namnsökning.",
    h1: "Korta domännamn är starka när de fortfarande går att förstå.",
    lead:
      "Ett kort namn kan vara lätt att minnas, men inte om det blir svårt att uttala eller förklara. Börja med den betydelse och känsla namnet ska bära, inte bara antalet tecken.",
    actionLabel: "Utforska korta namn",
    actionPath: "/",
    breadcrumb: ["Sajda", "Guide", "Korta domännamn"],
    sections: [
      {
        heading: "Korthet är ett kriterium bland flera",
        body:
          "Ett kort namn behöver fortfarande vara möjligt att säga, stava och förstå i den marknad där det ska användas. Det kortaste alternativet är inte alltid det starkaste.",
      },
      {
        heading: "Pröva innan du låser dig",
        body:
          "Läs kandidaterna högt, se hur de skrivs och kontrollera sedan de mest lovande namnen mot relevanta ändelser i Sajdas arbetsyta.",
      },
    ],
    links: [
      { label: "Välja domännamn", path: "/se/guide/valja-domannamn" },
      { label: "Domännamnsgenerator", path: "/se/domannamn-generator" },
      { label: "Hitta domännamn", path: "/se/hitta-domannamn" },
      { label: ".com-domän", path: "/se/toppdomaner/com" },
    ],
  },
  {
    path: "/se/toppdomaner",
    title: "Domänändelser: hitta rätt toppdomän | Sajda",
    description:
      "Välj domänändelse utifrån namn, marknad och användning. Pröva relevanta toppdomäner i Sajdas domänsökning.",
    h1: "Välj en domänändelse som hjälper namnet att göra sitt jobb.",
    lead:
      "En toppdomän ger sammanhang åt ett namn, men ska inte väljas på vana ensam. Pröva de ändelser som matchar din marknad, produkt och hur namnet ska användas.",
    actionLabel: "Pröva relevanta ändelser",
    actionPath: "/",
    breadcrumb: ["Sajda", "Domänändelser"],
    sections: [
      {
        heading: "Börja med sammanhanget",
        body:
          "En lokal marknad, en öppen organisation, en produkt eller en utvecklarinriktad tjänst kan behöva olika signaler. Välj ett litet urval som stämmer med verklig användning.",
      },
      {
        heading: "Pröva de viktiga alternativen",
        body:
          "Tillgänglighet, pris och köpväg har olika underlag. Sajda hjälper dig att kontrollera relevanta adresser, medan det slutliga beslutet bekräftas hos vald domänleverantör.",
      },
    ],
    links: [
      { label: ".se-domän", path: "/se/toppdomaner/se" },
      { label: ".com-domän", path: "/se/toppdomaner/com" },
      { label: ".ai-domän", path: "/se/toppdomaner/ai" },
      { label: ".app-domän", path: "/se/toppdomaner/app" },
      { label: ".dev-domän", path: "/se/toppdomaner/dev" },
      { label: ".org-domän", path: "/se/toppdomaner/org" },
      { label: ".net-domän", path: "/se/toppdomaner/net" },
      { label: ".se eller .com", path: "/se/guide/se-eller-com" },
    ],
  },
  {
    path: "/se/toppdomaner/ai",
    title: "Sök .ai-domän | Sajda",
    description:
      "Undersök ett .ai-domännamn med en direkt registrykontroll i Sajda och pröva om ändelsen passar ditt projekt.",
    h1: "Sök en .ai-domän med ett tydligt projekt i centrum.",
    lead:
      ".ai kan vara relevant när ändelsen är en naturlig del av hur produkten eller verksamheten presenteras. Skriv namnet och pröva den exakta adressen i Sajda.",
    actionLabel: "Sök en .ai-domän",
    actionPath: "/",
    breadcrumb: ["Sajda", "Toppdomäner", ".ai"],
    sections: [
      {
        heading: "När .ai är en bra riktning",
        body:
          "Pröva .ai när ändelsen är tydlig för målgruppen och passar det du faktiskt bygger – inte bara för att den känns aktuell.",
      },
      {
        heading: "Kontrollera den exakta adressen",
        body:
          "Sajda hämtar status via en registryväg. Ledig visas bara när svaret kan bekräftas, medan osäkra svar tydligt får statusen okänd.",
      },
    ],
    links: [
      { label: "Välj domänändelse", path: "/se/toppdomaner" },
      { label: ".app-domän", path: "/se/toppdomaner/app" },
      { label: ".dev-domän", path: "/se/toppdomaner/dev" },
      { label: ".com-domän", path: "/se/toppdomaner/com" },
      { label: "Välja domännamn", path: "/se/guide/valja-domannamn" },
    ],
  },
  {
    path: "/se/toppdomaner/app",
    title: "Sök .app-domän | Sajda",
    description:
      "Undersök ett .app-domännamn med en direkt registrykontroll i Sajda och pröva om ändelsen passar din produkt.",
    h1: "Sök en .app-domän för en produkt som ska kännas direkt.",
    lead:
      ".app kan ge ett tydligt sammanhang för en produkt eller tjänst som används som en app. Skriv namnet och pröva den exakta adressen i Sajda.",
    actionLabel: "Sök en .app-domän",
    actionPath: "/",
    breadcrumb: ["Sajda", "Toppdomäner", ".app"],
    sections: [
      {
        heading: "När .app är en bra riktning",
        body:
          "Pröva .app när produkten verkligen är en app eller digital tjänst och ändelsen gör adressen tydligare för de människor du vill nå.",
      },
      {
        heading: "Kontrollera den exakta adressen",
        body:
          "Sajda hämtar status via en registryväg. Ledig visas bara när svaret kan bekräftas, medan osäkra svar tydligt får statusen okänd.",
      },
    ],
    links: [
      { label: "Välj domänändelse", path: "/se/toppdomaner" },
      { label: ".ai-domän", path: "/se/toppdomaner/ai" },
      { label: ".dev-domän", path: "/se/toppdomaner/dev" },
      { label: ".com-domän", path: "/se/toppdomaner/com" },
      { label: "Företagsnamn", path: "/se/foretagsnamn-generator" },
    ],
  },
  {
    path: "/se/toppdomaner/dev",
    title: "Sök .dev-domän | Sajda",
    description:
      "Undersök ett .dev-domännamn med en direkt registrykontroll i Sajda och pröva om ändelsen passar ditt utvecklarprojekt.",
    h1: "Sök en .dev-domän för ett projekt som byggs för utveckling.",
    lead:
      ".dev kan passa produkter, verktyg och projekt där utvecklare är en viktig målgrupp. Skriv namnet och pröva den exakta adressen i Sajda.",
    actionLabel: "Sök en .dev-domän",
    actionPath: "/",
    breadcrumb: ["Sajda", "Toppdomäner", ".dev"],
    sections: [
      {
        heading: "När .dev är en bra riktning",
        body:
          "Pröva .dev när verktyget, dokumentationen eller produkten tydligt riktar sig till utvecklare eller ett tekniskt arbetsflöde.",
      },
      {
        heading: "Kontrollera den exakta adressen",
        body:
          "Sajda hämtar status via en registryväg. Ledig visas bara när svaret kan bekräftas, medan osäkra svar tydligt får statusen okänd.",
      },
    ],
    links: [
      { label: "Välj domänändelse", path: "/se/toppdomaner" },
      { label: ".app-domän", path: "/se/toppdomaner/app" },
      { label: ".ai-domän", path: "/se/toppdomaner/ai" },
      { label: ".com-domän", path: "/se/toppdomaner/com" },
      { label: "Domännamnsgenerator", path: "/se/domannamn-generator" },
    ],
  },
  {
    path: "/se/toppdomaner/org",
    title: "Sök .org-domän | Sajda",
    description:
      "Undersök ett .org-domännamn med en direkt registrykontroll i Sajda och pröva om ändelsen passar en organisation eller ett initiativ.",
    h1: "Sök en .org-domän för ett initiativ med ett tydligt syfte.",
    lead:
      ".org kan vara en relevant riktning för organisationer, gemenskaper och initiativ. Skriv namnet och pröva den exakta adressen i Sajda.",
    actionLabel: "Sök en .org-domän",
    actionPath: "/",
    breadcrumb: ["Sajda", "Toppdomäner", ".org"],
    sections: [
      {
        heading: "När .org är en bra riktning",
        body:
          "Pröva .org när namnet ska bära en organisation, gemenskap eller ett initiativ där syftet är centralt för mottagaren.",
      },
      {
        heading: "Kontrollera den exakta adressen",
        body:
          "Sajda hämtar status via en registryväg. Ledig visas bara när svaret kan bekräftas, medan osäkra svar tydligt får statusen okänd.",
      },
    ],
    links: [
      { label: "Välj domänändelse", path: "/se/toppdomaner" },
      { label: ".se-domän", path: "/se/toppdomaner/se" },
      { label: ".com-domän", path: "/se/toppdomaner/com" },
      { label: "Företagsnamn", path: "/se/foretagsnamn-generator" },
      { label: "Domän och varumärke", path: "/se/guide/doman-och-varumarke" },
    ],
  },
  {
    path: "/se/toppdomaner/net",
    title: "Sök .net-domän | Sajda",
    description:
      "Undersök ett .net-domännamn med en direkt registrykontroll i Sajda och pröva om ändelsen passar ditt nätverk eller projekt.",
    h1: "Sök en .net-domän när sammanhanget är ett nätverk eller en teknisk tjänst.",
    lead:
      ".net kan vara relevant för nätverk, infrastruktur eller tekniska tjänster när ändelsen tillför tydlighet. Skriv namnet och pröva den exakta adressen i Sajda.",
    actionLabel: "Sök en .net-domän",
    actionPath: "/",
    breadcrumb: ["Sajda", "Toppdomäner", ".net"],
    sections: [
      {
        heading: "När .net är en bra riktning",
        body:
          "Pröva .net när nätverk, infrastruktur eller en teknisk tjänst är en verklig del av hur projektet ska förstås och användas.",
      },
      {
        heading: "Kontrollera den exakta adressen",
        body:
          "Sajda hämtar status via en registryväg. Ledig visas bara när svaret kan bekräftas, medan osäkra svar tydligt får statusen okänd.",
      },
    ],
    links: [
      { label: "Välj domänändelse", path: "/se/toppdomaner" },
      { label: ".dev-domän", path: "/se/toppdomaner/dev" },
      { label: ".com-domän", path: "/se/toppdomaner/com" },
      { label: ".org-domän", path: "/se/toppdomaner/org" },
      { label: "Sök en domän", path: "/se/sok-doman" },
    ],
  },
  {
    path: "/se/sa-fungerar-sajda",
    title: "Så fungerar Sajda — underlag för ditt domänval | Sajda",
    description:
      "Se hur Sajda hittar, kontrollerar och jämför domännamn. Status, priskällor och osäkerhet visas så att du kan välja själv.",
    h1: "Ett domänval blir bättre när underlaget följer med.",
    lead:
      "Sajda är en oberoende arbetsyta för att hitta, kontrollera och jämföra domännamn. Varje del av resultatet ska göra det tydligare vad som är bekräftat, vad som är osäkert och vad du behöver avgöra själv.",
    actionLabel: "Öppna domänsökningen",
    actionPath: "/",
    breadcrumb: ["Sajda", "Så fungerar Sajda"],
    sections: [
      {
        heading: "Status ska kunna läsas",
        body:
          "När en relevant kontrollväg kan bekräfta statusen visar Sajda vilket underlag som användes. När svaret inte kan bekräftas säkert visas okänd i stället för en gissning.",
      },
      {
        heading: "Pris behöver sammanhang",
        body:
          "Ett pris visas bara när det finns ett begripligt underlag. Kampanjpris, förnyelse, moms och slutlig kassa hos leverantören är olika delar av samma beslut.",
      },
    ],
    links: [
      { label: "Sök en domän", path: "/se/sok-doman" },
      { label: "Välj domänändelse", path: "/se/toppdomaner" },
      { label: "Vad kostar en domän?", path: "/se/guide/vad-kostar-en-doman" },
      { label: "Domän och varumärke", path: "/se/guide/doman-och-varumarke" },
      { label: "Hitta domännamn", path: "/se/hitta-domannamn" },
    ],
  },
  {
    path: "/se/guide",
    title: "Domänguide: välj, förnya och flytta en domän | Sajda",
    description:
      "En praktisk domänguide om namn, ändelser, pris, förnyelse, flytt och varumärke – med en direkt väg till Sajdas domänsökning.",
    h1: "En domänguide för beslut före, under och efter registrering.",
    lead:
      "En domän är både en teknisk adress och en del av hur människor hittar tillbaka till ditt projekt. Börja i den fråga som är aktuell nu och fortsätt med exakt sökning när du är redo.",
    actionLabel: "Undersök en domän",
    actionPath: "/",
    breadcrumb: ["Sajda", "Domänguide"],
    sections: [
      {
        heading: "Rätt domänfråga vid rätt tillfälle",
        body:
          "Namnet, ändelsen, priset, flytten och rättigheterna är olika delar av samma beslut. Håll dem isär så blir nästa steg lättare att förstå.",
      },
      {
        heading: "Pröva adressen när du är redo",
        body:
          "Sajda förklarar beslutet och hjälper dig vidare till en kontroll. Pris, villkor och rättigheter bekräftas alltid hos den källa som ansvarar för dem.",
      },
    ],
    links: [
      { label: "Välja domännamn", path: "/se/guide/valja-domannamn" },
      { label: "Välj domänändelse", path: "/se/toppdomaner" },
      { label: ".se eller .com", path: "/se/guide/se-eller-com" },
      { label: "Vad kostar en domän?", path: "/se/guide/vad-kostar-en-doman" },
      { label: "Domänförnyelse", path: "/se/guide/domanfornyelse" },
      { label: "Flytta domän", path: "/se/guide/flytta-doman" },
      { label: "Domän och varumärke", path: "/se/guide/doman-och-varumarke" },
      { label: "Korta domännamn", path: "/se/guide/korta-domannamn" },
    ],
  },
]);

export const SEO_PAGE_BY_PATH = new Map(SEO_PAGES.map((page) => [page.path, page]));

export function normalizeSeoOrigin(value) {
  const candidate = value?.trim() || DEFAULT_SEO_ORIGIN;
  const url = new URL(candidate);

  if (url.protocol !== "https:") {
    throw new Error("SAJDA_CANONICAL_ORIGIN must use https.");
  }

  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("SAJDA_CANONICAL_ORIGIN must be a bare origin, for example https://sajda.dev.");
  }

  return url.origin;
}

export function resolveSeoOrigin(value = process.env.SAJDA_CANONICAL_ORIGIN) {
  return normalizeSeoOrigin(value);
}

/**
 * The static document and the hydrated React route must always declare the
 * same canonical origin. The browser receives the VITE_ value at bundle time;
 * the generator receives the server-only value. Refuse to publish if a manual
 * build supplied different values instead of letting two canonicals compete.
 */
export function resolveSeoBuildOrigin(environment = process.env) {
  const staticOrigin = normalizeSeoOrigin(environment.SAJDA_CANONICAL_ORIGIN);
  const browserOrigin = normalizeSeoOrigin(environment.VITE_SAJDA_CANONICAL_ORIGIN);

  if (staticOrigin !== browserOrigin) {
    throw new Error(
      "SAJDA_CANONICAL_ORIGIN and VITE_SAJDA_CANONICAL_ORIGIN must resolve to the same HTTPS origin.",
    );
  }

  return staticOrigin;
}

export function canonicalUrl(path, origin = resolveSeoOrigin()) {
  if (!SEO_PAGE_BY_PATH.has(path)) {
    throw new Error(`Unknown SEO route: ${path}`);
  }

  return `${origin}${path}`;
}

export function isNoindexBuild(environment = process.env) {
  // Preview and development deployments are never a second search surface.
  // This check deliberately comes before an operator override: allowing an
  // accidental `SAJDA_SEO_INDEXING=index` in Preview would expose canonical
  // production pages from a non-production host.
  const vercelEnvironment = environment.VERCEL_ENV?.trim();
  if (vercelEnvironment && vercelEnvironment !== "production") return true;

  if (environment.SAJDA_SEO_INDEXING?.trim() === "noindex") return true;
  if (environment.SAJDA_SEO_INDEXING?.trim() === "index") return false;

  return false;
}
