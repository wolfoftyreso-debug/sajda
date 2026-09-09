import type { PlusBillingErrorCode, PlusBillingStatus } from "@/lib/plusBilling";

const en = {
  title: "Trading subscription", monthly: "/ month", priceLabel: "Monthly price", loading: "Checking billing status…", refresh: "Check billing status",
  checkout: "Subscribe to Trading", testCheckout: "Try test checkout", portal: "Manage subscription", opening: "Opening secure checkout…", openingPortal: "Opening subscription settings…",
  testMode: "Test mode — no real payment", testNote: "Use Stripe test payment details only. A test subscription does not activate a live paid plan.",
  liveNote: "Review the recurring total and terms in Stripe before paying. Access changes only after payment is confirmed by the server.",
  unavailable: "New subscriptions are not available right now. Existing customers can still manage their subscription when the button below is available.",
  existing: "Subscription status", expires: "Current access ends", returnPending: "Checkout has returned. We are checking your billing status; returning here alone does not confirm payment or activate access.",
  cancelled: "Checkout was closed. No payment is confirmed on this page. You can check billing status or try again.",
  inclusive: "Tax included in the displayed price.", exclusive: "Tax is additional where applicable; the total is shown in checkout.", unspecified: "Tax treatment has not been confirmed. Review the final total before paying.",
  statuses: { none: "No subscription", incomplete: "Payment not completed", incomplete_expired: "Checkout expired", trialing: "Trial period", active: "Active", past_due: "Payment needs attention", canceled: "Cancelled", unpaid: "Payment unpaid", paused: "Paused", conflict: "Account needs review" } satisfies Record<PlusBillingStatus, string>,
  errors: { unavailable: "We could not confirm the billing response. Check billing status before trying again; payment may still be processing.", invalid_response: "The billing response could not be verified. No payment page was opened. Check billing status or contact us.", unauthenticated: "Sign in again to manage your subscription.", account_changed: "Your account changed. Check billing status to load the correct account's details.", rate_limited: "Too many billing requests. Wait a moment before trying again.", not_ready: "Online subscriptions are not available yet. No payment was started.",
    email_verification_required: "Confirm your email address before subscribing. Sign in again to request a new confirmation link if needed.",
    subscription_changed: "Your subscription or checkout has changed. Check billing status before continuing; no second subscription was started.",
    checkout_expired: "This checkout link has expired. Check billing status, then start a new checkout if needed.",
    review_required: "Your billing account needs review before another payment can start. Contact us with the reference below; you can still manage an existing subscription." } satisfies Record<PlusBillingErrorCode, string>,
};
const sv: typeof en = {
  title: "Trading-prenumeration", monthly: "/ månad", priceLabel: "Månadspris", loading: "Kontrollerar betalstatus…", refresh: "Kontrollera betalstatus",
  checkout: "Prenumerera på Trading", testCheckout: "Prova testbetalning", portal: "Hantera prenumeration", opening: "Öppnar säker betalning…", openingPortal: "Öppnar prenumerationsinställningar…",
  testMode: "Testläge — ingen riktig betalning", testNote: "Använd endast Stripes testuppgifter. En testprenumeration aktiverar inte en betald prenumeration i produktion.",
  liveNote: "Granska återkommande totalpris och villkor hos Stripe innan du betalar. Åtkomsten ändras först när servern har bekräftat betalningen.",
  unavailable: "Nya prenumerationer är inte tillgängliga just nu. Befintliga kunder kan fortfarande hantera sin prenumeration när knappen nedan visas.",
  existing: "Prenumerationsstatus", expires: "Nuvarande åtkomst upphör", returnPending: "Du har kommit tillbaka från betalningen. Vi kontrollerar betalstatus; en återkomst hit bekräftar inte betalning och aktiverar inte åtkomst.",
  cancelled: "Betalningssidan stängdes. Ingen betalning bekräftas här. Du kan kontrollera betalstatus eller försöka igen.",
  inclusive: "Skatt ingår i det visade priset.", exclusive: "Skatt tillkommer där det gäller; totalpriset visas i betalningen.", unspecified: "Skattehanteringen är inte bekräftad. Granska det slutliga totalpriset innan du betalar.",
  statuses: { none: "Ingen prenumeration", incomplete: "Betalning inte slutförd", incomplete_expired: "Betalningstillfället har gått ut", trialing: "Provperiod", active: "Aktiv", past_due: "Betalningen behöver åtgärdas", canceled: "Avslutad", unpaid: "Obetald", paused: "Pausad", conflict: "Kontot behöver granskas" },
  errors: { unavailable: "Vi kunde inte bekräfta betalningssvaret. Kontrollera betalstatus innan du försöker igen; betalningen kan fortfarande behandlas.", invalid_response: "Betalningssvaret kunde inte verifieras. Ingen betalningssida öppnades. Kontrollera betalstatus eller kontakta oss.", unauthenticated: "Logga in igen för att hantera prenumerationen.", account_changed: "Kontot ändrades. Kontrollera betalstatus för att hämta rätt kontos uppgifter.", rate_limited: "För många betalningsförfrågningar. Vänta en stund innan du försöker igen.", not_ready: "Prenumerationer online är inte tillgängliga ännu. Ingen betalning startades.",
    email_verification_required: "Bekräfta din e-postadress innan du prenumererar. Logga in igen för att begära en ny bekräftelselänk om det behövs.",
    subscription_changed: "Prenumerationen eller betalningstillfället har ändrats. Kontrollera betalstatus innan du fortsätter; ingen andra prenumeration startades.",
    checkout_expired: "Betalningslänken har gått ut. Kontrollera betalstatus och starta sedan en ny betalning om det behövs.",
    review_required: "Ditt betalningskonto behöver granskas innan en ny betalning kan starta. Kontakta oss med referensen nedan; du kan fortfarande hantera en befintlig prenumeration." },
};
export const getPlusBillingCopy = (language: string) => language === "sv" ? sv : en;
