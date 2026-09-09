import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Heart,
  RefreshCw,
  SearchCheck,
  Settings2,
  Shuffle,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SwipeWishlistPanel } from "@/components/SwipeWishlistPanel";
import { cn } from "@/lib/utils";
import { getSwipeTlds, isAnonymousSearchMode, isPublicSearchMode } from "@/lib/anonymousSearchMode";
import { runAnonymousSearch, type AnonymousSearchResult } from "@/lib/localTestSearch";
import {
  formatRegistrarOfferPrice,
  formatRegistrarPrice,
  getRegistrarFxDisclosure,
  getRegistrarOfferTerms,
  getRegistrationPrice,
  getRenewalPrice,
  normaliseRegistrarOffer,
  type RegistrarOffer,
} from "@/lib/registrarOffer";
import { useReferenceFx } from "@/hooks/useReferenceFx";
import { getReferenceUsdRate, type ReferenceFx } from "../../shared/reference-fx";
import DomainLogoConcept from "@/components/DomainLogoConcept";
import {
  readSwipeWishlist,
  removeSwipeWishlistEntry,
  saveSwipeWishlistResult,
  updateSwipeWishlistEntry,
  writeSwipeWishlist,
  type SwipeWishlistEntry,
} from "@/lib/swipeWishlist";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useScan } from "@/contexts/ScanContext";
import { useAuth } from "@/contexts/AuthContext";
import { canUndoSwipe, consumeSwipeUndo, createSwipeUndo, type SwipeUndoToken } from "@/lib/swipeUndo";
import { authorizeSwipeUndo, SwipePremiumError } from "@/lib/swipePremium";
import { swipePremiumCopy } from "@/i18n/swipePremiumCopy";
import { SWIPE_DECK_SIZE as DECK_SIZE, SWIPE_MIN_LENGTH as MIN_LABEL_LENGTH, SWIPE_MAX_LENGTH as MAX_LABEL_LENGTH, toVerifiedSwipeDeck } from "@/lib/swipeDeck";

type SwipeDirection = "skip" | "keep";
type DeckLoadMode = "replace" | "prefetch";

const SWIPE_THRESHOLD = 88;
const PREFETCH_REMAINING = 20;

const swipeMessages = {
  en: {
    backToSearch: "Search",
    eyebrow: "Sajda · Swipe",
    heading: "Browse short domain ideas.",
    intro: "Swipe through random 3–9 letter names after a registry check. Keep the ones worth a closer look.",
    deckSettings: "Deck settings",
    closeSettings: "Close settings",
    deckControls: "Deck controls",
    deckControlsDescription: "Choose one or more endings. Your deck will mix available domains from your selection.",
    selectedExtensions: "Selected: {count}",
    updateDeck: "Update deck",
    startDeck: "Start swiping",
    deckComplete: "You’ve reached the end of this deck",
    deckCompleteDescription: "Your saved picks are still here. Choose endings to check a new deck.",
    chooseFirst: "Choose your domain endings",
    unsupportedEndings: ".se, .nu and .io are not yet supported by Swipe’s registry checks.",
    allExtensions: "All endings",
    resetDefaults: "Reset to default",
    deck: "Swipe deck",
    extensionLabel: "Domain extensions",
    mixed: "Mixed",
    mixedHelp: "Choose one extension for a focused deck, or Mixed to rotate through every supported extension.",
    chooseExtensions: "Choose one extension or Mixed",
    publicService: "Registry-checked suggestions from the public search service.",
    localService: "Registry-checked suggestions from this local service.",
    shuffle: "Shuffle a new deck",
    checking: "Checking a fresh deck with registry sources…",
    checkAgain: "Try another deck",
    loadingTitle: "Building your deck",
    loadingDescription: "Generating short names, then checking them before they appear here.",
    ready: "{count} verified names are ready to browse.",
    emptyDeck: "No registry-verified names in this round.",
    emptyDeckDescription: "Availability changes quickly. Shuffle another deck to check a new set of short names.",
    unavailableTitle: "Swipe is available in local or public search mode.",
    unavailableDescription: "Open the public search tool to create a registry-checked swipe deck.",
    available: "Registry-verified available",
    letters: "{count} letters",
    source: "Availability source",
    provider: "Purchase provider",
    price: "Current registration price",
    renewal: "Renewal: {price}",
    priceUnavailable: "Current provider price unavailable",
    viewProvider: "View at {provider}",
    priceSource: "Price source",
    providerNote: "Availability and pricing can change. Confirm both with the provider immediately before purchase.",
    whyItCouldWork: "Why it could work",
    skip: "Skip",
    keep: "Keep",
    keyboardHelp: "Swipe left to skip, right to keep. You can also use ← and →.",
    saved: "Saved picks",
    savedTabOnly: "Saved in this tab only",
    noSaved: "Keep a name and it will appear here for this browsing session.",
    clearSaved: "Clear saved",
    kept: "Saved {domain} to your picks.",
    skipped: "Skipped {domain}.",
    selectionChanged: "Extension selection updated. Shuffle to build a new deck.",
    cardNumber: "Card {count}",
    openSearch: "Open search",
  },
  sv: {
    backToSearch: "Sök",
    eyebrow: "Sajda · Swajp",
    heading: "Bläddra bland korta domänidéer.",
    intro: "Swajpa bland slumpade namn med 3–9 bokstäver efter en registerkontroll. Behåll de namn du vill titta närmare på.",
    deckSettings: "Inställningar för kortleken",
    closeSettings: "Stäng inställningar",
    deckControls: "Inställningar för kortleken",
    deckControlsDescription: "Välj en eller flera ändelser. Kortleken blandar lediga domäner från dina val.",
    selectedExtensions: "Valda: {count}",
    updateDeck: "Uppdatera kortleken",
    startDeck: "Börja swajpa",
    deckComplete: "Du har gått igenom kortleken",
    deckCompleteDescription: "Dina sparade val finns kvar. Välj ändelser för att kontrollera en ny kortlek.",
    chooseFirst: "Välj dina domänändelser",
    unsupportedEndings: ".se, .nu och .io stöds ännu inte av Swipes registerkontroll.",
    allExtensions: "Alla ändelser",
    resetDefaults: "Återställ standardval",
    deck: "Swajp-kortlek",
    extensionLabel: "Domänändelser",
    mixed: "Blandat",
    mixedHelp: "Välj en ändelse för en fokuserad kortlek, eller Blandat för att växla mellan alla ändelser som stöds.",
    chooseExtensions: "Välj en ändelse eller Blandat",
    publicService: "Registerkontrollerade förslag från den publika söktjänsten.",
    localService: "Registerkontrollerade förslag från denna lokala tjänst.",
    shuffle: "Blanda en ny kortlek",
    checking: "Kontrollerar en ny kortlek mot registerkällor…",
    checkAgain: "Prova en ny kortlek",
    loadingTitle: "Bygger din kortlek",
    loadingDescription: "Skapar korta namn och kontrollerar dem innan de visas här.",
    ready: "{count} verifierade namn är klara att bläddra bland.",
    emptyDeck: "Inga registerverifierade lediga namn i den här omgången.",
    emptyDeckDescription: "Tillgänglighet ändras snabbt. Blanda en ny kortlek för att kontrollera fler korta namn.",
    unavailableTitle: "Swajp är tillgängligt i lokalt eller publikt sökläge.",
    unavailableDescription: "Öppna det publika sökverktyget för att skapa en registerkontrollerad swajp-kortlek.",
    available: "Ledig — registerverifierad",
    letters: "{count} bokstäver",
    source: "Tillgänglighetskälla",
    provider: "Köpleverantör",
    price: "Aktuellt registreringspris",
    renewal: "Förnyelse: {price}",
    priceUnavailable: "Aktuellt leverantörspris saknas",
    viewProvider: "Visa hos {provider}",
    priceSource: "Prisunderlag",
    providerNote: "Tillgänglighet och pris kan ändras. Bekräfta båda hos leverantören precis före köp.",
    whyItCouldWork: "Därför kan namnet fungera",
    skip: "Hoppa över",
    keep: "Behåll",
    keyboardHelp: "Swajpa vänster för att hoppa över och höger för att behålla. Du kan även använda ← och →.",
    saved: "Sparade val",
    savedTabOnly: "Sparas bara i denna flik",
    noSaved: "Behåll ett namn så visas det här under den här sessionen.",
    clearSaved: "Rensa sparade",
    kept: "{domain} sparades bland dina val.",
    skipped: "{domain} hoppades över.",
    selectionChanged: "Ändelsevalet uppdaterades. Blanda för att bygga en ny kortlek.",
    cardNumber: "Kort {count}",
    openSearch: "Öppna sökningen",
  },
  es: {
    backToSearch: "Buscar",
    eyebrow: "Sajda · Desliza",
    heading: "Explora ideas de dominios cortos.",
    intro: "Desliza nombres aleatorios de 3–9 letras tras una comprobación en el registro. Guarda los que merezcan una segunda mirada.",
    deckSettings: "Configuración de la baraja",
    closeSettings: "Cerrar configuración",
    deckControls: "Controles de la baraja",
    deckControlsDescription: "Elige una o varias extensiones. La baraja mezclará dominios disponibles de tu selección.",
    selectedExtensions: "Seleccionadas: {count}",
    updateDeck: "Actualizar baraja",
    startDeck: "Empezar a deslizar",
    deckComplete: "Has terminado esta baraja",
    deckCompleteDescription: "Tus selecciones guardadas siguen aquí. Elige extensiones para comprobar otra baraja.",
    chooseFirst: "Elige tus extensiones de dominio",
    unsupportedEndings: ".se, .nu y .io aún no son compatibles con la verificación de Swipe.",
    allExtensions: "Todas las extensiones",
    resetDefaults: "Restablecer valores predeterminados",
    deck: "Baraja de dominios",
    extensionLabel: "Extensiones de dominio",
    mixed: "Mezcladas",
    mixedHelp: "Elige una extensión para una baraja enfocada, o Mezcladas para alternar entre todas las extensiones compatibles.",
    chooseExtensions: "Elige una extensión o Mezcladas",
    publicService: "Sugerencias verificadas en el registro desde el servicio de búsqueda público.",
    localService: "Sugerencias verificadas en el registro desde este servicio local.",
    shuffle: "Mezclar una nueva baraja",
    checking: "Comprobando una nueva baraja con fuentes de registro…",
    checkAgain: "Probar otra baraja",
    loadingTitle: "Preparando tu baraja",
    loadingDescription: "Generamos nombres cortos y los comprobamos antes de mostrarlos aquí.",
    ready: "{count} nombres verificados están listos para explorar.",
    emptyDeck: "No hay nombres verificados por el registro en esta ronda.",
    emptyDeckDescription: "La disponibilidad cambia rápido. Mezcla otra baraja para comprobar nuevos nombres cortos.",
    unavailableTitle: "Swipe está disponible en el modo de búsqueda local o público.",
    unavailableDescription: "Abre la herramienta de búsqueda pública para crear una baraja Swipe verificada por el registro.",
    available: "Disponible y verificado por el registro",
    letters: "{count} letras",
    source: "Fuente de disponibilidad",
    provider: "Proveedor de compra",
    price: "Precio de registro actual",
    renewal: "Renovación: {price}",
    priceUnavailable: "El precio actual del proveedor no está disponible",
    viewProvider: "Ver en {provider}",
    priceSource: "Fuente del precio",
    providerNote: "La disponibilidad y el precio pueden cambiar. Confirma ambos con el proveedor justo antes de comprar.",
    whyItCouldWork: "Por qué podría funcionar",
    skip: "Descartar",
    keep: "Guardar",
    keyboardHelp: "Desliza a la izquierda para descartar y a la derecha para guardar. También puedes usar ← y →.",
    saved: "Selecciones guardadas",
    savedTabOnly: "Solo se guarda en esta pestaña",
    noSaved: "Guarda un nombre y aparecerá aquí durante esta sesión.",
    clearSaved: "Borrar selecciones",
    kept: "Se guardó {domain} entre tus selecciones.",
    skipped: "Se descartó {domain}.",
    selectionChanged: "Se actualizó la selección de extensiones. Mezcla para crear una nueva baraja.",
    cardNumber: "Tarjeta {count}",
    openSearch: "Abrir búsqueda",
  },
  fr: {
    backToSearch: "Rechercher",
    eyebrow: "Sajda · Swipe",
    heading: "Parcourez des idées de domaines courts.",
    intro: "Faites défiler des noms aléatoires de 3 à 9 lettres après une vérification au registre. Gardez ceux qui méritent d’être regardés de plus près.",
    deckSettings: "Réglages du jeu",
    closeSettings: "Fermer les réglages",
    deckControls: "Réglages du jeu",
    deckControlsDescription: "Choisissez une ou plusieurs extensions. Le jeu mélangera les domaines disponibles de votre sélection.",
    selectedExtensions: "Sélectionnées : {count}",
    updateDeck: "Mettre le jeu à jour",
    startDeck: "Commencer à parcourir",
    deckComplete: "Vous avez parcouru tout le jeu",
    deckCompleteDescription: "Vos sélections enregistrées sont conservées. Choisissez des extensions pour vérifier un nouveau jeu.",
    chooseFirst: "Choisissez vos extensions de domaine",
    unsupportedEndings: ".se, .nu et .io ne sont pas encore pris en charge par la vérification de Swipe.",
    allExtensions: "Toutes les extensions",
    resetDefaults: "Réinitialiser par défaut",
    deck: "Jeu de domaines",
    extensionLabel: "Extensions de domaine",
    mixed: "Mixte",
    mixedHelp: "Choisissez une extension pour un jeu ciblé, ou Mixte pour alterner entre toutes les extensions prises en charge.",
    chooseExtensions: "Choisissez une extension ou Mixte",
    publicService: "Suggestions vérifiées auprès du registre par le service de recherche public.",
    localService: "Suggestions vérifiées auprès du registre par ce service local.",
    shuffle: "Mélanger un nouveau jeu",
    checking: "Vérification d’un nouveau jeu auprès des sources du registre…",
    checkAgain: "Essayer un autre jeu",
    loadingTitle: "Préparation de votre jeu",
    loadingDescription: "Nous générons des noms courts et les vérifions avant de les afficher ici.",
    ready: "{count} noms vérifiés sont prêts à être parcourus.",
    emptyDeck: "Aucun nom vérifié auprès du registre pour cette sélection.",
    emptyDeckDescription: "La disponibilité change vite. Mélangez un autre jeu pour vérifier de nouveaux noms courts.",
    unavailableTitle: "Swipe est disponible en mode de recherche local ou public.",
    unavailableDescription: "Ouvrez l’outil de recherche public pour créer un jeu Swipe vérifié auprès du registre.",
    available: "Disponible et vérifié par le registre",
    letters: "{count} lettres",
    source: "Source de disponibilité",
    provider: "Fournisseur d’achat",
    price: "Prix d’enregistrement actuel",
    renewal: "Renouvellement : {price}",
    priceUnavailable: "Le prix actuel du fournisseur n’est pas disponible",
    viewProvider: "Voir chez {provider}",
    priceSource: "Source du prix",
    providerNote: "La disponibilité et le prix peuvent changer. Confirmez les deux auprès du fournisseur juste avant l’achat.",
    whyItCouldWork: "Pourquoi cela pourrait fonctionner",
    skip: "Passer",
    keep: "Garder",
    keyboardHelp: "Faites glisser vers la gauche pour passer et vers la droite pour garder. Vous pouvez aussi utiliser ← et →.",
    saved: "Sélections enregistrées",
    savedTabOnly: "Enregistrées dans cet onglet uniquement",
    noSaved: "Gardez un nom et il apparaîtra ici pendant cette session.",
    clearSaved: "Effacer les sélections",
    kept: "{domain} a été enregistré dans vos sélections.",
    skipped: "{domain} a été écarté.",
    selectionChanged: "La sélection des extensions a été mise à jour. Mélangez pour créer un nouveau jeu.",
    cardNumber: "Carte {count}",
    openSearch: "Ouvrir la recherche",
  },
  zh: {
    backToSearch: "搜索",
    eyebrow: "Sajda · 滑选",
    heading: "浏览简短的域名创意。",
    intro: "先完成注册局核验，再滑选由 3–9 个字母组成的随机名称。保留值得进一步查看的名称。",
    deckSettings: "卡组设置",
    closeSettings: "关闭设置",
    deckControls: "卡组设置",
    deckControlsDescription: "选择一个或多个后缀。卡组会混合展示所选后缀下可用的域名。",
    selectedExtensions: "已选 {count} 个",
    updateDeck: "更新卡组",
    startDeck: "开始滑选",
    deckComplete: "你已浏览完这组卡片",
    deckCompleteDescription: "你保存的选择仍然保留。选择后缀以核验一组新卡片。",
    chooseFirst: "选择域名后缀",
    unsupportedEndings: "Swipe 的注册局核验暂不支持 .se、.nu 和 .io。",
    allExtensions: "所有后缀",
    resetDefaults: "恢复默认设置",
    deck: "域名卡组",
    extensionLabel: "域名后缀",
    mixed: "混合",
    mixedHelp: "选择一个后缀可获得聚焦卡组；选择“混合”则轮换所有受支持的后缀。",
    chooseExtensions: "选择一个后缀或“混合”",
    publicService: "来自公开搜索服务、已通过注册局核验的建议。",
    localService: "来自此本地服务、已通过注册局核验的建议。",
    shuffle: "换一组新卡",
    checking: "正在通过注册局来源核验新卡组…",
    checkAgain: "再试一组",
    loadingTitle: "正在准备你的卡组",
    loadingDescription: "我们会生成简短名称，并在显示前完成核验。",
    ready: "已有 {count} 个已验证名称可供浏览。",
    emptyDeck: "这一轮没有通过注册局核验的名称。",
    emptyDeckDescription: "可用性变化很快。换一组新卡来核验更多简短名称。",
    unavailableTitle: "Swipe 仅在本地或公开搜索模式下可用。",
    unavailableDescription: "打开公开搜索工具，创建已通过注册局核验的 Swipe 卡组。",
    available: "已由注册局核验可用",
    letters: "{count} 个字母",
    source: "可用性来源",
    provider: "购买服务商",
    price: "当前注册价格",
    renewal: "续费：{price}",
    priceUnavailable: "当前服务商价格暂不可用",
    viewProvider: "前往 {provider}",
    priceSource: "价格来源",
    providerNote: "可用性和价格可能变化。购买前请立即向服务商确认两者。",
    whyItCouldWork: "它可能适合的原因",
    skip: "跳过",
    keep: "保留",
    keyboardHelp: "向左滑可跳过，向右滑可保留。也可以使用 ← 和 →。",
    saved: "已保存的选择",
    savedTabOnly: "仅保存在当前标签页",
    noSaved: "保留一个名称，它会在本次浏览期间显示在这里。",
    clearSaved: "清除已保存项",
    kept: "已将 {domain} 保存到你的选择中。",
    skipped: "已跳过 {domain}。",
    selectionChanged: "后缀选择已更新。换一组新卡以创建新的卡组。",
    cardNumber: "卡片 {count}",
    openSearch: "打开搜索",
  },
} as const;

type SwipeLanguage = keyof typeof swipeMessages;

function getSwipeLanguage(language: string): SwipeLanguage {
  if (language === "es" || language === "fr" || language === "zh") return language;
  return language === "sv" ? "sv" : "en";
}

function withValue(template: string, value: string | number) {
  return template.replace(/\{(?:count|domain|provider|price)\}/g, String(value));
}

function formatSwipeRegistrarPrice(
  value: number,
  currency: RegistrarOffer["currency"],
  language: SwipeLanguage,
  referenceFx: ReferenceFx | null,
) {
  return formatRegistrarOfferPrice(value, currency, language, referenceFx);
}

function domainLabel(domain: string) {
  return domain.split(".")[0] ?? domain;
}

function swipeAssessment(domain: string, language: SwipeLanguage): string {
  const label = domainLabel(domain);
  const tld = domain.split(".").at(-1) ?? "";
  const length = label.length;
  const vowelCount = (label.match(/[aeiouy]/gu) ?? []).length;
  const compact = length <= 5;
  const balanced = vowelCount > 0 && vowelCount < length;

  if (language === "sv") {
    if (compact && balanced) return `${length} bokstäver och en tydlig rytm gör namnet lätt att säga, skriva och minnas. .${tld} ger det en tydlig digital hemvist.`;
    if (compact) return `${length} bokstäver håller namnet kompakt och lätt att skriva. .${tld} ger en tydlig digital hemvist.`;
    return `Den jämna längden ger utrymme för ett eget uttryck utan att bli onödigt långt. .${tld} gör riktningen tydlig.`;
  }
  if (language === "es") {
    if (compact && balanced) return `Sus ${length} letras y su ritmo claro ayudan a decirlo, escribirlo y recordarlo. .${tld} le da un hogar digital definido.`;
    if (compact) return `Con ${length} letras, se mantiene compacto y fácil de escribir. .${tld} le da un hogar digital definido.`;
    return `Su longitud equilibrada deja espacio para una identidad propia sin hacerse innecesariamente largo. .${tld} mantiene la dirección clara.`;
  }
  if (language === "fr") {
    if (compact && balanced) return `Ses ${length} lettres et son rythme net aident à le dire, le saisir et s’en souvenir. .${tld} lui donne un ancrage numérique clair.`;
    if (compact) return `Avec ${length} lettres, il reste compact et simple à saisir. .${tld} lui donne un ancrage numérique clair.`;
    return `Sa longueur équilibrée laisse place à une identité propre sans l’allonger inutilement. .${tld} garde l’orientation lisible.`;
  }
  if (language === "zh") {
    if (compact && balanced) return `${length} 个字母和清晰的发音节奏，让它更容易读、写和记住。.${tld} 让数字定位更明确。`;
    if (compact) return `${length} 个字母让它保持简洁、便于输入。.${tld} 让数字定位更明确。`;
    return `长度有分寸，既能承载自己的辨识度，也不显得冗长。.${tld} 让方向更清楚。`;
  }
  if (compact && balanced) return `${length} letters and a clear rhythm make it easier to say, type, and recall. .${tld} gives it a defined digital home.`;
  if (compact) return `A ${length}-letter name keeps it compact and easy to type. .${tld} gives it a defined digital home.`;
  return `Its measured length leaves room for a distinct identity without becoming needlessly long. .${tld} keeps the direction clear.`;
}

const Swipe = () => {
  const anonymousMode = isAnonymousSearchMode();
  const availableTlds = useMemo(() => [...getSwipeTlds()], []);
  const defaultTlds = availableTlds;
  const [selectedTlds, setSelectedTlds] = useState<string[]>(defaultTlds);
  const [draftTlds, setDraftTlds] = useState<string[]>(defaultTlds);
  // Let visitors choose before spending their first search on a default deck.
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [hasRequestedDeck, setHasRequestedDeck] = useState(false);
  const [deck, setDeck] = useState<AnonymousSearchResult[]>([]);
  const [nextDeck, setNextDeck] = useState<AnonymousSearchResult[]>([]);
  const [deckIndex, setDeckIndex] = useState(0);
  const [saved, setSaved] = useState<SwipeWishlistEntry[]>(() => readSwipeWishlist());
  const [isRefreshingSaved, setIsRefreshingSaved] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [deckFeedback, setDeckFeedback] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [exitDirection, setExitDirection] = useState<SwipeDirection | null>(null);
  const [lastUndo, setLastUndo] = useState<SwipeUndoToken | null>(null);
  const [isUndoPending, setIsUndoPending] = useState(false);
  const [isPremiumDialogOpen, setIsPremiumDialogOpen] = useState(false);
  const [undoFeedback, setUndoFeedback] = useState<string | null>(null);
  const { user } = useAuth();
  const { language } = useLanguage();
  const {
    anonymousSearchAccessReady,
    anonymousSearchCanStart,
    requestAnonymousSearchAccess,
  } = useScan();
  const swipeLanguage = getSwipeLanguage(language as string);
  const copy = swipeMessages[swipeLanguage];
  const premiumCopy = swipePremiumCopy[swipeLanguage];
  const deckGenerationRef = useRef(0);
  const lastUndoRef = useRef<SwipeUndoToken | null>(null);
  const undoControllerRef = useRef<AbortController | null>(null);
  const undoButtonRef = useRef<HTMLButtonElement | null>(null);
  const savedRef = useRef(saved);
  const positionRef = useRef(deckIndex);
  const ownerRef = useRef(user?.id ?? null);
  const requestIdRef = useRef(0);
  const requestModeRef = useRef<DeckLoadMode | null>(null);
  const prefetchedAtIndexRef = useRef<number | null>(null);
  const refillAtIndexRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number } | null>(null);
  const decisionTimerRef = useRef<number | null>(null);
  const deckControllerRef = useRef<AbortController | null>(null);
  const savedControllerRef = useRef<AbortController | null>(null);
  const pendingAccessRef = useRef(new Set<NonNullable<ReturnType<typeof requestAnonymousSearchAccess>>>());

  const current = deck[deckIndex];
  const allExtensionsSelected = draftTlds.length === availableTlds.length;
  const publicMode = isPublicSearchMode();

  useLayoutEffect(() => { savedRef.current = saved; }, [saved]);
  useLayoutEffect(() => { positionRef.current = deckIndex; }, [deckIndex]);
  // Keep a synchronous revision for every wishlist mutation. An authorization
  // promise can resolve inside the same React batch as a tag/remove action,
  // before layout effects have copied that action's state into the ref.
  const commitSaved = useCallback((update: SwipeWishlistEntry[] | ((previous: SwipeWishlistEntry[]) => SwipeWishlistEntry[])) => {
    const next = typeof update === "function" ? update(savedRef.current) : update;
    savedRef.current = next;
    setSaved(next);
  }, []);
  useLayoutEffect(() => {
    const owner = user?.id ?? null;
    if (ownerRef.current === owner) return;
    ownerRef.current = owner;
    undoControllerRef.current?.abort();
    undoControllerRef.current = null;
    lastUndoRef.current = null;
    setLastUndo(null);
    setIsUndoPending(false);
    setUndoFeedback(null);
    setIsPremiumDialogOpen(false);
  }, [user?.id]);

  const commitNewDeck = useCallback((cards: AnonymousSearchResult[]) => {
    deckGenerationRef.current++;
    lastUndoRef.current = null;
    positionRef.current = 0;
    setLastUndo(null);
    setUndoFeedback(null);
    setDeck(cards);
    setDeckIndex(0);
  }, []);

  const loadDeck = useCallback(async (tlds = selectedTlds, mode: DeckLoadMode = "replace") => {
    if (!anonymousMode || !anonymousSearchAccessReady || tlds.length === 0 || requestModeRef.current !== null
      || undoControllerRef.current || decisionTimerRef.current !== null) return;
    // A queued deck is shown only after an explicit action, preserving the last
    // card's undo opportunity without charging for another registry request.
    if (mode === "replace" && nextDeck.length > 0 && tlds.length === selectedTlds.length
      && tlds.every((tld) => selectedTlds.includes(tld))) {
      commitNewDeck(nextDeck.slice(0, DECK_SIZE));
      setNextDeck([]);
      setExitDirection(null);
      setDragOffset(0);
      setError(null);
      setDeckFeedback(null);
      prefetchedAtIndexRef.current = null;
      refillAtIndexRef.current = null;
      setNotice(withValue(copy.ready, nextDeck.length));
      return;
    }
    // Prefetch is a convenience for signed-in users. A browser trial receives
    // one completed registry request, so it must never silently spend a second
    // request while someone is merely browsing the first deck.
    if (mode === "prefetch" && !anonymousSearchCanStart) return;
    const access = requestAnonymousSearchAccess();
    if (!access) return;
    pendingAccessRef.current.add(access);

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    deckControllerRef.current = controller;
    requestModeRef.current = mode;
    if (mode === "replace") {
      setHasRequestedDeck(true);
      if (deck.length === 0) setSelectedTlds(tlds);
      prefetchedAtIndexRef.current = null;
      refillAtIndexRef.current = null;
      setIsLoading(true);
      setError(null);
      setDeckFeedback(null);
      setExitDirection(null);
      setDragOffset(0);
    } else {
      setIsPrefetching(true);
    }
    setNotice(copy.checking);

    try {
      // The public registry service currently has English, Swedish, and
      // Spanish response locales. Other local UI translations safely use the
      // English response contract rather than sending an unsupported locale.
      const apiLanguage = swipeLanguage === "sv" || swipeLanguage === "es" ? swipeLanguage : "en";
      const response = await runAnonymousSearch(tlds, DECK_SIZE, "", apiLanguage, {
        signal: controller.signal,
        swipe: true,
        minLength: MIN_LABEL_LENGTH,
        maxLength: MAX_LABEL_LENGTH,
      });
      if (requestId !== requestIdRef.current) {
        access.release();
        return;
      }

      const verifiedDeck = toVerifiedSwipeDeck(response.results, tlds);
      // An empty or inconclusive round did not deliver a usable Swipe deck.
      // Keep the previous cards and allow the visitor to retry the free search.
      if (verifiedDeck.length === 0) {
        access.release();
        setNotice(copy.emptyDeck);
        if (mode === "replace") setDeckFeedback(copy.emptyDeck);
        return;
      }
      if (mode === "prefetch") {
        setNextDeck(verifiedDeck);
        if (verifiedDeck.length > 0) setNotice(withValue(copy.ready, verifiedDeck.length));
      } else {
        setSelectedTlds(tlds);
        commitNewDeck(verifiedDeck);
        setNextDeck([]);
        setNotice(verifiedDeck.length > 0
          ? withValue(copy.ready, verifiedDeck.length)
          : copy.emptyDeck);
      }
      access.complete();
    } catch (caughtError) {
      access.release();
      if (requestId !== requestIdRef.current) return;
      const message = caughtError instanceof Error ? caughtError.message : copy.emptyDeck;
      if (mode === "replace" && deck.length === 0) setError(message);
      setNotice(message);
      if (mode === "replace") setDeckFeedback(message);
    } finally {
      pendingAccessRef.current.delete(access);
      if (requestId === requestIdRef.current) {
        deckControllerRef.current = null;
        requestModeRef.current = null;
        if (mode === "replace") setIsLoading(false);
        else setIsPrefetching(false);
      }
    }
  }, [anonymousMode, anonymousSearchAccessReady, anonymousSearchCanStart, commitNewDeck, copy.checking, copy.emptyDeck, copy.ready, deck.length, nextDeck, requestAnonymousSearchAccess, selectedTlds, swipeLanguage]);

  useEffect(() => {
    if (!anonymousMode || !anonymousSearchCanStart || deck.length === 0 || isLoading) return;

    const remaining = deck.length - deckIndex;
    if (remaining <= 0) {
      // The last card must remain undoable until an explicit new-deck action.
      if (lastUndoRef.current || undoControllerRef.current) return;
      if (nextDeck.length > 0 && refillAtIndexRef.current !== deckIndex) {
        refillAtIndexRef.current = null;
        prefetchedAtIndexRef.current = null;
        commitNewDeck(nextDeck.slice(0, DECK_SIZE));
        setNextDeck([]);
        setExitDirection(null);
        setDragOffset(0);
        return;
      }

      if (!isPrefetching && refillAtIndexRef.current !== deckIndex) {
        refillAtIndexRef.current = deckIndex;
        void loadDeck(selectedTlds, "replace");
      }
      return;
    }

    if (remaining <= PREFETCH_REMAINING
      && nextDeck.length === 0
      && !isPrefetching
      && prefetchedAtIndexRef.current === null) {
      prefetchedAtIndexRef.current = deckIndex;
      void loadDeck(selectedTlds, "prefetch");
    }
  }, [anonymousMode, anonymousSearchCanStart, commitNewDeck, deck.length, deckIndex, isLoading, isPrefetching, loadDeck, nextDeck, selectedTlds]);

  useEffect(() => () => {
    if (decisionTimerRef.current !== null) window.clearTimeout(decisionTimerRef.current);
    requestIdRef.current++;
    deckControllerRef.current?.abort();
    savedControllerRef.current?.abort();
    undoControllerRef.current?.abort();
    for (const access of pendingAccessRef.current) access.release();
    pendingAccessRef.current.clear();
    requestModeRef.current = null;
  }, []);

  useEffect(() => {
    writeSwipeWishlist(saved);
  }, [saved]);

  useLayoutEffect(() => {
    const documentRoot = document.documentElement;
    documentRoot.classList.add("swipe-immersive");
    return () => documentRoot.classList.remove("swipe-immersive");
  }, []);

  const makeDecision = useCallback((direction: SwipeDirection) => {
    if (!current || exitDirection || isLoading || decisionTimerRef.current !== null || undoControllerRef.current) return;

    const beforeSaved = savedRef.current;
    const afterSaved = direction === "keep" ? saveSwipeWishlistResult(beforeSaved, current) : beforeSaved;
    const undo = createSwipeUndo({ card: current, deckIndex, generation: deckGenerationRef.current, direction, beforeSaved, afterSaved });
    lastUndoRef.current = undo;
    setLastUndo(undo);
    setUndoFeedback(null);

    setExitDirection(direction);
    setDragOffset(direction === "keep" ? 540 : -540);
    if (direction === "keep") {
      commitSaved(afterSaved);
      setNotice(withValue(copy.kept, current.domain));
    } else {
      setNotice(withValue(copy.skipped, current.domain));
    }

    decisionTimerRef.current = window.setTimeout(() => {
      positionRef.current = deckIndex + 1;
      setDeckIndex(deckIndex + 1);
      setExitDirection(null);
      setDragOffset(0);
      decisionTimerRef.current = null;
    }, 160);
  }, [commitSaved, copy.kept, copy.skipped, current, deckIndex, exitDirection, isLoading]);

  const undoLastDecision = useCallback(async () => {
    const token = lastUndoRef.current;
    const accountId = ownerRef.current;
    const context = { generation: deckGenerationRef.current, deckIndex: positionRef.current };
    if (!canUndoSwipe(token, context) || isLoading || decisionTimerRef.current !== null || undoControllerRef.current) return;
    setUndoFeedback(null);
    if (!accountId) { setIsPremiumDialogOpen(true); return; }

    const controller = new AbortController();
    undoControllerRef.current = controller;
    setIsUndoPending(true);
    try {
      const receipt = await authorizeSwipeUndo({ accountId, signal: controller.signal });
      // An authorization response may never act on another account, card, or deck.
      if (controller.signal.aborted || undoControllerRef.current !== controller || ownerRef.current !== accountId
        || receipt.accountId !== accountId || lastUndoRef.current !== token
        || deckGenerationRef.current !== context.generation || positionRef.current !== context.deckIndex) return;
      const result = consumeSwipeUndo(token, context, savedRef.current);
      lastUndoRef.current = result.undo;
      setLastUndo(result.undo);
      if (!result.restored) return;
      positionRef.current = result.deckIndex;
      setDeckIndex(result.deckIndex);
      if (result.wishlistChanged) commitSaved(result.saved);
      dragRef.current = null;
      setIsDragging(false);
      setExitDirection(null);
      setDragOffset(0);
      setNotice(premiumCopy.restored);
    } catch (error) {
      if (controller.signal.aborted || ownerRef.current !== accountId) return;
      if (error instanceof SwipePremiumError && ["premium_required", "unauthenticated"].includes(error.code)) {
        setIsPremiumDialogOpen(true);
      } else {
        setUndoFeedback(error instanceof SwipePremiumError && error.code === "email_verification_required"
          ? premiumCopy.verify : premiumCopy.failure);
      }
    } finally {
      if (undoControllerRef.current === controller) { undoControllerRef.current = null; setIsUndoPending(false); }
    }
  }, [commitSaved, isLoading, premiumCopy.failure, premiumCopy.restored, premiumCopy.verify]);

  const refreshSaved = useCallback(async (requestedDomains: string[]) => {
    const domains = [...new Set(requestedDomains.map((domain) => domain.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
    if (!anonymousMode || savedControllerRef.current || domains.length === 0) return;

    const access = requestAnonymousSearchAccess();
    if (!access) return;
    pendingAccessRef.current.add(access);
    const controller = new AbortController();
    savedControllerRef.current = controller;

    setIsRefreshingSaved(true);
    try {
      // This is an exact registry search, deliberately separate from building
      // a random Swipe deck. A saved status only changes when the registry
      // route returns a new result for that exact name.
      const apiLanguage = swipeLanguage === "sv" || swipeLanguage === "es" ? swipeLanguage : "en";
      const response = await runAnonymousSearch([], domains.length, "", apiLanguage, { domains, signal: controller.signal });
      if (controller.signal.aborted) return;
      const refreshedAt = new Date().toISOString();
      const refreshedByDomain = new Map(response.results.map((result) => [result.domain.toLowerCase(), result] as const));

      commitSaved((previous) => previous.map((entry) => {
        const result = refreshedByDomain.get(entry.domain);
        return result
          ? updateSwipeWishlistEntry([entry], entry.domain, { result, lastCheckedAt: refreshedAt })[0] ?? entry
          : entry;
      }));
      const confirmedCount = response.results.filter((result) => result.authoritative && result.status !== "unknown").length;
      setNotice(swipeLanguage === "sv"
        ? `${confirmedCount}/${domains.length} sparade domäner fick bekräftad status.`
        : `${confirmedCount}/${domains.length} saved domains received a confirmed status.`);
      if (confirmedCount > 0) access.complete();
      else access.release();
    } catch (caughtError) {
      access.release();
      if (!controller.signal.aborted) setNotice(caughtError instanceof Error ? caughtError.message : "Saved checks could not be refreshed.");
    } finally {
      pendingAccessRef.current.delete(access);
      savedControllerRef.current = null;
      if (!controller.signal.aborted) setIsRefreshingSaved(false);
    }
  }, [anonymousMode, commitSaved, requestAnonymousSearchAccess, swipeLanguage]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isSettingsOpen || isWishlistOpen || isPremiumDialogOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        makeDecision("skip");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        makeDecision("keep");
      } else if ((event.key === "r" || event.key === "R") && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        void loadDeck();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSettingsOpen, isWishlistOpen, isPremiumDialogOpen, loadDeck, makeDecision]);

  const openSettings = () => {
    if (undoControllerRef.current || decisionTimerRef.current !== null) return;
    setDraftTlds(selectedTlds);
    setIsSettingsOpen(true);
  };

  const toggleDraftExtension = (tld: string) => {
    setDraftTlds((previous) => previous.includes(tld)
      ? previous.length > 1 ? previous.filter((item) => item !== tld) : previous
      : [...previous, tld]);
  };

  const applySettings = () => {
    if (draftTlds.length === 0 || undoControllerRef.current) return;
    const changed = draftTlds.length !== selectedTlds.length
      || draftTlds.some((tld) => !selectedTlds.includes(tld));
    setIsSettingsOpen(false);
    if (!changed && current) return;
    // Keep the existing cards/selection if access is denied or checks fail.
    void loadDeck(draftTlds, "replace");
  };

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!current || isLoading || exitDirection || undoControllerRef.current || decisionTimerRef.current !== null || event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDragOffset(Math.max(-180, Math.min(180, event.clientX - drag.startX)));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const offset = event.clientX - drag.startX;
    dragRef.current = null;
    setIsDragging(false);
    if (Math.abs(offset) >= SWIPE_THRESHOLD) {
      makeDecision(offset > 0 ? "keep" : "skip");
    } else {
      setDragOffset(0);
    }
  };

  const cancelDrag = () => {
    dragRef.current = null;
    setIsDragging(false);
    setDragOffset(0);
  };

  const currentOffer = current ? normaliseRegistrarOffer(current.domain, current.registrarOffer) : null;
  const registration = currentOffer ? getRegistrationPrice(currentOffer) : null;
  const renewal = currentOffer ? getRenewalPrice(currentOffer) : null;
  const referenceFx = useReferenceFx(Boolean(anonymousMode && registration && currentOffer?.currency !== "USD"));

  if (!anonymousMode) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 sm:px-6">
        <main className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
          <section className="rounded-[1.5rem] border border-border bg-card p-8 text-center shadow-sm">
            <SearchCheck className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-semibold text-foreground">{copy.unavailableTitle}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.unavailableDescription}</p>
            <Button asChild className="mt-6">
              <Link to="/">{copy.openSearch}</Link>
            </Button>
          </section>
        </main>
      </div>
    );
  }

  const currentLabel = current ? domainLabel(current.domain) : "";
  const rotation = dragOffset / 22;
  const cardOpacity = exitDirection ? 0 : Math.max(0.55, 1 - Math.abs(dragOffset) / 620);

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-background">
      <main className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden px-3 py-3 sm:px-6 sm:py-5">
        <header className="flex shrink-0 items-center justify-between gap-2" aria-label={copy.deck}>
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-10 text-muted-foreground">
            <Link to="/" aria-label={copy.backToSearch}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{copy.backToSearch}</span>
            </Link>
          </Button>
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <div data-swipe-wishlist-slot>
              <SwipeWishlistPanel
                items={saved}
                language={swipeLanguage}
                isRefreshing={isRefreshingSaved}
                onOpenChange={setIsWishlistOpen}
                onRefresh={refreshSaved}
                onUpdate={(domain, update) => commitSaved((previous) => updateSwipeWishlistEntry(previous, domain, update))}
                onRemove={(domain) => commitSaved((previous) => removeSwipeWishlistEntry(previous, domain))}
                onClear={() => commitSaved([])}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void loadDeck()}
              disabled={isLoading || isPrefetching || isUndoPending || Boolean(exitDirection) || selectedTlds.length === 0}
              aria-label={copy.shuffle}
              className="h-10 w-10 rounded-xl border-border bg-card"
            >
              <RefreshCw className={cn("h-4 w-4", (isLoading || isPrefetching) && "animate-spin")} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={openSettings}
              disabled={isUndoPending || Boolean(exitDirection)}
              aria-label={copy.deckSettings}
              className="h-10 min-w-0 gap-1.5 rounded-xl border-border bg-card px-2.5 text-xs sm:px-3"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              <span>{selectedTlds.length === 1 ? `.${selectedTlds[0]}` : `${copy.mixed} (${selectedTlds.length})`}</span>
            </Button>
          </div>
        </header>

        <p className="sr-only" aria-live="polite">{notice}</p>
        {undoFeedback && <p role="alert" className="px-3 py-2 text-sm text-foreground">{undoFeedback}</p>}
        {deckFeedback && deck.length > 0 && (
          <p role="status" className="rounded-xl border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground">
            {deckFeedback}
          </p>
        )}

        <section className="relative flex min-h-0 flex-1 items-center justify-center py-2 sm:py-3" aria-label={copy.deck}>
          <div className="relative flex h-full w-full max-w-2xl flex-col">
          <div className="min-h-0 flex-1">
          {isLoading ? (
            <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto rounded-[1.75rem] border border-border bg-card px-6 py-6 text-center shadow-[0_16px_44px_hsl(0_0%_12%/0.06)]">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <h2 className="mt-5 text-lg font-semibold text-foreground">{copy.loadingTitle}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{copy.loadingDescription}</p>
            </div>
          ) : error ? (
            <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto rounded-[1.75rem] border border-destructive/20 bg-card px-6 py-6 text-center shadow-[0_16px_44px_hsl(0_0%_12%/0.06)]">
              <X className="h-8 w-8 text-destructive" aria-hidden="true" />
              <h2 className="mt-5 text-lg font-semibold text-foreground">{error}</h2>
              <Button onClick={() => void loadDeck()} className="mt-6">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {copy.checkAgain}
              </Button>
            </div>
          ) : current && currentOffer ? (
            <>
              <div className="relative h-[calc(100%-4.5rem)] min-h-0 touch-pan-y">
                <div className="absolute inset-4 rounded-[1.75rem] border border-border bg-secondary/60" aria-hidden="true" />
                <div className="absolute inset-2 rounded-[1.75rem] border border-border bg-card/90" aria-hidden="true" />
                <div
                  role="group"
                  aria-label={`${current.domain}, ${copy.available}`}
                  aria-keyshortcuts="ArrowLeft ArrowRight"
                  onPointerDown={beginDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={cancelDrag}
                  className={cn(
                    "relative z-10 flex h-full min-h-0 touch-pan-y select-none flex-col overflow-y-auto overscroll-contain rounded-[1.75rem] border border-border bg-card p-4 shadow-[0_18px_50px_hsl(0_0%_12%/0.1)] sm:p-6 [&>*]:shrink-0",
                    !isDragging && "transition-[transform,opacity] duration-150 ease-out",
                    !isDragging && !exitDirection && !isSettingsOpen && "swipe-card-idle",
                    isDragging ? "cursor-grabbing" : "cursor-grab",
                  )}
                  style={{
                    transform: `translateX(${dragOffset}px) rotate(${rotation}deg)`,
                    opacity: cardOpacity,
                  }}
                >
                  <div
                    className="pointer-events-none absolute left-6 top-6 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-destructive transition-opacity"
                    style={{ opacity: Math.max(0, -dragOffset / 96) }}
                  >
                    {copy.skip}
                  </div>
                  <div
                    className="pointer-events-none absolute right-6 top-6 rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-success transition-opacity"
                    style={{ opacity: Math.max(0, dragOffset / 96) }}
                  >
                    {copy.keep}
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
                      <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                      {copy.available}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {withValue(copy.cardNumber, deckIndex + 1)}
                    </span>
                  </div>

                  <div className="mt-7 text-center sm:mt-9">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{withValue(copy.letters, currentLabel.length)}</p>
                    <h2 className="mt-2 break-all text-[clamp(2.3rem,7vw,4rem)] font-semibold tracking-[-0.05em] text-foreground">
                      {current.domain}
                    </h2>
                  </div>

                  <div className="mt-3 rounded-2xl border border-primary/15 bg-primary/[0.035] px-3 py-2.5 text-left">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-primary">{copy.whyItCouldWork}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">{swipeAssessment(current.domain, swipeLanguage)}</p>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="min-w-0 rounded-2xl bg-secondary/70 p-2.5 text-left sm:p-3">
                      <dt className="truncate text-[10px] font-medium text-muted-foreground sm:text-xs">{copy.source}</dt>
                      <dd className="mt-0.5 truncate text-xs font-semibold text-foreground sm:mt-1 sm:text-sm">{current.source}</dd>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-secondary/70 p-2.5 text-left sm:p-3">
                      <dt className="truncate text-[10px] font-medium text-muted-foreground sm:text-xs">{copy.provider}</dt>
                      <dd className="mt-0.5 truncate text-xs font-semibold text-foreground sm:mt-1 sm:text-sm">{currentOffer.registrar}</dd>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-secondary/70 p-2.5 text-left sm:p-3">
                      <dt className="truncate text-[10px] font-medium text-muted-foreground sm:text-xs">{copy.price}</dt>
                      <dd className="mt-0.5 text-xs font-semibold text-foreground sm:mt-1 sm:text-sm">
                        {registration
                          ? formatSwipeRegistrarPrice(registration.amount, currentOffer.currency, swipeLanguage, referenceFx)
                          : copy.priceUnavailable}
                        {renewal !== null && (
                          <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground sm:text-xs">
                            {withValue(copy.renewal, formatSwipeRegistrarPrice(renewal.amount, currentOffer.currency, swipeLanguage, referenceFx))}
                            {getReferenceUsdRate(referenceFx, currentOffer.currency) && ` (${formatRegistrarPrice(renewal.amount, currentOffer.currency, swipeLanguage)})`}
                          </span>
                        )}
                        {registration && <span className="mt-1 block text-[10px] font-normal text-muted-foreground sm:text-xs">{getRegistrarOfferTerms(currentOffer, swipeLanguage)}</span>}
                        {registration && currentOffer.currency !== "USD" && <span className="mt-1 block text-[10px] font-normal text-muted-foreground sm:text-xs">{getRegistrarFxDisclosure(registration.amount, currentOffer.currency, swipeLanguage, referenceFx)}</span>}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-secondary/70 p-2.5 text-left sm:p-3">
                      <dt className="truncate text-[10px] font-medium text-muted-foreground sm:text-xs">{copy.priceSource}</dt>
                      <dd className="mt-0.5 truncate sm:mt-1">
                        <a
                          href={currentOffer.priceSourceUrl || undefined}
                          aria-disabled={!currentOffer.priceSourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onPointerDown={(event) => event.stopPropagation()}
                          className="inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-primary underline-offset-4 hover:underline sm:text-sm"
                        >
                          <span className="truncate">{currentOffer.registrar}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        </a>
                      </dd>
                    </div>
                  </dl>

                  <p className="sr-only">{copy.providerNote}</p>
                  <div className="mt-3 flex justify-center" onPointerDown={(event) => event.stopPropagation()}>
                    <DomainLogoConcept domain={current.domain} />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-center gap-3 sm:mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => makeDecision("skip")}
                  onPointerDown={(event) => event.stopPropagation()}
                  disabled={Boolean(exitDirection) || isUndoPending}
                  aria-label={`${copy.skip} ${current.domain}`}
                  className="min-w-32 border-destructive/25 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                  {copy.skip}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => makeDecision("keep")}
                  onPointerDown={(event) => event.stopPropagation()}
                  disabled={Boolean(exitDirection) || isUndoPending}
                  aria-label={`${copy.keep} ${current.domain}`}
                  className="min-w-32 bg-success text-success-foreground hover:bg-success/90"
                >
                  <Heart className="h-5 w-5" aria-hidden="true" />
                  {copy.keep}
                </Button>
              </div>
              <p className="sr-only">{copy.keyboardHelp}</p>
            </>
          ) : deck.length === 0 ? (
            <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto rounded-[1.75rem] border border-border bg-card px-6 py-6 text-center shadow-[0_16px_44px_hsl(0_0%_12%/0.06)]">
              <SearchCheck className="h-8 w-8 text-primary" aria-hidden="true" />
              <h2 className="mt-5 text-lg font-semibold text-foreground">{hasRequestedDeck ? copy.emptyDeck : copy.chooseFirst}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{hasRequestedDeck ? copy.emptyDeckDescription : copy.deckControlsDescription}</p>
              <Button onClick={openSettings} className="mt-6">
                <Shuffle className="h-4 w-4" aria-hidden="true" />
                {copy.chooseFirst}
              </Button>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto rounded-[1.75rem] border border-border bg-card px-6 py-6 text-center shadow-[0_16px_44px_hsl(0_0%_12%/0.06)]">
              {isPrefetching ? <RefreshCw className="h-8 w-8 animate-spin text-primary" aria-hidden="true" /> : <Check className="h-8 w-8 text-primary" aria-hidden="true" />}
              <h2 className="mt-5 text-lg font-semibold text-foreground">{isPrefetching ? copy.loadingTitle : copy.deckComplete}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{isPrefetching ? copy.loadingDescription : copy.deckCompleteDescription}</p>
              {!isPrefetching && <Button onClick={openSettings} className="mt-6">{copy.chooseFirst}</Button>}
            </div>
          )}
          </div>
          {deck.length > 0 && (
            <div className="mt-2 flex shrink-0 flex-col items-center gap-1 text-center">
              <Button ref={undoButtonRef} type="button" variant="ghost" onClick={() => void undoLastDecision()}
                disabled={!canUndoSwipe(lastUndo, { generation: deckGenerationRef.current, deckIndex }) || Boolean(exitDirection) || isLoading || isUndoPending}
                aria-describedby="swipe-undo-hint" className="h-auto min-h-11 max-w-full flex-wrap gap-x-2 gap-y-1 px-3 py-2 text-sm">
                <Undo2 className={cn("h-4 w-4", isUndoPending && "animate-pulse")} aria-hidden="true" />
                <span>{isUndoPending ? premiumCopy.pending : premiumCopy.undo}</span>
                <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary">Premium</span>
              </Button>
              <p id="swipe-undo-hint" className="text-xs text-muted-foreground">{premiumCopy.hint}</p>
            </div>
          )}
          </div>
        </section>

      </main>

      <Dialog open={isPremiumDialogOpen} onOpenChange={setIsPremiumDialogOpen}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl"
          onCloseAutoFocus={(event) => { event.preventDefault(); undoButtonRef.current?.focus(); }}>
          <DialogHeader className="text-left">
            <DialogTitle className="pr-6 leading-7">{premiumCopy.title}</DialogTitle>
            <DialogDescription className="pt-2 leading-6">{premiumCopy.description}</DialogDescription>
          </DialogHeader>
          <p className="rounded-xl border border-border bg-secondary/50 p-3 text-sm leading-6 text-muted-foreground">{premiumCopy.availability}</p>
          <DialogFooter><Button className="h-auto min-h-11 whitespace-normal" onClick={() => setIsPremiumDialogOpen(false)}>{premiumCopy.close}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent
          className="fixed bottom-0 left-0 top-auto grid max-h-[82dvh] w-full max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-t-[1.75rem] border-border bg-card p-0 shadow-[0_-18px_56px_hsl(221_39%_12%/0.16)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:left-1/2 sm:max-w-2xl sm:-translate-x-1/2 sm:rounded-t-[1.75rem]"
        >
          <DialogHeader className="border-b border-border px-5 py-5 text-left sm:px-7">
            <DialogTitle className="pr-10 text-xl text-foreground">{copy.deckControls}</DialogTitle>
            <DialogDescription className="mt-1 max-w-xl leading-6">
              {copy.deckControlsDescription}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-foreground">{copy.extensionLabel}</p>
              <span className="text-xs font-medium text-muted-foreground">
                {withValue(copy.selectedExtensions, draftTlds.length)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {availableTlds.map((tld) => {
                const selected = draftTlds.includes(tld);
                return (
                  <button
                    key={tld}
                    type="button"
                    onClick={() => toggleDraftExtension(tld)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-12 items-center justify-between rounded-xl border px-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      selected
                        ? "border-primary bg-primary/[0.07] text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    <span>.{tld}</span>
                    <span
                      className={cn(
                        "grid h-5 w-5 place-items-center rounded-full border",
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
                      )}
                      aria-hidden="true"
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setDraftTlds(availableTlds)}
              disabled={allExtensionsSelected}
              className="mt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline disabled:cursor-default disabled:opacity-50"
            >
              {copy.allExtensions}
            </button>

            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              {publicMode ? copy.publicService : copy.localService}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.unsupportedEndings}</p>
          </div>

          <DialogFooter className="border-t border-border bg-secondary/35 px-5 py-4 sm:flex-row sm:justify-between sm:px-7">
            <Button type="button" variant="ghost" onClick={() => setIsSettingsOpen(false)}>
              {copy.closeSettings}
            </Button>
            <Button type="button" onClick={applySettings} disabled={draftTlds.length === 0 || isLoading || isPrefetching || isUndoPending}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {deck.length > 0 ? copy.updateDeck : copy.startDeck}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Swipe;
