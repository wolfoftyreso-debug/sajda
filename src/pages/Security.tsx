import { useEffect, type ComponentType, type SVGProps } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  FileSearch,
  Globe2,
  KeyRound,
  LockKeyhole,
  Server,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { isNativeApp } from "@/lib/appSurface";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type SecurityCopy = {
  documentTitle: string;
  navBack: string;
  navLabel: string;
  anchors: Array<{ id: "availability" | "access" | "marketplace"; label: string }>;
  eyebrow: string;
  title: string;
  lead: string;
  status: string;
  signal: {
    label: string;
    title: string;
    body: string;
    rows: Array<{ label: string; body: string }>;
  };
  principles: {
    eyebrow: string;
    title: string;
    lead: string;
    cards: Array<{ title: string; body: string }>;
  };
  availability: {
    eyebrow: string;
    title: string;
    lead: string;
    steps: Array<{ title: string; body: string }>;
    unknownTitle: string;
    unknownBody: string;
  };
  access: {
    eyebrow: string;
    title: string;
    lead: string;
    cards: Array<{ title: string; body: string }>;
  };
  marketplace: {
    eyebrow: string;
    title: string;
    lead: string;
    proofTitle: string;
    proofBody: string;
    note: string;
  };
  finish: {
    title: string;
    body: string;
    howItWorks: string;
    developers: string;
    marketplace: string;
  };
};

const securityCopy: Record<Language, SecurityCopy> = {
  en: {
    documentTitle: "Security & transparency — Sajda",
    navBack: "Back to Sajda",
    navLabel: "Security navigation",
    anchors: [
      { id: "availability", label: "Availability" },
      { id: "access", label: "API access" },
      { id: "marketplace", label: "Marketplace" },
    ],
    eyebrow: "Security & transparency",
    title: "Clear signals. Clear boundaries.",
    lead: "Sajda helps you make a better domain decision without pretending that a search result, a price, or a score is more certain than it is.",
    status: "Availability can change. Provider checkout is the final confirmation before a purchase.",
    signal: {
      label: "How to read a result",
      title: "See the source behind each result.",
      body: "We separate a registry signal, price information, and the final provider checkout so you can see what is known, what is not, and what still needs confirmation.",
      rows: [
        { label: "Registry signal", body: "The source used to check the domain and the status it returned." },
        { label: "Price information", body: "Source-backed when available; otherwise a direct route to the provider." },
        { label: "Final order", body: "Confirmed only at the provider’s external checkout." },
      ],
    },
    principles: {
      eyebrow: "The operating principles",
      title: "What we can verify—and what we can’t.",
      lead: "You can see which details still need checking and when you need to continue with a provider.",
      cards: [
        { title: "Availability needs confirmation", body: "A registry response is a search signal, not a promise that a name remains purchasable. Confirm availability before payment." },
        { title: "Provider checkout stays external", body: "Sajda sends you to the selected provider to complete an order. Its checkout determines the final price, terms, and availability." },
        { title: "Unknown does not mean available", body: "When a route cannot confirm a status, Sajda keeps the status unknown. It does not turn an absence of evidence into an available result." },
        { title: "Registrar passwords do not belong here", body: "Sajda does not ask for, collect, or store registrar passwords." },
      ],
    },
    availability: {
      eyebrow: "Availability evidence",
      title: "Check first. Decide second.",
      lead: "Availability is a live condition. Sajda presents the evidence path and preserves the distinction between a confirmed response and an unresolved answer.",
      steps: [
        { title: "Search a domain", body: "An exact domain or a generated candidate is prepared for the relevant registry route." },
        { title: "Read the returned state", body: "The result reflects the response that route can support. A failed or incomplete route remains visible as unresolved." },
        { title: "Confirm with the provider", body: "Open the provider to see its current purchase terms and let checkout confirm the final transaction." },
      ],
      unknownTitle: "Unverified is an honest answer.",
      unknownBody: "A registry or provider route may be unavailable, delayed, or unable to establish a status. In that case, Sajda does not label the domain available or taken on guesswork.",
    },
    access: {
      eyebrow: "API access",
      title: "API access with clear limits.",
      lead: "The public API is deliberately bounded and rate-limited. It is intended for controlled integration, not unrestricted browser-side access.",
      cards: [
        { title: "Public requests are rate-limited", body: "Public routes have defined request limits so the shared service remains predictable and abuse-resistant." },
        { title: "Keep API keys on your server", body: "Use paid API keys from a trusted server environment. Do not expose them in browser code, client apps, or public repositories." },
        { title: "Use the documented route", body: "The Developer area shows the supported domain-search routes and the request shapes they accept." },
      ],
    },
    marketplace: {
      eyebrow: "Marketplace publication",
      title: "A listing should begin with evidence of control.",
      lead: "Marketplace listings are domain listings. The publication flow is designed to distinguish a seller’s claim from a domain they can demonstrate control over.",
      proofTitle: "DNS TXT proof, when configured",
      proofBody: "Where DNS proof is configured, a seller is asked to place a DNS TXT record before a listing is published. The record is evidence of control over the domain’s DNS—not a substitute for buyer diligence or transfer terms.",
      note: "If proof is unavailable or incomplete, Sajda does not treat that as proof of control. A listing is not a statement of legal title, trademark clearance, or a guaranteed transfer outcome.",
    },
    finish: {
      title: "Evidence is part of the product.",
      body: "Explore how Sajda checks domains, integrates with your service, or structures a marketplace listing.",
      howItWorks: "How Sajda works",
      developers: "Developer documentation",
      marketplace: "Open marketplace",
    },
  },
  sv: {
    documentTitle: "Säkerhet och transparens — Sajda",
    navBack: "Tillbaka till Sajda",
    navLabel: "Säkerhetsnavigering",
    anchors: [
      { id: "availability", label: "Tillgänglighet" },
      { id: "access", label: "API-åtkomst" },
      { id: "marketplace", label: "Marknadsplats" },
    ],
    eyebrow: "Säkerhet och transparens",
    title: "Tydliga signaler. Tydliga gränser.",
    lead: "Sajda hjälper dig att fatta ett bättre domänbeslut utan att låtsas att ett sökresultat, ett pris eller en poäng är säkrare än det är.",
    status: "Tillgänglighet kan ändras. Leverantörens kassa är den slutliga bekräftelsen före ett köp.",
    signal: {
      label: "Så läser du ett resultat",
      title: "Se källan bakom varje resultat.",
      body: "Vi skiljer på besked från domänregistret, prisinformation och leverantörens slutliga kassa så att du ser vad som är känt, vad som inte är det och vad som fortfarande behöver bekräftas.",
      rows: [
        { label: "Besked från domänregistret", body: "Källan som användes för kontrollen och den domänstatus den gav." },
        { label: "Prisinformation", body: "Källstödd när den finns; annars en direkt väg till leverantören." },
        { label: "Slutlig order", body: "Bekräftas först i leverantörens externa kassa." },
      ],
    },
    principles: {
      eyebrow: "Arbetssättet",
      title: "Det här kan vi bekräfta – och det här är osäkert.",
      lead: "Du ser vad som fortfarande behöver kontrolleras och när du behöver gå vidare till en leverantör.",
      cards: [
        { title: "Tillgänglighet behöver bekräftas", body: "Ett svar från domänregistret är ett underlag, inte ett löfte om att ett namn fortfarande går att köpa. Bekräfta tillgänglighet före betalning." },
        { title: "Leverantörens kassa är extern", body: "Sajda skickar dig till vald leverantör för att slutföra en order. Kassan avgör slutligt pris, villkor och tillgänglighet." },
        { title: "Okänd status betyder inte ledig", body: "Om kontrollen inte ger ett säkert besked visar Sajda okänd status. Att uppgifter saknas betyder inte att domänen är ledig." },
        { title: "Dela inte lösenordet till din domänleverantör", body: "Sajda ber inte om, samlar inte in och lagrar inte lösenord till domänleverantörer." },
      ],
    },
    availability: {
      eyebrow: "Underlag för tillgänglighet",
      title: "Kontrollera först. Bestäm sedan.",
      lead: "En domäns status kan ändras snabbt. Sajda visar kontrollens källa och skiljer på bekräftade uppgifter och sådant som inte gick att kontrollera.",
      steps: [
        { title: "Sök en domän", body: "Domänen du anger eller ett genererat förslag skickas till rätt domänregister för kontroll." },
        { title: "Läs beskedet", body: "Resultatet visar vad källan kunde bekräfta. En misslyckad eller ofullständig kontroll markeras som okänd." },
        { title: "Bekräfta hos leverantören", body: "Öppna leverantören för aktuella köpvillkor och låt kassan bekräfta den slutliga transaktionen." },
      ],
      unknownTitle: "Overifierat är ett ärligt svar.",
      unknownBody: "Domänregistret eller leverantören kan vara otillgänglig, svara långsamt eller sakna tillräckliga uppgifter. Då märker Sajda inte domänen som ledig eller upptagen på gissning.",
    },
    access: {
      eyebrow: "API-åtkomst",
      title: "API-åtkomst med tydliga gränser.",
      lead: "Det publika API:t har tydliga gränser för hur många anrop du kan göra. Det är avsett för kontrollerade integrationer, inte obegränsad åtkomst i webbläsaren.",
      cards: [
        { title: "Antalet publika anrop är begränsat", body: "Publika API-funktioner har tydliga anropsgränser så att den delade tjänsten förblir förutsägbar och motståndskraftig mot missbruk." },
        { title: "Behåll API-nycklar på din server", body: "Använd betalda API-nycklar från en betrodd servermiljö. Exponera dem inte i webbläsarkod, klientappar eller publika repositorier." },
        { title: "Använd den dokumenterade vägen", body: "Utvecklarsidan visar de stödda vägarna för domänsökning och vilka anropsformat de accepterar." },
      ],
    },
    marketplace: {
      eyebrow: "Publicering på marknadsplatsen",
      title: "Säljaren ska kunna visa att domänen står under säljarens kontroll.",
      lead: "Marknadsplatsen innehåller domänannonser. Publiceringsflödet är utformat för att skilja en säljares påstående från en domän som säljaren kan visa kontroll över.",
      proofTitle: "DNS TXT-bevis, när det är konfigurerat",
      proofBody: "När DNS-bevis är konfigurerat får säljaren lägga in en DNS TXT-post innan annonsen publiceras. Posten är underlag för kontroll över domänens DNS—inte en ersättning för köparens egen kontroll eller överlåtelsevillkor.",
      note: "Om bevis saknas eller är ofullständigt behandlar Sajda det inte som kontrollbevis. En annons är inte ett påstående om laglig äganderätt, varumärkesgranskning eller ett garanterat överlåtelseutfall.",
    },
    finish: {
      title: "Underlag är en del av produkten.",
      body: "Utforska hur Sajda kontrollerar domäner, integreras med din tjänst eller strukturerar en marknadsplatsannons.",
      howItWorks: "Så fungerar Sajda",
      developers: "Utvecklardokumentation",
      marketplace: "Öppna marknadsplatsen",
    },
  },
  es: {
    documentTitle: "Seguridad y transparencia — Sajda",
    navBack: "Volver a Sajda",
    navLabel: "Navegación de seguridad",
    anchors: [
      { id: "availability", label: "Disponibilidad" },
      { id: "access", label: "Acceso API" },
      { id: "marketplace", label: "Mercado" },
    ],
    eyebrow: "Seguridad y transparencia",
    title: "Señales claras. Límites claros.",
    lead: "Sajda te ayuda a tomar una mejor decisión sobre un dominio sin fingir que un resultado, un precio o una puntuación es más seguro de lo que realmente es.",
    status: "La disponibilidad puede cambiar. El pago del proveedor es la confirmación final antes de comprar.",
    signal: {
      label: "Cómo leer un resultado",
      title: "Consulta la fuente de cada resultado.",
      body: "Separamos la señal del registro, la información de precio y el pago final del proveedor para que veas qué se sabe, qué no y qué aún debe confirmarse.",
      rows: [
        { label: "Señal del registro", body: "La ruta usada para comprobar un dominio, con el estado devuelto visible." },
        { label: "Información de precio", body: "Con fuente cuando está disponible; si no, una ruta directa al proveedor." },
        { label: "Pedido final", body: "Se confirma únicamente en el pago externo del proveedor." },
      ],
    },
    principles: {
      eyebrow: "Principios de operación",
      title: "Qué podemos verificar y qué sigue siendo incierto.",
      lead: "Puedes ver qué detalles faltan por comprobar y cuándo debes continuar con el proveedor.",
      cards: [
        { title: "La disponibilidad necesita confirmación", body: "Una respuesta del registro es una señal de búsqueda, no una promesa de que un nombre sigue siendo comprable. Confirma la disponibilidad antes de pagar." },
        { title: "El pago del proveedor es externo", body: "Sajda te dirige al proveedor elegido para completar un pedido. Su pago determina el precio, las condiciones y la disponibilidad final." },
        { title: "Desconocido no significa disponible", body: "Cuando una ruta no puede confirmar un estado, Sajda lo mantiene como desconocido. La falta de evidencia no se convierte en un resultado disponible." },
        { title: "Las contraseñas del registrador no pertenecen aquí", body: "Sajda no solicita, recopila ni almacena contraseñas de registrador." },
      ],
    },
    availability: {
      eyebrow: "Evidencia de disponibilidad",
      title: "Comprueba primero. Decide después.",
      lead: "La disponibilidad puede cambiar en cualquier momento. Sajda muestra la fuente de la comprobación y distingue lo confirmado de lo que no se ha podido verificar.",
      steps: [
        { title: "Busca un dominio", body: "Un dominio exacto o un candidato generado se prepara para la ruta de registro pertinente." },
        { title: "Lee el estado devuelto", body: "El resultado refleja lo que esa ruta puede respaldar. Una ruta fallida o incompleta permanece visible como no resuelta." },
        { title: "Confirma con el proveedor", body: "Abre el proveedor para consultar condiciones actuales y deja que su pago confirme la transacción final." },
      ],
      unknownTitle: "No verificado es una respuesta honesta.",
      unknownBody: "El servicio del registro o del proveedor puede no estar disponible, demorarse o no poder establecer un estado. En ese caso, Sajda no etiqueta el dominio como disponible o registrado basándose en suposiciones.",
    },
    access: {
      eyebrow: "Acceso API",
      title: "Creado para un uso limitado del lado del servidor.",
      lead: "La API pública está deliberadamente limitada y tiene límites de frecuencia. Está pensada para integraciones controladas, no para acceso ilimitado desde el navegador.",
      cards: [
        { title: "Las solicitudes públicas tienen límite", body: "Las rutas públicas tienen límites definidos para que el servicio compartido siga siendo predecible y resistente al abuso." },
        { title: "Guarda las claves API en tu servidor", body: "Usa claves API de pago desde un entorno de servidor confiable. No las expongas en código del navegador, aplicaciones cliente o repositorios públicos." },
        { title: "Usa la ruta documentada", body: "El área de desarrolladores muestra las rutas de búsqueda de dominios compatibles y los formatos de solicitud aceptados." },
      ],
    },
    marketplace: {
      eyebrow: "Publicación en el mercado",
      title: "Un anuncio debe empezar con evidencia de control.",
      lead: "El mercado contiene anuncios de dominios. El flujo de publicación distingue entre la afirmación de un vendedor y un dominio sobre el que puede demostrar control.",
      proofTitle: "Prueba DNS TXT, cuando está configurada",
      proofBody: "Cuando la prueba DNS está configurada, se pide al vendedor que coloque un registro DNS TXT antes de publicar un anuncio. El registro es evidencia de control sobre el DNS del dominio, no un sustituto de la diligencia del comprador o de las condiciones de transferencia.",
      note: "Si la prueba no está disponible o está incompleta, Sajda no la considera evidencia de control. Un anuncio no es una declaración de titularidad legal, revisión de marcas ni resultado de transferencia garantizado.",
    },
    finish: {
      title: "La evidencia es parte del producto.",
      body: "Explora cómo Sajda comprueba dominios, se integra con tu servicio o estructura un anuncio de mercado.",
      howItWorks: "Cómo funciona Sajda",
      developers: "Documentación para desarrolladores",
      marketplace: "Abrir mercado",
    },
  },
  fr: {
    documentTitle: "Sécurité et transparence — Sajda",
    navBack: "Retour à Sajda",
    navLabel: "Navigation sécurité",
    anchors: [
      { id: "availability", label: "Disponibilité" },
      { id: "access", label: "Accès API" },
      { id: "marketplace", label: "Place de marché" },
    ],
    eyebrow: "Sécurité et transparence",
    title: "Des signaux clairs. Des limites claires.",
    lead: "Sajda vous aide à mieux choisir un domaine sans prétendre qu’un résultat, un prix ou un score est plus certain qu’il ne l’est.",
    status: "La disponibilité peut changer. Le paiement chez le fournisseur constitue la confirmation finale avant achat.",
    signal: {
      label: "Lire un résultat",
      title: "Consultez la source de chaque résultat.",
      body: "Nous séparons le signal du registre, l’information de prix et le paiement final du fournisseur afin que vous voyiez ce qui est connu, ce qui ne l’est pas et ce qui doit encore être confirmé.",
      rows: [
        { label: "Signal du registre", body: "Le chemin utilisé pour vérifier un domaine, avec l’état retourné visible." },
        { label: "Information de prix", body: "Sourcée lorsqu’elle est disponible ; sinon, un accès direct au fournisseur." },
        { label: "Commande finale", body: "Confirmée uniquement lors du paiement externe du fournisseur." },
      ],
    },
    principles: {
      eyebrow: "Principes de fonctionnement",
      title: "Une information utile, exprimée au juste niveau de certitude.",
      lead: "Vous voyez ce qui reste à vérifier et quand vous devez poursuivre auprès du fournisseur.",
      cards: [
        { title: "La disponibilité demande confirmation", body: "Une réponse du registre est un signal de recherche, pas la promesse qu’un nom reste achetable. Confirmez la disponibilité avant le paiement." },
        { title: "Le paiement du fournisseur reste externe", body: "Sajda vous envoie vers le fournisseur choisi pour finaliser une commande. Son paiement détermine le prix, les conditions et la disponibilité finale." },
        { title: "Inconnu ne signifie pas disponible", body: "Lorsqu’un chemin ne peut confirmer un état, Sajda le conserve comme inconnu. L’absence de preuve ne devient pas un résultat disponible." },
        { title: "Ne partagez pas le mot de passe de votre bureau d’enregistrement", body: "Sajda ne demande, ne collecte et ne stocke jamais les mots de passe des bureaux d’enregistrement." },
      ],
    },
    availability: {
      eyebrow: "Preuve de disponibilité",
      title: "Vérifiez d’abord. Décidez ensuite.",
      lead: "La disponibilité peut changer à tout moment. Sajda indique la source de la vérification et distingue les informations confirmées de celles qui restent inconnues.",
      steps: [
        { title: "Recherchez un domaine", body: "Un domaine exact ou un candidat généré est préparé pour le chemin de registre approprié." },
        { title: "Lisez l’état retourné", body: "Le résultat reflète ce que ce chemin peut étayer. Un chemin défaillant ou incomplet reste visible comme non résolu." },
        { title: "Confirmez auprès du fournisseur", body: "Ouvrez le fournisseur pour voir ses conditions d’achat actuelles et laissez son paiement confirmer la transaction finale." },
      ],
      unknownTitle: "Non vérifié est une réponse honnête.",
      unknownBody: "Le service du registre ou du fournisseur peut être indisponible, répondre trop lentement ou ne pas permettre de déterminer le statut. Dans ce cas, Sajda ne qualifie pas le domaine de disponible ou enregistré sur la base d’une supposition.",
    },
    access: {
      eyebrow: "Accès API",
      title: "Conçu pour un usage limité côté serveur.",
      lead: "L’API publique est volontairement limitée et soumise à des limites de débit. Elle est destinée à une intégration contrôlée, pas à un accès navigateur sans restriction.",
      cards: [
        { title: "Les requêtes publiques sont limitées", body: "Les routes publiques ont des limites définies afin que le service partagé reste prévisible et résistant aux abus." },
        { title: "Gardez les clés API sur votre serveur", body: "Utilisez des clés API payantes depuis un environnement serveur de confiance. Ne les exposez pas dans le code navigateur, les applications clientes ou les dépôts publics." },
        { title: "Utilisez la route documentée", body: "L’espace développeurs présente les routes de recherche de domaines prises en charge et les formats de requête acceptés." },
      ],
    },
    marketplace: {
      eyebrow: "Publication sur la place de marché",
      title: "Une annonce doit commencer par une preuve de contrôle.",
      lead: "La place de marché contient des annonces de domaines. Le flux de publication distingue l’affirmation d’un vendeur d’un domaine dont il peut démontrer le contrôle.",
      proofTitle: "Preuve DNS TXT, lorsqu’elle est configurée",
      proofBody: "Lorsque la preuve DNS est configurée, le vendeur doit placer un enregistrement DNS TXT avant la publication d’une annonce. Cet enregistrement constitue une preuve de contrôle du DNS du domaine, mais ne remplace ni la diligence de l’acheteur ni les conditions de transfert.",
      note: "Si la preuve est indisponible ou incomplète, Sajda ne la traite pas comme une preuve de contrôle. Une annonce n’est pas une déclaration de titre légal, de vérification de marque ou de transfert garanti.",
    },
    finish: {
      title: "La preuve fait partie du produit.",
      body: "Découvrez comment Sajda vérifie les domaines, s’intègre à votre service ou structure une annonce de place de marché.",
      howItWorks: "Comment Sajda fonctionne",
      developers: "Documentation développeurs",
      marketplace: "Ouvrir la place de marché",
    },
  },
  zh: {
    documentTitle: "安全与透明度 — Sajda",
    navBack: "返回 Sajda",
    navLabel: "安全导航",
    anchors: [
      { id: "availability", label: "可用性" },
      { id: "access", label: "API 访问" },
      { id: "marketplace", label: "交易市场" },
    ],
    eyebrow: "安全与透明度",
    title: "清晰信号。清晰边界。",
    lead: "Sajda 帮助你做出更好的域名决策，但不会假装搜索结果、价格或评分比实际更确定。",
    status: "可用性随时可能变化。购买前，服务商的结账页才是最终确认。",
    signal: {
      label: "如何阅读结果",
      title: "查看每项结果的来源。",
      body: "我们将注册局信号、价格信息与服务商最终结账分开，让你看到哪些已知、哪些未知、哪些仍需确认。",
      rows: [
        { label: "注册局信号", body: "检查域名所用的数据来源，以及该来源返回的状态。" },
        { label: "价格信息", body: "有来源时显示来源；否则提供服务商的直接入口。" },
        { label: "最终订单", body: "仅在服务商的外部结账页确认。" },
      ],
    },
    principles: {
      eyebrow: "运行原则",
      title: "哪些可以确认，哪些仍不确定。",
      lead: "你可以清楚地看到哪些信息仍需核实，以及何时需要前往服务商网站继续操作。",
      cards: [
        { title: "可用性需要确认", body: "注册局响应是搜索信号，不是名称仍然可购买的承诺。请在付款前确认可用性。" },
        { title: "购买在服务商网站完成", body: "Sajda 会将你带到所选服务商完成订单。其结账页决定最终价格、条款与可用性。" },
        { title: "状态未知不代表可以注册", body: "如果检查无法确认域名状态，Sajda 会标为未知。缺少信息不等于域名可以注册。" },
        { title: "注册商密码不属于这里", body: "Sajda 不会要求、收集或存储注册商密码。" },
      ],
    },
    availability: {
      eyebrow: "可用性依据",
      title: "先核验。再决定。",
      lead: "域名的可注册状态可能随时变化。Sajda 会显示检查来源，并区分已确认和无法确认的信息。",
      steps: [
        { title: "搜索域名", body: "你输入的域名或生成的候选名称会提交到相应的域名注册局进行检查。" },
        { title: "阅读返回状态", body: "结果只显示来源能够确认的信息。失败或未完成的检查会标为未知。" },
        { title: "向服务商确认", body: "打开服务商查看当前购买条件，并让其结账页确认最终交易。" },
      ],
      unknownTitle: "未核验是诚实的答案。",
      unknownBody: "注册局或服务商可能无法访问、响应缓慢，或无法确认域名状态。此时，Sajda 不会通过猜测把域名标记为可注册或已注册。",
    },
    access: {
      eyebrow: "API 访问",
      title: "为服务器端集成提供明确的使用限制。",
      lead: "公共 API 有意设置边界并进行速率限制。它面向受控集成，而不是无限制的浏览器端访问。",
      cards: [
        { title: "公共请求受到速率限制", body: "公共路径有明确请求上限，使共享服务保持可预测并能够抵御滥用。" },
        { title: "将 API 密钥保留在服务器上", body: "从受信任的服务器环境使用付费 API 密钥。不要在浏览器代码、客户端应用或公开仓库中暴露它们。" },
        { title: "使用文档中列出的接口", body: "开发者区域显示支持的域名搜索路径和它们接受的请求格式。" },
      ],
    },
    marketplace: {
      eyebrow: "交易市场发布",
      title: "挂牌应从控制权依据开始。",
      lead: "交易市场包含域名挂牌。发布流程旨在区分卖家的声明与其能够证明控制权的域名。",
      proofTitle: "DNS TXT 证明（配置后）",
      proofBody: "在配置 DNS 证明的情况下，卖家需要先放置 DNS TXT 记录，挂牌才会发布。该记录是对域名 DNS 控制权的依据，而非买方尽职调查或转让条款的替代品。",
      note: "如果证明不可用或不完整，Sajda 不会将其视为控制权证明。挂牌并非对合法所有权、商标审查或保证转让结果的声明。",
    },
    finish: {
      title: "依据是产品的一部分。",
      body: "了解 Sajda 如何核验域名、与你的服务集成，或构建交易市场挂牌。",
      howItWorks: "Sajda 的工作方式",
      developers: "开发者文档",
      marketplace: "打开交易市场",
    },
  },
};

const principleIcons = [BadgeCheck, Globe2, CircleAlert, LockKeyhole] as const;
const availabilityIcons = [FileSearch, BadgeCheck, ArrowRight] as const;
const accessIcons = [Server, KeyRound, FileSearch] as const;

function SectionHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">{title}</h2>
      {lead ? <p className="mt-4 text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{lead}</p> : null}
    </div>
  );
}

export default function Security() {
  const { language } = useLanguage();
  const copy = securityCopy[language];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = copy.documentTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [copy.documentTitle]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!isNativeApp && <header className="sticky top-0 z-20 border-b border-border/80 bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[4.75rem] w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-7">
          <Link
            to="/"
            className="inline-flex shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Sajda"
          >
            <img src="/sajda-logo.svg" alt="Sajda" className="h-7 w-auto sm:h-8" />
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-semibold text-muted-foreground md:flex" aria-label={copy.navLabel}>
            {copy.anchors.map((anchor) => (
              <a key={anchor.id} href={`#${anchor.id}`} className="transition-colors hover:text-foreground">
                {anchor.label}
              </a>
            ))}
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
      </header>}

      <main>
        <section className="sajda-canvas overflow-hidden border-b border-border/70">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,1.02fr)_minmax(22rem,0.86fr)] lg:items-center lg:gap-16 lg:py-24">
            <div className="relative z-10 max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/85 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-primary shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.eyebrow}
              </p>
              <h1 className="mt-6 max-w-[13ch] text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.055em] text-foreground sm:text-6xl">
                {copy.title}
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                {copy.lead}
              </p>
              <p className="mt-6 flex max-w-2xl items-start gap-2 text-sm leading-6 text-muted-foreground">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {copy.status}
              </p>
            </div>

            <aside className="relative mx-auto w-full max-w-xl rounded-[1.5rem] border border-primary/15 bg-card/92 p-5 shadow-[0_22px_64px_rgba(15,23,42,0.11)] sm:p-6" aria-labelledby="security-signal-title">
              <div className="absolute -right-12 -top-14 h-36 w-36 rounded-full border-[18px] border-primary/10" aria-hidden="true" />
              <div className="relative">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <FileSearch className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-primary">{copy.signal.label}</p>
                <h2 id="security-signal-title" className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">{copy.signal.title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.signal.body}</p>
                <dl className="mt-5 divide-y divide-border rounded-xl border border-border bg-background/75">
                  {copy.signal.rows.map((row) => (
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

        <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20">
          <SectionHeading eyebrow={copy.principles.eyebrow} title={copy.principles.title} lead={copy.principles.lead} />
          <div className="mt-9 grid gap-4 md:grid-cols-2">
            {copy.principles.cards.map((card, index) => {
              const Icon = principleIcons[index] as Icon;
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
        </section>

        <section id="availability" className="scroll-mt-24 border-y border-border/80 bg-card">
          <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20">
            <SectionHeading eyebrow={copy.availability.eyebrow} title={copy.availability.title} lead={copy.availability.lead} />
            <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1.16fr)_minmax(20rem,0.84fr)]">
              <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {copy.availability.steps.map((step, index) => {
                  const Icon = availabilityIcons[index] as Icon;
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
              <aside className="rounded-[1.25rem] border border-primary/15 bg-primary/[0.035] p-5 sm:p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-card text-primary shadow-sm">
                  <CircleAlert className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-foreground">{copy.availability.unknownTitle}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.availability.unknownBody}</p>
              </aside>
            </div>
          </div>
        </section>

        <section id="access" className="mx-auto w-full max-w-7xl scroll-mt-24 px-5 py-14 sm:px-7 sm:py-20">
          <SectionHeading eyebrow={copy.access.eyebrow} title={copy.access.title} lead={copy.access.lead} />
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {copy.access.cards.map((card, index) => {
              const Icon = accessIcons[index] as Icon;
              return (
                <article key={card.title} className="sajda-surface-raised p-5 sm:p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-[-0.025em] text-foreground">{card.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{card.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="marketplace" className="scroll-mt-24 border-y border-border/80 bg-secondary/45">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:items-center lg:gap-16">
            <SectionHeading eyebrow={copy.marketplace.eyebrow} title={copy.marketplace.title} lead={copy.marketplace.lead} />
            <aside className="rounded-[1.25rem] border border-border bg-card p-5 shadow-[0_10px_26px_hsl(219_44%_12%/0.04)] sm:p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <BadgeCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-foreground">{copy.marketplace.proofTitle}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.marketplace.proofBody}</p>
              <p className="mt-5 border-t border-border pt-5 text-sm leading-6 text-foreground/80">{copy.marketplace.note}</p>
            </aside>
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
                <Link
                  to="/how-it-works"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-input bg-card px-5 text-sm font-semibold transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {copy.finish.howItWorks}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/developers"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {copy.finish.developers}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/marketplace"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-input bg-card px-5 text-sm font-semibold transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {copy.finish.marketplace}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
