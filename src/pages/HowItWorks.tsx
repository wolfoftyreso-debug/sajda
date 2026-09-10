import { useEffect, type ComponentType, type ReactNode, type SVGProps } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  ChevronDown,
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
  detailsLabel: string;
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
    documentTitle: "How to find a domain | Sajda",
    navBack: "Back to search",
    navStory: "The Sajda story",
    anchors: [
      { id: "direction", label: "Search" },
      { id: "evidence", label: "Availability & price" },
      { id: "context", label: "Compare" },
    ],
    eyebrow: "How Sajda works",
    title: "How to find a domain",
    lead: "Check a name or get new ideas, compare availability and prices, then choose where to buy.",
    primaryAction: "Start a search",
    secondaryAction: "See the three steps",
    status: "Sajda helps you compare; your provider confirms availability and the final price before purchase.",
    detailsLabel: "More details",
    resultTitle: "What you see in a result",
    resultRows: [
      { label: "Domain name", body: "Names based on your idea, preferences or exact search." },
      { label: "Availability", body: "The check result and method, or an unknown status if it cannot be confirmed." },
      { label: "Price", body: "A current sourced price when available, or a link to check with the provider." },
      { label: "Name score", body: "An explained score to help you compare, not a financial valuation." },
    ],
    direction: {
      eyebrow: "Step 1 · Search",
      title: "Choose how to search",
      lead: "Check a name you have, get ideas or set more detailed preferences.",
      paths: [
        {
          label: "Have a name?",
          title: "Check a domain",
          body: "Enter a domain, such as sajda.dev, to check if it is available.",
          detail: "Check up to 12 exact domains at once, or enter one name with several endings: sajda .com .dev .ai. Sajda checks the domains you entered without generating alternatives instead.",
        },
        {
          label: "Need ideas?",
          title: "Find domain ideas",
          body: "Describe your business or idea to get name suggestions.",
          detail: "Choose domain endings and a naming style. Sajda uses your input to generate suggestions, then checks their availability.",
        },
        {
          label: "Have specific needs?",
          title: "Refine your search",
          body: "Choose the language, length and words you want in a name.",
          detail: "Add up to 250 words about your audience and preferred style. Set name length, language and words to include or avoid before suggestions are generated.",
        },
      ],
      criteriaTitle: "Your preferences guide the suggestions",
      criteriaBody: "Length, language, style and word choices are used when generating names, before their availability is checked.",
      action: "Start a search",
    },
    evidence: {
      eyebrow: "Step 2 · Check",
      title: "Check availability and price",
      lead: "See whether a name is available and what a provider charges, with unknown details clearly marked.",
      flowTitle: "How availability is checked",
      flow: [
        { title: "Select the names", body: "Sajda checks the domains you entered or generated from your idea." },
        { title: "Check the registry", body: "The check uses the route available for each ending, such as RDAP, DAS or WHOIS." },
        { title: "Show the result", body: "A domain is marked available only after an authoritative check confirms it; failed or inconclusive checks remain unknown." },
        { title: "Confirm before buying", body: "Availability can change, so the provider confirms it again before you pay." },
      ],
      priceTitle: "Understand the price",
      priceLead: "Compare sourced prices from selected providers; a name score or estimate is not a registration price.",
      prices: [
        { label: "Price available", title: "Check the source and date", body: "Current sourced prices show their currency and tax treatment when those details are known." },
        { label: "Price unknown", title: "Check with the provider", body: "If no current price source is available, Sajda links to the provider's search instead of guessing a price." },
        { label: "Before you pay", title: "Confirm the full cost", body: "Check promotions, tax, premium pricing, renewal terms and availability with the provider before payment." },
      ],
      providerNote: "Provider links show where you can buy an available domain, not who currently owns or manages a registered one.",
    },
    context: {
      eyebrow: "Step 3 · Compare",
      title: "Compare your best options",
      lead: "Build a Top 10 from verified available names and see why each one ranks.",
      reviewTitle: "Get an explained Top 10",
      reviewBody: "Deep Review ranks only names confirmed available by an authoritative check and shows the parts of each score, not a financial valuation.",
      reviewPoints: [
        "Readability and practical name length",
        "Fit with your theme and selected extension",
        "Registry evidence and price clarity",
        "A visible search signal—not a trademark or legal conclusion",
      ],
      marketTitle: "Past sales are not valuations",
      marketBody: "Historical sales include their reported source; they are not current listings, quotes or valuations of other domains.",
      limitsTitle: "Good to know",
      limits: [
        "Sajda does not clear trademarks, provide legal advice or transfer domain ownership.",
        "Comparisons do not cover every provider, resale market or private sale.",
        "Prices and purchases are not guaranteed before the provider confirms them at checkout.",
        "Availability remains unknown when a registry check cannot confirm it.",
      ],
      developerAction: "Read the developer proposal",
    },
    finish: {
      title: "Ready to find your domain?",
      body: "Start with a name or an idea, then compare your options before buying from a provider.",
      action: "Find a domain name",
      storyAction: "Read the Sajda story",
    },
  },
  sv: {
    documentTitle: "Så hittar du en domän | Sajda",
    navBack: "Tillbaka till sökningen",
    navStory: "Berättelsen om Sajda",
    anchors: [
      { id: "direction", label: "Sök" },
      { id: "evidence", label: "Tillgänglighet och pris" },
      { id: "context", label: "Jämför" },
    ],
    eyebrow: "Så fungerar Sajda",
    title: "Så hittar du en domän",
    lead: "Kontrollera ett namn eller få nya förslag, jämför tillgänglighet och priser och välj var du vill köpa.",
    primaryAction: "Starta en sökning",
    secondaryAction: "Se de tre stegen",
    status: "Sajda hjälper dig att jämföra; leverantören bekräftar tillgänglighet och slutpris före köpet.",
    detailsLabel: "Läs mer",
    resultTitle: "Det här visar ett resultat",
    resultRows: [
      { label: "Domännamn", body: "Namn som utgår från din idé, dina önskemål eller din exakta sökning." },
      { label: "Tillgänglighet", body: "Kontrollens resultat och metod, eller okänd status om svaret inte kan bekräftas." },
      { label: "Pris", body: "Ett aktuellt pris med källa när det finns, annars en länk till leverantörens priskontroll." },
      { label: "Namnpoäng", body: "En förklarad poäng som hjälper dig att jämföra, inte en ekonomisk värdering." },
    ],
    direction: {
      eyebrow: "Steg 1 · Sök",
      title: "Välj hur du vill söka",
      lead: "Kontrollera ett namn du har, få nya förslag eller ange mer detaljerade önskemål.",
      paths: [
        {
          label: "Har du ett namn?",
          title: "Kontrollera en domän",
          body: "Skriv en domän, till exempel sajda.dev, för att se om den är ledig.",
          detail: "Kontrollera upp till 12 exakta domäner samtidigt, eller skriv ett namn med flera ändelser: sajda .com .dev .ai. Sajda kontrollerar domänerna du angav utan att ersätta dem med nya förslag.",
        },
        {
          label: "Behöver du idéer?",
          title: "Få domänförslag",
          body: "Beskriv din verksamhet eller idé för att få namnförslag.",
          detail: "Välj domänändelser och namnstil. Sajda använder din beskrivning för att skapa förslag och kontrollerar sedan om domänerna är lediga.",
        },
        {
          label: "Har du särskilda krav?",
          title: "Anpassa sökningen",
          body: "Välj språk, längd och vilka ord du vill ha med i namnet.",
          detail: "Skriv upp till 250 ord om målgrupp och önskad känsla. Ange namnlängd, språk och ord som ska finnas med eller undvikas innan förslagen skapas.",
        },
      ],
      criteriaTitle: "Dina önskemål styr förslagen",
      criteriaBody: "Längd, språk, stil och ordval används när namnen skapas, innan domänernas tillgänglighet kontrolleras.",
      action: "Starta en sökning",
    },
    evidence: {
      eyebrow: "Steg 2 · Kontrollera",
      title: "Kontrollera tillgänglighet och pris",
      lead: "Se om namnet är ledigt och vad en leverantör tar betalt, med okända uppgifter tydligt markerade.",
      flowTitle: "Så kontrolleras tillgängligheten",
      flow: [
        { title: "Välj namnen", body: "Sajda kontrollerar domänerna du skrev in eller som skapades utifrån din idé." },
        { title: "Kontrollera registret", body: "Kontrollen använder den metod som finns för ändelsen, till exempel RDAP, DAS eller WHOIS." },
        { title: "Visa resultatet", body: "En domän visas som ledig först efter en bekräftad registerkontroll; misslyckade eller oklara kontroller får status okänd." },
        { title: "Bekräfta före köp", body: "Tillgängligheten kan ändras, så leverantören bekräftar den igen innan du betalar." },
      ],
      priceTitle: "Förstå priset",
      priceLead: "Jämför priser med källa från utvalda leverantörer; en namnpoäng eller uppskattning är inte ett registreringspris.",
      prices: [
        { label: "Pris finns", title: "Se källa och datum", body: "Aktuella priser med källa visar valuta och momsstatus när de uppgifterna är kända." },
        { label: "Priset är okänt", title: "Kontrollera hos leverantören", body: "När en aktuell priskälla saknas länkar Sajda till leverantörens sökning i stället för att gissa priset." },
        { label: "Innan du betalar", title: "Bekräfta hela kostnaden", body: "Kontrollera kampanjer, skatt, premiumpriser, förnyelsevillkor och tillgänglighet hos leverantören före betalning." },
      ],
      providerNote: "Leverantörslänkarna visar var du kan köpa en ledig domän, inte vem som äger eller hanterar en registrerad domän.",
    },
    context: {
      eyebrow: "Steg 3 · Jämför",
      title: "Jämför dina bästa alternativ",
      lead: "Skapa en topp 10 av verifierat lediga namn och se varför varje namn får sin placering.",
      reviewTitle: "Få en förklarad topp 10",
      reviewBody: "Djupgranskning rankar bara namn som bekräftats lediga av en tillförlitlig registerkontroll och visar poängens delar, inte en ekonomisk värdering.",
      reviewPoints: [
        "Läsbarhet och praktisk namnlängd",
        "Hur väl namnet passar ditt tema och vald ändelse",
        "Registerkontroll och tydliga prisuppgifter",
        "Söksignaler, inte ett juridiskt besked om namnet",
      ],
      marketTitle: "Tidigare försäljningar är inte värderingar",
      marketBody: "Tidigare försäljningar har en angiven källa; de är inte aktuella annonser, offerter eller värderingar av andra domäner.",
      limitsTitle: "Bra att veta",
      limits: [
        "Sajda godkänner inte varumärken, ger inte juridiska råd och överför inte domänägande.",
        "Jämförelserna omfattar inte alla leverantörer, andrahandsmarknader eller privata affärer.",
        "Priser och köp garanteras inte innan leverantören bekräftar dem i kassan.",
        "Tillgängligheten förblir okänd när registerkontrollen inte kan bekräfta den.",
      ],
      developerAction: "Läs utvecklarförslaget",
    },
    finish: {
      title: "Redo att hitta din domän?",
      body: "Börja med ett namn eller en idé och jämför alternativen innan du köper hos en leverantör.",
      action: "Hitta ett domännamn",
      storyAction: "Läs Sajdas berättelse",
    },
  },
  es: {
    documentTitle: "Cómo encontrar un dominio | Sajda",
    navBack: "Volver a la búsqueda",
    navStory: "La historia de Sajda",
    anchors: [
      { id: "direction", label: "Buscar" },
      { id: "evidence", label: "Disponibilidad y precio" },
      { id: "context", label: "Comparar" },
    ],
    eyebrow: "Cómo funciona Sajda",
    title: "Cómo encontrar un dominio",
    lead: "Comprueba un nombre o descubre ideas, compara disponibilidad y precios y elige dónde comprar.",
    primaryAction: "Iniciar una búsqueda",
    secondaryAction: "Ver los tres pasos",
    status: "Sajda te ayuda a comparar; el proveedor confirma la disponibilidad y el precio final antes de la compra.",
    detailsLabel: "Más detalles",
    resultTitle: "Qué muestra un resultado",
    resultRows: [
      { label: "Nombre de dominio", body: "Nombres basados en tu idea, preferencias o búsqueda exacta." },
      { label: "Disponibilidad", body: "El resultado y método de la comprobación, o un estado desconocido si no se puede confirmar." },
      { label: "Precio", body: "Un precio actual con fuente, cuando lo hay, o un enlace para consultar al proveedor." },
      { label: "Puntuación del nombre", body: "Una puntuación explicada para comparar, no una valoración económica." },
    ],
    direction: {
      eyebrow: "Paso 1 · Buscar",
      title: "Elige cómo buscar",
      lead: "Comprueba un nombre que ya tienes, descubre ideas o indica tus preferencias.",
      paths: [
        { label: "¿Ya tienes un nombre?", title: "Comprueba un dominio", body: "Introduce un dominio, como sajda.dev, para ver si está disponible.", detail: "Comprueba hasta 12 dominios exactos a la vez o escribe un nombre con varias extensiones: sajda .com .dev .ai. Sajda comprueba los dominios introducidos sin sustituirlos por nuevas sugerencias." },
        { label: "¿Necesitas ideas?", title: "Encuentra ideas de dominios", body: "Describe tu negocio o idea para recibir propuestas de nombres.", detail: "Elige extensiones y un estilo de nombre. Sajda genera sugerencias a partir de tu descripción y comprueba su disponibilidad." },
        { label: "¿Tienes requisitos concretos?", title: "Ajusta tu búsqueda", body: "Elige el idioma, la longitud y las palabras que quieres en el nombre.", detail: "Añade hasta 250 palabras sobre tu público y el estilo deseado. Define la longitud, el idioma y las palabras que incluir o evitar antes de generar sugerencias." },
      ],
      criteriaTitle: "Tus preferencias guían las sugerencias",
      criteriaBody: "La longitud, el idioma, el estilo y las palabras se utilizan al generar nombres, antes de comprobar su disponibilidad.",
      action: "Iniciar una búsqueda",
    },
    evidence: {
      eyebrow: "Paso 2 · Comprobar",
      title: "Comprueba disponibilidad y precio",
      lead: "Consulta si el nombre está disponible y cuánto cobra un proveedor, con los datos desconocidos claramente indicados.",
      flowTitle: "Cómo se comprueba la disponibilidad",
      flow: [
        { title: "Seleccionar los nombres", body: "Sajda comprueba los dominios introducidos o generados a partir de tu idea." },
        { title: "Consultar el registro", body: "La comprobación utiliza el método disponible para cada extensión, como RDAP, DAS o WHOIS." },
        { title: "Mostrar el resultado", body: "Un dominio solo figura como disponible tras una confirmación autorizada del registro; las comprobaciones fallidas o no concluyentes quedan como desconocidas." },
        { title: "Confirmar antes de comprar", body: "La disponibilidad puede cambiar, por lo que el proveedor la confirma de nuevo antes del pago." },
      ],
      priceTitle: "Entiende el precio",
      priceLead: "Compara precios con fuente de proveedores seleccionados; una puntuación o estimación no es un precio de registro.",
      prices: [
        { label: "Precio disponible", title: "Consulta la fuente y la fecha", body: "Los precios actuales con fuente muestran la moneda y los impuestos cuando esos datos se conocen." },
        { label: "Precio desconocido", title: "Consulta al proveedor", body: "Si no hay una fuente de precio actual, Sajda enlaza a la búsqueda del proveedor en lugar de adivinar el importe." },
        { label: "Antes de pagar", title: "Confirma el coste total", body: "Confirma promociones, impuestos, precios premium, renovación y disponibilidad con el proveedor antes del pago." },
      ],
      providerNote: "Los enlaces muestran dónde comprar un dominio disponible, no quién posee o gestiona uno registrado.",
    },
    context: {
      eyebrow: "Paso 3 · Comparar",
      title: "Compara tus mejores opciones",
      lead: "Crea un Top 10 de nombres con disponibilidad verificada y descubre el motivo de cada posición.",
      reviewTitle: "Obtén un Top 10 explicado",
      reviewBody: "La revisión profunda solo clasifica nombres confirmados disponibles por una comprobación autorizada y muestra las partes de su puntuación, no una valoración económica.",
      reviewPoints: ["Legibilidad y longitud práctica", "Ajuste con tu tema y extensión elegida", "Evidencia de registro y claridad de precio", "Una señal de búsqueda visible, no una conclusión legal o de marca"],
      marketTitle: "Las ventas anteriores no son valoraciones",
      marketBody: "Las ventas históricas indican la fuente que las reporta; no son anuncios actuales, cotizaciones ni valoraciones de otros dominios.",
      limitsTitle: "Qué debes saber",
      limits: ["Sajda no confirma derechos de marca, no ofrece asesoramiento legal ni transfiere la propiedad de dominios.", "Las comparaciones no incluyen todos los proveedores, mercados de reventa o ventas privadas.", "Los precios y las compras no se garantizan hasta la confirmación del proveedor antes del pago.", "La disponibilidad queda como desconocida cuando el registro no puede confirmarla."],
      developerAction: "Leer la propuesta para desarrolladores",
    },
    finish: {
      title: "¿Listo para encontrar tu dominio?",
      body: "Empieza con un nombre o una idea y compara las opciones antes de comprar a un proveedor.",
      action: "Encontrar un dominio",
      storyAction: "Leer la historia de Sajda",
    },
  },
  fr: {
    documentTitle: "Comment trouver un domaine | Sajda",
    navBack: "Retour à la recherche",
    navStory: "L’histoire de Sajda",
    anchors: [
      { id: "direction", label: "Rechercher" },
      { id: "evidence", label: "Disponibilité et prix" },
      { id: "context", label: "Comparer" },
    ],
    eyebrow: "Comment Sajda fonctionne",
    title: "Comment trouver un domaine",
    lead: "Vérifiez un nom ou trouvez des idées, comparez disponibilité et prix, puis choisissez où acheter.",
    primaryAction: "Lancer une recherche",
    secondaryAction: "Voir les trois étapes",
    status: "Sajda vous aide à comparer ; le prestataire confirme la disponibilité et le prix final avant l’achat.",
    detailsLabel: "En savoir plus",
    resultTitle: "Ce qu’affiche un résultat",
    resultRows: [
      { label: "Nom de domaine", body: "Des noms issus de votre idée, de vos préférences ou de votre recherche exacte." },
      { label: "Disponibilité", body: "Le résultat et la méthode du contrôle, ou un statut inconnu si la réponse ne peut être confirmée." },
      { label: "Prix", body: "Un prix actuel sourcé, s’il existe, ou un lien pour consulter le prestataire." },
      { label: "Score du nom", body: "Un score expliqué pour comparer, et non une estimation financière." },
    ],
    direction: {
      eyebrow: "Étape 1 · Rechercher",
      title: "Choisissez comment rechercher",
      lead: "Vérifiez un nom que vous avez, trouvez des idées ou précisez vos critères.",
      paths: [
        { label: "Vous avez un nom ?", title: "Vérifier un domaine", body: "Saisissez un domaine, comme sajda.dev, pour savoir s’il est disponible.", detail: "Vérifiez jusqu’à 12 domaines exacts à la fois, ou saisissez un nom avec plusieurs extensions : sajda .com .dev .ai. Sajda vérifie les domaines saisis sans les remplacer par de nouvelles suggestions." },
        { label: "Besoin d’idées ?", title: "Trouver des idées de domaines", body: "Décrivez votre activité ou votre idée pour obtenir des suggestions de noms.", detail: "Choisissez des extensions et un style de nom. Sajda génère des suggestions à partir de votre description, puis vérifie leur disponibilité." },
        { label: "Des besoins précis ?", title: "Affiner la recherche", body: "Choisissez la langue, la longueur et les mots souhaités dans le nom.", detail: "Ajoutez jusqu’à 250 mots sur votre public et le style recherché. Précisez la longueur, la langue et les mots à inclure ou éviter avant de générer des suggestions." },
      ],
      criteriaTitle: "Vos préférences guident les suggestions",
      criteriaBody: "La longueur, la langue, le style et les mots sont utilisés pour générer les noms, avant de vérifier leur disponibilité.",
      action: "Lancer une recherche",
    },
    evidence: {
      eyebrow: "Étape 2 · Vérifier",
      title: "Vérifiez la disponibilité et le prix",
      lead: "Découvrez si le nom est disponible et combien facture un prestataire, avec les informations inconnues clairement indiquées.",
      flowTitle: "Comment la disponibilité est vérifiée",
      flow: [
        { title: "Choisir les noms", body: "Sajda vérifie les domaines saisis ou générés à partir de votre idée." },
        { title: "Consulter le registre", body: "Le contrôle utilise la méthode disponible pour chaque extension, comme RDAP, DAS ou WHOIS." },
        { title: "Afficher le résultat", body: "Un domaine est indiqué disponible uniquement après un contrôle faisant autorité ; les contrôles échoués ou non concluants restent inconnus." },
        { title: "Confirmer avant l’achat", body: "La disponibilité peut changer ; le prestataire la confirme donc à nouveau avant le paiement." },
      ],
      priceTitle: "Comprendre le prix",
      priceLead: "Comparez les prix sourcés de prestataires sélectionnés ; un score ou une estimation n’est pas un prix d’enregistrement.",
      prices: [
        { label: "Prix disponible", title: "Consulter la source et la date", body: "Les prix actuels sourcés précisent la devise et les taxes lorsque ces informations sont connues." },
        { label: "Prix inconnu", title: "Consulter le prestataire", body: "Sans source de prix actuelle, Sajda renvoie vers la recherche du prestataire au lieu de deviner un montant." },
        { label: "Avant de payer", title: "Confirmer le coût total", body: "Confirmez promotions, taxes, prix premium, conditions de renouvellement et disponibilité auprès du prestataire avant le paiement." },
      ],
      providerNote: "Les liens indiquent où acheter un domaine disponible, pas qui possède ou gère un domaine déjà enregistré.",
    },
    context: {
      eyebrow: "Étape 3 · Comparer",
      title: "Comparez vos meilleures options",
      lead: "Créez un Top 10 de noms dont la disponibilité a été vérifiée et découvrez pourquoi chacun est classé.",
      reviewTitle: "Obtenir un Top 10 expliqué",
      reviewBody: "L’analyse approfondie ne classe que les noms confirmés disponibles par un contrôle faisant autorité et détaille leur score, sans estimation financière.",
      reviewPoints: ["Lisibilité et longueur pratique", "Adéquation avec votre thème et extension choisie", "Preuve du registre et clarté du prix", "Un signal de recherche visible, pas une conclusion juridique ou de marque"],
      marketTitle: "Les ventes passées ne sont pas des estimations",
      marketBody: "Les ventes passées citent leur source ; elles ne sont ni des annonces actuelles, ni des devis, ni des estimations d’autres domaines.",
      limitsTitle: "Bon à savoir",
      limits: ["Sajda ne valide pas les droits de marque, ne donne pas de conseil juridique et ne transfère pas la propriété des domaines.", "Les comparaisons ne couvrent pas tous les prestataires, marchés de revente ou ventes privées.", "Les prix et les achats ne sont pas garantis avant confirmation par le prestataire au paiement.", "La disponibilité reste inconnue si le contrôle du registre ne peut pas la confirmer."],
      developerAction: "Lire la proposition développeurs",
    },
    finish: {
      title: "Prêt à trouver votre domaine ?",
      body: "Commencez par un nom ou une idée et comparez les options avant d’acheter auprès d’un prestataire.",
      action: "Trouver un domaine",
      storyAction: "Lire l’histoire de Sajda",
    },
  },
  zh: {
    documentTitle: "如何找到域名 | Sajda",
    navBack: "返回搜索",
    navStory: "Sajda 的故事",
    anchors: [
      { id: "direction", label: "搜索" },
      { id: "evidence", label: "可用性与价格" },
      { id: "context", label: "比较" },
    ],
    eyebrow: "Sajda 如何工作",
    title: "如何找到域名",
    lead: "查询已有名称或获取新灵感，比较可用性与价格，再选择购买渠道。",
    primaryAction: "开始搜索",
    secondaryAction: "查看三个步骤",
    status: "Sajda 帮助你比较；服务商会在购买前确认可用性与最终价格。",
    detailsLabel: "了解更多",
    resultTitle: "搜索结果包含什么",
    resultRows: [
      { label: "域名", body: "根据你的想法、偏好或精确查询提供名称。" },
      { label: "可用性", body: "显示检查结果与方法，无法确认时标为未知。" },
      { label: "价格", body: "有可靠的最新来源时显示价格，否则提供服务商查询链接。" },
      { label: "名称评分", body: "通过可解释的评分帮助你比较，但评分不是财务估值。" },
    ],
    direction: {
      eyebrow: "第 1 步 · 搜索",
      title: "选择搜索方式",
      lead: "查询已有名称、获取新灵感，或设置更详细的偏好。",
      paths: [
        { label: "已有名称？", title: "查询域名", body: "输入一个域名，例如 sajda.dev，查看是否可注册。", detail: "一次最多查询 12 个精确域名，也可以输入同一名称的多个后缀：sajda .com .dev .ai。Sajda 会检查你输入的域名，不会用新建议代替。" },
        { label: "需要灵感？", title: "获取域名建议", body: "描述你的业务或想法，即可获取名称建议。", detail: "选择域名后缀与命名风格，Sajda 会根据你的描述生成建议，并检查可用性。" },
        { label: "有具体要求？", title: "细化搜索条件", body: "选择名称的语言、长度以及希望包含的词语。", detail: "最多添加 250 个词，描述受众与期望风格；在生成建议前设置名称长度、语言，以及需要包含或避开的词语。" },
      ],
      criteriaTitle: "根据你的偏好生成建议",
      criteriaBody: "长度、语言、风格与词语要求会用于生成名称，然后再检查域名是否可注册。",
      action: "开始搜索",
    },
    evidence: {
      eyebrow: "第 2 步 · 检查",
      title: "检查可用性与价格",
      lead: "查看名称是否可注册以及服务商的报价，尚未确认的信息会明确标出。",
      flowTitle: "如何检查可用性",
      flow: [
        { title: "选择名称", body: "Sajda 会检查你输入的域名，或根据你的想法生成的域名。" },
        { title: "查询注册局", body: "根据后缀使用可用的查询方法，例如 RDAP、DAS 或 WHOIS。" },
        { title: "显示结果", body: "只有权威检查确认后，域名才会标为可注册；检查失败或结果不明确时，状态保持未知。" },
        { title: "购买前再次确认", body: "可用性可能变化，因此服务商会在付款前再次确认。" },
      ],
      priceTitle: "看懂价格",
      priceLead: "比较所选服务商提供的有来源价格；名称评分或估算并不是注册价格。",
      prices: [
        { label: "有价格信息", title: "查看来源与日期", body: "有最新来源的价格会在信息已知时显示币种和含税情况。" },
        { label: "价格未知", title: "向服务商查询", body: "没有最新价格来源时，Sajda 会链接到服务商的搜索页，而不会猜测金额。" },
        { label: "付款前", title: "确认全部费用", body: "付款前请向服务商确认促销、税费、溢价域名价格、续费条款及可用性。" },
      ],
      providerNote: "服务商链接显示可注册域名的购买渠道，不表示已注册域名由谁持有或管理。",
    },
    context: {
      eyebrow: "第 3 步 · 比较",
      title: "比较最佳候选",
      lead: "从已确认可注册的域名中选出 Top 10，并了解每个名称的排名理由。",
      reviewTitle: "获取有解释的 Top 10",
      reviewBody: "深度审阅只对经过权威检查确认可注册的名称排名，并展示评分的组成部分，而不是财务估值。",
      reviewPoints: ["易读性和实用名称长度", "与你的主题和所选后缀的匹配", "注册局依据和价格清晰度", "可见的搜索信号，而不是商标或法律结论"],
      marketTitle: "历史成交价不等于估值",
      marketBody: "历史成交记录会注明报道来源；它们不是当前挂牌、报价或其他域名的估值。",
      limitsTitle: "你需要了解",
      limits: ["Sajda 不确认商标权、不提供法律意见，也不转让域名所有权。", "比较结果不涵盖所有服务商、转售市场或私人交易。", "在服务商结账确认之前，不保证价格或购买结果。", "注册局检查无法确认可用性时，状态保持未知。"],
      developerAction: "阅读开发者方案",
    },
    finish: {
      title: "准备好寻找你的域名了吗？",
      body: "从一个名称或想法开始，比较候选，再向服务商购买。",
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
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-bold leading-tight tracking-[-0.035em] text-foreground sm:text-4xl">{title}</h2>
      {lead && <p className="mt-3 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">{lead}</p>}
    </div>
  );
}

function DetailDisclosure({ label, subject, children }: { label: string; subject: string; children: ReactNode }) {
  return (
    <details className="group mt-5 border-t border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-3 text-sm font-semibold text-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <span>{label}<span className="sr-only">: {subject}</span></span>
        <ChevronDown className="h-4 w-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-1 pt-1 text-sm leading-6 text-muted-foreground">{children}</div>
    </details>
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
        <div className="mx-auto flex min-h-[4.75rem] w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-7">
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
              <h1 className="mt-6 max-w-[18ch] text-balance text-4xl font-bold leading-[1.08] tracking-[-0.045em] text-foreground sm:text-6xl">
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
                <article key={path.label} data-search-path={index} className="sajda-surface flex min-w-0 flex-col p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="text-xl font-bold leading-snug tracking-[-0.025em] text-foreground">{path.title}</h3>
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-6 text-muted-foreground">{path.body}</p>
                  <DetailDisclosure label={copy.detailsLabel} subject={path.title}>
                    <p>{path.detail}</p>
                  </DetailDisclosure>
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
                      <h4 className="text-base font-semibold text-foreground">{price.label}</h4>
                      <p className="mt-1 text-sm font-medium text-foreground/80">{price.title}</p>
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
              <DetailDisclosure label={copy.detailsLabel} subject={copy.context.reviewTitle}>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {copy.context.reviewPoints.map((point) => (
                    <li key={point} className="flex gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </DetailDisclosure>
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
