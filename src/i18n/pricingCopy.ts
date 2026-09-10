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
  openTrading: string;
  currentLevel: string;
  included: string;
  account: string;
  signIn: string;
  checkingAccess: string;
  unknownAccess: string;
  assignedAccess: string;
  hierarchy: string;
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
  eyebrow: "Ett Sajda-konto. Fyra åtkomstnivåer.",
  title: "Från första idén till professionell domänanalys.",
  lead: "Prova gratis och använd samma inloggning hela vägen. Bas passar ett mindre projekt, Premium återkommande sökningar och Trading den som arbetar professionellt med domäner.",
  noticeTitle: "Priserna är satta. Betalda abonnemang är inte öppna ännu.",
  notice: "Här ser du nivåernas inriktning inför abonnemangsstart. Att skapa ett konto aktiverar inte en betalnivå, och ingen betalning tas emot här. Tilldelad teståtkomst visas på ditt befintliga konto och är inte ett köpt abonnemang.",
  contents: "Inriktning",
  trySearch: "Prova sökningen",
  unavailable: "Inte öppet för köp ännu",
  exploreTrading: "Utforska Trading",
  openTrading: "Öppna Trading",
  currentLevel: "Din aktuella nivå",
  included: "Ingår i din nivå",
  account: "Mitt konto och min åtkomst",
  signIn: "Logga in på ditt Sajda-konto",
  checkingAccess: "Kontrollerar din aktuella nivå…",
  unknownAccess: "Din aktuella nivå kunde inte bekräftas. Kontrollera åtkomsten på ditt konto.",
  assignedAccess: "Tilldelad åtkomst · inget betalt abonnemang",
  hierarchy: "Nivåerna bygger på varandra: Trading inkluderar Premium, Premium inkluderar Bas och Bas inkluderar Gratis. Detta gäller lanserade funktioner; planerade funktioner är inte automatiskt tillgängliga.",
  currentTitle: "Tillgängligt idag",
  current: "Prova domänsökningen, se registerstatus och jämför de prisuppgifter vi kan verifiera. Med verifierad inloggning kan du spara domäner redan nu, utan abonnemang.",
  monitoringTitle: "Bevakning byggs ut",
  monitoring: "Bas är tänkt för enkel bevakning, Premium för mer avancerad bevakning och Trading för prioriterad uppföljning av domänkandidater. Automatiska kontroller och aviseringar är inte aktiva idag. Sparade domäner är sparade ögonblicksbilder, inte löpande bevakningar.",
  terms: "Alla priser är i USD per månad. Före ett framtida köp ska användningsgränser, villkor, eventuell skatt och slutbelopp visas tydligt. Domänköp hos leverantörer ingår inte i abonnemangspriset.",
  risk: "Trading ger analysunderlag, inte en garanti för värde, tillgänglighet eller avkastning. Köp och slutlig kontroll görs hos vald domänleverantör.",
  plans: {
    free: { name: "Gratis", audience: "För att komma igång", description: "Testa en idé och förstå vad Sajda kan hjälpa dig med.", points: ["Prova domänsökningen", "Se registerstatus", "Jämför tillgängliga prisunderlag"] },
    basic: { name: "Bas", audience: "För ditt nästa projekt", description: "För dig som letar efter en domän då och då och vill hålla ordning på kandidaterna.", points: ["Allt i Gratis", "Spara och jämför domäner", "Arbeta med ett mindre projekt", "Begränsad swajpning"] },
    premium: { name: "Premium", audience: "För återkommande sökningar", description: "För dig som utvecklar fler idéer och behöver mer utrymme att söka och jämföra.", points: ["Allt i Bas", "Ångra senaste svajpen, ett steg", "Högre sök- och projektgränser", "Fördjupad granskning av kandidater"] },
    trading: { name: "Trading", audience: "För domänspecialister", description: "Undersök Lost Domains och fatta mer underbyggda beslut, med samma konto och inloggning.", points: ["Allt i Premium, inklusive ångra svajp", "Lost Domains-arbetsyta", "Källor och kontrollhistorik", "Riskbedömda kandidater för egen granskning"] },
  },
};

const en: PricingCopy = {
  back: "Back to search",
  eyebrow: "One Sajda account. Four access levels.",
  title: "From your first idea to professional domain research.",
  lead: "Try it free and keep the same login throughout. Basic suits a smaller project, Premium supports regular searches, and Trading is for domain professionals.",
  noticeTitle: "Prices are set. Paid subscriptions are not open yet.",
  notice: "These are the intended plan levels before subscriptions launch. Creating an account does not activate a paid plan, and no payment is collected here. Assigned test access appears on your existing account and is not a purchased subscription.",
  contents: "Focus",
  trySearch: "Try search",
  unavailable: "Not available to buy yet",
  exploreTrading: "Explore Trading",
  openTrading: "Open Trading",
  currentLevel: "Your current level",
  included: "Included in your level",
  account: "My account and access",
  signIn: "Sign in to your Sajda account",
  checkingAccess: "Checking your current level…",
  unknownAccess: "Your current level could not be confirmed. Check access on your account.",
  assignedAccess: "Assigned access · not a paid subscription",
  hierarchy: "Levels build on one another: Trading includes Premium, Premium includes Basic, and Basic includes Free. This applies to released features; planned features are not automatically available.",
  currentTitle: "Available today",
  current: "Try domain search, see registry status and compare the price information we can verify. With a verified login, you can already save domains without a subscription.",
  monitoringTitle: "Monitoring is being developed",
  monitoring: "Basic is intended for simple monitoring, Premium for more advanced monitoring, and Trading for prioritised follow-up of domain candidates. Automatic checks and alerts are not active today. Saved domains are snapshots, not ongoing monitoring.",
  terms: "All prices are in USD per month. Usage limits, terms, any applicable tax and the final total must be shown clearly before a future purchase. Domain purchases from providers are not included in the subscription price.",
  risk: "Trading provides research, not a guarantee of value, availability or returns. Purchases and final checks take place with your chosen domain provider.",
  plans: {
    free: { name: "Free", audience: "To get started", description: "Try an idea and discover how Sajda can help.", points: ["Try domain search", "See registry status", "Compare available price evidence"] },
    basic: { name: "Basic", audience: "For your next project", description: "For occasional domain searches when you want to keep your candidates organised.", points: ["Everything in Free", "Save and compare domains", "Work on a smaller project", "Limited swiping"] },
    premium: { name: "Premium", audience: "For regular searches", description: "For developing more ideas with more room to search and compare.", points: ["Everything in Basic", "Undo your last swipe, one step", "Higher search and project limits", "Deeper candidate review"] },
    trading: { name: "Trading", audience: "For domain specialists", description: "Investigate Lost Domains and make better-informed decisions with the same account and login.", points: ["Everything in Premium, including swipe undo", "Lost Domains workspace", "Sources and check history", "Risk-assessed candidates for your review"] },
  },
};

export function getPricingCopy(language: string): PricingCopy {
  return language === "sv" ? sv : en;
}
