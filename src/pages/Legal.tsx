import { useEffect } from "react";
import {
  Accessibility,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cookie,
  Database,
  FileText,
  KeyRound,
  LockKeyhole,
  Scale,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import AiPrivacyControl from "@/components/AiPrivacyControl";
import { isNativeApp } from "@/lib/appSurface";
import { Button } from "@/components/ui/button";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";
import { legalDataCopy } from "@/i18n/legalDataCopy";
import { IMY_COMPLAINT_URL, legalRightsCopy } from "@/i18n/legalRightsCopy";

type LegalSection = {
  eyebrow: string;
  title: string;
  lead: string;
};

type LegalCopy = {
  documentTitle: string;
  navLabel: string;
  backToSearch: string;
  anchors: Array<{ id: "privacy" | "terms" | "cookies" | "accessibility"; label: string }>;
  eyebrow: string;
  title: string;
  lead: string;
  note: string;
  searchAction: string;
  howItWorksAction: string;
  atAGlance: string;
  principles: Array<{ title: string; body: string }>;
  privacy: LegalSection & {
    localTitle: string;
    localBody: string;
    serviceTitle: string;
    serviceBody: string;
    accountTitle: string;
    accountBody: string;
    keyTitle: string;
    keyBody: string;
  };
  terms: LegalSection & {
    items: Array<{ title: string; body: string }>;
  };
  cookies: LegalSection & {
    items: Array<{ title: string; body: string }>;
    browserControl: string;
  };
  accessibility: LegalSection & {
    items: Array<{ title: string; body: string }>;
  };
  close: {
    title: string;
    body: string;
    action: string;
  };
};

const legalCopy: Record<Language, LegalCopy> = {
  en: {
    documentTitle: "Legal & Privacy Center — Sajda",
    navLabel: "Legal navigation",
    backToSearch: "Back to search",
    anchors: [
      { id: "privacy", label: "Privacy" },
      { id: "terms", label: "Product terms" },
      { id: "cookies", label: "Browser storage" },
      { id: "accessibility", label: "Accessibility" },
    ],
    eyebrow: "Legal & Privacy Center",
    title: "Your data, your choices, and our terms.",
    lead: "Sajda is built to help you discover, check, compare, and keep domain opportunities in view. This page explains what the current product handles, where evidence comes from, and what remains your decision.",
    note: "Availability, prices, and market signals can change. A registry or provider checkout remains the final source of truth before a purchase.",
    searchAction: "Start a search",
    howItWorksAction: "How Sajda works",
    atAGlance: "At a glance",
    principles: [
      { title: "Information with a clear purpose", body: "We use the information needed to run a search, show its evidence, and preserve the choices you ask us to keep." },
      { title: "Sources and uncertainty stay visible", body: "Registry status, provider pricing, and market signals are shown with their source or uncertainty—not turned into guarantees." },
      { title: "Keys stay out of the browser", body: "Developer credentials belong on your server. Do not put a Sajda API key in client-side code." },
    ],
    privacy: {
      eyebrow: "Privacy",
      title: "What Sajda handles when you use it.",
      lead: "The product separates browser-only preferences from information sent to a service to complete a search. Optional account features add authenticated storage when they are configured.",
      localTitle: "In your browser",
      localBody: "Sajda uses device storage for language, search choices, AI permission, wishlists and local marketplace drafts. Guest search results can be restored from this tab’s session storage for 30 minutes; the snapshot excludes your brief, account details and credentials. The restore window does not guarantee deletion after 30 minutes. Signed-in searches are not saved in that guest snapshot. You can clear website data in your browser settings.",
      serviceTitle: "During a search",
      serviceBody: "Your query, extensions and search settings go to Sajda’s service to produce results. Domain checks and quotes send the relevant names to configured registries, DNS and registrar services, which can include Cloudflare, Porkbun and Loopia. Network requests also expose technical request information to receiving services. These checks still contact external services when optional AI is off. Market signals are source-labeled context.",
      accountTitle: "When you sign in",
      accountBody: "Account services run on Vercel with data stored in Neon. They handle your email, account identifier, password hash, verification records and session data, including IP address and browser information, to sign you in and protect access. Website sign-in uses a secure HTTP-only cookie. The iPhone app stores its sign-in credential in iOS Keychain. Resend delivers account verification, recovery and deletion messages to your email address.",
      keyTitle: "For developers",
      keyBody: "API keys authenticate server-to-server requests. Keep them in server-side environment variables or a secret manager; never expose them in a browser bundle, public repository, or client-side storage.",
    },
    terms: {
      eyebrow: "Product terms",
      title: "Sajda helps you decide. It does not decide for you.",
      lead: "The current product is a search, evidence, and discovery layer for domains. Use its results as decision support, then confirm the transaction at the relevant provider or marketplace flow.",
      items: [
        { title: "Search results", body: "A result is based on the input, selected route, and sources available at the time of the request. A visible status is not a reservation and does not create a right to register a domain." },
        { title: "Prices and signals", body: "Provider prices, screening values, and market signals are context—not a quote, valuation, or promise of resale value. Tax, premium status, renewal terms, and availability can change at checkout." },
        { title: "Marketplace listings", body: "A listing describes an offered domain. Review its details and the applicable transaction flow before committing. Listing visibility does not by itself confirm ownership, transferability, or completion." },
        { title: "Public and developer API", body: "Use the published API contract and keep credentials server-side. Respect rate limits and do not use the service to bypass registry, provider, or third-party restrictions." },
      ],
    },
    cookies: {
      eyebrow: "Browser storage",
      title: "Preferences should be easy to find—and easy to clear.",
      lead: "The current app uses browser storage to make the workspace feel continuous. It is controlled in your browser, not by a hidden in-product switch.",
      items: [
        { title: "Language and presentation", body: "Your selected interface language can be remembered so the product does not ask you to choose it on every visit." },
        { title: "Search workspace", body: "Selected extensions, search settings, and local search or wishlist choices may be kept in browser storage to preserve your working context." },
        { title: "How to reset", body: "Use your browser’s site-data or local-storage controls for Sajda to remove locally stored preferences and lists. Clearing this data can remove locally saved items." },
      ],
      browserControl: "Manage this in browser settings",
    },
    accessibility: {
      eyebrow: "Accessibility",
      title: "An interface everyone can understand.",
      lead: "Sajda aims for a calm, readable interface with semantic structure, keyboard access, focus visibility, and information that does not rely on color alone. We keep improving the product as it evolves.",
      items: [
        { title: "Navigation", body: "Primary pages, links, controls, and these section anchors are designed to work with a keyboard and a visible focus state." },
        { title: "Clarity", body: "Search status, source labels, and uncertainty are written as text so important meaning is not communicated by color or decoration alone." },
        { title: "Motion and layout", body: "The product keeps interaction feedback purposeful and provides a responsive layout intended to remain usable across common screen sizes." },
      ],
    },
    close: {
      title: "A good search leaves the next step clear.",
      body: "Bring an exact domain, a reference word, or a detailed brief. Sajda keeps the evidence visible while you decide what is worth securing.",
      action: "Open domain search",
    },
  },
  sv: {
    documentTitle: "Juridik & integritet — Sajda",
    navLabel: "Juridisk navigering",
    backToSearch: "Tillbaka till sökningen",
    anchors: [
      { id: "privacy", label: "Integritet" },
      { id: "terms", label: "Produktvillkor" },
      { id: "cookies", label: "Webblagring" },
      { id: "accessibility", label: "Tillgänglighet" },
    ],
    eyebrow: "Juridik & integritet",
    title: "Dina uppgifter, dina val och våra villkor.",
    lead: "Sajda hjälper dig att hitta, kontrollera, jämföra och spara intressanta domäner. Här förklarar vi vad den aktuella produkten hanterar, var underlaget kommer ifrån och vad som fortfarande är ditt beslut.",
    note: "Tillgänglighet, priser och marknadssignaler kan ändras. Domänregistret eller leverantörens kassa är den slutliga källan före ett köp.",
    searchAction: "Starta en sökning",
    howItWorksAction: "Så fungerar Sajda",
    atAGlance: "I korthet",
    principles: [
      { title: "Uppgifter med ett tydligt syfte", body: "Vi använder uppgifterna som behövs för att köra en sökning, visa dess underlag och behålla de val du ber oss spara." },
      { title: "Källor och osäkerheter framgår", body: "Status från domänregistret, leverantörspriser och marknadssignaler visas med källa eller osäkerhet—inte som garantier." },
      { title: "Nycklar hör inte hemma i webbläsaren", body: "Utvecklaruppgifter hör hemma på din server. Lägg aldrig en Sajda API-nyckel i klientkod." },
    ],
    privacy: {
      eyebrow: "Integritet",
      title: "Vad Sajda hanterar när du använder tjänsten.",
      lead: "Produkten skiljer mellan inställningar som bara finns i webbläsaren och information som skickas till en tjänst för att slutföra en sökning. Valfria kontofunktioner lägger till autentiserad lagring när de är konfigurerade.",
      localTitle: "I din webbläsare",
      localBody: "Sajda använder enhetens lagring för språk, sökval, AI-tillstånd, önskelistor och lokala marknadsplatsutkast. Gästsökningar kan återställas från flikens sessionslagring i 30 minuter; kopian innehåller inte din beskrivning, dina kontouppgifter eller inloggningsuppgifter. Återställningstiden innebär inte garanterad radering efter 30 minuter. Inloggade sökningar sparas inte i denna gästkopia. Du kan rensa webbplatsdata i webbläsarens inställningar.",
      serviceTitle: "Under en sökning",
      serviceBody: "Din sökfråga, dina ändelser och sökinställningar skickas till Sajdas tjänst för att ta fram resultat. Domänkontroller och prisförfrågningar skickar berörda namn till konfigurerade domänregister, DNS- och registratortjänster, som kan omfatta Cloudflare, Porkbun och Loopia. Mottagande tjänster ser också teknisk information om nätverksanropen. Kontrollerna använder externa tjänster även när valfri AI är avstängd. Marknadssignaler visas med angivna källor.",
      accountTitle: "När du loggar in",
      accountBody: "Kontotjänsterna körs på Vercel med lagring i Neon. De hanterar e-postadress, konto-id, lösenordshash, verifieringsposter och sessionsdata, inklusive IP-adress och webbläsarinformation, för inloggning och åtkomstskydd. Webbplatsen använder en säker HTTP-only-kaka för inloggning. iPhone-appen lagrar sin inloggningsuppgift i iOS Keychain. Resend levererar mejl för verifiering, återställning och kontoradering till din e-postadress.",
      keyTitle: "För utvecklare",
      keyBody: "API-nycklar autentiserar server-till-server-anrop. Förvara dem i serverbaserade miljövariabler eller en hemlighetshanterare; exponera dem aldrig i webbläsarpaket, öppna kodarkiv eller klientlagring.",
    },
    terms: {
      eyebrow: "Produktvillkor",
      title: "Sajda hjälper dig att välja. Det väljer inte åt dig.",
      lead: "Sajda är ett verktyg för att hitta och undersöka domäner. Använd resultaten som beslutsstöd och bekräfta sedan transaktionen hos rätt leverantör eller marknadsplatsflöde.",
      items: [
        { title: "Sökresultat", body: "Ett resultat utgår från inmatning, valt sökspår och de källor som finns när frågan skickas. En visad status är ingen reservation och ger ingen rätt att registrera en domän." },
        { title: "Priser och signaler", body: "Leverantörspriser, screeningvärden och marknadssignaler är underlag—inte en offert, värdering eller ett löfte om andrahandsvärde. Skatt, premiumstatus, förnyelsevillkor och tillgänglighet kan ändras i kassan." },
        { title: "Marknadsplatsobjekt", body: "Ett objekt beskriver en erbjuden domän. Granska dess detaljer och tillämpligt transaktionsflöde innan du förbinder dig. Synlighet i listan bekräftar inte i sig ägande, överlåtbarhet eller genomförd affär." },
        { title: "Publikt API och utvecklar-API", body: "Använd det publicerade API-kontraktet och håll behörigheter på serversidan. Respektera hastighetsgränser och använd inte tjänsten för att kringgå begränsningar hos domänregister, leverantörer eller andra parter." },
      ],
    },
    cookies: {
      eyebrow: "Webblagring",
      title: "Inställningar ska vara lätta att hitta—och lätta att rensa.",
      lead: "Den aktuella appen använder lagring i webbläsaren för att arbetsytan ska kännas sammanhängande. Den styrs i din webbläsare, inte av en dold knapp i produkten.",
      items: [
        { title: "Språk och visning", body: "Ditt valda gränssnittsspråk kan kommas ihåg så att produkten inte ber dig välja det vid varje besök." },
        { title: "Sökarbetsyta", body: "Valda ändelser, sökinställningar och lokala sök- eller önskelisteval kan behållas i webbläsarlagring för att bevara ditt arbetssammanhang." },
        { title: "Så återställer du", body: "Använd webbläsarens kontroller för webbplatsdata eller lokal lagring för Sajda för att ta bort lokalt sparade inställningar och listor. Att rensa datan kan ta bort lokalt sparade objekt." },
      ],
      browserControl: "Hantera detta i webbläsarens inställningar",
    },
    accessibility: {
      eyebrow: "Tillgänglighet",
      title: "Ett gränssnitt som alla kan förstå.",
      lead: "Sajda strävar efter ett lugnt och läsbart gränssnitt med semantisk struktur, tangentbordsåtkomst, synlig fokusmarkering och information som inte bara bygger på färg. Vi fortsätter att förbättra produkten när den utvecklas.",
      items: [
        { title: "Navigering", body: "Primära sidor, länkar, kontroller och dessa sektionslänkar är utformade för att fungera med tangentbord och en synlig fokusmarkering." },
        { title: "Tydlighet", body: "Sökstatus, källmärkning och osäkerhet skrivs ut som text så att viktig betydelse inte enbart förmedlas med färg eller dekoration." },
        { title: "Rörelse och layout", body: "Produkten håller återkoppling vid interaktion meningsfull och har en responsiv layout som är avsedd att fungera på vanliga skärmstorlekar." },
      ],
    },
    close: {
      title: "En bra sökning lämnar nästa steg tydligt.",
      body: "Kom med en exakt domän, ett referensord eller en detaljerad brief. Sajda håller underlaget synligt medan du avgör vad som är värt att säkra.",
      action: "Öppna domänsökning",
    },
  },
  es: {
    documentTitle: "Centro legal y de privacidad — Sajda",
    navLabel: "Navegación legal",
    backToSearch: "Volver a la búsqueda",
    anchors: [
      { id: "privacy", label: "Privacidad" },
      { id: "terms", label: "Términos del producto" },
      { id: "cookies", label: "Almacenamiento" },
      { id: "accessibility", label: "Accesibilidad" },
    ],
    eyebrow: "Centro legal y de privacidad",
    title: "Tus datos, tus decisiones y nuestras condiciones.",
    lead: "Sajda está diseñado para ayudarte a descubrir, comprobar, comparar y mantener a la vista oportunidades de dominio. Esta página explica qué gestiona el producto actual, de dónde procede la evidencia y qué sigue siendo tu decisión.",
    note: "La disponibilidad, los precios y las señales de mercado pueden cambiar. El registro o la compra con el proveedor sigue siendo la fuente final antes de pagar.",
    searchAction: "Iniciar una búsqueda",
    howItWorksAction: "Cómo funciona Sajda",
    atAGlance: "En resumen",
    principles: [
      { title: "Información con un propósito claro", body: "Usamos la información necesaria para realizar una búsqueda, mostrar su evidencia y conservar las elecciones que nos pides guardar." },
      { title: "Fuentes e incertidumbres visibles", body: "El estado del registro, los precios del proveedor y las señales de mercado se muestran con su fuente o incertidumbre, no como garantías." },
      { title: "Las claves no van en el navegador", body: "Las credenciales de desarrollador pertenecen a tu servidor. No incluyas una clave API de Sajda en código del cliente." },
    ],
    privacy: {
      eyebrow: "Privacidad",
      title: "Qué gestiona Sajda cuando lo utilizas.",
      lead: "El producto diferencia entre preferencias exclusivas del navegador e información enviada a un servicio para completar una búsqueda. Las funciones opcionales de cuenta añaden almacenamiento autenticado cuando están configuradas.",
      localTitle: "En tu navegador",
      localBody: "Sajda utiliza el almacenamiento del dispositivo para el idioma, las opciones de búsqueda, el permiso de IA, las listas y los borradores locales del marketplace. Los resultados de invitados pueden restaurarse desde la sesión de esta pestaña durante 30 minutos; la copia no incluye tu descripción, datos de cuenta ni credenciales. Este plazo no garantiza la eliminación a los 30 minutos. Las búsquedas con sesión iniciada no se guardan en esa copia de invitado. Puedes borrar los datos del sitio en los ajustes del navegador.",
      serviceTitle: "Durante una búsqueda",
      serviceBody: "La consulta, las extensiones y los ajustes se envían al servicio de Sajda para obtener resultados. Las comprobaciones de dominios y precios envían los nombres pertinentes a los registros y servicios de DNS y registradores configurados, que pueden incluir Cloudflare, Porkbun y Loopia. Los destinatarios también reciben información técnica de las solicitudes. Estas consultas usan servicios externos aunque la IA opcional esté desactivada. Las señales de mercado indican su fuente.",
      accountTitle: "Cuando inicias sesión",
      accountBody: "Los servicios de cuenta funcionan en Vercel y almacenan datos en Neon. Gestionan correo, identificador de cuenta, hash de contraseña, verificaciones y datos de sesión, incluida la dirección IP e información del navegador, para iniciar sesión y proteger el acceso. La web usa una cookie segura HTTP-only; la app de iPhone guarda su credencial en iOS Keychain. Resend entrega los mensajes de verificación, recuperación y eliminación a tu correo.",
      keyTitle: "Para desarrolladores",
      keyBody: "Las claves API autentican solicitudes de servidor a servidor. Guárdalas en variables de entorno del servidor o en un gestor de secretos; nunca las expongas en un paquete del navegador, repositorio público o almacenamiento del cliente.",
    },
    terms: {
      eyebrow: "Términos del producto",
      title: "Sajda te ayuda a decidir. No decide por ti.",
      lead: "Sajda es una herramienta para encontrar e investigar dominios. Usa los resultados como apoyo a la decisión y confirma la transacción en el proveedor o flujo de marketplace correspondiente.",
      items: [
        { title: "Resultados de búsqueda", body: "Un resultado se basa en la entrada, la ruta elegida y las fuentes disponibles en el momento de la solicitud. Un estado visible no es una reserva ni crea un derecho a registrar un dominio." },
        { title: "Precios y señales", body: "Los precios del proveedor, indicadores de evaluación inicial y señales de mercado son contexto; no son una cotización, tasación ni promesa de valor de reventa. Los impuestos, el estado premium, las renovaciones y la disponibilidad pueden cambiar en la compra." },
        { title: "Listados del marketplace", body: "Un listado describe un dominio ofrecido. Revisa sus detalles y el flujo de transacción aplicable antes de comprometerte. La visibilidad del listado no confirma por sí sola propiedad, transferibilidad ni finalización." },
        { title: "API pública y de desarrolladores", body: "Usa el contrato API publicado y conserva las credenciales en el servidor. Respeta los límites de uso y no utilices el servicio para eludir restricciones de registros, proveedores o terceros." },
      ],
    },
    cookies: {
      eyebrow: "Almacenamiento del navegador",
      title: "Las preferencias deben ser fáciles de encontrar y de borrar.",
      lead: "La aplicación actual usa almacenamiento del navegador para que el espacio de trabajo se sienta continuo. Se controla en tu navegador, no mediante un interruptor oculto en el producto.",
      items: [
        { title: "Idioma y presentación", body: "El idioma de interfaz que selecciones puede recordarse para que el producto no te pida elegirlo en cada visita." },
        { title: "Espacio de búsqueda", body: "Las extensiones seleccionadas, ajustes de búsqueda y elecciones locales de búsqueda o lista de deseos pueden conservarse en el almacenamiento del navegador para mantener tu contexto de trabajo." },
        { title: "Cómo restablecer", body: "Usa los controles de datos del sitio o almacenamiento local de tu navegador para Sajda y elimina preferencias y listas locales. Borrar estos datos puede eliminar elementos guardados localmente." },
      ],
      browserControl: "Gestiona esto en los ajustes del navegador",
    },
    accessibility: {
      eyebrow: "Accesibilidad",
      title: "Una interfaz que todos puedan entender.",
      lead: "Sajda busca una interfaz tranquila y legible con estructura semántica, acceso por teclado, foco visible e información que no dependa solo del color. Seguimos mejorando el producto a medida que evoluciona.",
      items: [
        { title: "Navegación", body: "Las páginas, enlaces, controles y anclas de esta sección están diseñados para funcionar con teclado y foco visible." },
        { title: "Claridad", body: "El estado de búsqueda, las etiquetas de fuente y la incertidumbre se expresan como texto para que el significado importante no dependa únicamente del color o la decoración." },
        { title: "Movimiento y diseño", body: "El producto procura que la respuesta a la interacción sea útil y ofrece un diseño adaptable pensado para las dimensiones de pantalla más comunes." },
      ],
    },
    close: {
      title: "Una buena búsqueda deja claro el siguiente paso.",
      body: "Introduce un dominio concreto, una palabra de referencia o una descripción detallada. Sajda mantiene visible la evidencia mientras decides qué merece asegurarse.",
      action: "Abrir búsqueda de dominios",
    },
  },
  fr: {
    documentTitle: "Centre juridique et confidentialité — Sajda",
    navLabel: "Navigation juridique",
    backToSearch: "Retour à la recherche",
    anchors: [
      { id: "privacy", label: "Confidentialité" },
      { id: "terms", label: "Conditions produit" },
      { id: "cookies", label: "Stockage navigateur" },
      { id: "accessibility", label: "Accessibilité" },
    ],
    eyebrow: "Centre juridique et confidentialité",
    title: "Vos données, vos choix et nos conditions.",
    lead: "Sajda est conçu pour vous aider à découvrir, vérifier, comparer et garder en vue des opportunités de domaines. Cette page explique ce que traite le produit actuel, l’origine des informations et ce qui reste votre décision.",
    note: "La disponibilité, les prix et les signaux de marché peuvent évoluer. Le registre ou le paiement chez le fournisseur reste la source finale avant un achat.",
    searchAction: "Lancer une recherche",
    howItWorksAction: "Comment Sajda fonctionne",
    atAGlance: "En bref",
    principles: [
      { title: "Des informations qui servent un objectif précis", body: "Nous utilisons les informations nécessaires pour effectuer une recherche, afficher ses éléments de preuve et conserver les choix que vous demandez de garder." },
      { title: "Les sources restent identifiées", body: "Le statut du registre, les prix des fournisseurs et les signaux de marché sont affichés avec leur source ou leur incertitude, jamais comme des garanties." },
      { title: "Les clés restent hors du navigateur", body: "Les identifiants développeur doivent rester sur votre serveur. N’intégrez jamais une clé API Sajda dans du code côté client." },
    ],
    privacy: {
      eyebrow: "Confidentialité",
      title: "Ce que Sajda traite lorsque vous l’utilisez.",
      lead: "Le produit distingue les préférences conservées uniquement dans le navigateur des informations envoyées à un service pour réaliser une recherche. Les fonctions de compte facultatives ajoutent du stockage authentifié lorsqu’elles sont configurées.",
      localTitle: "Dans votre navigateur",
      localBody: "Sajda utilise le stockage de l’appareil pour la langue, les choix de recherche, l’autorisation IA, les listes et les brouillons locaux du marketplace. Les résultats des invités peuvent être restaurés depuis la session de cet onglet pendant 30 minutes ; la copie exclut le brief, les données du compte et les identifiants. Ce délai ne garantit pas leur suppression après 30 minutes. Les recherches connectées ne sont pas enregistrées dans cette copie invité. Vous pouvez effacer les données du site dans les réglages du navigateur.",
      serviceTitle: "Pendant une recherche",
      serviceBody: "Votre requête, les extensions et les réglages sont transmis au service Sajda pour produire des résultats. Les vérifications et demandes de prix transmettent les noms concernés aux registres, services DNS et bureaux d’enregistrement configurés, dont Cloudflare, Porkbun et Loopia peuvent faire partie. Les destinataires reçoivent aussi des informations techniques sur les requêtes. Ces vérifications utilisent des services externes même si l’IA facultative est désactivée. Les signaux de marché indiquent leur source.",
      accountTitle: "Lorsque vous vous connectez",
      accountBody: "Les services de compte fonctionnent sur Vercel et stockent les données dans Neon. Ils traitent l’e-mail, l’identifiant du compte, le hachage du mot de passe, les vérifications et les données de session, dont l’adresse IP et des informations sur le navigateur, pour vous connecter et protéger l’accès. Le site utilise un cookie sécurisé HTTP-only ; l’app iPhone conserve son identifiant de connexion dans iOS Keychain. Resend envoie les messages de vérification, de récupération et de suppression à votre adresse e-mail.",
      keyTitle: "Pour les développeurs",
      keyBody: "Les clés API authentifient les requêtes de serveur à serveur. Conservez-les dans des variables d’environnement côté serveur ou un gestionnaire de secrets ; ne les exposez jamais dans un bundle navigateur, un dépôt public ou un stockage côté client.",
    },
    terms: {
      eyebrow: "Conditions produit",
      title: "Sajda vous aide à choisir. Il ne choisit pas à votre place.",
      lead: "Sajda est un outil pour trouver et étudier des domaines. Utilisez les résultats comme aide à la décision, puis confirmez la transaction auprès du fournisseur ou dans le flux de marketplace concerné.",
      items: [
        { title: "Résultats de recherche", body: "Un résultat est fondé sur la saisie, le parcours choisi et les sources disponibles au moment de la demande. Un statut affiché n’est pas une réservation et ne crée aucun droit d’enregistrer un domaine." },
        { title: "Prix et signaux", body: "Les prix des fournisseurs, indicateurs d’évaluation préliminaire et signaux de marché sont du contexte, pas un devis, une expertise ou une promesse de valeur de revente. Les taxes, le statut premium, le renouvellement et la disponibilité peuvent changer au paiement." },
        { title: "Annonces marketplace", body: "Une annonce décrit un domaine proposé. Vérifiez ses détails et le flux de transaction applicable avant de vous engager. La visibilité d’une annonce ne confirme pas à elle seule la propriété, la cessibilité ou la finalisation." },
        { title: "API publique et développeur", body: "Utilisez le contrat API publié et gardez les identifiants côté serveur. Respectez les limites de débit et n’utilisez pas le service pour contourner les restrictions des registres, fournisseurs ou tiers." },
      ],
    },
    cookies: {
      eyebrow: "Stockage navigateur",
      title: "Les préférences doivent être simples à trouver et à effacer.",
      lead: "L’application actuelle utilise le stockage du navigateur afin que l’espace de travail reste continu. Il se gère dans votre navigateur, et non via un interrupteur caché dans le produit.",
      items: [
        { title: "Langue et présentation", body: "La langue d’interface choisie peut être mémorisée afin que le produit ne vous la demande pas à chaque visite." },
        { title: "Espace de recherche", body: "Les extensions sélectionnées, réglages de recherche et choix de recherche ou de liste d’envies locaux peuvent rester dans le stockage du navigateur afin de préserver votre contexte de travail." },
        { title: "Comment réinitialiser", body: "Utilisez les contrôles de données de site ou de stockage local de votre navigateur pour Sajda afin de supprimer les préférences et listes locales. Effacer ces données peut supprimer les éléments enregistrés localement." },
      ],
      browserControl: "Gérer ceci dans les réglages du navigateur",
    },
    accessibility: {
      eyebrow: "Accessibilité",
      title: "Une interface que chacun peut comprendre.",
      lead: "Sajda vise une interface calme et lisible, avec une structure sémantique, un accès clavier, un focus visible et des informations qui ne reposent pas uniquement sur la couleur. Nous continuons à améliorer le produit à mesure qu’il évolue.",
      items: [
        { title: "Navigation", body: "Les pages, liens, contrôles et ancres de cette section sont conçus pour fonctionner au clavier avec un état de focus visible." },
        { title: "Clarté", body: "Le statut de recherche, les libellés de source et l’incertitude sont écrits sous forme de texte afin que le sens important ne dépende pas seulement de la couleur ou de la décoration." },
        { title: "Mouvement et mise en page", body: "Le produit cherche à rendre le retour d’interaction utile et propose une mise en page responsive conçue pour rester utilisable sur les tailles d’écran courantes." },
      ],
    },
    close: {
      title: "Une bonne recherche rend la prochaine étape évidente.",
      body: "Apportez un domaine exact, un mot de référence ou un brief détaillé. Sajda garde les éléments de preuve visibles pendant que vous décidez ce qui mérite d’être sécurisé.",
      action: "Ouvrir la recherche de domaines",
    },
  },
  zh: {
    documentTitle: "法律与隐私中心 — Sajda",
    navLabel: "法律页面导航",
    backToSearch: "返回搜索",
    anchors: [
      { id: "privacy", label: "隐私" },
      { id: "terms", label: "产品条款" },
      { id: "cookies", label: "浏览器存储" },
      { id: "accessibility", label: "无障碍" },
    ],
    eyebrow: "法律与隐私中心",
    title: "你的数据、你的选择与我们的使用条款。",
    lead: "Sajda 用于帮助你发现、核验、比较并持续关注域名机会。本页说明当前产品处理什么信息、证据来自哪里，以及哪些决定仍由你作出。",
    note: "可用性、价格和市场信号都可能变化。注册局或服务商的结账页面才是购买前的最终信息来源。",
    searchAction: "开始搜索",
    howItWorksAction: "了解 Sajda 的工作方式",
    atAGlance: "要点",
    principles: [
      { title: "每项信息都有明确用途", body: "我们仅使用运行搜索、展示依据以及保留你要求保存的选择所需的信息。" },
      { title: "注明来源与不确定性", body: "注册局状态、服务商价格和市场信号均附带来源或不确定性说明，而不会被包装成保证。" },
      { title: "密钥不应放在浏览器中", body: "开发者凭据应留在你的服务器上。不要在客户端代码中放入 Sajda API 密钥。" },
    ],
    privacy: {
      eyebrow: "隐私",
      title: "使用 Sajda 时，产品会处理哪些信息。",
      lead: "产品区分仅保留在浏览器中的偏好设置，以及为完成搜索而发送给服务的信息。配置了可选账户功能时，会加入经过身份验证的存储。",
      localTitle: "在你的浏览器中",
      localBody: "Sajda 使用设备存储保存语言、搜索选项、AI 许可、收藏列表和本地市场草稿。访客搜索结果可在 30 分钟内从此标签页的会话存储恢复；副本不含需求说明、账户信息或认证凭据。恢复期限不代表 30 分钟后一定删除。登录后的搜索不会保存到此访客副本。您可以在浏览器设置中清除网站数据。",
      serviceTitle: "搜索期间",
      serviceBody: "查询、后缀和搜索设置会发送给 Sajda 服务以生成结果。域名核查和报价会将相关名称发送给已配置的注册局、DNS 和注册商服务，其中可能包括 Cloudflare、Porkbun 和 Loopia。接收服务还会获得请求的技术信息。即使关闭可选 AI，这些核查仍会联系外部服务。市场信号会注明来源。",
      accountTitle: "登录时",
      accountBody: "账户服务运行于 Vercel，数据存储于 Neon。服务处理邮箱、账户标识符、密码哈希、验证记录和会话数据（包括 IP 地址及浏览器信息），以实现登录并保护访问。网站登录使用安全的 HTTP-only Cookie；iPhone 应用将登录凭据存储在 iOS Keychain 中。Resend 向您的邮箱发送验证、恢复和删除账户的邮件。",
      keyTitle: "面向开发者",
      keyBody: "API 密钥用于验证服务器到服务器的请求。请将其放在服务端环境变量或密钥管理工具中；不要将其暴露在浏览器构建产物、公开代码库或客户端存储中。",
    },
    terms: {
      eyebrow: "产品条款",
      title: "Sajda 帮你作出判断，但不会替你决定。",
      lead: "Sajda 是用于寻找和研究域名的工具。请将结果作为决策支持，然后在相关服务商或交易市场流程中确认交易。",
      items: [
        { title: "搜索结果", body: "结果基于输入、所选路径以及请求时可用的来源。显示的状态不是预留，也不会产生注册域名的权利。" },
        { title: "价格和信号", body: "服务商价格、筛选价值和市场信号仅为背景信息，不是报价、估值或转售价值承诺。税费、溢价状态、续费条款和可用性可能会在结账时变化。" },
        { title: "交易市场列表", body: "列表描述一个正在出售的域名。在作出承诺前，请核验其详情和适用的交易流程。列表的可见性本身并不确认所有权、可转让性或交易完成。" },
        { title: "公开和开发者 API", body: "请使用已发布的 API 契约，并将凭据保留在服务端。遵守速率限制，不要利用服务规避注册局、服务商或第三方的限制。" },
      ],
    },
    cookies: {
      eyebrow: "浏览器存储",
      title: "偏好设置应当容易找到，也容易清除。",
      lead: "当前应用使用浏览器存储以保持工作区的连续性。它由你的浏览器控制，而不是产品中隐藏的开关。",
      items: [
        { title: "语言与展示", body: "你选择的界面语言可以被记住，因此产品不需要在每次访问时都要求你重新选择。" },
        { title: "搜索工作区", body: "已选后缀、搜索设置以及本地搜索或心愿单选择可能保存在浏览器存储中，以保留你的工作上下文。" },
        { title: "如何重置", body: "使用浏览器针对 Sajda 的网站数据或本地存储控制功能，删除本地偏好和列表。清除这些数据可能会移除本地保存的条目。" },
      ],
      browserControl: "在浏览器设置中管理",
    },
    accessibility: {
      eyebrow: "无障碍",
      title: "让每个人都能理解和使用的界面。",
      lead: "Sajda 追求平静、易读的界面，包括语义结构、键盘访问、可见焦点以及不单纯依赖颜色的信息表达。产品持续演进时，我们也会持续改进。",
      items: [
        { title: "导航", body: "主要页面、链接、控件和这些章节锚点都旨在支持键盘使用，并提供可见的焦点状态。" },
        { title: "清晰度", body: "搜索状态、来源标签和不确定性均以文字表达，因此重要含义不只依赖颜色或装饰。" },
        { title: "动效和布局", body: "产品尽量让交互反馈保持必要性，并提供响应式布局，以适应常见屏幕尺寸。" },
      ],
    },
    close: {
      title: "好的搜索会让下一步变得清楚。",
      body: "带来一个确切域名、参考词或详细需求说明。Sajda 会在你决定什么值得抢注时，让证据始终保持可见。",
      action: "打开域名搜索",
    },
  },
};

function SectionHeading({ eyebrow, title, lead }: LegalSection) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">{title}</h2>
      <p className="mt-4 text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{lead}</p>
    </div>
  );
}

const packagePrivacy: Record<Language, { title: string; body: string }> = {
  en: { title: "Name packages and social checks", body: "Unsaved package comparisons stay in page memory. Names and configurations saved to a project are stored with your account. When you request a GitHub check, Sajda sends the exact handle to GitHub’s public API, not your brief or account email. Sajda retains a hashed account quota counter, not the profile payload. Opening other social or official-register links contacts those services directly. A downloaded or shared report remains outside account deletion. Company names and social registration availability are not automatically cleared." },
  sv: { title: "Namnpaket och profilkontroller", body: "Osparade paketjämförelser finns i sidans minne. Namn och inställningar som sparas i ett projekt lagras med kontot. När du begär en GitHub-kontroll skickar Sajda det exakta användarnamnet till GitHubs publika API, inte din beskrivning eller kontots e-postadress. Sajda sparar en hashad räknare för kontots kvot, inte profilsvaret. Öppnar du andra sociala länkar eller officiella register kontaktar du dessa tjänster direkt. Nedladdade och delade rapporter omfattas inte av kontoradering. Företagsnamn och sociala användarnamns registrerbarhet godkänns inte automatiskt." },
  es: { title: "Paquetes de nombres y perfiles", body: "Las comparaciones no guardadas permanecen en la memoria de la página. Los nombres y ajustes guardados en un proyecto se almacenan con la cuenta. Al solicitar una comprobación de GitHub, Sajda envía el nombre de usuario exacto a la API pública de GitHub, no tu descripción ni el correo de la cuenta. Sajda conserva un contador de cuota asociado a un hash del identificador de cuenta, no el perfil. Los enlaces externos contactan directamente con esas plataformas o registros. Eliminar la cuenta no elimina informes descargados o compartidos. No se autoriza automáticamente el registro de denominaciones sociales ni de nombres de usuario." },
  fr: { title: "Ensembles de noms et profils", body: "Les comparaisons non enregistrées restent dans la mémoire de la page. Les noms et réglages enregistrés dans un projet sont conservés avec le compte. Lors d’une vérification GitHub, Sajda envoie l’identifiant exact à l’API publique de GitHub, pas votre description ni l’adresse e-mail du compte. Sajda conserve un compteur de quota lié à un identifiant de compte haché, pas le profil. Les liens externes contactent directement ces plateformes ou registres. La suppression du compte n’efface pas les rapports téléchargés ou partagés. L’enregistrement des dénominations sociales et des identifiants sociaux n’est pas validé automatiquement." },
  zh: { title: "命名方案与账号核查", body: "未保存的方案比较保存在页面内存中。保存到项目的名称和配置会与账户一同存储。您请求核查 GitHub 时，Sajda 仅将准确用户名发送到 GitHub 的公开 API，不发送企业描述或账户邮箱。Sajda 保存关联到账户哈希标识的配额计数，不保存完整账号响应。打开其他社交平台或官方登记链接会直接联系相应服务。删除账户不会删除已下载或分享的报告。企业名称和社交用户名是否可注册不会自动获得确认。" },
};

const brandLookupPrivacy: Record<Language, { title: string; body: string }> = {
  en: { title: "Brand lookup and Wikidata", body: "When you look up a brand, Sajda sends the name you enter or the selected Wikidata Q identifier, plus the chosen language, to Wikidata’s public database. The website and app request this without account credentials; Sajda does not add your account email or project brief. Names you enter can still contain personal or confidential information. A temporary server-memory cache holds up to 128 entries per instance, with 5-minute search and 15-minute profile cache windows; these are not saved cloud or account profiles. These windows are not a general retention guarantee for hosting or Wikidata. Opening a source, website or social link contacts that service directly. Database records do not verify ownership." },
  sv: { title: "Varumärkesuppslag och Wikidata", body: "När du slår upp ett varumärke skickar Sajda namnet du skriver eller den valda Wikidata-postens Q-id samt valt språk till Wikidatas offentliga databas. Webbplatsen och appen begär uppslaget utan att skicka inloggningsuppgifter; Sajda lägger inte till kontots e-postadress eller projektbeskrivning. Namn du skriver kan ändå innehålla personliga eller konfidentiella uppgifter. En tillfällig cache i serverminnet rymmer högst 128 poster per instans, med cachetider på 5 minuter för sökningar och 15 minuter för profiler; dessa är inte sparade moln- eller kontoprofiler. Tiderna är ingen generell lagringsgaranti för driftleverantören eller Wikidata. Öppnar du en käll-, webbplats- eller social länk kontaktar du den tjänsten direkt. Databasposter verifierar inte ägande." },
  es: { title: "Búsqueda de marcas y Wikidata", body: "Al buscar una marca, Sajda envía el nombre que escribes o el identificador Q de Wikidata seleccionado, junto con el idioma elegido, a la base pública de Wikidata. La web y la app hacen esta solicitud sin credenciales de cuenta; Sajda no añade el correo de tu cuenta ni la descripción del proyecto. Los nombres introducidos aún pueden contener información personal o confidencial. Una caché temporal en la memoria del servidor mantiene hasta 128 entradas por instancia, con ventanas de 5 minutos para búsquedas y 15 minutos para perfiles; no son perfiles guardados en la nube o en la cuenta. Estos plazos no garantizan la retención general del alojamiento ni de Wikidata. Abrir un enlace de fuente, sitio web o red social contacta directamente con ese servicio. Los registros de la base no verifican la propiedad." },
  fr: { title: "Recherche de marques et Wikidata", body: "Lorsque vous recherchez une marque, Sajda transmet le nom saisi ou l’identifiant Q Wikidata sélectionné, ainsi que la langue choisie, à la base publique de Wikidata. Le site et l’app effectuent cette demande sans identifiants d’authentification du compte ; Sajda n’ajoute ni l’adresse e-mail du compte ni la description du projet. Les noms saisis peuvent néanmoins contenir des informations personnelles ou confidentielles. Un cache temporaire en mémoire serveur contient au plus 128 entrées par instance, avec des fenêtres de 5 minutes pour les recherches et de 15 minutes pour les profils ; ce ne sont pas des profils enregistrés dans le cloud ou le compte. Ces délais ne garantissent pas la durée générale de conservation de l’hébergeur ou de Wikidata. Ouvrir un lien de source, de site ou de réseau social contacte directement ce service. Les données de la base ne vérifient pas la propriété." },
  zh: { title: "品牌查询与 Wikidata", body: "查询品牌时，Sajda 会将您输入的名称或所选 Wikidata 记录的 Q 标识符，以及所选语言发送到 Wikidata 公开数据库。网站和应用发起此请求时不携带账户认证凭据；Sajda 不会附加账户邮箱或项目描述。您输入的名称仍可能包含个人或机密信息。每个服务器实例的临时内存缓存最多包含 128 条记录，搜索缓存窗口为 5 分钟，资料缓存窗口为 15 分钟；这些不是保存到云端或账户中的资料。这些窗口并非对托管服务或 Wikidata 总体保留时间的保证。打开来源、网站或社交链接会直接联系相应服务。数据库记录不能验证所有权。" },
};

export default function Legal() {
  const { language } = useLanguage();
  const copy = legalCopy[language];
  const rightsCopy = legalRightsCopy[language];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = copy.documentTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [copy.documentTitle]);

  const privacyCards = [
    { icon: Database, title: copy.privacy.localTitle, body: copy.privacy.localBody },
    { icon: SearchCheck, title: copy.privacy.serviceTitle, body: copy.privacy.serviceBody },
    { icon: SearchCheck, ...packagePrivacy[language] },
    { icon: SearchCheck, ...brandLookupPrivacy[language] },
    { icon: ShieldCheck, title: copy.privacy.accountTitle, body: copy.privacy.accountBody },
    ...legalDataCopy[language].cards.map(card => ({ icon: ShieldCheck, ...card })),
    { icon: KeyRound, title: copy.privacy.keyTitle, body: copy.privacy.keyBody },
  ];

  const termIcons = [SearchCheck, Scale, FileText, LockKeyhole];
  const storageIcons = [Cookie, Database, CheckCircle2];
  const accessibilityIcons = [CheckCircle2, FileText, Accessibility];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!isNativeApp && <header className="top-0 z-20 border-b border-border/80 bg-card/95 backdrop-blur-xl xl:sticky">
        <div className="mx-auto flex min-h-[4.75rem] w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-7">
          <Link
            to="/"
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Sajda"
          >
            <img src="/sajda-logo.svg" alt="Sajda" className="h-7 w-auto sm:h-8" />
          </Link>
          <nav className="order-last hidden w-full flex-wrap items-center gap-x-5 gap-y-1 text-sm font-semibold text-muted-foreground lg:flex xl:order-none xl:w-auto" aria-label={copy.navLabel}>
            {copy.anchors.map((anchor) => (
              <a key={anchor.id} href={`#${anchor.id}`} className="inline-flex min-h-11 items-center transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                {anchor.label}
              </a>
            ))}
          </nav>
          <div className="flex max-w-full flex-wrap items-center gap-2 sm:gap-4">
            <Link
              to="/"
              className="hidden min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 xl:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {copy.backToSearch}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </header>}

      <main>
        <section className="sajda-canvas overflow-hidden border-b border-border/70">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-14 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(21rem,0.95fr)] lg:items-center lg:gap-16 lg:py-24">
            <div className="relative z-10 max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/85 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-primary shadow-sm">
                <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.eyebrow}
              </p>
              <h1 className="mt-6 max-w-[14ch] text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.055em] text-foreground sm:text-6xl">
                {copy.title}
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                {copy.lead}
              </p>
              <p className="mt-6 flex max-w-2xl items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/75 p-4 text-sm leading-6 text-amber-950/85">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                {copy.note}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/">
                    {copy.searchAction}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/how-it-works">{copy.howItWorksAction}</Link>
                </Button>
              </div>
            </div>

            <aside className="relative mx-auto w-full max-w-xl overflow-hidden rounded-[1.5rem] border border-primary/15 bg-card/90 p-5 shadow-[0_22px_64px_rgba(15,23,42,0.11)] sm:p-6" aria-labelledby="legal-at-a-glance">
              <span className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full border-[18px] border-primary/10" aria-hidden="true" />
              <div className="relative">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 id="legal-at-a-glance" className="mt-5 text-lg font-semibold tracking-[-0.025em] text-foreground">{copy.atAGlance}</h2>
                <ol className="mt-4 divide-y divide-border rounded-xl border border-border bg-background/75">
                  {copy.principles.map((principle, index) => (
                    <li key={principle.title} className="flex gap-3 px-4 py-3.5">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{principle.title}</p>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">{principle.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          </div>
        </section>

        <section aria-labelledby="legal-operator" className="mx-auto w-full max-w-7xl px-5 pt-10 sm:px-7 sm:pt-14">
          <div className="sajda-surface p-5 sm:p-6">
            <h2 id="legal-operator" className="text-lg font-semibold tracking-[-0.025em] text-foreground">{legalDataCopy[language].operator.title}</h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">{legalDataCopy[language].operator.body}</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <a className="inline-flex min-h-11 items-center underline underline-offset-4" href="mailto:dev@hypbit.com">dev@hypbit.com</a>
              <a className="inline-flex min-h-11 items-center underline underline-offset-4" href="tel:+46101985881">+46 10 198 58 81</a>
              <a className="inline-flex min-h-11 items-center underline underline-offset-4" href="https://landvex.com/company">{legalDataCopy[language].companyInformation}</a>
            </div>
          </div>
        </section>

        <section id="privacy" className="mx-auto w-full max-w-7xl scroll-mt-24 px-5 py-14 sm:px-7 sm:py-20">
          <SectionHeading eyebrow={copy.privacy.eyebrow} title={copy.privacy.title} lead={copy.privacy.lead} />
          <AiPrivacyControl className="mt-6" />
          <div className="mt-9 grid gap-4 md:grid-cols-2">
            {privacyCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className="sajda-surface p-5 sm:p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-[-0.025em] text-foreground">{card.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{card.body}</p>
                </article>
              );
            })}
          </div>
          <section aria-labelledby="privacy-rights-title" className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h3 id="privacy-rights-title" className="text-lg font-semibold">{rightsCopy.title}</h3>
            <div className="mt-3 max-w-4xl space-y-3 text-sm leading-6 text-muted-foreground">
              <p>{rightsCopy.rights}</p>
              <p>{rightsCopy.request}</p>
              <p>{rightsCopy.complaint}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <a href="mailto:dev@hypbit.com" className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{rightsCopy.requestAction}</a>
              <a href={IMY_COMPLAINT_URL} className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{rightsCopy.complaintAction}</a>
            </div>
          </section>
        </section>

        <div className="mx-auto flex w-full max-w-7xl flex-wrap gap-x-6 gap-y-3 px-5 pb-8 text-sm sm:px-7">
          <Link className="inline-flex min-h-11 items-center underline underline-offset-4" to="/account">{legalDataCopy[language].account}</Link>
          <a className="inline-flex min-h-11 items-center underline underline-offset-4" href="mailto:dev@hypbit.com">{legalDataCopy[language].support} · dev@hypbit.com</a>
        </div>

        <section id="terms" className="scroll-mt-24 border-y border-border/80 bg-card">
          <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20">
            <SectionHeading eyebrow={copy.terms.eyebrow} title={copy.terms.title} lead={copy.terms.lead} />
            <div className="mt-9 grid gap-4 lg:grid-cols-2">
              {[...copy.terms.items, legalDataCopy[language].rights].map((item, index) => {
                const Icon = termIcons[index] ?? FileText;
                return (
                  <article key={item.title} className="rounded-[1.25rem] border border-border bg-background p-5 shadow-[0_8px_22px_hsl(219_44%_12%/0.035)] sm:p-6">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold tracking-[-0.025em] text-foreground">{item.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="cookies" className="mx-auto w-full max-w-7xl scroll-mt-24 px-5 py-14 sm:px-7 sm:py-20">
          <SectionHeading eyebrow={copy.cookies.eyebrow} title={copy.cookies.title} lead={copy.cookies.lead} />
          <div className="mt-9 grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(18rem,0.92fr)]">
            <div className="grid gap-3">
              {copy.cookies.items.map((item, index) => {
                const Icon = storageIcons[index] ?? Cookie;
                return (
                  <article key={item.title} className="flex gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
            <aside className="relative overflow-hidden rounded-[1.25rem] border border-primary/15 bg-primary/[0.04] p-6 sm:p-7">
              <span className="absolute -right-8 -top-10 h-28 w-28 rounded-full border border-primary/20" aria-hidden="true" />
              <Cookie className="relative h-6 w-6 text-primary" aria-hidden="true" />
              <p className="relative mt-5 text-lg font-semibold tracking-[-0.025em] text-foreground">{copy.cookies.browserControl}</p>
              <p className="relative mt-3 text-sm leading-6 text-muted-foreground">{copy.cookies.items[2]?.body}</p>
            </aside>
          </div>
        </section>

        <section id="accessibility" className="scroll-mt-24 border-y border-border/80 bg-secondary/45">
          <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20">
            <SectionHeading eyebrow={copy.accessibility.eyebrow} title={copy.accessibility.title} lead={copy.accessibility.lead} />
            <div className="mt-9 grid gap-px overflow-hidden rounded-[1.25rem] border border-border bg-border md:grid-cols-3">
              {copy.accessibility.items.map((item, index) => {
                const Icon = accessibilityIcons[index] ?? Accessibility;
                return (
                  <article key={item.title} className="bg-card p-6 sm:p-7">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-base font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20">
          <div className="flex flex-col justify-between gap-7 rounded-[1.5rem] border border-primary/15 bg-primary/[0.035] p-7 sm:p-10 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <h2 className="text-balance text-3xl font-semibold tracking-[-0.04em] text-foreground">{copy.close.title}</h2>
              <p className="mt-3 text-pretty text-base leading-7 text-muted-foreground">{copy.close.body}</p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link to="/">
                {copy.close.action}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
