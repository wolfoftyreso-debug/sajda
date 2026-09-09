import { useEffect, type ComponentType, type SVGProps } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  FileSearch,
  Layers3,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "react-router-dom";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type HowItWorksCopy = {
  documentTitle: string;
  navBack: string;
  navStory: string;
  anchors: Array<{ id: "direction" | "evidence" | "context"; label: string }>;
  eyebrow: string;
  title: string;
  lead: string;
  primaryAction: string;
  secondaryAction: string;
  status: string;
  resultTitle: string;
  resultRows: Array<{ label: string; body: string }>;
  direction: {
    eyebrow: string;
    title: string;
    lead: string;
    paths: Array<{ label: string; title: string; body: string; detail: string }>;
    criteriaTitle: string;
    criteriaBody: string;
    action: string;
  };
  evidence: {
    eyebrow: string;
    title: string;
    lead: string;
    flowTitle: string;
    flow: Array<{ title: string; body: string }>;
    priceTitle: string;
    priceLead: string;
    prices: Array<{ label: string; title: string; body: string }>;
    providerNote: string;
  };
  context: {
    eyebrow: string;
    title: string;
    lead: string;
    reviewTitle: string;
    reviewBody: string;
    reviewPoints: string[];
    marketTitle: string;
    marketBody: string;
    limitsTitle: string;
    limits: string[];
    developerAction: string;
  };
  finish: {
    title: string;
    body: string;
    action: string;
    storyAction: string;
  };
};

const howItWorksCopy: Record<Language, HowItWorksCopy> = {
  en: {
    documentTitle: "How Sajda works — Domain search with evidence",
    navBack: "Back to search",
    navStory: "The Sajda story",
    anchors: [
      { id: "direction", label: "Direction" },
      { id: "evidence", label: "Evidence" },
      { id: "context", label: "Context" },
    ],
    eyebrow: "How Sajda works",
    title: "Turn a rough idea into a checked next step.",
    lead: "Sajda helps you find a domain name in three deliberate passes: shape the brief, verify what can be verified, then compare the evidence before you decide.",
    primaryAction: "Start a search",
    secondaryAction: "See the process",
    status: "Sajda is decision support. Registry and provider checkout remain the final source of truth.",
    resultTitle: "What stays attached to a result",
    resultRows: [
      { label: "The name", body: "Your reference word, brief, or exact domain query remains part of the search context." },
      { label: "Availability evidence", body: "The result shows the registry method used—or clearly says when it could not be confirmed." },
      { label: "Price source", body: "A price is shown only when its source and freshness qualify. Otherwise, you get a provider handoff." },
      { label: "Decision context", body: "A shortlist can explain its score and trade-offs while leaving the purchase decision with you." },
    ],
    direction: {
      eyebrow: "01 · Set the direction",
      title: "Start as precisely—or as openly—as you need.",
      lead: "A search should not forget why you started it. Sajda keeps the input visible while it creates or checks candidates, rather than treating every search as a random word generator.",
      paths: [
        {
          label: "Exact check",
          title: "Ask about the name you already have.",
          body: "Enter a complete name such as sajda.dev, or one label with several endings such as sajda .com .dev .ai.",
          detail: "Sajda parses up to 12 unambiguous exact domains and sends those names to the availability check. It does not quietly turn an exact query into a creative theme.",
        },
        {
          label: "Creative search",
          title: "Give the search a reference, not a blank stare.",
          body: "Use an idea, product, audience, or reference word to make candidate generation follow a visible naming direction.",
          detail: "Choose extensions and a search style, then see names that carry that input forward into the registry-checking stage.",
        },
        {
          label: "Advanced brief",
          title: "Give more context when the name has to do real work.",
          body: "Paste up to 250 words about the audience, feeling, words to include or avoid, and the sort of name you are looking for.",
          detail: "You can constrain length, naming language, style, priority words, and excluded words before candidates are generated.",
        },
      ],
      criteriaTitle: "The controls are constraints, not decoration.",
      criteriaBody: "Length, language, style, and word choices travel with the search request. They are there to influence generation before an availability check—not to make a finished name look more scientific after the fact.",
      action: "Open the search workspace",
    },
    evidence: {
      eyebrow: "02 · Check the evidence",
      title: "A green result needs a method behind it.",
      lead: "Availability and price are separate questions. Sajda keeps them separate, shows the path used to answer each one, and leaves uncertainty visible instead of filling it with confidence theatre.",
      flowTitle: "Availability flow",
      flow: [
        { title: "Prepare the candidates", body: "Sajda either parses exact domains or generates candidates from the selected search direction." },
        { title: "Ask the relevant registry path", body: "Checks use the available registry route for the extension, such as RDAP, DAS, or WHOIS." },
        { title: "Show the actual state", body: "A name is only presented as available when an authoritative check confirms it. If a route fails or cannot confirm the answer, the state remains unknown." },
        { title: "Hand off before checkout", body: "Availability can change. Open the chosen provider before you buy and let its checkout confirm the final order." },
      ],
      priceTitle: "Price is shown with its status and source, never treated as a confirmed quote.",
      priceLead: "Sajda compares selected provider paths. It never treats a screening estimate as a registration price, and it does not imply that an available domain currently belongs with one registrar.",
      prices: [
        { label: "Verified price", title: "Source and checked time are visible.", body: "A current, source-backed price can be shown with its currency and tax treatment when those details are known." },
        { label: "No verified price", title: "The provider link stays useful.", body: "When there is no connected or fresh source, Sajda says so and links you to the provider's own search page instead of inventing a number." },
        { label: "Final purchase", title: "Checkout decides the transaction.", body: "Promotions, tax, premium status, renewal terms, and availability can change. Confirm them with the provider before payment." },
      ],
      providerNote: "Selected providers are purchase options for an available name. They are not a claim about the current registrar or owner of a registered name.",
    },
    context: {
      eyebrow: "03 · Choose with context",
      title: "A shortlist should explain itself.",
      lead: "Once you have registry-verified available names, Sajda can turn the strongest candidates into a readable Top 10. It is a transparent decision aid—not a valuation.",
      reviewTitle: "Deep Review starts after verification.",
      reviewBody: "Only candidates that are both available and authoritatively verified can enter the ranking. The score is displayed as components, so you can see the trade-offs rather than accept a mysterious number.",
      reviewPoints: [
        "Readability and practical name length",
        "Fit with your theme and selected extension",
        "Registry evidence and price clarity",
        "A visible search signal—not a trademark or legal conclusion",
      ],
      marketTitle: "Market facts are context, not a price tag for your name.",
      marketBody: "When Sajda shows a historical domain sale, it is source-labelled and described as reported evidence. A past transaction is not a current listing, a quote, or a valuation for a different domain.",
      limitsTitle: "What Sajda does not promise",
      limits: [
        "Trademark clearance, legal advice, or ownership transfer",
        "A complete view of every registrar, aftermarket, or private sale",
        "A guaranteed price or purchase outcome before provider checkout",
        "A verified answer when the registry path cannot provide one",
      ],
      developerAction: "Read the developer proposal",
    },
    finish: {
      title: "Useful, checkable, and still your decision.",
      body: "Bring an idea or an exact name. Sajda will make the next step clearer, keep the evidence close, and point you to the provider that completes the purchase.",
      action: "Find a domain name",
      storyAction: "Read the Sajda story",
    },
  },
  sv: {
    documentTitle: "Så fungerar Sajda — Domänsökning med underlag",
    navBack: "Tillbaka till sökningen",
    navStory: "Berättelsen om Sajda",
    anchors: [
      { id: "direction", label: "Riktning" },
      { id: "evidence", label: "Underlag" },
      { id: "context", label: "Sammanhang" },
    ],
    eyebrow: "Så fungerar Sajda",
    title: "Gör en rå idé till ett kontrollerat nästa steg.",
    lead: "Sajda hjälper dig att hitta ett domännamn i tre medvetna steg: formulera briefen, verifiera det som går att verifiera och jämför sedan underlaget innan du bestämmer dig.",
    primaryAction: "Starta en sökning",
    secondaryAction: "Se processen",
    status: "Sajda är beslutsstöd. Registry-källan och leverantörens kassa är alltid den slutliga sanningen.",
    resultTitle: "Det som följer med ett resultat",
    resultRows: [
      { label: "Namnet", body: "Ditt referensord, din brief eller din exakta domänfråga följer med som söksammanhang." },
      { label: "Tillgänglighetsunderlag", body: "Resultatet visar vilken registry-metod som användes—eller säger tydligt när det inte kunde bekräftas." },
      { label: "Priskälla", body: "Ett pris visas bara när källa och aktualitet räcker. Annars får du en väg vidare till leverantören." },
      { label: "Beslutssammanhang", body: "En kortlista kan förklara sin poäng och sina avvägningar utan att låtsas fatta köpet åt dig." },
    ],
    direction: {
      eyebrow: "01 · Sätt riktningen",
      title: "Börja så precist—eller så öppet—som du behöver.",
      lead: "En sökning ska inte glömma varför du startade den. Sajda håller inmatningen synlig medan kandidater skapas eller kontrolleras, i stället för att göra varje sökning till en slumpgenerator.",
      paths: [
        {
          label: "Exakt kontroll",
          title: "Fråga om namnet du redan har.",
          body: "Skriv ett komplett namn som sajda.dev, eller ett namn med flera ändelser som sajda .com .dev .ai.",
          detail: "Sajda tolkar upp till 12 otvetydiga exakta domäner och skickar just dessa namn till tillgänglighetskontrollen. En exakt fråga förvandlas inte i smyg till ett kreativt tema.",
        },
        {
          label: "Kreativ sökning",
          title: "Ge sökningen en referens, inte en tom blick.",
          body: "Använd en idé, produkt, målgrupp eller ett referensord så att kandidatgenereringen följer en synlig namnriktning.",
          detail: "Välj ändelser och sökstil och se sedan namn som bär den inmatningen vidare till registry-kontrollen.",
        },
        {
          label: "Avancerad brief",
          title: "Ge mer sammanhang när namnet ska göra ett riktigt jobb.",
          body: "Klistra in upp till 250 ord om målgruppen, känslan, ord som ska finnas med eller undvikas och vilken typ av namn du söker.",
          detail: "Du kan begränsa längd, namnspråk, stil, prioriterade ord och exkluderade ord innan kandidaterna skapas.",
        },
      ],
      criteriaTitle: "Reglagen är begränsningar, inte dekoration.",
      criteriaBody: "Längd, språk, stil och ordval följer med sökningen. De ska påverka genereringen före en registry-kontroll—inte få ett färdigt namn att se mer vetenskapligt ut i efterhand.",
      action: "Öppna sökytan",
    },
    evidence: {
      eyebrow: "02 · Kontrollera underlaget",
      title: "Ett grönt resultat behöver en metod bakom sig.",
      lead: "Tillgänglighet och pris är olika frågor. Sajda håller isär dem, visar vilken väg som användes för varje svar och låter osäkerheten synas i stället för att fylla den med låtsassäkerhet.",
      flowTitle: "Flöde för tillgänglighet",
      flow: [
        { title: "Förbered kandidaterna", body: "Sajda tolkar antingen exakta domäner eller skapar kandidater från den valda sökriktningen." },
        { title: "Fråga rätt registry-väg", body: "Kontroller använder den registry-väg som finns för ändelsen, till exempel RDAP, DAS eller WHOIS." },
        { title: "Visa den faktiska statusen", body: "Ett namn visas som ledigt först när en auktoritativ kontroll bekräftar det. Om en väg misslyckas eller inte kan bekräfta svaret är statusen fortfarande okänd." },
        { title: "Lämna över före köp", body: "Tillgänglighet kan ändras. Öppna vald leverantör före köp och låt dess kassa bekräfta den slutliga ordern." },
      ],
      priceTitle: "Priset visas med sin status—inte som en påhittad offert.",
      priceLead: "Sajda jämför valda leverantörsvägar. Ett screeningvärde blir aldrig ett registreringspris, och ett ledigt namn påstås inte automatiskt höra hemma hos en viss registrar.",
      prices: [
        { label: "Verifierat pris", title: "Källa och kontrolltid syns.", body: "Ett aktuellt pris med källa kan visas med valuta och skattehantering när de uppgifterna är kända." },
        { label: "Inget verifierat pris", title: "Leverantörslänken är fortfarande användbar.", body: "När det saknas en ansluten eller färsk källa säger Sajda det och länkar till leverantörens egen söksida i stället för att hitta på en siffra." },
        { label: "Slutligt köp", title: "Kassan avgör transaktionen.", body: "Kampanjer, skatt, premiumstatus, förnyelsevillkor och tillgänglighet kan ändras. Bekräfta dem hos leverantören före betalning." },
      ],
      providerNote: "Valda leverantörer är köpalternativ för ett ledigt namn. De är inte ett påstående om den nuvarande registrarens eller ägarens identitet för ett registrerat namn.",
    },
    context: {
      eyebrow: "03 · Välj med sammanhang",
      title: "En kortlista ska kunna förklara sig själv.",
      lead: "När du har registry-verifierade lediga namn kan Sajda göra de starkaste kandidaterna till en läsbar topp 10. Det är ett transparent beslutsstöd, inte en värdering.",
      reviewTitle: "Djupgranskning börjar efter verifiering.",
      reviewBody: "Endast kandidater som både är lediga och auktoritativt verifierade kan rankas. Poängen visas som komponenter så att du ser avvägningarna i stället för att acceptera ett mystiskt tal.",
      reviewPoints: [
        "Läsbarhet och praktisk namnlängd",
        "Passning mot ditt tema och vald ändelse",
        "Registry-underlag och pristydlighet",
        "En synlig söksignal—inte en varumärkes- eller juridisk slutsats",
      ],
      marketTitle: "Marknadsfakta är sammanhang, inte en prislapp för ditt namn.",
      marketBody: "När Sajda visar en historisk domänförsäljning är den källmärkt och beskriven som rapporterat underlag. En tidigare affär är inte en aktuell annons, offert eller värdering av en annan domän.",
      limitsTitle: "Det Sajda inte lovar",
      limits: [
        "Varumärkesgranskning, juridisk rådgivning eller ägaröverföring",
        "En fullständig bild av varje registrar, aftermarket eller privat affär",
        "Ett garanterat pris eller köpresultat före leverantörens kassa",
        "Ett verifierat svar när registry-vägen inte kan ge ett",
      ],
      developerAction: "Läs utvecklarförslaget",
    },
    finish: {
      title: "Användbart, kontrollerbart och fortfarande ditt beslut.",
      body: "Kom med en idé eller ett exakt namn. Sajda gör nästa steg tydligare, håller underlaget nära och pekar mot leverantören som genomför köpet.",
      action: "Hitta ett domännamn",
      storyAction: "Läs Sajdas berättelse",
    },
  },
  es: {
    documentTitle: "Cómo funciona Sajda — Búsqueda de dominios con evidencia",
    navBack: "Volver a la búsqueda",
    navStory: "La historia de Sajda",
    anchors: [
      { id: "direction", label: "Dirección" },
      { id: "evidence", label: "Evidencia" },
      { id: "context", label: "Contexto" },
    ],
    eyebrow: "Cómo funciona Sajda",
    title: "Convierte una idea inicial en un siguiente paso comprobado.",
    lead: "Sajda te ayuda a encontrar un dominio en tres pasos deliberados: definir el briefing, verificar lo verificable y comparar la evidencia antes de decidir.",
    primaryAction: "Iniciar una búsqueda",
    secondaryAction: "Ver el proceso",
    status: "Sajda es apoyo para decidir. El registro y el checkout del proveedor siguen siendo la fuente final de verdad.",
    resultTitle: "Lo que permanece junto a un resultado",
    resultRows: [
      { label: "El nombre", body: "Tu palabra de referencia, briefing o consulta de dominio exacto sigue formando parte del contexto." },
      { label: "Evidencia de disponibilidad", body: "El resultado muestra el método de registro utilizado o indica claramente cuándo no pudo confirmarse." },
      { label: "Fuente de precio", body: "Solo se muestra un precio cuando su fuente y actualidad son suficientes. Si no, hay un acceso al proveedor." },
      { label: "Contexto de decisión", body: "Una lista corta puede explicar su puntuación y sus concesiones, mientras la decisión de compra sigue siendo tuya." },
    ],
    direction: {
      eyebrow: "01 · Marca la dirección",
      title: "Empieza con tanta precisión—o apertura—como necesites.",
      lead: "Una búsqueda no debería olvidar por qué la iniciaste. Sajda mantiene visible la entrada mientras crea o comprueba candidatos, en lugar de tratar cada búsqueda como un generador de palabras aleatorias.",
      paths: [
        { label: "Comprobación exacta", title: "Pregunta por el nombre que ya tienes.", body: "Introduce un nombre completo como sajda.dev, o una etiqueta con varias extensiones como sajda .com .dev .ai.", detail: "Sajda analiza hasta 12 dominios exactos inequívocos y envía esos nombres a la comprobación de disponibilidad. No convierte silenciosamente una consulta exacta en un tema creativo." },
        { label: "Búsqueda creativa", title: "Da a la búsqueda una referencia, no una mirada en blanco.", body: "Usa una idea, producto, audiencia o palabra de referencia para que la generación siga una dirección de naming visible.", detail: "Elige extensiones y estilo de búsqueda y verás nombres que llevan esa entrada hasta la fase de verificación del registro." },
        { label: "Briefing avanzado", title: "Da más contexto cuando el nombre tiene que hacer un trabajo real.", body: "Pega hasta 250 palabras sobre la audiencia, sensación, palabras que incluir o evitar y el tipo de nombre que buscas.", detail: "Puedes acotar longitud, idioma de naming, estilo, palabras prioritarias y palabras excluidas antes de generar candidatos." },
      ],
      criteriaTitle: "Los controles son límites, no decoración.",
      criteriaBody: "La longitud, el idioma, el estilo y las palabras elegidas viajan con la solicitud. Influyen en la generación antes de la comprobación de registro, no después para hacer que un nombre acabado parezca más científico.",
      action: "Abrir el espacio de búsqueda",
    },
    evidence: {
      eyebrow: "02 · Comprueba la evidencia",
      title: "Un resultado verde necesita un método detrás.",
      lead: "Disponibilidad y precio son preguntas distintas. Sajda las separa, muestra la vía usada para cada una y deja visible la incertidumbre en vez de rellenarla con seguridad fingida.",
      flowTitle: "Flujo de disponibilidad",
      flow: [
        { title: "Preparar candidatos", body: "Sajda analiza dominios exactos o genera candidatos a partir de la dirección de búsqueda elegida." },
        { title: "Consultar la vía de registro", body: "Las comprobaciones usan la ruta de registro disponible para la extensión, como RDAP, DAS o WHOIS." },
        { title: "Mostrar el estado real", body: "Un nombre solo aparece como disponible cuando una comprobación autorizada lo confirma. Si una ruta falla o no confirma, el estado sigue siendo desconocido." },
        { title: "Pasar al proveedor antes del checkout", body: "La disponibilidad puede cambiar. Abre el proveedor elegido antes de comprar y deja que su checkout confirme el pedido final." },
      ],
      priceTitle: "El precio se muestra con su estado y su fuente; nunca se presenta como una cotización confirmada.",
      priceLead: "Sajda compara vías de proveedores seleccionados. Nunca convierte una estimación de selección en un precio de registro ni sugiere que un dominio disponible pertenezca a un registrador concreto.",
      prices: [
        { label: "Precio verificado", title: "La fuente y la hora de comprobación son visibles.", body: "Un precio actual con fuente puede mostrarse con su moneda y tratamiento fiscal cuando se conocen esos detalles." },
        { label: "Sin precio verificado", title: "El enlace al proveedor sigue siendo útil.", body: "Cuando no hay una fuente conectada o reciente, Sajda lo indica y enlaza a la página de búsqueda del proveedor en vez de inventar una cifra." },
        { label: "Compra final", title: "El checkout decide la transacción.", body: "Promociones, impuestos, estado premium, renovaciones y disponibilidad pueden cambiar. Confírmalos con el proveedor antes de pagar." },
      ],
      providerNote: "Los proveedores seleccionados son opciones de compra para un nombre disponible. No son una afirmación sobre el registrador o propietario actual de un nombre registrado.",
    },
    context: {
      eyebrow: "03 · Elige con contexto",
      title: "Una lista corta debería poder explicarse.",
      lead: "Cuando tienes nombres disponibles verificados por el registro, Sajda puede convertir los candidatos más fuertes en un Top 10 legible. Es una ayuda transparente para decidir, no una valoración.",
      reviewTitle: "La revisión profunda empieza después de verificar.",
      reviewBody: "Solo entran en la clasificación candidatos disponibles y verificados de forma autorizada. La puntuación se muestra por componentes para que puedas ver las concesiones en lugar de aceptar un número misterioso.",
      reviewPoints: ["Legibilidad y longitud práctica", "Ajuste con tu tema y extensión elegida", "Evidencia de registro y claridad de precio", "Una señal de búsqueda visible, no una conclusión legal o de marca"],
      marketTitle: "Los datos de mercado son contexto, no una etiqueta de precio para tu nombre.",
      marketBody: "Cuando Sajda muestra una venta histórica de dominio, lleva fuente y se describe como evidencia reportada. Una transacción pasada no es un anuncio actual, presupuesto ni valoración de otro dominio.",
      limitsTitle: "Lo que Sajda no promete",
      limits: ["Liberación de marcas, asesoramiento legal o transferencia de propiedad", "Una vista completa de cada registrador, mercado secundario o venta privada", "Un precio o compra garantizados antes del checkout del proveedor", "Una respuesta verificada cuando la vía de registro no puede darla"],
      developerAction: "Leer la propuesta para desarrolladores",
    },
    finish: {
      title: "Útil, comprobable y todavía tu decisión.",
      body: "Trae una idea o un nombre exacto. Sajda aclarará el siguiente paso, mantendrá cerca la evidencia y te dirigirá al proveedor que completa la compra.",
      action: "Encontrar un dominio",
      storyAction: "Leer la historia de Sajda",
    },
  },
  fr: {
    documentTitle: "Comment Sajda fonctionne — Recherche de domaines avec preuves",
    navBack: "Retour à la recherche",
    navStory: "L’histoire de Sajda",
    anchors: [
      { id: "direction", label: "Direction" },
      { id: "evidence", label: "Preuves" },
      { id: "context", label: "Contexte" },
    ],
    eyebrow: "Comment Sajda fonctionne",
    title: "Transformez une idée brute en prochaine étape vérifiée.",
    lead: "Sajda vous aide à trouver un domaine en trois passages délibérés : cadrer le brief, vérifier ce qui peut l’être, puis comparer les preuves avant de choisir.",
    primaryAction: "Lancer une recherche",
    secondaryAction: "Voir le processus",
    status: "Sajda aide à la décision. Le registre et le paiement du prestataire restent la source finale de vérité.",
    resultTitle: "Ce qui reste attaché à un résultat",
    resultRows: [
      { label: "Le nom", body: "Votre mot de référence, brief ou requête de domaine exact reste dans le contexte de recherche." },
      { label: "Preuve de disponibilité", body: "Le résultat affiche la méthode de registre utilisée, ou indique clairement lorsqu’elle n’a pas pu confirmer." },
      { label: "Source du prix", body: "Un prix n’est affiché que si sa source et sa fraîcheur sont suffisantes. Sinon, vous obtenez un accès au prestataire." },
      { label: "Contexte de décision", body: "Une sélection peut expliquer son score et ses compromis, tandis que la décision d’achat vous appartient." },
    ],
    direction: {
      eyebrow: "01 · Définir la direction",
      title: "Commencez avec autant de précision—ou d’ouverture—qu’il vous faut.",
      lead: "Une recherche ne doit pas oublier pourquoi vous l’avez lancée. Sajda garde l’entrée visible pendant la création ou la vérification des candidats, au lieu de traiter chaque recherche comme un générateur de mots aléatoires.",
      paths: [
        { label: "Vérification exacte", title: "Interrogez le nom que vous avez déjà.", body: "Saisissez un nom complet comme sajda.dev, ou une étiquette avec plusieurs extensions comme sajda .com .dev .ai.", detail: "Sajda analyse jusqu’à 12 domaines exacts sans ambiguïté et envoie ces noms à la vérification de disponibilité. Une requête exacte n’est pas discrètement transformée en thème créatif." },
        { label: "Recherche créative", title: "Donnez une référence à la recherche, pas un regard vide.", body: "Utilisez une idée, un produit, une audience ou un mot de référence pour que la génération suive une direction de naming visible.", detail: "Choisissez des extensions et un style, puis voyez des noms qui transportent cette entrée jusqu’à l’étape de vérification du registre." },
        { label: "Brief avancé", title: "Donnez plus de contexte quand le nom doit accomplir une vraie tâche.", body: "Collez jusqu’à 250 mots sur l’audience, l’ambiance, les mots à inclure ou éviter et le type de nom recherché.", detail: "Vous pouvez contraindre la longueur, la langue de nom, le style, les mots prioritaires et les mots exclus avant la génération." },
      ],
      criteriaTitle: "Les contrôles sont des contraintes, pas de la décoration.",
      criteriaBody: "La longueur, la langue, le style et les choix de mots voyagent avec la requête. Ils orientent la génération avant le contrôle du registre, et non après pour rendre un nom fini plus scientifique.",
      action: "Ouvrir l’espace de recherche",
    },
    evidence: {
      eyebrow: "02 · Vérifier les preuves",
      title: "Un résultat vert a besoin d’une méthode derrière lui.",
      lead: "Disponibilité et prix sont deux questions distinctes. Sajda les sépare, montre le chemin utilisé pour chacune et laisse l’incertitude visible au lieu de la remplir d’assurance factice.",
      flowTitle: "Flux de disponibilité",
      flow: [
        { title: "Préparer les candidats", body: "Sajda analyse les domaines exacts ou génère des candidats à partir de la direction de recherche choisie." },
        { title: "Interroger le bon chemin de registre", body: "Les contrôles utilisent la route de registre disponible pour l’extension, par exemple RDAP, DAS ou WHOIS." },
        { title: "Afficher l’état réel", body: "Un nom n’est présenté comme disponible qu’après confirmation par un contrôle faisant autorité. Si une route échoue ou ne confirme pas, l’état reste inconnu." },
        { title: "Passer au prestataire avant le paiement", body: "La disponibilité peut changer. Ouvrez le prestataire choisi avant d’acheter et laissez son paiement confirmer la commande finale." },
      ],
      priceTitle: "Le prix est affiché avec son statut et sa source, sans jamais être présenté comme un devis confirmé.",
      priceLead: "Sajda compare les chemins des prestataires sélectionnés. Une estimation de sélection ne devient jamais un prix d’enregistrement, et un domaine disponible n’est pas attribué à un registrar particulier.",
      prices: [
        { label: "Prix vérifié", title: "La source et l’heure de contrôle sont visibles.", body: "Un prix actuel sourcé peut être affiché avec sa devise et son traitement fiscal lorsque ces détails sont connus." },
        { label: "Aucun prix vérifié", title: "Le lien vers le prestataire reste utile.", body: "Sans source connectée ou récente, Sajda le précise et renvoie vers la page de recherche du prestataire au lieu d’inventer un montant." },
        { label: "Achat final", title: "Le paiement décide de la transaction.", body: "Promotions, taxes, statut premium, renouvellement et disponibilité peuvent changer. Confirmez-les avec le prestataire avant paiement." },
      ],
      providerNote: "Les prestataires sélectionnés sont des options d’achat pour un nom disponible. Ils ne constituent pas une affirmation sur le registrar ou le propriétaire actuel d’un nom enregistré.",
    },
    context: {
      eyebrow: "03 · Choisir avec contexte",
      title: "Une sélection doit pouvoir s’expliquer.",
      lead: "Une fois des noms disponibles vérifiés par le registre obtenus, Sajda peut transformer les candidats les plus solides en un Top 10 lisible. C’est une aide à la décision transparente, pas une évaluation.",
      reviewTitle: "L’analyse approfondie commence après la vérification.",
      reviewBody: "Seuls les candidats à la fois disponibles et vérifiés de manière autoritative entrent au classement. Le score est affiché en composantes afin que vous voyiez les compromis plutôt que d’accepter un nombre mystérieux.",
      reviewPoints: ["Lisibilité et longueur pratique", "Adéquation avec votre thème et extension choisie", "Preuve du registre et clarté du prix", "Un signal de recherche visible, pas une conclusion juridique ou de marque"],
      marketTitle: "Les faits de marché sont du contexte, pas une étiquette de prix pour votre nom.",
      marketBody: "Lorsque Sajda affiche une vente historique de domaine, elle est sourcée et décrite comme une preuve rapportée. Une transaction passée n’est ni une annonce actuelle, ni un devis, ni l’évaluation d’un autre domaine.",
      limitsTitle: "Ce que Sajda ne promet pas",
      limits: ["Recherche de marque, conseil juridique ou transfert de propriété", "Une vue complète de chaque registrar, marché secondaire ou vente privée", "Un prix ou un résultat d’achat garanti avant le paiement du prestataire", "Une réponse vérifiée quand la route de registre ne peut pas la fournir"],
      developerAction: "Lire la proposition développeurs",
    },
    finish: {
      title: "Utile, vérifiable, et toujours votre décision.",
      body: "Apportez une idée ou un nom exact. Sajda clarifie la prochaine étape, garde les preuves à portée de main et vous oriente vers le prestataire qui finalise l’achat.",
      action: "Trouver un domaine",
      storyAction: "Lire l’histoire de Sajda",
    },
  },
  zh: {
    documentTitle: "Sajda 如何工作 — 具备依据的域名搜索",
    navBack: "返回搜索",
    navStory: "Sajda 的故事",
    anchors: [
      { id: "direction", label: "方向" },
      { id: "evidence", label: "依据" },
      { id: "context", label: "上下文" },
    ],
    eyebrow: "Sajda 如何工作",
    title: "将一个粗略想法变成可核验的下一步。",
    lead: "Sajda 通过三个清晰步骤帮助你寻找域名：梳理说明、核验可核验的内容，然后在决定前比较依据。",
    primaryAction: "开始搜索",
    secondaryAction: "查看流程",
    status: "Sajda 是决策辅助工具。注册局与服务商结账页始终是最终事实来源。",
    resultTitle: "会随结果保留的信息",
    resultRows: [
      { label: "名称", body: "你的参考词、说明或精确域名查询会保留在搜索上下文中。" },
      { label: "可用性依据", body: "结果显示使用的注册局方法，或明确说明何时无法确认。" },
      { label: "价格来源", body: "只有来源与时效足够时才显示价格；否则会给出服务商入口。" },
      { label: "决策上下文", body: "候选列表可以解释分数和取舍，而不会假装替你完成购买。" },
    ],
    direction: {
      eyebrow: "01 · 确定方向",
      title: "按你需要的精确程度或开放程度开始。",
      lead: "搜索不应该忘记你为什么开始。Sajda 在生成或核验候选名称时保留输入内容，而不会把每次搜索当作随机词生成器。",
      paths: [
        { label: "精确查询", title: "查询你已经拥有的名称。", body: "输入完整名称，例如 sajda.dev，或一个标签加多个后缀，例如 sajda .com .dev .ai。", detail: "Sajda 会解析最多 12 个明确的精确域名，并将这些名称发送至可用性检查。它不会悄悄把精确查询变成创意主题。" },
        { label: "创意搜索", title: "给搜索一个参考，而不是空白凝视。", body: "使用想法、产品、受众或参考词，让候选名称生成遵循可见的命名方向。", detail: "选择后缀与搜索风格，然后查看将这些输入延续至注册局核验阶段的名称。" },
        { label: "高级说明", title: "当名称必须承担真正任务时，提供更多上下文。", body: "粘贴最多 250 个词，说明受众、感觉、要包含或避开的词，以及你寻找的名称类型。", detail: "在生成候选名称前，你可以限制长度、命名语言、风格、优先词和排除词。" },
      ],
      criteriaTitle: "这些控制项是约束，不是装饰。",
      criteriaBody: "长度、语言、风格和词语选择会随搜索请求传递。它们在注册局核验之前影响生成，而不是事后让一个完成的名称看起来更科学。",
      action: "打开搜索工作区",
    },
    evidence: {
      eyebrow: "02 · 核验依据",
      title: "绿色结果背后需要有方法。",
      lead: "可用性和价格是两个不同的问题。Sajda 将它们分开，显示每个答案所使用的路径，并让不确定性保持可见，而不是用虚假的信心填补它。",
      flowTitle: "可用性流程",
      flow: [
        { title: "准备候选名称", body: "Sajda 解析精确域名，或根据所选搜索方向生成候选名称。" },
        { title: "查询相应的注册局路径", body: "核验使用该后缀可用的注册局路径，例如 RDAP、DAS 或 WHOIS。" },
        { title: "显示实际状态", body: "仅当权威核验确认时，名称才会显示为可注册。如果路径失败或无法确认，状态仍为未知。" },
        { title: "结账前交给服务商", body: "可用性会变化。购买前请打开所选服务商，并由其结账页确认最终订单。" },
      ],
      priceTitle: "价格会显示其状态和来源，但不会被呈现为已确认报价。",
      priceLead: "Sajda 比较所选服务商路径。它绝不把筛选估值变成注册价格，也不暗示一个可注册域名目前属于某个注册商。",
      prices: [
        { label: "已核验价格", title: "来源与核验时间清晰可见。", body: "当细节已知时，可以显示带来源的当前价格、币种与税务处理。" },
        { label: "没有已核验价格", title: "服务商链接仍然有用。", body: "如果没有已连接或新鲜的来源，Sajda 会说明情况，并链接到服务商自己的搜索页，而不是编造数字。" },
        { label: "最终购买", title: "结账页决定交易。", body: "促销、税费、高级域名状态、续费条款和可用性都可能变化。付款前请与服务商确认。" },
      ],
      providerNote: "所选服务商是可注册名称的购买选项，并不表示已注册名称当前的注册商或所有者。",
    },
    context: {
      eyebrow: "03 · 带着上下文选择",
      title: "候选列表应该能够解释自己。",
      lead: "当你拥有注册局核验的可注册名称后，Sajda 可以将最强候选整理为可读的 Top 10。这是透明的决策辅助，不是估值。",
      reviewTitle: "深度审阅在核验之后开始。",
      reviewBody: "只有既可注册又经过权威核验的候选名称才会进入排名。分数以组件方式展示，让你看到取舍，而不是接受一个神秘数字。",
      reviewPoints: ["易读性和实用名称长度", "与你的主题和所选后缀的匹配", "注册局依据和价格清晰度", "可见的搜索信号，而不是商标或法律结论"],
      marketTitle: "市场事实是上下文，不是你的名称的价格标签。",
      marketBody: "当 Sajda 展示历史域名成交时，它会标明来源，并说明其为已报道的证据。过去的交易不是当前挂牌、报价或另一个域名的估值。",
      limitsTitle: "Sajda 不承诺什么",
      limits: ["商标清查、法律意见或所有权转让", "每个注册商、二级市场或私人交易的完整视图", "服务商结账前保证的价格或购买结果", "当注册局路径无法给出答案时的已核验答案"],
      developerAction: "阅读开发者方案",
    },
    finish: {
      title: "有用、可核验，仍然由你决定。",
      body: "带来一个想法或精确名称。Sajda 会让下一步更清晰，让依据留在身边，并指向完成购买的服务商。",
      action: "寻找域名",
      storyAction: "阅读 Sajda 的故事",
    },
  },
};

const pathIcons = [Search, Layers3, SlidersHorizontal] as const;
const flowIcons = [FileSearch, Search, BadgeCheck, ShieldCheck] as const;

function SectionHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">{title}</h2>
      {lead && <p className="mt-4 text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{lead}</p>}
    </div>
  );
}

export default function HowItWorks() {
  const { language } = useLanguage();
  const copy = howItWorksCopy[language];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = copy.documentTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [copy.documentTitle]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[4.75rem] w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-7">
          <Link
            to="/"
            className="inline-flex shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Sajda"
          >
            <img src="/sajda-logo.svg" alt="Sajda" className="h-7 w-auto sm:h-8" />
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-semibold text-muted-foreground md:flex" aria-label={copy.eyebrow}>
            {copy.anchors.map((anchor) => (
              <a key={anchor.id} href={`#${anchor.id}`} className="transition-colors hover:text-foreground">
                {anchor.label}
              </a>
            ))}
            <Link to="/story" className="transition-colors hover:text-foreground">{copy.navStory}</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/"
              className="hidden items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {copy.navBack}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main>
        <section className="sajda-canvas overflow-hidden border-b border-border/70">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.82fr)] lg:items-center lg:gap-16 lg:py-24">
            <div className="relative z-10 max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/85 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-primary shadow-sm">
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.eyebrow}
              </p>
              <h1 className="mt-6 max-w-[14ch] text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.055em] text-foreground sm:text-6xl">
                {copy.title}
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                {copy.lead}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/">
                    {copy.primaryAction}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <a
                  href="#direction"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-input bg-card px-5 text-sm font-semibold transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {copy.secondaryAction}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              <p className="mt-6 flex max-w-2xl items-start gap-2 text-sm leading-6 text-muted-foreground">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {copy.status}
              </p>
            </div>

            <aside className="relative mx-auto w-full max-w-xl rounded-[1.5rem] border border-primary/15 bg-card/90 p-5 shadow-[0_22px_64px_rgba(15,23,42,0.11)] sm:p-6" aria-labelledby="result-context-title">
              <div className="absolute -right-12 -top-14 h-36 w-36 rounded-full border-[18px] border-primary/10" aria-hidden="true" />
              <div className="relative">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <FileSearch className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 id="result-context-title" className="mt-5 text-lg font-semibold tracking-[-0.025em] text-foreground">{copy.resultTitle}</h2>
                <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-background/75">
                  {copy.resultRows.map((row) => (
                    <div key={row.label} className="px-4 py-3.5">
                      <dt className="text-sm font-semibold text-foreground">{row.label}</dt>
                      <dd className="mt-1 text-sm leading-5 text-muted-foreground">{row.body}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </aside>
          </div>
        </section>

        <section id="direction" className="mx-auto w-full max-w-7xl scroll-mt-24 px-5 py-14 sm:px-7 sm:py-20">
          <SectionHeading eyebrow={copy.direction.eyebrow} title={copy.direction.title} lead={copy.direction.lead} />
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {copy.direction.paths.map((path, index) => {
              const Icon = pathIcons[index] as Icon;
              return (
                <article key={path.label} className="sajda-surface p-5 sm:p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="mt-5 text-xs font-bold uppercase tracking-[0.13em] text-primary">{path.label}</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-foreground">{path.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{path.body}</p>
                  <p className="mt-5 border-t border-border pt-4 text-sm leading-6 text-foreground/80">{path.detail}</p>
                </article>
              );
            })}
          </div>
          <div className="mt-5 flex flex-col justify-between gap-5 rounded-[1.25rem] border border-primary/15 bg-primary/[0.035] p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="max-w-3xl">
              <h3 className="text-base font-semibold text-foreground">{copy.direction.criteriaTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.direction.criteriaBody}</p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link to="/">
                {copy.direction.action}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>

        <section id="evidence" className="scroll-mt-24 border-y border-border/80 bg-card">
          <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20">
            <SectionHeading eyebrow={copy.evidence.eyebrow} title={copy.evidence.title} lead={copy.evidence.lead} />
            <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,0.86fr)_minmax(22rem,1.14fr)] lg:gap-16">
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.025em] text-foreground">{copy.evidence.flowTitle}</h3>
                <ol className="mt-5 space-y-3">
                  {copy.evidence.flow.map((step, index) => {
                    const Icon = flowIcons[index] as Icon;
                    return (
                      <li key={step.title} className="flex gap-4 rounded-xl border border-border bg-background p-4 sm:p-5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{step.title}</p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.body}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
              <div className="rounded-[1.25rem] border border-border bg-background p-5 shadow-[0_10px_26px_hsl(219_44%_12%/0.04)] sm:p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-foreground">{copy.evidence.priceTitle}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.evidence.priceLead}</p>
                <div className="mt-6 space-y-3">
                  {copy.evidence.prices.map((price) => (
                    <article key={price.label} className="rounded-xl border border-border bg-card p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">{price.label}</p>
                      <h4 className="mt-2 text-sm font-semibold text-foreground">{price.title}</h4>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{price.body}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-7 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/75 p-4 text-sm leading-6 text-amber-950/85">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              {copy.evidence.providerNote}
            </p>
          </div>
        </section>

        <section id="context" className="mx-auto w-full max-w-7xl scroll-mt-24 px-5 py-14 sm:px-7 sm:py-20">
          <SectionHeading eyebrow={copy.context.eyebrow} title={copy.context.title} lead={copy.context.lead} />
          <div className="mt-9 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
            <article className="sajda-surface-raised p-6 sm:p-7">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <FileSearch className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-foreground">{copy.context.reviewTitle}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.context.reviewBody}</p>
              <ul className="mt-6 grid gap-3 border-t border-border pt-5 text-sm text-foreground/85 sm:grid-cols-2">
                {copy.context.reviewPoints.map((point) => (
                  <li key={point} className="flex gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </article>
            <div className="grid gap-5">
              <article className="sajda-surface p-5 sm:p-6">
                <h3 className="text-base font-semibold text-foreground">{copy.context.marketTitle}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.context.marketBody}</p>
              </article>
              <article className="rounded-[1rem] border border-border bg-secondary/45 p-5 sm:p-6">
                <h3 className="text-base font-semibold text-foreground">{copy.context.limitsTitle}</h3>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                  {copy.context.limits.map((limit) => (
                    <li key={limit} className="flex gap-2.5">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/65" aria-hidden="true" />
                      <span>{limit}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button asChild variant="outline">
              <Link to="/developers">
                {copy.context.developerAction}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="border-t border-border/80 bg-card">
          <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20">
            <div className="flex flex-col justify-between gap-7 rounded-[1.5rem] border border-primary/15 bg-primary/[0.035] p-7 sm:p-10 lg:flex-row lg:items-end">
              <div className="max-w-2xl">
                <h2 className="text-balance text-3xl font-semibold tracking-[-0.04em] text-foreground">{copy.finish.title}</h2>
                <p className="mt-3 text-pretty text-base leading-7 text-muted-foreground">{copy.finish.body}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/">
                    {copy.finish.action}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/story">{copy.finish.storyAction}</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
