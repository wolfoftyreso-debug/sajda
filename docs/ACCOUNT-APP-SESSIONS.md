# Appinloggningar och sparade namn

## Konto → Appinloggningar

Kontosidan har en uttrycklig knapp för att hämta aktiva appinloggningar.
Ingen sessionslista hämtas bara för att kontosidan öppnas. Samma kontroll
finns i webb- och native-ytan.

`GET /api/account/app-sessions?cursor=<opaque>` returnerar högst 25 poster:

```json
{
  "items": [{"id":"<uuid>","createdAt":"<ISO date>","expiresAt":"<ISO date>"}],
  "nextCursor": null,
  "currentSessionId": null,
  "accountId": "<authenticated owner>",
  "requestId": "<correlation id>"
}
```

Webben använder verifierad cookie och `X-Sajda-Account` som ägarbyteskontroll.
Native går genom sin vanliga autentiserade adapter och det interna scopet
`sessions:manage`. Där identifierar `currentSessionId` den anropande
appinloggningen. Detta scope kan inte väljas för en API-nyckel. REST-nycklar
och MCP kan inte hantera andra inloggningar.

Listningen är bunden till ägare och miljö. Endast ej återkallade/utgångna
appsessioner med giltig ursprunglig webbsession och verifierad användare visas.
Ingen token, tokenhash, IP-adress, webbsessionsidentifierare eller påstådd
enhetsmodell exponeras. Kort sessionsreferens och anslutningstid med sekunder
hjälper användaren att skilja posterna åt; dessa är inte identifierade enheter.
Cursor bevarar databasens mikrosekunder och UUID för stabil paginering.

`DELETE /api/account/app-sessions` kräver exakt JSON `{"id":"<uuid>"}`.
Återkallning är ägar-/miljöbunden och idempotent: en främmande eller redan
borttagen identifierare avslöjar inte om någon annans inloggning finns.
Endast appsessionens `revoked_at` ändras. Webbsessioner, andra appinloggningar,
API-nycklar, sparade domäner och abonnemang berörs inte. Påbörjade anrop kan
slutföras; nya verifieringar nekar återkallad åtkomst.

UI kräver bekräftelse och konkret serversvar innan framgång visas. Den egna
native-inloggningen hänvisar till befintlig Logga ut. Ägarbyte avbryter gamla
operationer och skapar en ny komponentlivslängd. Fel innebär inte en tom lista.
En gemensam beständig kontokvot om 20 hanteringsanrop/minut gäller för webb
och app; omladdning eller byte av credential återställer inte räknaren.

## Swajp → Sparat

Swajps lokala lista heter nu uttryckligen Namn på den här enheten.
Varje kandidat kan kopieras till kontots Sparat med en separat knapp.
Det är ingen automatisk uppladdning. Lokala taggar och kategorier förblir
lokala; endast den befintliga kontomodellens snapshotfält kopieras.
En serverbekräftelse med rätt domän krävs. Inga priser, valutakonverteringar,
bevakningar eller tillgänglighetskontroller uppfinns. Befintligt beteende för
verifierade konton behålls; ingen ny pris- eller planmodell introduceras.

Sparat erbjuder namnsökning, ändelsefilter (även sammansatta ändelser),
namn-/datumsortering, träffantal, filteråterställning och manuell uppdatering.
Uppdatering hämtar kontolistan, inte nya registry- eller prisuppgifter.
Borttagning kräver en separat bekräftelse och ett riktigt `ok:true`-svar.
Sparade snapshots presenteras fortfarande med okänd aktuell tillgänglighet.

## Verifiering och kvarvarande gränser

- Komponent- och klienttester använder den verkliga UI-koden och uttryckligt
  simulerade transportsvar. De testar fem språk, paginering, tom-/felläge,
  dubbelklick, avbrott, kontobyte, gamla callbacks och bekräftade svar.
- Backendtester använder simulerad SQL-transport. Riktiga SQL-frågor har
  dessutom körts genom lokal HTTP mot utvecklings-Neon med
  `SAJDA_QA_APP_SESSIONS=true` i `scripts/test-developer-live.mjs`:
  68 kontrollpunkter godkända, inklusive två nya appinloggningar,
  återkallning av den ena, fortsatt åtkomst för den andra och full städning
  av testets egna credentials. Inga existerande appinloggningar återkallades.
- Samma 68 kontrollpunkter godkändes sedan på Vercel-preview f702d3d, följt
  av 43 verifierade sparandekontroller mellan REST, MCP och webbkontot.
  [Releaseprotokollet](RELEASE-2026-09-10.md) länkar till bygge och simulator-QA.
- Ingen ny migration krävs; 0013 och 0014 måste redan vara applicerade.
- Ingen kundprofil raderades, ingen betalning eller Trading-körning startades.
- Ny QA-flik gick inte att ansluta, men en befintlig tom produktflik kunde
  tillfälligt användas mot lokal HTTP/Neon. Riktig lösenordsinloggning,
  kontonavigering, öppning av appinloggningar, tom sessionslista, Sparats
  tomläge och manuell listuppdatering fungerade i webbläsaren. Skärmbilder
  granskades vid 390×844; dokumentets scrollbredd motsvarade klientbredden
  (375 px efter rullist), och navigation till Sparat startade vid scrollY=0.
  Fyllda listor, återkallningsdialoger och fysisk iPhone är inte visuellt
  verifierade av detta test. Deras tillstånd täcks separat av komponenttester.
- Vercel-skydd, StoreKit, signering/TestFlight och övriga begränsningar finns
  i [iPhone-status](IPHONE.md) och [releaseprotokollet](RELEASE-2026-09-10.md).

Full kontoradering är fortfarande spärrad. Att bara aktivera Better Auths
delete-user skulle kunna radera Stripe-kundmappningen medan debitering
fortsätter, och lämna sparade domäner utan ägare. Den kräver ett separat,
verifierat avslutningsflöde för betalning och data, inte en auth-inställning.
