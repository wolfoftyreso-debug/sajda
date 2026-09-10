import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Braces,
  CheckCircle2,
  Clipboard,
  Code2,
  ExternalLink,
  FileJson,
  KeyRound,
  LockKeyhole,
  LoaderCircle,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { isAccountAuthConfigured, readAccountSession } from "@/integrations/neon/auth";
import { isLocalTestMode } from "@/lib/localTestMode";
import { isNativeApp } from "@/lib/appSurface";
import { productFetch } from "@/lib/productFetch";
import { nativeRequest } from "@/lib/nativeTransport";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";

type DeveloperCopy = {
  documentTitle: string;
  eyebrow: string;
  navOverview: string;
  navPublic: string;
  navV1: string;
  navAccess: string;
  navBack: string;
  title: string;
  lead: string;
  proofLine: string;
  heroPrimary: string;
  heroSecondary: string;
  liveLabel: string;
  liveBody: string;
  publicLabel: string;
  publicTitle: string;
  publicLead: string;
  publicReference: string;
  publicDomains: string;
  protectedDomains: string;
  publicFacts: string;
  publicRateLimit: string;
  runExample: string;
  running: string;
  runDescription: string;
  response: string;
  responseIdle: string;
  responseError: string;
  capabilitiesLabel: string;
  capabilitiesTitle: string;
  capabilitiesLead: string;
  statusAvailable: string;
  statusKey: string;
  audiencePublic: string;
  audienceApproved: string;
  status: string;
  audience: string;
  route: string;
  action: string;
  open: string;
  apiLabel: string;
  apiTitle: string;
  apiLead: string;
  serverOnly: string;
  endpointLabel: string;
  contractLabel: string;
  copy: string;
  copied: string;
  boundariesLabel: string;
  boundariesTitle: string;
  boundaries: Array<{ title: string; body: string }>;
};

type DeveloperKeyCopy = {
  sectionLabel: string;
  title: string;
  lead: string;
  benefitLine: string;
  signInTitle: string;
  signInLead: string;
  signInAction: string;
  create: string;
  createTitle: string;
  createLead: string;
  nameLabel: string;
  namePlaceholder: string;
  nameRequired: string;
  createAction: string;
  creating: string;
  cancel: string;
  keyCreated: string;
  keyCreatedLead: string;
  copyKey: string;
  keyCopied: string;
  done: string;
  listTitle: string;
  listLead: string;
  refresh: string;
  loading: string;
  empty: string;
  created: string;
  lastUsed: string;
  neverUsed: string;
  revoke: string;
  revoking: string;
  revokeConfirm: string;
  revoked: string;
  serverHint: string;
  usageTitle: string;
  usageLead: string;
  requestError: string;
  localBadge: string;
  localTitle: string;
  localLead: string;
  localNotice: string;
  createTest: string;
  createTestTitle: string;
  createTestAction: string;
};

const developerKeyCopy: Record<Language, DeveloperKeyCopy> = {
  en: {
    sectionLabel: "Developer keys",
    title: "Create a key for your server.",
    lead: "Issue, copy, and revoke your API keys here. Each key is shown once, then only its safe identifier remains visible.",
    benefitLine: "What ChatGPT cannot do alone: verify live domain availability and provider pricing.",
    signInTitle: "Sign in to manage API keys.",
    signInLead: "Your keys belong to your Sajda account and are ready for server-side integrations.",
    signInAction: "Sign in to create a key",
    create: "Create API key",
    createTitle: "Create an API key",
    createLead: "Give this key a clear name so you can recognise the server that uses it.",
    nameLabel: "Key name",
    namePlaceholder: "Production domain search",
    nameRequired: "Enter a name for this key.",
    createAction: "Create key",
    creating: "Creating…",
    cancel: "Cancel",
    keyCreated: "Your new API key",
    keyCreatedLead: "Copy it now. For your security, Sajda will not show this full key again.",
    copyKey: "Copy key",
    keyCopied: "Key copied",
    done: "Done",
    listTitle: "Your API keys",
    listLead: "The full secret is never stored in this browser.",
    refresh: "Refresh",
    loading: "Loading keys…",
    empty: "No API keys yet. Create one when your server is ready.",
    created: "Created",
    lastUsed: "Last used",
    neverUsed: "Not used yet",
    revoke: "Revoke",
    revoking: "Revoking…",
    revokeConfirm: "Revoke this API key? Any server using it will stop working immediately.",
    revoked: "Revoked",
    serverHint: "Use keys only from a trusted server or a server-side secret store. Never ship one in browser code, a mobile app, or a public repository.",
    usageTitle: "Use it from your server",
    usageLead: "Send it as a Bearer token to POST /api/v1/domains. Keep it in your platform’s server-side environment variables.",
    requestError: "We could not complete that key request. Please try again.",
    localBadge: "Local test mode",
    localTitle: "Create a test key on this machine.",
    localLead: "This loopback-only workspace creates a test key for the local API. It is not connected to a production Sajda account.",
    localNotice: "Test keys work only with this local server and reset when it restarts.",
    createTest: "Create test key",
    createTestTitle: "Create a local test key",
    createTestAction: "Create test key",
  },
  sv: {
    sectionLabel: "Utvecklarnycklar",
    title: "Skapa en nyckel för din server.",
    lead: "Skapa, kopiera och återkalla API-nycklar här. Varje nyckel visas en gång; därefter syns bara ett säkert identifieringsvärde.",
    benefitLine: "Det ChatGPT inte kan göra på egen hand: verifiera aktuell domäntillgänglighet och leverantörspriser.",
    signInTitle: "Logga in för att hantera API-nycklar.",
    signInLead: "Dina nycklar hör till ditt Sajda-konto och används i integrationer på serversidan.",
    signInAction: "Logga in för att skapa nyckel",
    create: "Skapa API-nyckel",
    createTitle: "Skapa en API-nyckel",
    createLead: "Ge nyckeln ett tydligt namn så att du känner igen vilken server som använder den.",
    nameLabel: "Nyckelnamn",
    namePlaceholder: "Produktionssökning av domäner",
    nameRequired: "Ange ett namn för nyckeln.",
    createAction: "Skapa nyckel",
    creating: "Skapar…",
    cancel: "Avbryt",
    keyCreated: "Din nya API-nyckel",
    keyCreatedLead: "Kopiera den nu. Av säkerhetsskäl visar Sajda aldrig hela nyckeln igen.",
    copyKey: "Kopiera nyckel",
    keyCopied: "Nyckeln kopierad",
    done: "Klar",
    listTitle: "Dina API-nycklar",
    listLead: "Hela hemligheten lagras aldrig i den här webbläsaren.",
    refresh: "Uppdatera",
    loading: "Hämtar nycklar…",
    empty: "Inga API-nycklar ännu. Skapa en när servern är redo.",
    created: "Skapad",
    lastUsed: "Senast använd",
    neverUsed: "Inte använd ännu",
    revoke: "Återkalla",
    revoking: "Återkallar…",
    revokeConfirm: "Återkalla den här API-nyckeln? Alla servrar som använder den slutar fungera direkt.",
    revoked: "Återkallad",
    serverHint: "Använd endast nycklar från en betrodd server eller en hemlighetshanterare på serversidan. Lägg aldrig en nyckel i webbläsarkod, en mobilapp eller ett publikt repo.",
    usageTitle: "Använd den från din server",
    usageLead: "Skicka den som en Bearer-token till POST /api/v1/domains. Spara den i plattformens servermiljövariabler.",
    requestError: "Det gick inte att genomföra nyckelanropet. Försök igen.",
    localBadge: "Lokalt testläge",
    localTitle: "Skapa en testnyckel på den här datorn.",
    localLead: "Den här loopback-ytan skapar en testnyckel för det lokala API:t. Den är inte kopplad till ett Sajda-konto i produktion.",
    localNotice: "Testnycklar fungerar bara med den här lokala servern och återställs vid omstart.",
    createTest: "Skapa testnyckel",
    createTestTitle: "Skapa en lokal testnyckel",
    createTestAction: "Skapa testnyckel",
  },
  es: {
    sectionLabel: "Claves de desarrollador",
    title: "Crea una clave para tu servidor.",
    lead: "Emite, copia y revoca tus claves de API aquí. Cada clave se muestra una sola vez; después solo queda visible su identificador seguro.",
    benefitLine: "Lo que ChatGPT no puede hacer por sí solo: verificar la disponibilidad actual del dominio y los precios del proveedor.",
    signInTitle: "Inicia sesión para gestionar las claves de API.",
    signInLead: "Tus claves pertenecen a tu cuenta de Sajda y están listas para integraciones de servidor.",
    signInAction: "Iniciar sesión para crear una clave",
    create: "Crear clave de API",
    createTitle: "Crear una clave de API",
    createLead: "Ponle un nombre claro para reconocer el servidor que la utiliza.",
    nameLabel: "Nombre de la clave",
    namePlaceholder: "Búsqueda de dominios de producción",
    nameRequired: "Introduce un nombre para esta clave.",
    createAction: "Crear clave",
    creating: "Creando…",
    cancel: "Cancelar",
    keyCreated: "Tu nueva clave de API",
    keyCreatedLead: "Cópiala ahora. Por seguridad, Sajda no volverá a mostrar esta clave completa.",
    copyKey: "Copiar clave",
    keyCopied: "Clave copiada",
    done: "Listo",
    listTitle: "Tus claves de API",
    listLead: "El secreto completo nunca se almacena en este navegador.",
    refresh: "Actualizar",
    loading: "Cargando claves…",
    empty: "Aún no hay claves de API. Crea una cuando tu servidor esté listo.",
    created: "Creada",
    lastUsed: "Último uso",
    neverUsed: "Aún no utilizada",
    revoke: "Revocar",
    revoking: "Revocando…",
    revokeConfirm: "¿Revocar esta clave de API? Cualquier servidor que la use dejará de funcionar de inmediato.",
    revoked: "Revocada",
    serverHint: "Usa las claves solo desde un servidor de confianza o un almacén de secretos del lado del servidor. Nunca incluyas una en código de navegador, una app móvil o un repositorio público.",
    usageTitle: "Úsala desde tu servidor",
    usageLead: "Envíala como token Bearer a POST /api/v1/domains. Guárdala en las variables de entorno del servidor de tu plataforma.",
    requestError: "No pudimos completar esa solicitud de clave. Inténtalo de nuevo.",
    localBadge: "Modo de prueba local",
    localTitle: "Crea una clave de prueba en esta máquina.",
    localLead: "Este espacio solo de loopback crea una clave de prueba para la API local. No está conectada a una cuenta Sajda de producción.",
    localNotice: "Las claves de prueba solo funcionan con este servidor local y se restablecen al reiniciarlo.",
    createTest: "Crear clave de prueba",
    createTestTitle: "Crear una clave de prueba local",
    createTestAction: "Crear clave de prueba",
  },
  fr: {
    sectionLabel: "Clés développeur",
    title: "Créez une clé pour votre serveur.",
    lead: "Émettez, copiez et révoquez vos clés API ici. Chaque clé s’affiche une seule fois ; seul son identifiant sûr reste ensuite visible.",
    benefitLine: "Ce que ChatGPT ne peut pas faire seul : vérifier la disponibilité actuelle d’un domaine et les prix du fournisseur.",
    signInTitle: "Connectez-vous pour gérer les clés API.",
    signInLead: "Vos clés sont liées à votre compte Sajda et prêtes pour les intégrations côté serveur.",
    signInAction: "Se connecter pour créer une clé",
    create: "Créer une clé API",
    createTitle: "Créer une clé API",
    createLead: "Donnez-lui un nom clair afin d’identifier le serveur qui l’utilise.",
    nameLabel: "Nom de la clé",
    namePlaceholder: "Recherche de domaines en production",
    nameRequired: "Saisissez un nom pour cette clé.",
    createAction: "Créer la clé",
    creating: "Création…",
    cancel: "Annuler",
    keyCreated: "Votre nouvelle clé API",
    keyCreatedLead: "Copiez-la maintenant. Pour votre sécurité, Sajda n’affichera plus jamais cette clé complète.",
    copyKey: "Copier la clé",
    keyCopied: "Clé copiée",
    done: "Terminé",
    listTitle: "Vos clés API",
    listLead: "Le secret complet n’est jamais stocké dans ce navigateur.",
    refresh: "Actualiser",
    loading: "Chargement des clés…",
    empty: "Aucune clé API pour l’instant. Créez-en une lorsque votre serveur est prêt.",
    created: "Créée",
    lastUsed: "Dernière utilisation",
    neverUsed: "Pas encore utilisée",
    revoke: "Révoquer",
    revoking: "Révocation…",
    revokeConfirm: "Révoquer cette clé API ? Tout serveur qui l’utilise cessera immédiatement de fonctionner.",
    revoked: "Révoquée",
    serverHint: "Utilisez les clés uniquement depuis un serveur fiable ou un gestionnaire de secrets côté serveur. Ne les intégrez jamais dans du code navigateur, une application mobile ou un dépôt public.",
    usageTitle: "Utilisez-la depuis votre serveur",
    usageLead: "Envoyez-la comme jeton Bearer à POST /api/v1/domains. Conservez-la dans les variables d’environnement serveur de votre plateforme.",
    requestError: "Impossible d’exécuter cette demande de clé. Réessayez.",
    localBadge: "Mode de test local",
    localTitle: "Créez une clé de test sur cette machine.",
    localLead: "Cet espace réservé à la boucle locale crée une clé de test pour l’API locale. Elle n’est pas liée à un compte Sajda de production.",
    localNotice: "Les clés de test ne fonctionnent qu’avec ce serveur local et sont réinitialisées à son redémarrage.",
    createTest: "Créer une clé de test",
    createTestTitle: "Créer une clé de test locale",
    createTestAction: "Créer la clé de test",
  },
  zh: {
    sectionLabel: "开发者密钥",
    title: "为你的服务器创建密钥。",
    lead: "在此签发、复制和撤销 API 密钥。每个密钥仅显示一次，之后仅保留安全标识符可见。",
    benefitLine: "ChatGPT 单独无法做到的事：验证域名的实时可用性与服务商价格。",
    signInTitle: "登录以管理 API 密钥。",
    signInLead: "密钥属于你的 Sajda 账户，可用于服务器端集成。",
    signInAction: "登录以创建密钥",
    create: "创建 API 密钥",
    createTitle: "创建 API 密钥",
    createLead: "为密钥命名，以便识别正在使用它的服务器。",
    nameLabel: "密钥名称",
    namePlaceholder: "生产域名搜索",
    nameRequired: "请输入此密钥的名称。",
    createAction: "创建密钥",
    creating: "创建中…",
    cancel: "取消",
    keyCreated: "你的新 API 密钥",
    keyCreatedLead: "请立即复制。出于安全考虑，Sajda 不会再次显示完整密钥。",
    copyKey: "复制密钥",
    keyCopied: "已复制密钥",
    done: "完成",
    listTitle: "你的 API 密钥",
    listLead: "完整密钥绝不会存储在此浏览器中。",
    refresh: "刷新",
    loading: "正在加载密钥…",
    empty: "还没有 API 密钥。服务器准备好后即可创建。",
    created: "创建时间",
    lastUsed: "最近使用",
    neverUsed: "尚未使用",
    revoke: "撤销",
    revoking: "撤销中…",
    revokeConfirm: "撤销此 API 密钥？所有使用它的服务器将立即停止工作。",
    revoked: "已撤销",
    serverHint: "仅可从受信任的服务器或服务器端密钥管理器使用密钥。切勿将其放进浏览器代码、移动应用或公开代码仓库中。",
    usageTitle: "从你的服务器使用",
    usageLead: "将其作为 Bearer 令牌发送至 POST /api/v1/domains。请存储在平台的服务器端环境变量中。",
    requestError: "无法完成该密钥请求。请重试。",
    localBadge: "本地测试模式",
    localTitle: "在此设备上创建测试密钥。",
    localLead: "此仅限回环的工作区会为本地 API 创建测试密钥，不会连接到生产 Sajda 账户。",
    localNotice: "测试密钥仅适用于此本地服务器，并会在服务器重启时重置。",
    createTest: "创建测试密钥",
    createTestTitle: "创建本地测试密钥",
    createTestAction: "创建测试密钥",
  },
};

const developerCopy: Record<Language, DeveloperCopy> = {
  en: {
    documentTitle: "Sajda Developers — API documentation",
    eyebrow: "Sajda Developers",
    navOverview: "Overview",
    navPublic: "Public",
    navV1: "API v1",
    navAccess: "API keys",
    navBack: "Back to Sajda",
    title: "A careful API for finding the right domain.",
    lead: "Build a domain-search experience that keeps the evidence with every result: the registry method, the checked time, and the limits of every price signal stay visible.",
    proofLine: "What ChatGPT cannot do alone: verify live domain availability and provider pricing.",
    heroPrimary: "Read the public reference",
    heroSecondary: "View API v1",
    liveLabel: "Production surface",
    liveBody: "The public reference, market-context endpoint, and bounded domain search are live. Create a server-side API key in your Sajda account when you need authenticated v1 access.",
    publicLabel: "Public API",
    publicTitle: "Start with the contract, not a promise.",
    publicLead: "The OpenAPI document, source-attributed fact feed, and bounded domain-search route are public. They do not require a key, account, browser SDK, or payment flow.",
    publicReference: "OpenAPI 3.1 reference",
    publicDomains: "Bounded domain search with registry evidence",
    protectedDomains: "Key-authenticated domain search for server integrations",
    publicFacts: "Source-attributed fact signals",
    publicRateLimit: "Shared best-effort limit: 6 requests per IP per minute. Responses carry a request ID and rate-limit headers; this is not a paid quota or service-level agreement.",
    runExample: "Run live example",
    running: "Requesting…",
    runDescription: "Makes a real POST request to /api/v1/public/domains. No key is sent or stored.",
    response: "Response",
    responseIdle: "Run the public request to inspect a current JSON response.",
    responseError: "The public endpoint did not return JSON. Check the deployed application route and try again.",
    capabilitiesLabel: "Endpoint status",
    capabilitiesTitle: "What is public, what is protected.",
    capabilitiesLead: "Public endpoints are available without a key. Authenticated domain search uses a self-service key from your Sajda account and must run from your server.",
    statusAvailable: "Available",
    statusKey: "Key required",
    audiencePublic: "Public",
    audienceApproved: "Your server integration",
    status: "Status",
    audience: "Access",
    route: "Route",
    action: "Action",
    open: "Open",
    apiLabel: "Authenticated API v1",
    apiTitle: "Domain search for a trusted server, never a browser.",
    apiLead: "POST /api/v1/domains uses a bearer key from your Sajda account. It accepts a bounded query or exact domains, verifies through supported registry routes, and returns availability with its evidence. Keep the key on your server.",
    serverOnly: "Server-side only",
    endpointLabel: "Illustrative request",
    contractLabel: "Machine-readable contract",
    copy: "Copy",
    copied: "Copied",
    boundariesLabel: "Operating boundaries",
    boundariesTitle: "The useful limits are part of the product.",
    boundaries: [
      { title: "Availability is evidence-led", body: "A result can be available, taken, or unknown. Unknown is never a registration claim." },
      { title: "Prices are not checkout quotes", body: "Provider signals stay separate from availability and need final confirmation at the provider." },
      { title: "The key stays off the client", body: "Use your key only from a trusted server. Do not embed it in a site, extension, or mobile app." },
    ],
  },
  sv: {
    documentTitle: "Sajda Developers — API-dokumentation",
    eyebrow: "Sajda Developers",
    navOverview: "Översikt",
    navPublic: "Publikt",
    navV1: "API v1",
    navAccess: "API-nycklar",
    navBack: "Tillbaka till Sajda",
    title: "Ett genomtänkt API för att hitta rätt domän.",
    lead: "Bygg en domänsökning som behåller underlaget vid varje resultat: registermetod, kontrolltid och begränsningarna för varje prissignal är alltid synliga.",
    proofLine: "Det ChatGPT inte kan göra på egen hand: verifiera aktuell domäntillgänglighet och leverantörspriser.",
    heroPrimary: "Läs den publika referensen",
    heroSecondary: "Visa API v1",
    liveLabel: "Produktionsyta",
    liveBody: "Den publika referensen, marknadskontexten och den avgränsade domänsökningen är live. Skapa en API-nyckel på serversidan i ditt Sajda-konto när du behöver autentiserad v1-åtkomst.",
    publicLabel: "Publikt API",
    publicTitle: "Börja med kontraktet, inte med ett löfte.",
    publicLead: "OpenAPI-dokumentet, det källhänvisade faktflödet och en avgränsad domänsökningsroute är publika. De kräver ingen nyckel, inget konto, inget webbläsar-SDK och inget betalflöde.",
    publicReference: "OpenAPI 3.1-referens",
    publicDomains: "Avgränsad domänsökning med registry-underlag",
    protectedDomains: "Nyckelskyddad domänsökning för serverintegrationer",
    publicFacts: "Källhänvisade faktasignaler",
    publicRateLimit: "Delad gräns enligt bästa förmåga: 6 anrop per IP och minut. Svaren har request-id och rate-limit-headers; detta är inte en betald kvot eller ett servicenivåavtal.",
    runExample: "Kör liveexempel",
    running: "Hämtar…",
    runDescription: "Gör ett riktigt POST-anrop till /api/v1/public/domains. Ingen nyckel skickas eller lagras.",
    response: "Svar",
    responseIdle: "Kör det publika anropet för att granska ett aktuellt JSON-svar.",
    responseError: "Den publika endpointen returnerade inte JSON. Kontrollera den deployade applikationens route och försök igen.",
    capabilitiesLabel: "Endpointstatus",
    capabilitiesTitle: "Vad som är publikt och vad som är skyddat.",
    capabilitiesLead: "Publika endpoints är tillgängliga utan nyckel. Autentiserad domänsökning använder en självbetjäningsnyckel från ditt Sajda-konto och ska köras från din server.",
    statusAvailable: "Tillgängligt",
    statusKey: "Nyckel krävs",
    audiencePublic: "Publikt",
    audienceApproved: "Din serverintegration",
    status: "Status",
    audience: "Åtkomst",
    route: "Route",
    action: "Åtgärd",
    open: "Öppna",
    apiLabel: "Autentiserat API v1",
    apiTitle: "Domänsökning för en betrodd server, aldrig en webbläsare.",
    apiLead: "POST /api/v1/domains använder en bearer-nyckel från ditt Sajda-konto. Den tar en avgränsad fråga eller exakta domäner, verifierar genom stödda registervägar och returnerar tillgänglighet med underlag. Nyckeln ska stanna på din server.",
    serverOnly: "Endast server",
    endpointLabel: "Illustrativ förfrågan",
    contractLabel: "Maskinläsbart kontrakt",
    copy: "Kopiera",
    copied: "Kopierat",
    boundariesLabel: "Driftsgränser",
    boundariesTitle: "De användbara begränsningarna är en del av produkten.",
    boundaries: [
      { title: "Tillgänglighet bygger på underlag", body: "Ett resultat kan vara tillgängligt, upptaget eller okänt. Okänt är aldrig ett registreringsanspråk." },
      { title: "Priser är inte kassaofferter", body: "Leverantörssignaler hålls skilda från tillgänglighet och måste bekräftas hos leverantören." },
      { title: "Nyckeln hålls borta från klienten", body: "Använd din nyckel endast från en betrodd server. Bädda aldrig in den i en webbplats, extension eller mobilapp." },
    ],
  },
  es: {
    documentTitle: "Sajda Developers — Documentación de API",
    eyebrow: "Sajda Developers",
    navOverview: "Resumen",
    navPublic: "Público",
    navV1: "API v1",
    navAccess: "Claves API",
    navBack: "Volver a Sajda",
    title: "Una API cuidadosa para encontrar el dominio adecuado.",
    lead: "Crea una búsqueda de dominios que conserve la evidencia junto a cada resultado: el método de registro, la hora de comprobación y los límites de cada señal de precio siempre permanecen visibles.",
    proofLine: "Lo que ChatGPT no puede hacer por sí solo: verificar la disponibilidad actual del dominio y los precios del proveedor.",
    heroPrimary: "Leer la referencia pública",
    heroSecondary: "Ver API v1",
    liveLabel: "Superficie de producción",
    liveBody: "La referencia pública, el endpoint de contexto de mercado y la búsqueda de dominios limitada están en funcionamiento. Crea una clave de API en tu cuenta Sajda cuando necesites acceso v1 autenticado.",
    publicLabel: "API pública",
    publicTitle: "Empieza con el contrato, no con una promesa.",
    publicLead: "El documento OpenAPI, el feed de hechos con fuentes y la ruta de búsqueda de dominios limitada son públicos. No requieren clave, cuenta, SDK de navegador ni pago.",
    publicReference: "Referencia OpenAPI 3.1",
    publicDomains: "Búsqueda de dominios limitada con evidencia de registro",
    protectedDomains: "Búsqueda de dominios con clave para integraciones de servidor",
    publicFacts: "Señales de hechos con fuentes",
    publicRateLimit: "Límite compartido de mejor esfuerzo: 6 solicitudes por IP y minuto. Las respuestas incluyen ID de solicitud y cabeceras de límite; no es una cuota de pago ni un acuerdo de nivel de servicio.",
    runExample: "Ejecutar ejemplo real",
    running: "Solicitando…",
    runDescription: "Realiza una petición POST real a /api/v1/public/domains. No se envía ni almacena ninguna clave.",
    response: "Respuesta",
    responseIdle: "Ejecuta la petición pública para inspeccionar una respuesta JSON actual.",
    responseError: "El endpoint público no devolvió JSON. Comprueba la ruta de la aplicación desplegada e inténtalo de nuevo.",
    capabilitiesLabel: "Estado de endpoints",
    capabilitiesTitle: "Qué es público y qué está protegido.",
    capabilitiesLead: "Los endpoints públicos están disponibles sin clave. La búsqueda de dominios autenticada usa una clave autoservicio de tu cuenta Sajda y debe ejecutarse desde tu servidor.",
    statusAvailable: "Disponible",
    statusKey: "Requiere clave",
    audiencePublic: "Público",
    audienceApproved: "Tu integración de servidor",
    status: "Estado",
    audience: "Acceso",
    route: "Ruta",
    action: "Acción",
    open: "Abrir",
    apiLabel: "API v1 autenticada",
    apiTitle: "Búsqueda de dominios para un servidor de confianza, nunca para un navegador.",
    apiLead: "POST /api/v1/domains usa una clave bearer de tu cuenta Sajda. Acepta una consulta limitada o dominios exactos, verifica mediante rutas de registro compatibles y devuelve disponibilidad con evidencia. La clave debe permanecer en tu servidor.",
    serverOnly: "Solo servidor",
    endpointLabel: "Solicitud ilustrativa",
    contractLabel: "Contrato legible por máquina",
    copy: "Copiar",
    copied: "Copiado",
    boundariesLabel: "Límites operativos",
    boundariesTitle: "Los límites útiles son parte del producto.",
    boundaries: [
      { title: "La disponibilidad se basa en evidencia", body: "Un resultado puede estar disponible, ocupado o ser desconocido. Desconocido nunca es una afirmación de registro." },
      { title: "Los precios no son cotizaciones de checkout", body: "Las señales del proveedor permanecen separadas de la disponibilidad y requieren confirmación final del proveedor." },
      { title: "La clave no llega al cliente", body: "Usa tu clave solo desde un servidor de confianza. No la incluyas en un sitio, extensión o aplicación móvil." },
    ],
  },
  fr: {
    documentTitle: "Sajda Developers — Documentation API",
    eyebrow: "Sajda Developers",
    navOverview: "Aperçu",
    navPublic: "Public",
    navV1: "API v1",
    navAccess: "Clés API",
    navBack: "Retour à Sajda",
    title: "Une API précise pour trouver le bon domaine.",
    lead: "Construisez une recherche de domaines qui conserve les éléments de preuve près de chaque résultat : méthode de registre, heure de vérification et limites de chaque signal de prix restent visibles.",
    proofLine: "Ce que ChatGPT ne peut pas faire seul : vérifier la disponibilité actuelle d’un domaine et les prix du fournisseur.",
    heroPrimary: "Lire la référence publique",
    heroSecondary: "Voir l’API v1",
    liveLabel: "Surface de production",
    liveBody: "La référence publique, l’endpoint de contexte de marché et la recherche de domaines bornée sont en ligne. Créez une clé API dans votre compte Sajda lorsque vous avez besoin d’un accès v1 authentifié.",
    publicLabel: "API publique",
    publicTitle: "Commencez par le contrat, pas par une promesse.",
    publicLead: "Le document OpenAPI, le flux de faits sourcés et la route de recherche de domaines bornée sont publics. Ils ne nécessitent ni clé, ni compte, ni SDK navigateur, ni paiement.",
    publicReference: "Référence OpenAPI 3.1",
    publicDomains: "Recherche de domaines bornée avec preuves de registre",
    protectedDomains: "Recherche de domaines avec clé pour intégrations serveur",
    publicFacts: "Signaux factuels sourcés",
    publicRateLimit: "Limite partagée au mieux : 6 requêtes par IP et par minute. Les réponses comportent un ID de requête et des en-têtes de limite ; ce n’est ni un quota payant ni un accord de niveau de service.",
    runExample: "Exécuter un exemple réel",
    running: "Requête en cours…",
    runDescription: "Effectue une véritable requête POST vers /api/v1/public/domains. Aucune clé n’est envoyée ni stockée.",
    response: "Réponse",
    responseIdle: "Exécutez la requête publique pour examiner une réponse JSON actuelle.",
    responseError: "L’endpoint public n’a pas renvoyé de JSON. Vérifiez la route de l’application déployée puis réessayez.",
    capabilitiesLabel: "État des endpoints",
    capabilitiesTitle: "Ce qui est public et ce qui est protégé.",
    capabilitiesLead: "Les endpoints publics sont accessibles sans clé. La recherche de domaines authentifiée utilise une clé libre-service de votre compte Sajda et doit s’exécuter depuis votre serveur.",
    statusAvailable: "Disponible",
    statusKey: "Clé requise",
    audiencePublic: "Public",
    audienceApproved: "Votre intégration serveur",
    status: "État",
    audience: "Accès",
    route: "Route",
    action: "Action",
    open: "Ouvrir",
    apiLabel: "API v1 authentifiée",
    apiTitle: "La recherche de domaines pour un serveur fiable, jamais pour un navigateur.",
    apiLead: "POST /api/v1/domains utilise une clé bearer de votre compte Sajda. Elle accepte une requête limitée ou des domaines exacts, vérifie les routes de registre prises en charge et renvoie la disponibilité avec ses preuves. La clé doit rester sur votre serveur.",
    serverOnly: "Serveur uniquement",
    endpointLabel: "Requête illustrative",
    contractLabel: "Contrat lisible par machine",
    copy: "Copier",
    copied: "Copié",
    boundariesLabel: "Limites opérationnelles",
    boundariesTitle: "Les bonnes limites font partie du produit.",
    boundaries: [
      { title: "La disponibilité repose sur des preuves", body: "Un résultat peut être disponible, pris ou inconnu. Inconnu n’est jamais une affirmation d’enregistrement." },
      { title: "Les prix ne sont pas des devis de paiement", body: "Les signaux fournisseurs restent distincts de la disponibilité et nécessitent une confirmation finale du fournisseur." },
      { title: "La clé reste hors du client", body: "Utilisez votre clé uniquement depuis un serveur de confiance. Ne l’intégrez pas dans un site, une extension ou une application mobile." },
    ],
  },
  zh: {
    documentTitle: "Sajda Developers — API 文档",
    eyebrow: "Sajda Developers",
    navOverview: "概览",
    navPublic: "公开",
    navV1: "API v1",
    navAccess: "API 密钥",
    navBack: "返回 Sajda",
    title: "用于寻找合适域名的审慎 API。",
    lead: "构建将证据保留在每个结果旁边的域名搜索：注册局方法、检查时间和每个价格信号的限制始终可见。",
    proofLine: "ChatGPT 单独无法做到的事：验证域名的实时可用性与服务商价格。",
    heroPrimary: "阅读公开参考",
    heroSecondary: "查看 API v1",
    liveLabel: "生产服务面",
    liveBody: "公开参考、市场背景端点和受限域名搜索现已上线。需要已认证 v1 访问时，可在 Sajda 账户中创建服务器端 API 密钥。",
    publicLabel: "公开 API",
    publicTitle: "从契约开始，而非承诺。",
    publicLead: "OpenAPI 文档、带来源的事实数据流和受限域名搜索路由均为公开内容，无需密钥、账户、浏览器 SDK 或支付流程。",
    publicReference: "OpenAPI 3.1 参考",
    publicDomains: "带注册局证据的受限域名搜索",
    protectedDomains: "面向服务器集成的密钥认证域名搜索",
    publicFacts: "带来源的事实信号",
    publicRateLimit: "共享的尽力而为限制：每个 IP 每分钟 6 次请求。响应包含请求 ID 和速率限制标头；这不是付费配额或服务级别协议。",
    runExample: "运行实时示例",
    running: "请求中…",
    runDescription: "对 /api/v1/public/domains 发起真实的 POST 请求。不发送或存储密钥。",
    response: "响应",
    responseIdle: "运行公开请求以查看当前 JSON 响应。",
    responseError: "公开端点没有返回 JSON。请检查已部署应用的路由后重试。",
    capabilitiesLabel: "端点状态",
    capabilitiesTitle: "哪些公开，哪些受保护。",
    capabilitiesLead: "公开端点无需密钥即可使用。已认证的域名搜索使用 Sajda 账户中的自助密钥，必须从你的服务器运行。",
    statusAvailable: "可用",
    statusKey: "需要密钥",
    audiencePublic: "公开",
    audienceApproved: "你的服务器集成",
    status: "状态",
    audience: "访问权限",
    route: "路由",
    action: "操作",
    open: "打开",
    apiLabel: "已认证 API v1",
    apiTitle: "为受信任服务器提供域名搜索，绝不直接用于浏览器。",
    apiLead: "POST /api/v1/domains 使用 Sajda 账户中的 bearer 密钥。它接受受限查询或精确域名，通过支持的注册局路由进行验证，并返回带证据的可用性。密钥必须保留在你的服务器上。",
    serverOnly: "仅限服务器",
    endpointLabel: "示例请求",
    contractLabel: "机器可读契约",
    copy: "复制",
    copied: "已复制",
    boundariesLabel: "运行边界",
    boundariesTitle: "有用的限制是产品的一部分。",
    boundaries: [
      { title: "可用性以证据为准", body: "结果可以是可用、已注册或未知。未知绝不是可以注册的声明。" },
      { title: "价格不是结账报价", body: "服务商信号与可用性分开，仍需在服务商处最终确认。" },
      { title: "密钥不进入客户端", body: "只从可信服务器使用你的密钥。不要嵌入网站、扩展程序或移动应用。" },
    ],
  },
};

type CopyButtonProps = {
  code: string;
  copyLabel: string;
  copiedLabel: string;
  className?: string;
};

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy was not available.");
}

function CopyButton({ code, copyLabel, copiedLabel, className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition-colors hover:border-white/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${className}`}
    >
      <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
      {copied ? copiedLabel : copyLabel}
    </button>
  );
}

function CodeExample({ label, code, copyLabel, copiedLabel }: { label: string; code: string; copyLabel: string; copiedLabel: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-[0_18px_44px_rgba(15,23,42,0.16)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300">
          <TerminalSquare className="h-4 w-4 text-sky-300" aria-hidden="true" />
          {label}
        </span>
        <CopyButton code={code} copyLabel={copyLabel} copiedLabel={copiedLabel} />
      </div>
      <pre className="max-h-[29rem] overflow-auto p-4 text-left text-[11px] leading-6 text-sky-100 sm:p-5 sm:text-[12px]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function StatusBadge({ tone, children }: { tone: "available" | "protected"; children: string }) {
  const styles = tone === "available"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-slate-200 bg-slate-100 text-slate-700";
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold ${styles}`}>{children}</span>;
}

type DeveloperApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  lastFour: string;
  environment: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  scopes: string[];
};

type IssuedApiKey = {
  metadata: DeveloperApiKey;
  rawKey: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readTimestamp(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDeveloperApiKey(value: unknown): DeveloperApiKey | undefined {
  const record = asRecord(value);
  const id = readString(record?.id);
  if (!record || !id) return undefined;

  return {
    id,
    name: readString(record.name) ?? "Untitled key",
    keyPrefix: readString(record.keyPrefix) ?? "",
    lastFour: readString(record.lastFour) ?? "",
    environment: readString(record.environment) ?? "live",
    createdAt: readTimestamp(record.createdAt),
    lastUsedAt: readTimestamp(record.lastUsedAt),
    expiresAt: readTimestamp(record.expiresAt),
    revokedAt: readTimestamp(record.revokedAt),
    scopes: Array.isArray(record.scopes) ? record.scopes.filter((value): value is string => typeof value === "string") : ["domains:search"],
  };
}

async function readApiPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return asRecord(JSON.parse(text)) ?? {};
  } catch {
    return {};
  }
}

function apiErrorMessage(payload: Record<string, unknown>, fallback: string): string {
  return readString(payload.error) ?? readString(payload.message) ?? fallback;
}

function formatKeyDate(value: string | null, language: Language): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language, { dateStyle: "medium" }).format(date);
}

function maskedKey(key: DeveloperApiKey): string {
  const prefix = key.keyPrefix.replace(/[•*]+$/u, "");
  if (prefix && key.lastFour) return `${prefix}••••${key.lastFour}`;
  if (prefix) return `${prefix}••••`;
  if (key.lastFour) return `••••${key.lastFour}`;
  return "••••••••";
}

const permissionScopes = ["domains:search", "account:read", "saved:read", "saved:write", "trading:read", "trading:run", "trading:quote"] as const;
const permissionCopy = {
  en: { title: "Permissions", expiry: "Expires after", expires: "Expires", expired: "Expired", days: "days", hint: "Choose only the access this integration needs. Trading still requires an active Trading plan.", labels: ["Search domains", "Read account and plan", "Read saved domains", "Save and remove domains", "Read Trading reports", "Start and cancel Trading research", "Refresh registrar quotes"] },
  sv: { title: "Behörigheter", expiry: "Upphör efter", expires: "Upphör", expired: "Utgången", days: "dagar", hint: "Välj endast den åtkomst integrationen behöver. Trading kräver fortfarande en aktiv Trading-plan.", labels: ["Sök domäner", "Läs konto och plan", "Läs sparade domäner", "Spara och ta bort domäner", "Läs Trading-rapporter", "Starta och avbryt Trading-analyser", "Uppdatera registrarpriser"] },
  es: { title: "Permisos", expiry: "Caduca después de", expires: "Caduca", expired: "Caducada", days: "días", hint: "Selecciona solo el acceso que necesita esta integración. Trading requiere un plan Trading activo.", labels: ["Buscar dominios", "Leer cuenta y plan", "Leer dominios guardados", "Guardar y eliminar dominios", "Leer informes de Trading", "Iniciar y cancelar análisis de Trading", "Actualizar precios del registrador"] },
  fr: { title: "Autorisations", expiry: "Expire après", expires: "Expiration", expired: "Expirée", days: "jours", hint: "Choisissez uniquement les accès nécessaires. Trading exige toujours un abonnement Trading actif.", labels: ["Rechercher des domaines", "Lire le compte et l’abonnement", "Lire les domaines enregistrés", "Enregistrer et supprimer des domaines", "Lire les rapports Trading", "Lancer et annuler les analyses Trading", "Actualiser les prix du bureau d’enregistrement"] },
  zh: { title: "权限", expiry: "有效期", expires: "到期时间", expired: "已到期", days: "天", hint: "仅选择此集成所需的权限。Trading 仍然需要有效的 Trading 套餐。", labels: ["搜索域名", "读取账户与套餐", "读取已保存的域名", "保存和删除域名", "读取 Trading 报告", "启动和取消 Trading 研究", "刷新注册商报价"] },
};

function DeveloperKeyWorkspace(props: { copy: DeveloperKeyCopy; language: Language }) {
  const { user } = useAuth();
  // Remount all secret-bearing state on account changes, including sign-out.
  return <DeveloperKeyAccountWorkspace key={isLocalTestMode() ? "local-test" : user?.id ?? "anonymous"} {...props} />;
}

function DeveloperKeyAccountWorkspace({ copy, language }: { copy: DeveloperKeyCopy; language: Language }) {
  const { user, loading: authLoading } = useAuth();
  const localTestMode = isLocalTestMode();
  const accountId = user?.id;
  const permissions = permissionCopy[language];
  const lifetime = useRef<AbortController>();
  const [keys, setKeys] = useState<DeveloperApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [requestError, setRequestError] = useState<string>();
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string>();
  const [issuedKey, setIssuedKey] = useState<IssuedApiKey>();
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["domains:search"]);
  const [expiresInDays, setExpiresInDays] = useState(90);

  const requestKeys = useCallback(async (method = "GET", body?: unknown, id?: string) => {
    const signal = lifetime.current?.signal;
    signal?.throwIfAborted();
    if (!localTestMode) {
      const current = await readAccountSession();
      signal?.throwIfAborted();
      if (!accountId || current?.user.id !== accountId) throw new Error(copy.requestError);
    }
    const path = `/api/developer/api-keys${id ? `?id=${encodeURIComponent(id)}` : ""}`;
    const response = import.meta.env.VITE_SAJDA_SURFACE === "native"
      ? await nativeRequest("/api/native/account","POST",{path,method,body,accountId},signal)
      : await fetch(path, {
      method, credentials: "same-origin", cache: "no-store", redirect: "error", signal,
      headers: { Accept: "application/json", ...(!localTestMode && accountId ? { "X-Sajda-Account": accountId } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await readApiPayload(response);
    signal?.throwIfAborted();
    if (!response.ok) throw new Error(apiErrorMessage(payload, copy.requestError));
    return payload;
  }, [accountId, localTestMode, copy.requestError]);

  const loadKeys = useCallback(async () => {
    if (!accountId && !localTestMode) {
      setKeys([]);
      return;
    }

    setIsLoading(true);
    setRequestError(undefined);
    try {
      const payload = await requestKeys();
      const rawKeys = Array.isArray(payload.keys) ? payload.keys : [];
      setKeys(rawKeys.map(parseDeveloperApiKey).filter((key): key is DeveloperApiKey => Boolean(key)));
    } catch (error) {
      if (!lifetime.current?.signal.aborted) setRequestError(error instanceof Error && error.message ? error.message : copy.requestError);
    } finally {
      if (!lifetime.current?.signal.aborted) setIsLoading(false);
    }
  }, [accountId, copy.requestError, localTestMode, requestKeys]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void loadKeys();
    return () => controller.abort();
  }, [loadKeys]);

  const createKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = keyName.trim();
    if (!name) {
      setNameError(copy.nameRequired);
      return;
    }
    if ((!accountId && !localTestMode) || !selectedScopes.length) return;

    setIsCreating(true);
    setNameError(undefined);
    setRequestError(undefined);
    try {
      const payload = await requestKeys("POST", localTestMode ? { name } : { name, scopes: selectedScopes, expiresInDays });
      const metadata = parseDeveloperApiKey(payload.key);
      const rawKey = readString(payload.apiKey);
      if (!metadata || !rawKey) throw new Error(apiErrorMessage(payload, copy.requestError));

      setKeys((current) => [metadata, ...current.filter((key) => key.id !== metadata.id)]);
      setKeyName("");
      setIsCreateOpen(false);
      setIssuedKey({ metadata, rawKey });
    } catch (error) {
      if (!lifetime.current?.signal.aborted) setNameError(error instanceof Error && error.message ? error.message : copy.requestError);
    } finally {
      if (!lifetime.current?.signal.aborted) setIsCreating(false);
    }
  };

  const revokeKey = async (key: DeveloperApiKey) => {
    if ((!accountId && !localTestMode) || key.revokedAt) return;
    if (!window.confirm(copy.revokeConfirm)) return;

    setRevokingId(key.id);
    setRequestError(undefined);
    try {
      const payload = await requestKeys("DELETE", undefined, key.id);
      const revokedKey = parseDeveloperApiKey(payload.key);
      if (!revokedKey) throw new Error(apiErrorMessage(payload, copy.requestError));
      setKeys((current) => current.map((entry) => entry.id === revokedKey.id ? revokedKey : entry));
    } catch (error) {
      if (!lifetime.current?.signal.aborted) setRequestError(error instanceof Error && error.message ? error.message : copy.requestError);
    } finally {
      if (!lifetime.current?.signal.aborted) setRevokingId(undefined);
    }
  };

  return (
    <section id="access" className="mx-auto w-full max-w-7xl scroll-mt-24 px-5 py-14 sm:px-7 sm:py-20">
      <div className="overflow-hidden rounded-[1.35rem] border border-primary/20 bg-card shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <div className="border-b border-border bg-[linear-gradient(125deg,rgba(37,99,235,0.07),transparent_45%)] p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{localTestMode ? copy.localBadge : copy.sectionLabel}</p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{localTestMode ? copy.localTitle : copy.title}</h2>
              <p className="mt-4 leading-7 text-muted-foreground sm:text-lg">{localTestMode ? copy.localLead : copy.lead}</p>
              <p className="mt-3 text-sm font-bold leading-6 text-foreground sm:text-base">{copy.benefitLine}</p>
            </div>
            {(user && !authLoading) || localTestMode ? <Button type="button" onClick={() => { setSelectedScopes(["domains:search"]); setExpiresInDays(90); setIsCreateOpen(true); }} className="shrink-0"><Plus className="h-4 w-4" />{localTestMode ? copy.createTest : copy.create}</Button> : null}
          </div>
        </div>

        {!authLoading && !user && !localTestMode ? (
          <div className="p-6 sm:p-8">
            <div className="max-w-2xl rounded-xl border border-border bg-background p-5 sm:p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound className="h-5 w-5" aria-hidden="true" /></span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em]">{copy.signInTitle}</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{copy.signInLead}</p>
              <Button asChild className="mt-5"><Link to="/auth?next=/developers%23access">{copy.signInAction}<ArrowRight className="h-4 w-4" /></Link></Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.56fr)]">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">{copy.listTitle}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.listLead}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadKeys()} disabled={isLoading || authLoading}><RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />{copy.refresh}</Button>
              </div>

              {requestError ? <p role="alert" className="mt-4 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{requestError}</p> : null}
              {authLoading || isLoading ? <div className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{copy.loading}</div> : null}
              {!authLoading && !isLoading && !keys.length ? <p className="mt-5 rounded-xl border border-dashed border-border bg-background px-4 py-5 text-sm leading-6 text-muted-foreground">{copy.empty}</p> : null}
              {!authLoading && !isLoading && keys.length ? <ul className="mt-5 grid gap-3">{keys.map((key) => {
                const isRevoking = revokingId === key.id;
                const expired = Boolean(key.expiresAt && Date.parse(key.expiresAt) <= Date.now());
                return <li key={key.id} className={`rounded-xl border p-4 ${key.revokedAt ? "border-border bg-muted/35 opacity-75" : "border-border bg-background"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{key.name}</h4><span className="rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-primary">{key.environment}</span>{key.revokedAt || expired ? <span className="rounded-full border border-destructive/20 bg-destructive/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-destructive">{key.revokedAt ? copy.revoked : permissions.expired}</span> : null}</div><code className="mt-2 block break-all text-xs font-semibold text-muted-foreground">{maskedKey(key)}</code></div>
                    {!key.revokedAt ? <Button type="button" variant="outline" size="sm" onClick={() => void revokeKey(key)} disabled={isRevoking}>{isRevoking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{isRevoking ? copy.revoking : copy.revoke}</Button> : null}
                  </div>
                  <p className="mt-3 break-words text-xs leading-5 text-muted-foreground" aria-label={permissions.title}>{key.scopes.join(" · ")}</p>
                  <dl className="mt-4 grid gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-3"><div><dt className="font-bold uppercase tracking-[0.1em]">{copy.created}</dt><dd className="mt-1 font-medium text-foreground">{formatKeyDate(key.createdAt, language)}</dd></div><div><dt className="font-bold uppercase tracking-[0.1em]">{copy.lastUsed}</dt><dd className="mt-1 font-medium text-foreground">{key.lastUsedAt ? formatKeyDate(key.lastUsedAt, language) : copy.neverUsed}</dd></div><div><dt className="font-bold uppercase tracking-[0.1em]">{permissions.expires}</dt><dd className="mt-1 font-medium text-foreground">{formatKeyDate(key.expiresAt, language)}</dd></div></dl>
                </li>;
              })}</ul> : null}
            </div>

            <aside className="rounded-xl border border-primary/15 bg-primary/[0.035] p-5 sm:p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><LockKeyhole className="h-5 w-5" aria-hidden="true" /></span>
              <h3 className="mt-5 text-lg font-semibold tracking-[-0.025em]">{copy.usageTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.usageLead}</p>
              <p className="mt-5 border-t border-primary/15 pt-4 text-xs leading-5 text-muted-foreground">{localTestMode ? copy.localNotice : copy.serverHint}</p>
            </aside>
          </div>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) { setNameError(undefined); setKeyName(""); } }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{localTestMode ? copy.createTestTitle : copy.createTitle}</DialogTitle><DialogDescription>{copy.createLead}</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void createKey(event)} className="space-y-5">
            <div className="space-y-2"><Label htmlFor="developer-key-name">{copy.nameLabel}</Label><Input id="developer-key-name" autoFocus value={keyName} onChange={(event) => { setKeyName(event.target.value); setNameError(undefined); }} placeholder={copy.namePlaceholder} maxLength={80} disabled={isCreating} />{nameError ? <p role="alert" className="text-sm text-destructive">{nameError}</p> : null}</div>
            {!localTestMode ? <>
              <fieldset className="space-y-3" disabled={isCreating}>
                <legend className="mb-2 text-sm font-semibold">{permissions.title}</legend>
                <p className="text-xs leading-5 text-muted-foreground">{permissions.hint}</p>
                <div className="grid gap-2">{permissionScopes.map((scope, index) => <label key={scope} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${selectedScopes.includes(scope) ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                  <input type="checkbox" value={scope} checked={selectedScopes.includes(scope)} onChange={(event) => setSelectedScopes(current => event.target.checked ? [...current, scope] : current.filter(value => value !== scope))} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
                  <span className="min-w-0"><span className="block font-medium">{permissions.labels[index]}</span><code className="text-xs text-muted-foreground">{scope}</code></span>
                </label>)}</div>
              </fieldset>
              <div className="space-y-2"><Label htmlFor="developer-key-expiry">{permissions.expiry}</Label>
                <select id="developer-key-expiry" value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))} disabled={isCreating} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {[7, 30, 90, 180, 365].map(days => <option key={days} value={days}>{days} {permissions.days}</option>)}
                </select>
              </div>
            </> : null}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isCreating}>{copy.cancel}</Button><Button type="submit" disabled={isCreating || (!localTestMode && !selectedScopes.length)}>{isCreating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{isCreating ? copy.creating : localTestMode ? copy.createTestAction : copy.createAction}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(issuedKey)} onOpenChange={(open) => { if (!open) setIssuedKey(undefined); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{copy.keyCreated}</DialogTitle><DialogDescription>{copy.keyCreatedLead}</DialogDescription></DialogHeader>
          {issuedKey ? <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">{issuedKey.metadata.name}</p><code className="mt-3 block break-all rounded-lg bg-slate-950 p-3 text-sm font-semibold text-sky-100">{issuedKey.rawKey}</code></div> : null}
          <DialogFooter><CopyButton code={issuedKey?.rawKey ?? ""} copyLabel={copy.copyKey} copiedLabel={copy.keyCopied} className="border-border bg-card text-foreground hover:border-primary/35 hover:bg-accent" /><Button type="button" onClick={() => setIssuedKey(undefined)}>{copy.done}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

const mcpCopy = {
  en: { title: "Connect your tools to Sajda.", lead: "Use MCP to search domains, work with your saved list and read Trading research from the same Sajda account.",
    auth: "Create a key with only the permissions your integration needs. Store it in your MCP client's secret settings and send it as a Bearer header on every request.",
    protocol: "Streamable HTTP · protocol 2025-11-25 · server 1.0.0",
    compatibility: "Use a client that supports configured Bearer headers. OAuth sign-in is not available.",
    behavior: "Reading status or a report never starts research. Start, advance, stop and quote refresh are explicit tools. Trading still requires an active plan; no tool purchases a domain.",
    rest: "The same account operations are available through the scoped REST API.", permission: "Choose access", reference: "Open API reference", keys: "Manage API keys" },
  sv: { title: "Anslut dina verktyg till Sajda.", lead: "Använd MCP för att söka domäner, arbeta med din sparade lista och läsa Trading-analyser från samma Sajda-konto.",
    auth: "Skapa en nyckel med de behörigheter integrationen behöver. Spara den i MCP-klientens hemliga inställningar och skicka den som Bearer-header vid varje anrop.",
    protocol: "Streamable HTTP · protokoll 2025-11-25 · server 1.0.0",
    compatibility: "Använd en klient med stöd för konfigurerade Bearer-headers. OAuth-inloggning är inte tillgänglig.",
    behavior: "Status och rapporter startar aldrig analyser. Start, fortsättning, stopp och prisuppdatering är uttryckliga verktyg. Trading kräver fortfarande en aktiv plan; inget verktyg köper domäner.",
    rest: "Samma kontofunktioner finns i REST-API:t med avgränsade behörigheter.", permission: "Välj åtkomst", reference: "Öppna API-referensen", keys: "Hantera API-nycklar" },
  es: { title: "Conecta tus herramientas a Sajda.", lead: "Usa MCP para buscar dominios, trabajar con tu lista guardada y leer análisis de Trading de la misma cuenta de Sajda.",
    auth: "Crea una clave con los permisos que necesita tu integración. Guárdala en la configuración de secretos de tu cliente MCP y envíala como cabecera Bearer en cada solicitud.",
    protocol: "Streamable HTTP · protocolo 2025-11-25 · servidor 1.0.0",
    compatibility: "Usa un cliente compatible con cabeceras Bearer configuradas. El inicio de sesión OAuth no está disponible.",
    behavior: "Leer el estado o un informe nunca inicia una investigación. Iniciar, avanzar, detener y actualizar precios son herramientas explícitas. Trading requiere un plan activo; ninguna herramienta compra dominios.",
    rest: "Las mismas operaciones de cuenta están disponibles en la API REST con permisos definidos.", permission: "Elige el acceso", reference: "Abrir referencia API", keys: "Gestionar claves API" },
  fr: { title: "Connectez vos outils à Sajda.", lead: "Utilisez MCP pour rechercher des domaines, gérer votre liste et lire les analyses Trading du même compte Sajda.",
    auth: "Créez une clé avec les autorisations nécessaires. Conservez-la dans les paramètres secrets de votre client MCP et envoyez-la en en-tête Bearer à chaque requête.",
    protocol: "Streamable HTTP · protocole 2025-11-25 · serveur 1.0.0",
    compatibility: "Utilisez un client acceptant des en-têtes Bearer configurés. La connexion OAuth n’est pas disponible.",
    behavior: "Lire le statut ou un rapport ne lance jamais une analyse. Lancer, avancer, arrêter et actualiser un prix sont des outils explicites. Trading exige un abonnement actif ; aucun outil n’achète de domaine.",
    rest: "Les mêmes opérations sont disponibles dans l’API REST avec des autorisations précises.", permission: "Choisir les accès", reference: "Ouvrir la référence API", keys: "Gérer les clés API" },
  zh: { title: "将你的工具连接到 Sajda。", lead: "通过 MCP 搜索域名、管理收藏并读取同一 Sajda 账户的 Trading 研究报告。",
    auth: "创建仅含所需权限的密钥，将其保存在 MCP 客户端的机密设置中，并在每次请求中通过 Bearer 请求头发送。",
    protocol: "Streamable HTTP · 协议 2025-11-25 · 服务版本 1.0.0",
    compatibility: "请使用支持配置 Bearer 请求头的客户端。目前不提供 OAuth 登录。",
    behavior: "读取状态或报告不会启动研究。启动、推进、停止和刷新报价均需显式调用工具。Trading 仍需有效套餐；所有工具均不会购买域名。",
    rest: "相同的账户操作也可通过带权限控制的 REST API 使用。", permission: "选择权限", reference: "打开 API 参考", keys: "管理 API 密钥" },
};

function DeveloperMcpSection({ language, origin, copyLabel, copiedLabel }: { language: Language; origin: string; copyLabel: string; copiedLabel: string }) {
  const copy = mcpCopy[language];
  return <section id="mcp" className="scroll-mt-24 border-y border-border/80 bg-card">
    <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-12 sm:px-7 sm:py-16 lg:grid-cols-2 lg:gap-14">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">MCP</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em]">{copy.title}</h2>
        <p className="mt-4 leading-7 text-muted-foreground">{copy.lead}</p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{copy.auth}</p>
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <code className="min-w-0 break-all text-sm font-semibold">{origin}/api/mcp</code>
            <CopyButton code={`${origin}/api/mcp`} copyLabel={copyLabel} copiedLabel={copiedLabel} className="border-border bg-card text-foreground" />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.protocol}</p>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{copy.compatibility}</p>
      </div>
      <div>
        <h3 className="text-sm font-bold">{copy.permission}</h3>
        <dl className="mt-3 divide-y divide-border">
          {permissionScopes.map((scope, index) => <div key={scope} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 py-2.5">
            <dt><code className="text-xs font-semibold text-primary">{scope}</code></dt>
            <dd className="text-sm text-muted-foreground">{permissionCopy[language].labels[index]}</dd>
          </div>)}
        </dl>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">{copy.behavior}</p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{copy.rest} <code className="break-all text-xs">/api/v1/account?resource=membership</code></p>
        <a href={`${origin}/api/openapi`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary">
          {copy.reference}<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </div>
  </section>;
}

export default function Developers() {
  const { language } = useLanguage();
  const keyCopy = developerKeyCopy[language];
  const keyPortalEnabled = isLocalTestMode() || isAccountAuthConfigured;
  const accessCopy = {
    en: {
      liveLabel: "Public API",
      liveBody: "Try the public endpoints below without an account. Self-service API key creation is not available in this deployment.",
      capabilitiesLead: "Public endpoints do not require a key. The protected v1 route requires a server key provisioned by the operator; this page cannot create one yet.",
      apiLead: "POST /api/v1/domains requires an operator-provisioned bearer key. Keep it on your server. To try domain search without a key, use POST /api/v1/public/domains above.",
    },
    sv: {
      liveLabel: "Publikt API",
      liveBody: "Prova de publika ändpunkterna nedan utan konto. Det går ännu inte att skapa egna API-nycklar i den här driftsmiljön.",
      capabilitiesLead: "Publika ändpunkter kräver ingen nyckel. Skyddad v1-åtkomst kräver en servernyckel från operatören; den kan ännu inte skapas på den här sidan.",
      apiLead: "POST /api/v1/domains kräver en Bearer-nyckel från operatören. Förvara den på servern. Prova domänsökning utan nyckel med POST /api/v1/public/domains ovan.",
    },
    es: {
      liveLabel: "API pública",
      liveBody: "Prueba los endpoints públicos sin cuenta. La creación de claves de API de autoservicio aún no está disponible en este entorno.",
      capabilitiesLead: "Los endpoints públicos no requieren clave. La ruta v1 protegida necesita una clave de servidor proporcionada por el operador; esta página aún no puede crearla.",
      apiLead: "POST /api/v1/domains requiere una clave bearer proporcionada por el operador. Guárdala en el servidor. Para probar sin clave, usa POST /api/v1/public/domains arriba.",
    },
    fr: {
      liveLabel: "API publique",
      liveBody: "Essayez les endpoints publics sans compte. La création de clés API en libre-service n’est pas encore disponible dans cet environnement.",
      capabilitiesLead: "Les endpoints publics ne nécessitent pas de clé. La route v1 protégée exige une clé serveur fournie par l’opérateur ; cette page ne peut pas encore la créer.",
      apiLead: "POST /api/v1/domains exige une clé bearer fournie par l’opérateur. Gardez-la sur votre serveur. Pour essayer sans clé, utilisez POST /api/v1/public/domains ci-dessus.",
    },
    zh: {
      liveLabel: "公开 API",
      liveBody: "无需账户即可尝试下方的公开端点。此部署尚不支持自助创建 API 密钥。",
      capabilitiesLead: "公开端点不需要密钥。受保护的 v1 路由需要由运营者配置的服务器密钥；此页面暂时无法创建密钥。",
      apiLead: "POST /api/v1/domains 需要运营者配置的 bearer 密钥，请保存在服务器上。如需无密钥测试，请使用上方的 POST /api/v1/public/domains。",
    },
  }[language];
  const copy = keyPortalEnabled ? developerCopy[language] : { ...developerCopy[language], ...accessCopy };
  const [publicResponse, setPublicResponse] = useState<string>();
  const [publicRequestState, setPublicRequestState] = useState<"idle" | "loading" | "success" | "error">("idle");

  const origin = isNativeApp ? import.meta.env.VITE_NATIVE_API_ORIGIN?.trim() ?? ""
    : typeof window === "undefined" ? "https://sajda.dev" : window.location.origin;
  const domainsRequest = useMemo(() => `curl --request POST "${origin}/api/v1/domains" \\
  --header "Authorization: Bearer $SAJDA_API_KEY" \\
  --header "Content-Type: application/json" \\
  --data '{
    "query": "calm scheduling for small clinics",
    "tlds": ["com", "dev"],
    "count": 6,
    "locale": "en",
    "providers": ["loopia", "spaceship"],
    "creativeMode": "medium"
  }'`, [origin]);
  const publicDomainsRequest = useMemo(() => `curl --request POST "${origin}/api/v1/public/domains" \\
  --header "Content-Type: application/json" \\
  --data '{
    "query": "calm scheduling for small clinics",
    "tlds": ["com", "dev"],
    "count": 3,
    "locale": "en",
    "providers": ["loopia"],
    "creativeMode": "medium"
  }'`, [origin]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = copy.documentTitle;
    return () => { document.title = previousTitle; };
  }, [copy.documentTitle]);

  const runPublicExample = async () => {
    setPublicRequestState("loading");
    setPublicResponse(undefined);
    try {
      const response = await productFetch("/api/v1/public/domains", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "calm scheduling for small clinics",
          tlds: ["com", "dev"],
          count: 3,
          locale: "en",
          providers: ["loopia"],
          creativeMode: "medium",
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) throw new Error("Expected JSON response");
      const data: unknown = await response.json();
      setPublicResponse(JSON.stringify(data, null, 2));
      setPublicRequestState(response.ok ? "success" : "error");
    } catch {
      setPublicResponse(copy.responseError);
      setPublicRequestState("error");
    }
  };

  const endpoints = [
    { method: "GET", path: "/api/openapi", description: copy.publicReference, status: copy.statusAvailable, audience: copy.audiencePublic, href: "/api/openapi", tone: "available" as const },
    { method: "POST", path: "/api/v1/public/domains", description: copy.publicDomains, status: copy.statusAvailable, audience: copy.audiencePublic, href: "#public-console", tone: "available" as const },
    { method: "GET", path: "/api/fact-signals", description: copy.publicFacts, status: copy.statusAvailable, audience: copy.audiencePublic, href: "/api/fact-signals?tld=com&limit=3", tone: "available" as const },
    { method: "POST", path: "/api/v1/domains", description: copy.protectedDomains, status: copy.statusKey, audience: copy.audienceApproved, href: "#api-v1", tone: "protected" as const },
  ];

  if (isNativeApp) return <div className="min-h-screen bg-background text-foreground">
    <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-5 pt-6 sm:px-7">
      <h1 className="text-xl font-semibold">{mcpCopy[language].keys}</h1>
      <a href="#mcp" className="text-sm font-semibold text-primary">MCP<ArrowRight className="ml-2 inline h-4 w-4" aria-hidden="true" /></a>
    </div>
    {keyPortalEnabled ? <DeveloperKeyWorkspace copy={keyCopy} language={language} /> : null}
    <DeveloperMcpSection language={language} origin={origin} copyLabel={copy.copy} copiedLabel={copy.copied} />
  </div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[4.5rem] w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-7">
          <Link to="/" className="inline-flex shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label="Sajda">
            <img src="/sajda-logo.svg" alt="Sajda" className="h-7 w-auto sm:h-8" />
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-semibold text-muted-foreground lg:flex" aria-label="Developer navigation">
            <a href="#overview" className="transition-colors hover:text-foreground">{copy.navOverview}</a>
            <a href="#public" className="transition-colors hover:text-foreground">{copy.navPublic}</a>
            <a href="#api-v1" className="transition-colors hover:text-foreground">{copy.navV1}</a>
            <a href="#mcp" className="transition-colors hover:text-foreground">MCP</a>
            {keyPortalEnabled ? <a href="#access" className="transition-colors hover:text-foreground">{copy.navAccess}</a> : null}
          </nav>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/" className="hidden items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground md:inline-flex">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {copy.navBack}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main>
        <section id="overview" className="sajda-canvas scroll-mt-24 overflow-hidden border-b border-border/80">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.68fr)] lg:items-center lg:gap-16 lg:py-24">
            <div className="relative z-10 max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/85 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-primary shadow-sm">
                <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.eyebrow}
              </div>
              <h1 className="mt-6 max-w-[14ch] text-balance text-4xl font-semibold leading-[1.03] tracking-[-0.055em] sm:text-6xl">{copy.title}</h1>
              <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{copy.lead}</p>
              <p className="mt-4 max-w-2xl text-pretty text-base font-bold leading-7 text-foreground sm:text-lg sm:leading-8">{copy.proofLine}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#public" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">{copy.heroPrimary}<ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
                <a href="#api-v1" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-input bg-card px-5 text-sm font-semibold transition-colors hover:bg-accent hover:text-accent-foreground">{copy.heroSecondary}<ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
              </div>
            </div>

            <aside className="relative overflow-hidden rounded-[1.35rem] border border-primary/15 bg-card/95 p-5 shadow-[0_20px_54px_rgba(15,23,42,0.1)] sm:p-6" aria-label={copy.liveLabel}>
              <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full border-[18px] border-primary/10" aria-hidden="true" />
              <div className="relative flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{copy.liveLabel}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.liveBody}</p></div></div>
              <div className="relative mt-6 space-y-3 border-t border-border pt-5">
                <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">GET /api/openapi</span><StatusBadge tone="available">{copy.statusAvailable}</StatusBadge></div>
                <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">POST /api/v1/public/domains</span><StatusBadge tone="available">{copy.statusAvailable}</StatusBadge></div>
                <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">GET /api/fact-signals</span><StatusBadge tone="available">{copy.statusAvailable}</StatusBadge></div>
                <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">POST /api/v1/domains</span><StatusBadge tone="protected">{copy.statusKey}</StatusBadge></div>
              </div>
            </aside>
          </div>
        </section>

        <section id="public" className="mx-auto w-full max-w-7xl scroll-mt-24 px-5 py-14 sm:px-7 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.74fr)_minmax(25rem,1.06fr)] lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{copy.publicLabel}</p>
              <h2 className="mt-3 max-w-xl text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{copy.publicTitle}</h2>
              <p className="mt-4 max-w-xl text-pretty leading-7 text-muted-foreground sm:text-lg">{copy.publicLead}</p>
              <p className="mt-5 max-w-xl border-l-2 border-primary/30 pl-4 text-sm leading-6 text-muted-foreground">{copy.publicRateLimit}</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <a href="/api/openapi" target="_blank" rel="noreferrer" className="sajda-interactive flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileJson className="h-5 w-5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{copy.publicReference}</span><code className="mt-1 block text-xs text-muted-foreground">GET /api/openapi</code></span><ArrowUpRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /></a>
                <a href="#public-console" className="sajda-interactive flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Code2 className="h-5 w-5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{copy.publicDomains}</span><code className="mt-1 block text-xs text-muted-foreground">POST /api/v1/public/domains</code></span><ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /></a>
                <a href="/api/fact-signals?tld=com&limit=3" target="_blank" rel="noreferrer" className="sajda-interactive flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><BookOpen className="h-5 w-5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{copy.publicFacts}</span><code className="mt-1 block text-xs text-muted-foreground">GET /api/fact-signals</code></span><ArrowUpRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /></a>
              </div>
            </div>

            <div id="public-console" className="scroll-mt-24 overflow-hidden rounded-[1.25rem] border border-slate-800 bg-slate-950 shadow-[0_20px_54px_rgba(15,23,42,0.14)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5"><div className="flex items-center gap-2 text-sm font-semibold text-slate-100"><TerminalSquare className="h-4 w-4 text-sky-300" aria-hidden="true" /> POST /api/v1/public/domains</div><div className="flex items-center gap-2"><CopyButton code={publicDomainsRequest} copyLabel={copy.copy} copiedLabel={copy.copied} /><button type="button" onClick={runPublicExample} disabled={publicRequestState === "loading"} className="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-400 px-3 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-300 disabled:cursor-wait disabled:opacity-70"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />{publicRequestState === "loading" ? copy.running : copy.runExample}</button></div></div>
              <div className="p-4 sm:p-5"><p className="text-sm leading-6 text-slate-300">{copy.runDescription}</p><div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">{copy.response}</p><pre aria-live="polite" className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-left text-[11px] leading-5 text-slate-200"><code>{publicResponse ?? copy.responseIdle}</code></pre></div></div>
            </div>
          </div>
        </section>

        <section className="border-y border-border/80 bg-card">
          <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20">
            <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{copy.capabilitiesLabel}</p><h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{copy.capabilitiesTitle}</h2><p className="mt-4 leading-7 text-muted-foreground sm:text-lg">{copy.capabilitiesLead}</p></div>
            <div className="mt-8 overflow-hidden rounded-xl border border-border">
              <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(9rem,0.65fr)_minmax(11rem,0.82fr)_auto] gap-4 border-b border-border bg-muted/55 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground md:grid"><span>{copy.route}</span><span>{copy.status}</span><span>{copy.audience}</span><span>{copy.action}</span></div>
              {endpoints.map((endpoint) => <article key={endpoint.path} className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1.1fr)_minmax(9rem,0.65fr)_minmax(11rem,0.82fr)_auto] md:items-center md:gap-4 md:px-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-extrabold tracking-[0.1em] text-primary">{endpoint.method}</span><code className="text-sm font-bold text-foreground">{endpoint.path}</code></div><p className="mt-2 text-sm text-muted-foreground">{endpoint.description}</p></div><div><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground md:hidden">{copy.status}: </span><StatusBadge tone={endpoint.tone}>{endpoint.status}</StatusBadge></div><p className="text-sm font-medium text-muted-foreground"><span className="text-[10px] font-bold uppercase tracking-[0.12em] md:hidden">{copy.audience}: </span>{endpoint.audience}</p>{endpoint.href.startsWith("#") ? <a href={endpoint.href} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary/75">{copy.open}<ArrowRight className="h-4 w-4" aria-hidden="true" /></a> : <a href={endpoint.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary/75">{copy.open}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>}</article>)}
            </div>
          </div>
        </section>

        <section id="api-v1" className="scroll-mt-24"><div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-14 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,0.74fr)_minmax(26rem,1.1fr)] lg:gap-16"><div><div className="flex flex-wrap items-center gap-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{copy.apiLabel}</p><span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700"><LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />{copy.serverOnly}</span></div><h2 className="mt-3 max-w-xl text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{copy.apiTitle}</h2><p className="mt-4 max-w-xl leading-7 text-muted-foreground sm:text-lg">{copy.apiLead}</p><a href="/api/openapi" target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/75"><Braces className="h-4 w-4" aria-hidden="true" />{copy.contractLabel}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a></div><CodeExample label={`${copy.endpointLabel} · POST /api/v1/domains`} code={domainsRequest} copyLabel={copy.copy} copiedLabel={copy.copied} /></div></section>

        <DeveloperMcpSection language={language} origin={origin} copyLabel={copy.copy} copiedLabel={copy.copied} />

        <section className="border-y border-border/80 bg-secondary/45"><div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-7 sm:py-20"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{copy.boundariesLabel}</p><h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{copy.boundariesTitle}</h2></div><div className="mt-8 grid gap-3 lg:grid-cols-3">{copy.boundaries.map((boundary, index) => { const Icon = [CheckCircle2, Server, KeyRound][index] ?? CheckCircle2; return <article key={boundary.title} className="sajda-surface p-5 sm:p-6"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span><h3 className="mt-5 text-lg font-bold tracking-[-0.025em]">{boundary.title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{boundary.body}</p></article>; })}</div></div></section>

        {keyPortalEnabled ? <DeveloperKeyWorkspace copy={keyCopy} language={language} /> : null}
      </main>
    </div>
  );
}
