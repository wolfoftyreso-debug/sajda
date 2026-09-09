import type { PlanId } from "../../shared/plans";

type PlanCopy = {
  name: string;
  audience: string;
  description: string;
  points: string[];
};

export type PricingCopy = {
  back: string;
  eyebrow: string;
  title: string;
  lead: string;
  noticeTitle: string;
  notice: string;
  contents: string;
  trySearch: string;
  unavailable: string;
  exploreTrading: string;
  currentTitle: string;
  current: string;
  monitoringTitle: string;
  monitoring: string;
  terms: string;
  risk: string;
  plans: Record<PlanId, PlanCopy>;
};

const sv: PricingCopy = {
  back: "Tillbaka till sökningen",
  eyebrow: "Sajdas konton",
  title: "Från första idén till professionell domänanalys.",
  lead: "Prova gratis. Bas passar ett mindre projekt, Premium återkommande sökningar och Trading den som arbetar professionellt med domäner.",
  noticeTitle: "Priserna är satta. Betalda abonnemang är inte öppna ännu.",
  notice: "Här ser du nivåernas inriktning inför abonnemangsstart. Att skapa ett konto aktiverar inte en betalnivå, och ingen betalning tas emot här.",
  contents: "Inriktning",
  trySearch: "Prova sökningen",
  unavailable: "Inte öppet för köp ännu",
  exploreTrading: "Utforska Trading",
  currentTitle: "Tillgängligt idag",
  current: "Prova domänsökningen, se registerstatus och jämför de prisuppgifter vi kan verifiera. Med verifierad inloggning kan du spara domäner redan nu, utan abonnemang.",
  monitoringTitle: "Bevakning byggs ut",
  monitoring: "Bas är tänkt för enkel bevakning, Premium för mer avancerad bevakning och Trading för prioriterad uppföljning av domänkandidater. Automatiska kontroller och aviseringar är inte aktiva idag. Sparade domäner är sparade ögonblicksbilder, inte löpande bevakningar.",
  terms: "Alla priser är i USD per månad. Före ett framtida köp ska användningsgränser, villkor, eventuell skatt och slutbelopp visas tydligt. Domänköp hos leverantörer ingår inte i abonnemangspriset.",
  risk: "Trading ger analysunderlag, inte en garanti för värde, tillgänglighet eller avkastning. Köp och slutlig kontroll görs hos vald domänleverantör.",
  plans: {
    free: { name: "Gratis", audience: "För att komma igång", description: "Testa en idé och förstå vad Sajda kan hjälpa dig med.", points: ["Prova domänsökningen", "Se registerstatus", "Jämför tillgängliga prisunderlag"] },
    basic: { name: "Bas", audience: "För ditt nästa projekt", description: "För dig som letar efter en domän då och då och vill hålla ordning på kandidaterna.", points: ["Spara och jämför domäner", "Arbeta med ett mindre projekt", "Begränsad swajpning"] },
    premium: { name: "Premium", audience: "För återkommande sökningar", description: "För dig som utvecklar fler idéer och behöver mer utrymme att söka och jämföra.", points: ["Högre sök- och projektgränser", "Mer swajpning", "Fördjupad granskning av kandidater"] },
    trading: { name: "Trading", audience: "För domänspecialister", description: "En separat arbetsyta för att undersöka Lost Domains och fatta mer underbyggda beslut.", points: ["Lost Domains-arbetsyta", "Källor och kontrollhistorik", "Riskbedömda kandidater för egen granskning"] },
  },
};

const en: PricingCopy = {
  back: "Back to search",
  eyebrow: "Sajda plans",
  title: "From your first idea to professional domain research.",
  lead: "Try it free. Basic suits a smaller project, Premium supports regular searches, and Trading is for domain professionals.",
  noticeTitle: "Prices are set. Paid subscriptions are not open yet.",
  notice: "These are the intended plan levels before subscriptions launch. Creating an account does not activate a paid plan, and no payment is collected here.",
  contents: "Focus",
  trySearch: "Try search",
  unavailable: "Not available to buy yet",
  exploreTrading: "Explore Trading",
  currentTitle: "Available today",
  current: "Try domain search, see registry status and compare the price information we can verify. With a verified login, you can already save domains without a subscription.",
  monitoringTitle: "Monitoring is being developed",
  monitoring: "Basic is intended for simple monitoring, Premium for more advanced monitoring, and Trading for prioritised follow-up of domain candidates. Automatic checks and alerts are not active today. Saved domains are snapshots, not ongoing monitoring.",
  terms: "All prices are in USD per month. Usage limits, terms, any applicable tax and the final total must be shown clearly before a future purchase. Domain purchases from providers are not included in the subscription price.",
  risk: "Trading provides research, not a guarantee of value, availability or returns. Purchases and final checks take place with your chosen domain provider.",
  plans: {
    free: { name: "Free", audience: "To get started", description: "Try an idea and discover how Sajda can help.", points: ["Try domain search", "See registry status", "Compare available price evidence"] },
    basic: { name: "Basic", audience: "For your next project", description: "For occasional domain searches when you want to keep your candidates organised.", points: ["Save and compare domains", "Work on a smaller project", "Limited swiping"] },
    premium: { name: "Premium", audience: "For regular searches", description: "For developing more ideas with more room to search and compare.", points: ["Higher search and project limits", "More swiping", "Deeper candidate review"] },
    trading: { name: "Trading", audience: "For domain specialists", description: "A dedicated workspace to investigate Lost Domains and make better-informed decisions.", points: ["Lost Domains workspace", "Sources and check history", "Risk-assessed candidates for your review"] },
  },
};

export function getPricingCopy(language: string): PricingCopy {
  return language === "sv" ? sv : en;
}
