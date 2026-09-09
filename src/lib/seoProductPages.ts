import type { ScanMode } from "@/lib/scanModes";

export type SeoProductPageId =
  | "market"
  | "domain-search"
  | "domain-generator"
  | "company-generator"
  | "find-domain-name"
  | "top-domains"
  | "tld-se"
  | "tld-com"
  | "tld-ai"
  | "tld-app"
  | "tld-dev"
  | "tld-org"
  | "tld-net"
  | "guide-hub"
  | "se-or-com"
  | "domain-cost"
  | "domain-renewal"
  | "choose-domain-name"
  | "move-domain"
  | "domain-and-trademark"
  | "short-domain-names";

type PageSignal = "search" | "check" | "compare" | "project" | "globe" | "direction";

export interface SeoProductPage {
  id: SeoProductPageId;
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  lead: string;
  field: {
    label: string;
    placeholder: string;
    hint: string;
    action: string;
    required?: boolean;
    appendTld?: string;
  };
  preset: {
    advanced?: boolean;
    tlds?: string[];
    mode?: ScanMode;
    focus?: "main" | "advanced";
  };
  productTitle: string;
  productLead: string;
  signals: Array<{
    icon: PageSignal;
    title: string;
    body: string;
  }>;
  steps: Array<{
    title: string;
    body: string;
  }>;
  scopeTitle: string;
  scope: string;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
  related: SeoProductPageId[];
}

type TldPageInput = {
  id: SeoProductPageId;
  tld: "ai" | "app" | "dev" | "org" | "net";
  title: string;
  description: string;
  h1: string;
  lead: string;
  productTitle: string;
  productLead: string;
  fitTitle: string;
  fitBody: string;
  scope: string;
  faqs: SeoProductPage["faqs"];
  related: SeoProductPageId[];
};

function createTldPage(input: TldPageInput): SeoProductPage {
  const extension = `.${input.tld}`;

  return {
    id: input.id,
    path: `/se/toppdomaner/${input.tld}`,
    title: input.title,
    description: input.description,
    eyebrow: `${extension}-domän`,
    h1: input.h1,
    lead: input.lead,
    field: {
      label: `Vilket ${extension}-namn vill du kontrollera?`,
      placeholder: "nordform",
      hint: `Skriv bara namnet eller hela adressen. Sajda lägger till ${extension} när det saknas och startar ingen kontroll automatiskt.`,
      action: `Kontrollera ${extension}-domän`,
      required: true,
      appendTld: input.tld,
    },
    preset: { tlds: [input.tld], mode: "light", focus: "main" },
    productTitle: input.productTitle,
    productLead: input.productLead,
    signals: [
      { icon: "direction", title: input.fitTitle, body: input.fitBody },
      { icon: "check", title: "Exakt registrykontroll", body: `Sajda behandlar ${extension}-adressen som en egen kontroll och visar underlaget separat från pris och köpväg.` },
      { icon: "compare", title: "Välj med sammanhang", body: "Pröva även närliggande ändelser om marknad, användning eller namnets tydlighet pekar åt ett annat håll." },
    ],
    steps: [
      { title: "Skriv namnet", body: `Sajda fyller i ${extension} om ändelsen saknas.` },
      { title: "Kontrollera status", body: "Sökningen visar det svar som registryvägen kan ge och markerar osäkerhet i stället för att gissa." },
      { title: "Bekräfta nära köp", body: "Tillgänglighet, pris och villkor kan ändras. Kontrollera det slutliga underlaget hos vald domänleverantör." },
    ],
    scopeTitle: `En ${extension}-kontroll är inte en reservering.`,
    scope: input.scope,
    faqs: input.faqs,
    related: input.related,
  };
}

export const seoProductPages: Record<SeoProductPageId, SeoProductPage> = {
  market: {
    id: "market",
    path: "/se",
    title: "Hitta en bättre domän | Sajda",
    description: "Sajda hjälper dig att hitta, kontrollera och utvärdera domännamn innan du väljer var du vill köpa.",
    eyebrow: "Sajda · svensk domänsökning",
    h1: "Hitta en domän som är värd att bygga vidare på.",
    lead: "Börja med en idé eller ett exakt namn. Sajda ger dig en tydlig väg från första tanke till registreringskontroller och köpvägar.",
    field: {
      label: "Vad vill du undersöka?",
      placeholder: "Exempel: ett hållbart kaffemärke eller nordform.se",
      hint: "Du kan skriva en idé, ett varumärkesspår eller en exakt domän. Sökningen startar först i arbetsytan.",
      action: "Fortsätt till sökningen",
    },
    preset: { mode: "medium", focus: "main" },
    productTitle: "Ett sammanhang för hela domänbeslutet.",
    productLead: "Sajda är byggt för att göra nästa steg tydligt, utan att låtsas att ett resultat är ett köp eller en juridisk bedömning.",
    signals: [
      { icon: "direction", title: "Börja med riktning", body: "Beskriv vad namnet ska bära och utforska olika sätt att formulera det." },
      { icon: "check", title: "Kontrollera det som går", body: "Exakta domäner och kandidater skickas vidare till relevanta registryvägar." },
      { icon: "compare", title: "Välj med kontext", body: "När prisdata finns ansluten visas källa och tidpunkt – annars en ärlig köpväg." },
    ],
    steps: [
      { title: "Beskriv eller skriv exakt", body: "En idé ger namnspår. En domän med ändelse ger en direkt kontroll." },
      { title: "Välj ändelser och stil", body: "Håll sökningen fokuserad på de adresser som faktiskt är relevanta." },
      { title: "Granska resultatet", body: "Tillgänglighet, prisuppgift och namnbedömning hålls isär så att beslutet går att förstå." },
    ],
    scopeTitle: "Sajda säljer inte ett påstående.",
    scope: "Tillgänglighet och priser kan förändras. Sajda visar källa och status där det finns underlag, och du bekräftar alltid det slutliga köpet hos vald domänleverantör.",
    faqs: [
      { question: "Kan jag skriva in en exakt domän?", answer: "Ja. Skriv till exempel namn.se eller namn.com så blir det en direkt kontroll i stället för en kreativ sökning." },
      { question: "Måste jag bestämma ändelser direkt?", answer: "Nej. Du kan börja brett och begränsa urvalet i arbetsytan när du vet vilka marknader och sammanhang som är viktiga." },
    ],
    related: ["domain-search", "domain-generator", "top-domains", "choose-domain-name", "domain-cost"],
  },
  "domain-search": {
    id: "domain-search",
    path: "/se/sok-doman",
    title: "Sök domän och kontrollera tillgänglighet | Sajda",
    description: "Skriv ett exakt domännamn och låt Sajda kontrollera tillgängligheten via relevant registryväg.",
    eyebrow: "Domänsökning",
    h1: "Sök en domän. Se vad som faktiskt går att kontrollera.",
    lead: "Skriv en exakt adress och fortsätt till Sajdas sökverktyg. Där separeras registrystatus från pris och köpväg, så att svaret går att lita på.",
    field: {
      label: "Skriv domänen du vill kontrollera",
      placeholder: "exempel.se",
      hint: "Skriv ändelsen också. Sajda kontrollerar inga domäner förrän du aktivt startar sökningen.",
      action: "Kontrollera domänen",
      required: true,
    },
    preset: { mode: "light", focus: "main" },
    productTitle: "En kontroll ska visa sin grund.",
    productLead: "En domän är inte automatiskt tillgänglig bara för att en butik visar en köpsida. Sajda gör kontrollvägen och osäkerheten synlig.",
    signals: [
      { icon: "search", title: "Exakt inmatning", body: "En adress med ändelse behandlas som en direkt kontroll, inte som ett tema för namnförslag." },
      { icon: "check", title: "Registrystatus först", body: "Statusen redovisas separat från en leverantörs pris- eller köpsida." },
      { icon: "compare", title: "Köpväg med källa", body: "Pris visas bara när Sajda har ett aktuellt, anslutet underlag. Annars går du vidare till leverantörens egen sökning." },
    ],
    steps: [
      { title: "Skriv hela adressen", body: "Ange exempelvis nordform.se eller nordform.com." },
      { title: "Starta kontrollen", body: "Sajda använder den relevanta vägen för ändelsen och redovisar resultatet som tillgängligt, upptaget eller okänt." },
      { title: "Bekräfta vid köp", body: "Domänläget kan ändras. Leverantörens kassa är alltid den sista bekräftelsen." },
    ],
    scopeTitle: "Tydlig status före säkra formuleringar.",
    scope: "Om en registryväg inte kan bekräfta ett svar presenteras inte en gissning som tillgänglighet. Det är bättre att visa okänt än att styra dig fel.",
    faqs: [
      { question: "Kan jag kontrollera flera domäner?", answer: "Ja. I arbetsytan kan du skriva flera exakta domäner separerade med kommatecken eller radbrytningar." },
      { question: "Betyder tillgänglig att namnet är fritt som varumärke?", answer: "Nej. Domänregistrering, företagsnamn och varumärken är olika frågor. Gör alltid en separat officiell kontroll före lansering." },
    ],
    related: ["market", "domain-and-trademark", "domain-cost", "se-or-com"],
  },
  "domain-generator": {
    id: "domain-generator",
    path: "/se/domannamn-generator",
    title: "Domännamnsgenerator med registrykontroll | Sajda",
    description: "Beskriv en idé och få domännamn att utforska i Sajdas sökverktyg, med registrykontroller på valda ändelser.",
    eyebrow: "Domännamnsgenerator",
    h1: "Skapa domännamn som går att pröva på riktigt.",
    lead: "En namnriktning blir värdefull först när den kan granskas mot riktiga ändelser. Beskriv idén och fortsätt till ett sökflöde med tydliga val.",
    field: {
      label: "Vad ska namnet handla om?",
      placeholder: "Exempel: en lugn bokningsapp för små kliniker",
      hint: "Din beskrivning följer med som en sökbrief. Du väljer själv ändelser och sökstil innan något kontrolleras.",
      action: "Skapa namnspår",
      required: true,
    },
    preset: { advanced: true, mode: "heavy", focus: "advanced" },
    productTitle: "Idé, ljud och användbarhet i samma arbetsyta.",
    productLead: "Sajda samlar kreativa namnspår och registrykontroller i ett flöde. Det minskar glappet mellan ett namn som låter bra och ett namn du faktiskt kan arbeta vidare med.",
    signals: [
      { icon: "direction", title: "Beskriv uppgiften", body: "Målgrupp, ton och ord du gillar hjälper dig att välja en riktning i stället för att bara bläddra." },
      { icon: "search", title: "Utforska olika stilar", body: "Välj hur direkt eller fritt namnen ska byggas utan att ändra vad som kontrolleras." },
      { icon: "check", title: "Pröva kandidaterna", body: "Sajda kontrollerar utvalda kandidater via de ändelser du väljer i nästa steg." },
    ],
    steps: [
      { title: "Sätt en riktning", body: "Skriv några ord om erbjudandet, känslan och vad namnet ska hjälpa människor att förstå." },
      { title: "Justera ramen", body: "Välj längd, ord, stil och ändelser i den avancerade sökningen." },
      { title: "Fortsätt med de bästa", body: "Granska bara kandidater med tydlig status och gå vidare till köpväg när det passar." },
    ],
    scopeTitle: "Ett förslag är en start, inte en frisedel.",
    scope: "Sajda kan hjälpa dig att undersöka domänläget och namnens läsbarhet. Varumärkes- och företagsnamnskontroller behöver alltid göras separat innan ett beslut.",
    faqs: [
      { question: "Kommer resultatet att vara ledigt?", answer: "Sökningen visar registrystatus för de kandidater och ändelser du väljer. Statusen kan förändras, så bekräfta alltid hos leverantören före köp." },
      { question: "Kan jag börja med en kort idé?", answer: "Ja. En enkel beskrivning räcker för att öppna en riktning; mer kontext gör det lättare att sortera bort irrelevanta spår." },
    ],
    related: ["find-domain-name", "choose-domain-name", "short-domain-names", "domain-search"],
  },
  "company-generator": {
    id: "company-generator",
    path: "/se/foretagsnamn-generator",
    title: "Företagsnamnsgenerator med domänkontroll | Sajda",
    description: "Beskriv företaget och utforska namnspår som kan kontrolleras mot relevanta domänändelser i Sajda.",
    eyebrow: "Företagsnamn",
    h1: "Ge företaget ett namn som håller när verksamheten växer.",
    lead: "Skriv vad företaget gör, vem det är till för och vilken känsla det ska bära. Sajda hjälper dig att arbeta från namnspår till domänalternativ utan att blanda ihop olika rättigheter.",
    field: {
      label: "Beskriv företaget med några ord",
      placeholder: "Exempel: redovisningsbyrå för kreativa småföretag i Malmö",
      hint: "Texten öppnar en avancerad namnbrief. Den publiceras inte i URL:en och ingen sökning körs automatiskt.",
      action: "Starta ett namnspår",
      required: true,
    },
    preset: { advanced: true, mode: "deep", focus: "advanced" },
    productTitle: "Ett företagsnamn behöver mer än en ledig adress.",
    productLead: "Sajda ger dig namnspår, läsbarhet och domänstatus som underlag. Själva registreringen av företagsnamn och varumärke har egna officiella prövningar.",
    signals: [
      { icon: "direction", title: "Utgå från verksamheten", body: "Beskriv erbjudande, kunder och ambition så att namnet kan bära mer än dagens produkt." },
      { icon: "project", title: "Välj en hållbar riktning", body: "Jämför beskrivande, korta och mer egna namnspår innan du låser dig vid ett ord." },
      { icon: "check", title: "Kontrollera digitalt", body: "Fortsätt med de ändelser som är viktiga för marknaden och kontrollera deras registrystatus." },
    ],
    steps: [
      { title: "Skriv verksamhetens kärna", body: "Tjänst, målgrupp, ort och ton ger sökningen en ram." },
      { title: "Undersök namnspåren", body: "Välj ord och struktur som känns hållbara även om erbjudandet utvecklas." },
      { title: "Gör separata kontroller", body: "En ledig domän är inte ett besked om företagsnamn eller varumärke. Kontrollera dem hos rätt myndighet." },
    ],
    scopeTitle: "Domänstatus är inte en juridisk slutsats.",
    scope: "Sajda visar vilken domänstatus som kan kontrolleras. Företagsnamn, varumärken och andra rättigheter behöver bedömas var för sig med officiella källor.",
    faqs: [
      { question: "Kan jag använda en ledig domän som företagsnamn?", answer: "Inte automatiskt. En domän kan vara ledig samtidigt som ett liknande företagsnamn eller varumärke redan finns." },
      { question: "Måste mitt företagsnamn innehålla branschen?", answer: "Inte nödvändigtvis. Ett beskrivande namn kan vara tydligt från start, medan ett friare namn kan fungera bättre om verksamheten ska breddas." },
    ],
    related: ["domain-generator", "choose-domain-name", "domain-and-trademark", "tld-se"],
  },
  "find-domain-name": {
    id: "find-domain-name",
    path: "/se/hitta-domannamn",
    title: "Hitta domännamn med riktning | Sajda",
    description: "Hitta ett domännamn genom att börja i affären, produkten eller känslan och fortsätt sedan till registrykontroller.",
    eyebrow: "Hitta domännamn",
    h1: "Hitta ett namn med riktning, inte bara variation.",
    lead: "Ett bra domännamn ska vara möjligt att säga, skriva och utveckla vidare. Börja med det som är viktigt i erbjudandet och öppna sökningen när du vill pröva alternativen.",
    field: {
      label: "Vad ska namnet hjälpa människor att förstå?",
      placeholder: "Exempel: en tjänst som gör energidata enkel för kommuner",
      hint: "Sajda tar med din riktning till sökningen. Du väljer sedan namnspår, ändelser och hur brett du vill utforska.",
      action: "Hitta namnspår",
      required: true,
    },
    preset: { mode: "medium", focus: "main" },
    productTitle: "Leta efter ett namn som bär sitt nästa kapitel.",
    productLead: "Sajda är till för den tidiga bedömningen: vad namnet signalerar, hur det kan användas digitalt och vilka alternativ som är värda att kontrollera.",
    signals: [
      { icon: "direction", title: "Börja i användningen", body: "Skriv vad namnet behöver göra för en kund, inte bara vilka ord som råkar finnas i branschen." },
      { icon: "project", title: "Jämför flera spår", body: "Ett kort namn, ett beskrivande namn och ett mer eget namn löser olika uppgifter." },
      { icon: "globe", title: "Pröva ändelserna", body: "Se hur samma idé fungerar i den marknad och det språk där den ska användas." },
    ],
    steps: [
      { title: "Beskriv målet", body: "Skriv vilken förändring, känsla eller funktion som namnet ska bära." },
      { title: "Välj spår", body: "Pröva en sökstil som passar behovet: direkt, lekfull, bred eller mer egen." },
      { title: "Kontrollera nästa steg", body: "När en kandidat känns rätt kan du pröva exakta ändelser i samma arbetsyta." },
    ],
    scopeTitle: "Sajda väljer inte namn åt dig.",
    scope: "Verktyget gör skillnader och underlag tydliga. Den slutliga bedömningen – språk, marknad, rättigheter och köp – är fortfarande din.",
    faqs: [
      { question: "Vad gör ett domännamn lätt att använda?", answer: "Korthet hjälper, men även uttal, stavning, tydlighet och hur väl namnet passar i sammanhanget spelar roll." },
      { question: "Kan jag testa både svenska och internationella idéer?", answer: "Ja. Börja med riktningen och anpassa sedan ordval, ändelser och sökstil efter den marknad du vill nå." },
    ],
    related: ["domain-generator", "choose-domain-name", "short-domain-names", "top-domains"],
  },
  "top-domains": {
    id: "top-domains",
    path: "/se/toppdomaner",
    title: "Domänändelser: hitta rätt toppdomän | Sajda",
    description: "Välj domänändelse utifrån namn, marknad och användning. Pröva relevanta toppdomäner i Sajdas domänsökning.",
    eyebrow: "Domänändelser",
    h1: "Välj en domänändelse som hjälper namnet att göra sitt jobb.",
    lead: "En toppdomän ger sammanhang åt ett namn, men ska inte väljas på vana ensam. Pröva de ändelser som matchar din marknad, produkt och hur namnet ska användas.",
    field: {
      label: "Vilket namn vill du pröva?",
      placeholder: "Exempel: nordform",
      hint: "Sajda öppnar sökningen med flera relevanta ändelser förvalda. Du justerar urvalet innan en kontroll startar.",
      action: "Pröva relevanta ändelser",
      required: true,
    },
    preset: { tlds: ["se", "com", "ai", "app", "dev", "org", "net"], mode: "medium", focus: "main" },
    productTitle: "Börja med sammanhanget, inte med en lista på hundra ändelser.",
    productLead: "Olika toppdomäner hjälper olika projekt. En lokal marknad, en öppen organisation, en produkt eller en utvecklarinriktad tjänst kan behöva olika signaler.",
    signals: [
      { icon: "globe", title: "Marknad först", body: "Utgå från var människor ska hitta, förstå och lita på namnet." },
      { icon: "direction", title: "Användning ger riktning", body: "En produkt, organisation eller teknisk tjänst kan ha olika naturliga ändelser utan att någon är universellt bäst." },
      { icon: "check", title: "Pröva de viktiga", body: "Kontrollera de få ändelser som faktiskt passar innan du låser beslutet." },
    ],
    steps: [
      { title: "Skriv namnet eller sammanhanget", body: "Börja med kandidaten du vill bedöma eller beskriv vad den ska användas till." },
      { title: "Välj ett avgränsat urval", body: "Sajda öppnar med relevanta toppdomäner, men du kan ta bort eller lägga till innan sökning." },
      { title: "Granska varje kontroll för sig", body: "Tillgänglighet, pris och köpväg har olika underlag och ska inte blandas ihop." },
    ],
    scopeTitle: "En ändelse är en del av beslutet, inte hela beslutet.",
    scope: "Sajda kan hjälpa dig pröva ett relevant urval. Namnets tydlighet, varumärkesfrågor, villkor och den slutliga registreringen behöver fortfarande bedömas separat.",
    faqs: [
      { question: "Vilken domänändelse är bäst?", answer: "Den bästa ändelsen beror på målgrupp, språk, marknad och vad projektet ska signalera. Börja med de få alternativ som har en tydlig koppling till hur namnet ska användas." },
      { question: "Måste jag köpa flera ändelser?", answer: "Inte alltid. Det kan vara klokt att pröva flera när de är relevanta, men köpbeslutet ska utgå från verklig användning och förutsättningar – inte bara rädsla för att missa en variant." },
    ],
    related: ["tld-se", "tld-com", "tld-ai", "tld-app", "tld-dev", "tld-org", "tld-net"],
  },
  "guide-hub": {
    id: "guide-hub",
    path: "/se/guide",
    title: "Domänguide: välj, förnya och flytta en domän | Sajda",
    description: "En praktisk domänguide om namn, ändelser, pris, förnyelse, flytt och varumärke – med en direkt väg till Sajdas domänsökning.",
    eyebrow: "Domänguide",
    h1: "En domänguide för beslut före, under och efter registrering.",
    lead: "En domän är både en teknisk adress och en del av hur människor hittar tillbaka till ditt projekt. Börja i den fråga som är aktuell nu och fortsätt med exakt sökning när du är redo.",
    field: {
      label: "Vilken domän vill du undersöka?",
      placeholder: "exempel.se",
      hint: "Skriv en exakt adress för att förbereda en direkt kontroll. Ingen kontroll startar automatiskt på den här sidan.",
      action: "Undersök en domän",
      required: true,
    },
    preset: { mode: "light", focus: "main" },
    productTitle: "Rätt domänfråga vid rätt tillfälle.",
    productLead: "Namnet, ändelsen, priset, flytten och rättigheterna är olika delar av samma beslut. Sajdas guider håller dem åtskilda så att nästa steg blir möjligt att förstå.",
    signals: [
      { icon: "direction", title: "Välj namn med avsikt", body: "Börja i det namn ska göra för människor, inte bara vilka tecken som är lediga." },
      { icon: "globe", title: "Välj ändelse med sammanhang", body: "Marknad, språk och användning hjälper dig välja vilka adresser som är värda att pröva." },
      { icon: "check", title: "Kontrollera det exakta", body: "En registrykontroll gäller en specifik adress vid en specifik tidpunkt och ska läsas skilt från andra frågor." },
    ],
    steps: [
      { title: "Välj frågan", body: "Börja med den del som faktiskt står i vägen: namn, ändelse, kostnad, förnyelse, flytt eller rättighet." },
      { title: "Läs sammanhanget", body: "Använd guiden som beslutsstöd och följ alltid den källa som ansvarar för just registrering, pris eller rättighet." },
      { title: "Pröva adressen", body: "När du har en kandidat öppnar du Sajdas sökning och avgör själv när en kontroll ska starta." },
    ],
    scopeTitle: "En guide ersätter inte den ansvariga källan.",
    scope: "Sajda förklarar beslutet och hjälper dig vidare till en domänkontroll. Leverantörsvillkor, kontouppgifter, lagar och varumärkesbedömningar behöver alltid bekräftas där de hör hemma.",
    faqs: [
      { question: "Kan jag börja med ett namn i stället för en domän?", answer: "Ja. Öppna namnsökningen när du behöver nya riktningar, och gå sedan vidare till exakt domänkontroll för de kandidater som håller." },
      { question: "Vad är viktigast att kontrollera före köp?", answer: "Börja med det exakta namnet och ändelsen. Läs sedan leverantörens aktuella pris, förnyelsevillkor och eventuella krav innan du genomför ett köp." },
    ],
    related: ["choose-domain-name", "top-domains", "domain-cost", "domain-renewal", "move-domain", "domain-and-trademark", "short-domain-names"],
  },
  "tld-ai": createTldPage({
    id: "tld-ai",
    tld: "ai",
    title: "Sök .ai-domän | Sajda",
    description: "Undersök ett .ai-domännamn med en direkt registrykontroll i Sajda och pröva om ändelsen passar ditt projekt.",
    h1: "Sök en .ai-domän med ett tydligt projekt i centrum.",
    lead: ".ai kan vara relevant när ändelsen är en naturlig del av hur produkten eller verksamheten presenteras. Skriv namnet och pröva den exakta adressen i Sajda.",
    productTitle: ".ai fungerar bäst när ändelsen tillför verkligt sammanhang.",
    productLead: "En ändelse kan hjälpa människor att förstå vilket slags projekt de möter. Den ersätter inte ett namn som går att säga, skriva och komma ihåg.",
    fitTitle: "När .ai är en relevant riktning",
    fitBody: "Pröva .ai när ändelsen är tydlig för målgruppen och passar det du faktiskt bygger – inte bara för att den känns aktuell.",
    scope: "Sajda kan undersöka den exakta .ai-adressen via en registryväg. Resultatet är inte en reservering, och du bekräftar alltid tillgänglighet, pris och villkor hos vald domänleverantör.",
    faqs: [
      { question: "När passar .ai?", answer: "När ändelsen hjälper målgruppen att förstå projektet och känns naturlig i namnets verkliga användning. Bedöm också hur den läses, uttalas och fungerar i din marknad." },
      { question: "Kan jag jämföra .ai med andra ändelser?", answer: "Ja. Öppna arbetsytan från toppdomänguiden och pröva .ai tillsammans med de få alternativ som faktiskt är relevanta för projektet." },
    ],
    related: ["top-domains", "tld-app", "tld-dev", "tld-com", "choose-domain-name"],
  }),
  "tld-app": createTldPage({
    id: "tld-app",
    tld: "app",
    title: "Sök .app-domän | Sajda",
    description: "Undersök ett .app-domännamn med en direkt registrykontroll i Sajda och pröva om ändelsen passar din produkt.",
    h1: "Sök en .app-domän för en produkt som ska kännas direkt.",
    lead: ".app kan ge ett tydligt sammanhang för en produkt eller tjänst som används som en app. Skriv namnet och pröva den exakta adressen i Sajda.",
    productTitle: ".app är ett sammanhang för produkten – inte en genväg runt ett bra namn.",
    productLead: "Det kan vara en användbar ändelse när människor redan förstår produkten som en app. Låt ändå namn, målgrupp och tillgänglighet styra beslutet tillsammans.",
    fitTitle: "När .app är en relevant riktning",
    fitBody: "Pröva .app när produkten verkligen är en app eller digital tjänst och ändelsen gör adressen tydligare för de människor du vill nå.",
    scope: "Sajda kan undersöka den exakta .app-adressen via en registryväg. Resultatet är inte en reservering, och du bekräftar alltid tillgänglighet, pris och villkor hos vald domänleverantör.",
    faqs: [
      { question: "Måste en .app-domän användas av en app?", answer: "Nej, men ändelsen blir mest begriplig när den har en tydlig koppling till produkten eller tjänsten. Låt användningen avgöra, inte bara utseendet på adressen." },
      { question: "Kan jag testa .app och .com tillsammans?", answer: "Ja. Välj båda i Sajdas arbetsyta och kontrollera varje adress som en egen möjlighet innan du bestämmer dig." },
    ],
    related: ["top-domains", "tld-ai", "tld-dev", "tld-com", "company-generator"],
  }),
  "tld-dev": createTldPage({
    id: "tld-dev",
    tld: "dev",
    title: "Sök .dev-domän | Sajda",
    description: "Undersök ett .dev-domännamn med en direkt registrykontroll i Sajda och pröva om ändelsen passar ditt utvecklarprojekt.",
    h1: "Sök en .dev-domän för ett projekt som byggs för utveckling.",
    lead: ".dev kan passa produkter, verktyg och projekt där utvecklare är en viktig målgrupp. Skriv namnet och pröva den exakta adressen i Sajda.",
    productTitle: ".dev kan göra målgruppen tydlig direkt i adressen.",
    productLead: "En teknisk ändelse hjälper när den faktiskt matchar projektets användare och sammanhang. Det viktiga är fortfarande om namnet går att förstå och använda varje dag.",
    fitTitle: "När .dev är en relevant riktning",
    fitBody: "Pröva .dev när verktyget, dokumentationen eller produkten tydligt riktar sig till utvecklare eller ett tekniskt arbetsflöde.",
    scope: "Sajda kan undersöka den exakta .dev-adressen via en registryväg. Resultatet är inte en reservering, och du bekräftar alltid tillgänglighet, pris och villkor hos vald domänleverantör.",
    faqs: [
      { question: "När passar .dev?", answer: "När utvecklare, teknisk dokumentation eller en digital byggprocess är central för projektet. För en bred konsumentprodukt kan en annan ändelse vara lättare att läsa i sitt sammanhang." },
      { question: "Kan ett vanligt företag använda .dev?", answer: "Ja, men ändelsen bör hjälpa snarare än förvirra målgruppen. Pröva hur adressen kommer att användas i kommunikation, e-post och produktens egna gränssnitt." },
    ],
    related: ["top-domains", "tld-app", "tld-ai", "tld-com", "domain-generator"],
  }),
  "tld-org": createTldPage({
    id: "tld-org",
    tld: "org",
    title: "Sök .org-domän | Sajda",
    description: "Undersök ett .org-domännamn med en direkt registrykontroll i Sajda och pröva om ändelsen passar en organisation eller ett initiativ.",
    h1: "Sök en .org-domän för ett initiativ med ett tydligt syfte.",
    lead: ".org kan vara en relevant riktning för organisationer, gemenskaper och initiativ. Skriv namnet och pröva den exakta adressen i Sajda.",
    productTitle: ".org kan rama in ett syfte – när det stämmer med verkligheten.",
    productLead: "Ändelsen kan ge rätt kontext för en organisation eller gemenskap. Låt den faktiska verksamheten och mottagarens förväntning styra, inte en etikett ensam.",
    fitTitle: "När .org är en relevant riktning",
    fitBody: "Pröva .org när namnet ska bära en organisation, förening, gemenskap eller ett initiativ där syftet är centralt för mottagaren.",
    scope: "Sajda kan undersöka den exakta .org-adressen via en registryväg. Resultatet är inte en reservering, och du bekräftar alltid tillgänglighet, pris och villkor hos vald domänleverantör.",
    faqs: [
      { question: "När passar .org?", answer: "När adressen ska representera en organisation, gemenskap eller ett initiativ där det sammanhanget är tydligt för målgruppen. Bedöm alltid om signalen motsvarar verksamheten." },
      { question: "Är .org bara för föreningar?", answer: "Inte nödvändigtvis, men den är ofta lättast att förstå när syfte, organisation eller gemenskap står i centrum. Pröva också .se eller .com om de bättre beskriver användningen." },
    ],
    related: ["top-domains", "tld-se", "tld-com", "company-generator", "domain-and-trademark"],
  }),
  "tld-net": createTldPage({
    id: "tld-net",
    tld: "net",
    title: "Sök .net-domän | Sajda",
    description: "Undersök ett .net-domännamn med en direkt registrykontroll i Sajda och pröva om ändelsen passar ditt nätverk eller projekt.",
    h1: "Sök en .net-domän när sammanhanget är ett nätverk eller en teknisk tjänst.",
    lead: ".net kan vara relevant för nätverk, infrastruktur eller tekniska tjänster när ändelsen tillför tydlighet. Skriv namnet och pröva den exakta adressen i Sajda.",
    productTitle: ".net är starkast när den beskriver en verklig koppling.",
    productLead: "En etablerad ändelse är inte automatiskt rätt alternativ. Den blir användbar när människor kan läsa en tydlig koppling mellan namnet, tjänsten och adressen.",
    fitTitle: "När .net är en relevant riktning",
    fitBody: "Pröva .net när nätverk, infrastruktur eller en teknisk tjänst är en verklig del av hur projektet ska förstås och användas.",
    scope: "Sajda kan undersöka den exakta .net-adressen via en registryväg. Resultatet är inte en reservering, och du bekräftar alltid tillgänglighet, pris och villkor hos vald domänleverantör.",
    faqs: [
      { question: "När passar .net?", answer: "När namnet används för ett nätverk, en infrastrukturtjänst eller en teknisk produkt där ändelsen förtydligar syftet. I andra fall kan .com eller en lokal ändelse vara mer direkt." },
      { question: "Kan jag jämföra .net med andra ändelser?", answer: "Ja. Välj de få alternativ som passar projektet i Sajdas arbetsyta och bedöm dem utifrån användning, tydlighet och den faktiska kontrollen." },
    ],
    related: ["top-domains", "tld-dev", "tld-com", "tld-org", "domain-search"],
  }),
  "tld-se": {
    id: "tld-se",
    path: "/se/toppdomaner/se",
    title: "Sök .se-domän | Sajda",
    description: "Undersök ett .se-domännamn med svensk marknad i åtanke och se den status som Sajda säkert kan visa.",
    eyebrow: ".se-domän",
    h1: "Sök en .se-domän med svensk marknad i åtanke.",
    lead: ".se är ofta ett naturligt val när verksamheten, kunderna eller förtroendet i första hand är svenskt. Skriv namnet och pröva adressen i Sajda; om en säker offentlig verifiering saknas visas statusen som okänd.",
    field: {
      label: "Vilket .se-namn vill du kontrollera?",
      placeholder: "nordform",
      hint: "Skriv bara namnet eller hela adressen. Sajda lägger till .se när det saknas och kör inget automatiskt. En offentlig verifiering kan ibland behöva bekräftas hos leverantören.",
      action: "Undersök .se-domän",
      required: true,
      appendTld: "se",
    },
    preset: { tlds: ["se"], mode: "light", focus: "main" },
    productTitle: ".se är en adress – inte hela namnbeslutet.",
    productLead: "En .se-domän kan vara ett bra digitalt hem för en svensk verksamhet. Sajda hjälper dig kontrollera adressen och hålla den kontrollen skild från andra namnfrågor.",
    signals: [
      { icon: "search", title: "Fokuserad kontroll", body: "Du går direkt till .se i stället för att få en osorterad lista av ändelser." },
      { icon: "check", title: "Tydlig status", body: "Sajda visar vad registryvägen kan bekräfta och märker osäkerhet i stället för att fylla den med antaganden." },
      { icon: "project", title: "Fortsätt om namnet saknas", body: "Om adressen är upptagen kan du gå tillbaka till ett namnspår och hitta närliggande alternativ." },
    ],
    steps: [
      { title: "Skriv namnet", body: "Sajda fyller i .se om du inte redan har skrivit ändelsen." },
      { title: "Läs statusen rätt", body: "Sökningen visar tillgänglig, upptagen eller okänd status efter det faktiska svaret. Okänd är ett ärligt osäkerhetsbesked, inte ett nej." },
      { title: "Välj en köpväg", body: "Bekräfta alltid tillgänglighet och slutligt pris hos den domänleverantör du väljer." },
    ],
    scopeTitle: "En ledig .se-domän är inte en reservering.",
    scope: "Sajda kan inte hålla en domän åt dig. Tillgängligheten kan ändras mellan kontroll och köp, och en domänkontroll ersätter inte företagsnamns- eller varumärkesgranskning.",
    faqs: [
      { question: "När passar .se?", answer: "Ofta när verksamheten främst riktar sig till Sverige. Det är ändå värt att väga in framtida marknader, språk och hur namnet används utanför webbplatsen." },
      { question: "Kan jag jämföra .se och .com?", answer: "Ja. Öppna vägledningen för .se eller .com och fortsätt därifrån med båda ändelserna förvalda i arbetsytan." },
    ],
    related: ["tld-com", "se-or-com", "domain-cost", "domain-renewal"],
  },
  "tld-com": {
    id: "tld-com",
    path: "/se/toppdomaner/com",
    title: "Sök .com-domän | Sajda",
    description: "Kontrollera ett .com-domännamn i Sajda och fortsätt till en tydlig registrystatus och köpväg.",
    eyebrow: ".com-domän",
    h1: "Sök en .com-domän för ett namn som ska röra sig längre.",
    lead: ".com är en etablerad global ändelse, men den är inte alltid rätt för varje verksamhet. Skriv namnet och pröva det i en direkt .com-kontroll.",
    field: {
      label: "Vilket .com-namn vill du kontrollera?",
      placeholder: "nordform",
      hint: "Skriv bara namnet eller hela adressen. Sajda lägger till .com när det saknas och startar ingen kontroll automatiskt.",
      action: "Kontrollera .com-domän",
      required: true,
      appendTld: "com",
    },
    preset: { tlds: ["com"], mode: "light", focus: "main" },
    productTitle: "Global räckvidd börjar med en tydlig kontroll.",
    productLead: "En .com-domän kan passa när namnet ska fungera över gränser. Sajda gör det enklare att pröva adressen och väga den mot andra relevanta ändelser.",
    signals: [
      { icon: "globe", title: "Global standard", body: "Pröva samma namn i en ändelse som många människor redan känner igen." },
      { icon: "check", title: "Registrystatus i fokus", body: "Sökningen särskiljer ett registrybesked från pris och leverantörens egen kassa." },
      { icon: "direction", title: "Jämför med avsikt", body: "Om .com inte passar eller är upptagen kan du fortsätta med .se eller nya namnspår." },
    ],
    steps: [
      { title: "Skriv namnet", body: "Sajda fyller i .com om du inte redan har gjort det." },
      { title: "Kontrollera status", body: "Sökningen redovisar det faktiska resultatet från vald registryväg." },
      { title: "Väg in sammanhanget", body: "Tänk på marknad, språk och alternativ innan du väljer var du ska köpa." },
    ],
    scopeTitle: "En ändelse gör inte namnet internationellt av sig själv.",
    scope: "Uttal, stavning, marknad och lokala rättigheter avgör också om ett namn fungerar. Sajda hjälper dig kontrollera domänen, inte att lova hur marknaden kommer uppfatta den.",
    faqs: [
      { question: "När passar .com?", answer: "Ofta när du vill nå flera marknader eller använda ett namn som ska kännas bekant internationellt. Det beror fortfarande på målgrupp och var verksamheten byggs." },
      { question: "Måste jag ha både .se och .com?", answer: "Inte alltid. Sökningen kan hjälpa dig pröva båda och sedan välja en väg som passar din verkliga användning." },
    ],
    related: ["tld-se", "se-or-com", "domain-cost", "move-domain"],
  },
  "se-or-com": {
    id: "se-or-com",
    path: "/se/guide/se-eller-com",
    title: ".se eller .com? Pröva båda domänändelserna | Sajda",
    description: "Väg .se mot .com utifrån verksamhet och marknad, och fortsätt med båda ändelserna förvalda i Sajdas domänsökning.",
    eyebrow: "Välj domänändelse",
    h1: ".se eller .com? Börja i var namnet ska fungera.",
    lead: "Det finns ingen universell vinnare. .se kan vara naturligt för en svensk kärnmarknad, medan .com kan vara relevant för ett mer internationellt namn. Pröva båda innan du bestämmer dig.",
    field: {
      label: "Beskriv verksamheten eller skriv ett namn",
      placeholder: "Exempel: en svensk SaaS-tjänst med internationell ambition",
      hint: ".se och .com väljs i arbetsytan. Du kan ändra urvalet innan du startar en kontroll.",
      action: "Jämför .se och .com",
      required: true,
    },
    preset: { tlds: ["se", "com"], mode: "medium", focus: "main" },
    productTitle: "Jämför ändelser med rätt fråga i centrum.",
    productLead: "Det viktiga är inte bara vilken adress som är ledig. Fråga var kunderna finns, hur namnet uttalas och vilken flexibilitet verksamheten behöver framåt.",
    signals: [
      { icon: "globe", title: "Marknad och språk", body: "Utgå från var de första kunderna finns – och var namnet behöver fungera senare." },
      { icon: "compare", title: "Pröva båda vägarna", body: "Arbetsytan kan börja med .se och .com valda, så att du inte jämför på känsla ensam." },
      { icon: "check", title: "Kontrollera innan du låser", body: "Tillgängligheten är en av flera faktorer; varje status visas med sin egen grund." },
    ],
    steps: [
      { title: "Skriv sammanhanget", body: "Beskriv verksamheten eller ange det namn du vill pröva." },
      { title: "Se över urvalet", body: "Sajda öppnar sökningen med .se och .com markerade, men du kan ändra innan kontroll." },
      { title: "Välj med helheten", body: "Väg domänstatus tillsammans med varumärke, språk, prisvillkor och framtida marknad." },
    ],
    scopeTitle: "Två ändelser löser inte samma uppgift.",
    scope: "Sajda kan hjälpa dig pröva tillgänglighet och se anslutna köpvägar. Vilken ändelse som är rätt beror på din verksamhet och ersätter inte en egen juridisk eller varumärkesmässig bedömning.",
    faqs: [
      { question: "Är .se bättre för svenska företag?", answer: "Den kan vara mer direkt för en tydligt svensk målgrupp, men det finns inget automatiskt rätt svar. Bedöm marknad, språk och framtidsplan tillsammans." },
      { question: "Kan jag söka på båda samtidigt?", answer: "Ja. Knappen ovan öppnar arbetsytan med .se och .com förvalda, där du kan justera innan du startar sökningen." },
    ],
    related: ["tld-se", "tld-com", "choose-domain-name", "domain-cost"],
  },
  "domain-cost": {
    id: "domain-cost",
    path: "/se/guide/vad-kostar-en-doman",
    title: "Vad kostar en domän? Förstå priset före köp | Sajda",
    description: "Förstå vad som påverkar en domäns kostnad och fortsätt till Sajdas domänsökning för att kontrollera ett exakt namn.",
    eyebrow: "Domänens kostnad",
    h1: "Vad kostar en domän? Titta längre än första årets pris.",
    lead: "Kostnaden beror på ändelse, leverantör och villkor. Ett kampanjpris kan vara relevant, men förnyelsen och vad som faktiskt ingår är ofta lika viktigt att förstå.",
    field: {
      label: "Vilken domän vill du undersöka?",
      placeholder: "exempel.se",
      hint: "Skriv en exakt domän för att gå vidare till Sajdas kontroll. Pris visas bara när ett aktuellt underlag finns anslutet.",
      action: "Kontrollera domänen",
      required: true,
    },
    preset: { mode: "light", focus: "main" },
    productTitle: "Ett domänpris är mer än en siffra vid kassan.",
    productLead: "Jämför alltid samma sak med samma sak: rätt ändelse, samma tidsperiod och villkor som gäller när den första perioden är slut.",
    signals: [
      { icon: "compare", title: "Börja med hela perioden", body: "Första årets pris och förnyelsepriset kan skilja sig. Läs båda innan du väljer en köpväg." },
      { icon: "search", title: "Kontrollera det exakta namnet", body: "En prisuppgift är inte användbar om namnet inte kan kontrolleras eller om villkoren gäller en annan ändelse." },
      { icon: "check", title: "Bekräfta hos leverantören", body: "Den slutliga kassan, valutan, momsvisningen och villkoren kommer från den leverantör du väljer." },
    ],
    steps: [
      { title: "Bestäm vilken adress du menar", body: "Samma ord under .se och .com är olika domäner med olika villkor." },
      { title: "Läs både start och förnyelse", body: "Notera prisets period, eventuella kampanjvillkor och om priset uppges med eller utan moms." },
      { title: "Kontrollera nära köpet", body: "När du har valt väg gör du den slutliga kontrollen direkt hos leverantören." },
    ],
    scopeTitle: "Sajda fyller inte i ett pris när underlaget saknas.",
    scope: "Sajda visar prisuppgift med källa och tidpunkt när det finns aktuellt anslutet underlag. Om det saknas får du en tydlig köpväg i stället för en påhittad jämförelse.",
    faqs: [
      { question: "Är den billigaste domänen alltid bäst?", answer: "Inte nödvändigtvis. Kontrollera förnyelse, villkor, support och om leverantören passar hur du faktiskt ska använda domänen." },
      { question: "Kan Sajda lova slutpriset?", answer: "Nej. Priser och villkor kan ändras. Bekräfta alltid totalsumman och vad som ingår i leverantörens egen kassa." },
    ],
    related: ["domain-renewal", "domain-search", "tld-se", "tld-com"],
  },
  "domain-renewal": {
    id: "domain-renewal",
    path: "/se/guide/domanfornyelse",
    title: "Domänförnyelse: så planerar du nästa period | Sajda",
    description: "Förstå vad domänförnyelse innebär, vad du behöver kontrollera och hur du börjar med en exakt domän i Sajda.",
    eyebrow: "Domänförnyelse",
    h1: "Domänförnyelse är ett beslut som förtjänar en kontroll i tid.",
    lead: "En domän fortsätter normalt bara att fungera när den förnyas enligt den valda leverantörens villkor. Se över datum, kontaktuppgifter och pris innan du hamnar nära ett avbrott.",
    field: {
      label: "Vilken domän vill du kontrollera?",
      placeholder: "exempel.com",
      hint: "Sajda kontrollerar domänstatus, inte ditt kundavtal. Förnyelsevillkor och datum bekräftas hos din nuvarande leverantör.",
      action: "Kontrollera domänen",
      required: true,
    },
    preset: { mode: "light", focus: "main" },
    productTitle: "Håll isär status, avtalsdatum och beslut.",
    productLead: "En registrykontroll berättar inte vad ditt konto kostar eller när din faktura förfaller. Börja med överblicken och gå sedan till den leverantör som hanterar domänen.",
    signals: [
      { icon: "check", title: "Kontrollera i god tid", body: "Vänta inte tills en adress riskerar att sluta fungera. Leverantörens datum och påminnelser är styrande." },
      { icon: "compare", title: "Läs nästa periods villkor", body: "Se särskilt över priset efter en eventuell introduktionsperiod och vilka tjänster som faktiskt ingår." },
      { icon: "project", title: "Håll ägarskapet ordnat", body: "Rätt kontaktuppgifter och åtkomst till kontot är minst lika viktigt som att själva domänen finns kvar." },
    ],
    steps: [
      { title: "Logga in hos nuvarande leverantör", body: "Där ser du förnyelsedatum, förnyelsepris och eventuella inställningar som är kopplade till just din domän." },
      { title: "Kontrollera kontaktvägarna", body: "Säkerställ att ägare, e-post och betalningsuppgifter är aktuella för organisationen som ska ha kontrollen." },
      { title: "Agera före tidsfristen", body: "Om du vill förnya eller flytta, gör det i god tid och följ leverantörens specifika process." },
    ],
    scopeTitle: "Sajda ser inte ditt kundkonto.",
    scope: "Sajda kan hjälpa dig att undersöka en domän. Förnyelsedatum, avtal, pris och återställningsregler kommer från den registrator eller leverantör som håller din registrering.",
    faqs: [
      { question: "Förnyas en domän automatiskt?", answer: "Det beror på inställningarna och villkoren hos din leverantör. Kontrollera dem i ditt konto i stället för att anta att automatisk förnyelse är aktiv." },
      { question: "Kan jag vänta tills domänen löper ut?", answer: "Det är riskabelt. Processer efter utgång kan skilja sig mellan ändelser och leverantörer, och domänen kan bli svårare eller dyrare att återställa." },
    ],
    related: ["domain-cost", "move-domain", "domain-search", "tld-se"],
  },
  "choose-domain-name": {
    id: "choose-domain-name",
    path: "/se/guide/valja-domannamn",
    title: "Välja domännamn: en tydlig metod | Sajda",
    description: "Välj domännamn med fokus på tydlighet, uttal och användning. Börja ett namnspår i Sajdas sökverktyg.",
    eyebrow: "Välja domännamn",
    h1: "Välj ett domännamn som människor kan hitta tillbaka till.",
    lead: "Ett bra namn behöver inte säga allt. Det behöver vara tydligt i sin situation, gå att skriva och fungera när människor ser eller hör det för första gången.",
    field: {
      label: "Vad behöver namnet hjälpa till med?",
      placeholder: "Exempel: ett nordiskt verktyg för enkel projektplanering",
      hint: "Beskriv riktningen och fortsätt till den avancerade sökningen. Du väljer själv när en kontroll startar.",
      action: "Starta ett namnspår",
      required: true,
    },
    preset: { advanced: true, mode: "deep", focus: "advanced" },
    productTitle: "Bra namn väljs i en följd av små, tydliga tester.",
    productLead: "Sajda gör det lättare att gå från idé till kandidater som är värda en verklig domänkontroll – utan att låtsas att en generator kan göra slutvalet åt dig.",
    signals: [
      { icon: "direction", title: "Börja i användningen", body: "Tänk på vem som ska säga, skriva och rekommendera namnet snarare än på en enskild trend." },
      { icon: "project", title: "Jämför riktningar", body: "Beskrivande, korta och friare namnspår gör olika jobb. Se dem bredvid varandra innan du väljer." },
      { icon: "check", title: "Pröva de bästa", body: "När ett namn håller i språket och sammanhanget kan du kontrollera dess relevanta domänändelser." },
    ],
    steps: [
      { title: "Sätt ett fåtal kriterier", body: "Marknad, ton, språk och hur brett verksamheten kan bli ger en bättre riktning än en lång önskelista." },
      { title: "Säg och skriv kandidaterna", body: "Om ett namn blir oklart när det uttalas eller stavas är det en signal att pröva ett annat spår." },
      { title: "Kontrollera separat", body: "Domänstatus, företagsnamn och varumärke är olika frågor. Låt varje kontroll göra sitt jobb." },
    ],
    scopeTitle: "Ett ledigt namn är inte automatiskt ett starkt namn.",
    scope: "Sajda kan ge struktur åt namnarbetet och kontrollera domänalternativ. Bedömningen av marknad, rättigheter och långsiktig passform behöver fortfarande göras med ditt verkliga sammanhang i åtanke.",
    faqs: [
      { question: "Ska ett domännamn vara kort?", answer: "Korthet hjälper ofta, men ett förkortat namn som är svårt att säga eller stava kan vara sämre än ett något längre namn som är tydligt." },
      { question: "Ska domänen innehålla min bransch?", answer: "Det beror på om tydlighet i dag är viktigare än flexibilitet i morgon. Pröva både ett beskrivande och ett friare spår innan du låser valet." },
    ],
    related: ["short-domain-names", "domain-generator", "company-generator", "domain-and-trademark"],
  },
  "move-domain": {
    id: "move-domain",
    path: "/se/guide/flytta-doman",
    title: "Flytta domän: vad du behöver kontrollera först | Sajda",
    description: "Förstå grunderna när du ska flytta en domän mellan leverantörer och kontrollera den exakta domänen i Sajda.",
    eyebrow: "Flytta domän",
    h1: "Flytta en domän med kontroll över namn, åtkomst och tidpunkt.",
    lead: "En domänflytt hanteras av din nuvarande och nya leverantör. Börja med att förstå vilken domän det gäller, vem som har åtkomst och vilka regler som gäller för just ändelsen.",
    field: {
      label: "Vilken domän gäller flytten?",
      placeholder: "exempel.se",
      hint: "Sajda kan kontrollera domänstatus. Själva flytten startas och godkänns hos de leverantörer som hanterar registreringen.",
      action: "Kontrollera domänen",
      required: true,
    },
    preset: { mode: "light", focus: "main" },
    productTitle: "En flytt är en administrativ process, inte en ny domänsökning.",
    productLead: "Sajda kan vara en tydlig startpunkt för den exakta adressen. Sedan behöver du följa flyttinstruktionerna hos registratorerna och säkra att relevanta inställningar följer med.",
    signals: [
      { icon: "search", title: "Bekräfta rätt domän", body: "Börja alltid med hela adressen och rätt ändelse så att processen gäller rätt registrering." },
      { icon: "project", title: "Kartlägg beroenden", body: "DNS, e-post och webbplats kan vara kopplade till den nuvarande leverantören även om själva domänen flyttas." },
      { icon: "check", title: "Följ båda parternas krav", body: "Auktoriseringskod, låsning och tidsregler bestäms av ändelsen och de leverantörer du använder." },
    ],
    steps: [
      { title: "Säkra åtkomst", body: "Kontrollera vem som äger kontot och att rätt personer kan läsa e-post och godkänna ändringar." },
      { title: "Läs instruktionerna hos båda leverantörer", body: "Flyttprocessen, avgifter och möjliga begränsningar varierar mellan leverantörer och domänändelser." },
      { title: "Planera teknikskiftet", body: "Dokumentera DNS och andra inställningar innan du ändrar något, särskilt om e-post eller en aktiv webbplats är viktig." },
    ],
    scopeTitle: "Sajda flyttar inte en domän åt dig.",
    scope: "Sajda är inte registrator och har inte åtkomst till din domän eller dina DNS-inställningar. Flytten sker i de konton och enligt de villkor som berörda leverantörer anger.",
    faqs: [
      { question: "Kan jag flytta en domän direkt efter köp?", answer: "Det beror på ändelsen, leverantörens villkor och domänens status. Läs de aktuella flyttreglerna innan du påbörjar processen." },
      { question: "Flyttas min webbplats automatiskt?", answer: "Inte nödvändigtvis. En domän, DNS, e-post och webbhotell kan vara separata delar. Kontrollera vad som är kopplat innan du genomför flytten." },
    ],
    related: ["domain-renewal", "domain-cost", "domain-search", "tld-com"],
  },
  "domain-and-trademark": {
    id: "domain-and-trademark",
    path: "/se/guide/doman-och-varumarke",
    title: "Domän och varumärke: två olika kontroller | Sajda",
    description: "Förstå skillnaden mellan domän, företagsnamn och varumärke innan du går vidare med ett namn i Sajda.",
    eyebrow: "Domän och varumärke",
    h1: "En ledig domän är inte ett besked om varumärket.",
    lead: "Domänregistrering, företagsnamn och varumärkesrätt är olika frågor. Börja gärna med ett namnspår och en domänkontroll, men låt alltid rätt källa pröva respektive fråga.",
    field: {
      label: "Vilket namn eller vilken domän vill du undersöka?",
      placeholder: "Exempel: nordform eller nordform.se",
      hint: "Sajda hjälper dig att förbereda en domänsökning. Den ersätter inte en officiell kontroll av företagsnamn eller varumärke.",
      action: "Undersök domänspåret",
      required: true,
    },
    preset: { advanced: true, mode: "medium", focus: "advanced" },
    productTitle: "Låt varje namnfråga få sin egen kontroll.",
    productLead: "Det gör beslutet tydligare. En domänsökning visar inte om ett namn kan registreras som bolag eller användas som varumärke, och en företagsnamnskontroll berättar inte om adressen är ledig.",
    signals: [
      { icon: "search", title: "Domän", body: "Kontrollerar den tekniska adressens status för en specifik ändelse när relevant registryväg finns." },
      { icon: "project", title: "Företagsnamn", body: "Bedöms i en egen process som kan bero på exempelvis verksamhet, likhet och sammanhang." },
      { icon: "check", title: "Varumärke", body: "Behöver granskas separat i rätt register och med rätt geografiskt och kommersiellt sammanhang." },
    ],
    steps: [
      { title: "Pröva namnspåret", body: "Undersök hur namnet låter, stavas och fungerar för den marknad du vill nå." },
      { title: "Kontrollera domänen", body: "Låt Sajda visa den domänstatus som går att kontrollera för relevanta ändelser." },
      { title: "Gör officiella kontroller", body: "Innan lansering kontrollerar du företagsnamn och varumärken i rätt myndighets- och registerkällor." },
    ],
    scopeTitle: "Domänstatus är bara en del av namnbeslutet.",
    scope: "Sajda ger inte juridisk rådgivning eller ett besked om rätten att använda ett namn. Använd domänkontrollen som ett underlag och gör sedan relevanta officiella kontroller före köp eller lansering.",
    faqs: [
      { question: "Kan jag använda en ledig domän som varumärke?", answer: "Inte automatiskt. En ledig domän säger bara något om den adressen vid kontrolltillfället, inte om tidigare rättigheter eller registrerbarhet." },
      { question: "Räcker det att kontrollera företagsnamnet?", answer: "Nej. Företagsnamn, varumärken, domäner och sociala konton kan behöva bedömas separat beroende på hur namnet ska användas." },
    ],
    related: ["company-generator", "choose-domain-name", "domain-search", "tld-se"],
  },
  "short-domain-names": {
    id: "short-domain-names",
    path: "/se/guide/korta-domannamn",
    title: "Korta domännamn: hitta en tydlig riktning | Sajda",
    description: "Utforska korta domännamn med fokus på uttal, stavning och användning. Fortsätt till Sajdas namnsökning.",
    eyebrow: "Korta domännamn",
    h1: "Korta domännamn är starka när de fortfarande går att förstå.",
    lead: "Ett kort namn kan vara lätt att minnas, men inte om det blir svårt att uttala eller förklara. Börja med den betydelse och känsla namnet ska bära, inte bara antalet tecken.",
    field: {
      label: "Vad ska det korta namnet handla om?",
      placeholder: "Exempel: en enkel app för att planera återkommande arbete",
      hint: "Din riktning följer med till namnsökningen. Du kan sedan välja stil, ändelser och vilka kandidater som ska kontrolleras.",
      action: "Utforska korta namn",
      required: true,
    },
    preset: { advanced: true, mode: "heavy", focus: "advanced" },
    productTitle: "Korta namn behöver hårdare urval, inte mindre eftertanke.",
    productLead: "Sajda hjälper dig utforska en koncentrerad namnriktning och pröva kandidaterna vidare. Korthet är ett kriterium bland flera – tydlighet och användning avgör om namnet håller.",
    signals: [
      { icon: "direction", title: "Behåll en tydlig kärna", body: "Ett kort namn behöver fortfarande ha en idé, ett ljud eller en koppling som går att bära vidare." },
      { icon: "project", title: "Testa uttal och stavning", body: "Läs namnet högt och låt någon annan skriva det efter att ha hört det en gång." },
      { icon: "check", title: "Kontrollera först när det håller", body: "När ett namn fungerar språkligt kan du kontrollera de domänändelser som är relevanta." },
    ],
    steps: [
      { title: "Sätt en betydelseriktning", body: "Beskriv funktion, ton eller målgrupp även om målet är ett kort namn." },
      { title: "Sortera bort det otydliga", body: "Undvik kandidater som kräver en ständig förklaring för att bli rätt stavade eller uttalade." },
      { title: "Pröva digitalt", body: "Kontrollera de mest lovande kandidaterna mot valda ändelser i Sajdas arbetsyta." },
    ],
    scopeTitle: "Kortast är inte alltid tydligast.",
    scope: "Sajda kan hjälpa dig att utforska och kontrollera domännamn. Namnets språkliga, juridiska och kommersiella lämplighet behöver bedömas i sitt sammanhang före lansering.",
    faqs: [
      { question: "Hur kort bör ett domännamn vara?", answer: "Det finns ingen perfekt längd. Ett lite längre namn som går att läsa och minnas kan vara bättre än en mycket kort förkortning som blir oklar." },
      { question: "Är korta domäner alltid svåra att få tag på?", answer: "De kan vara mer efterfrågade, särskilt i populära ändelser. Därför är det klokt att ha flera tydliga kandidater och kontrollera dem tidigt." },
    ],
    related: ["choose-domain-name", "domain-generator", "find-domain-name", "tld-com"],
  },
};

export function getSeoProductPage(id: SeoProductPageId): SeoProductPage {
  return seoProductPages[id];
}
