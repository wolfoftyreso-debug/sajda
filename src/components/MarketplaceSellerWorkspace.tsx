import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Globe2,
  KeyRound,
  Link2,
  ListPlus,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";
import {
  getMarketplaceRepository,
  type MarketplaceCurrency,
  type MarketplaceDomainControlProof,
  type MarketplaceDomainListing,
  type MarketplaceDomainOffer,
  type MarketplacePublicDomainListing,
} from "@/lib/marketplaceRepository";
import { parseMarketplaceBulkListings } from "@/lib/marketplaceBulk";

type WorkspaceCopy = {
  eyebrow: string;
  title: string;
  lead: string;
  signInTitle: string;
  signInBody: string;
  signIn: string;
  publicTitle: string;
  publicEmpty: string;
  sellerTitle: string;
  sellerLead: string;
  sellerName: string;
  sellerNameHint: string;
  domain: string;
  price: string;
  currency: string;
  description: string;
  create: string;
  creating: string;
  createError: string;
  invalidDomain: string;
  myListings: string;
  noListings: string;
  open: string;
  statusDraft: string;
  statusProof: string;
  statusChecking: string;
  statusLive: string;
  statusPaused: string;
  statusWithdrawn: string;
  statusOther: string;
  proofTitle: string;
  proofLead: string;
  createProof: string;
  creatingProof: string;
  record: string;
  token: string;
  copy: string;
  copied: string;
  verify: string;
  verifying: string;
  proofPending: string;
  proofLive: string;
  proofError: string;
  refresh: string;
  bulkTitle: string;
  bulkLead: string;
  bulkExample: string;
  bulkPlaceholder: string;
  bulkReview: string;
  bulkNoRows: string;
  bulkErrors: string;
  lineLabel: string;
  bulkReady: string;
  import: string;
  importing: string;
  imported: string;
  bulkDefaultDescription: string;
  bulkMissingPrice: string;
  offers: string;
  offersLead: string;
  offersNotice: string;
  noOffers: string;
  offerMessage: string;
  offerSubmitted: string;
  offerAccepted: string;
  offerDeclined: string;
  acceptOffer: string;
  declineOffer: string;
  updatingOffer: string;
  offerUpdateError: string;
};

const workspaceCopy: Record<Language, WorkspaceCopy> = {
  en: {
    eyebrow: "Seller workspace",
    title: "List the domains you already own.",
    lead: "Create a listing, prove domain control with one DNS TXT record, then give every active listing a direct Sajda page and a downloadable for-sale site.",
    signInTitle: "Sign in to start selling.",
    signInBody: "Browse active listings without an account. Sign in to create and manage your own listings.",
    signIn: "Sign in to sell",
    publicTitle: "Live listings",
    publicEmpty: "No verified public listings yet.",
    sellerTitle: "Create a domain listing",
    sellerLead: "Add an asking price and a short description for buyers. After creating the listing, you can start verifying that you control the domain.",
    sellerName: "Public seller name",
    sellerNameHint: "Shown on your public listing.",
    domain: "Domain name",
    price: "Asking price",
    currency: "Currency",
    description: "Buyer-facing description",
    create: "Create listing",
    creating: "Creating…",
    createError: "We could not create that listing. Check the fields and try again.",
    invalidDomain: "Use a supported apex domain, such as northstar.dev — not www or a subdomain.",
    myListings: "Your listings",
    noListings: "Your first listing will appear here.",
    open: "Open listing",
    statusDraft: "Draft",
    statusProof: "DNS record needed",
    statusChecking: "Checking DNS",
    statusLive: "Live",
    statusPaused: "Paused",
    statusWithdrawn: "Withdrawn",
    statusOther: "Needs review",
    proofTitle: "Prove you control this domain",
    proofLead: "Add the TXT record below exactly as shown, then ask Sajda to check it. DNS changes can take time to become visible.",
    createProof: "Create DNS proof",
    creatingProof: "Preparing proof…",
    record: "TXT record",
    token: "TXT value",
    copy: "Copy",
    copied: "Copied",
    verify: "Check DNS and publish",
    verifying: "Checking DNS…",
    proofPending: "The TXT record is not visible yet. Leave it in place and try again shortly.",
    proofLive: "Domain control verified. Your listing is live.",
    proofError: "We could not verify this proof. Check the record and try again.",
    refresh: "Refresh listings",
    bulkTitle: "Add many domains at once",
    bulkLead: "Paste up to 100 domains. Include a price per line, or use the price above as the default.",
    bulkExample: "Format: domain | price | currency | description",
    bulkPlaceholder: "northstar.dev | 2500 | USD | Short, memorable product name\nfieldnotes.com | 8000 | USD | A clean editorial domain",
    bulkReview: "Review import",
    bulkNoRows: "Paste at least one domain to import.",
    bulkErrors: "Issues to fix before importing: {count}.",
    lineLabel: "Line",
    bulkReady: "Listings ready to create: {count}.",
    import: "Create {count} listings",
    importing: "Creating listings…",
    imported: "{count} listings created. Select one to start its DNS proof.",
    bulkDefaultDescription: "A domain offered through Sajda.",
    bulkMissingPrice: "Add a price on each row or enter a default asking price above.",
    offers: "Buyer offers",
    offersLead: "Review each offer and decide whether to continue the sale conversation.",
    offersNotice: "Offers are non-binding. Sajda does not process payment or the domain transfer.",
    noOffers: "No offers for this listing yet.",
    offerMessage: "Buyer message",
    offerSubmitted: "New offer",
    offerAccepted: "Conversation opened",
    offerDeclined: "Declined",
    acceptOffer: "Continue the conversation",
    declineOffer: "Decline",
    updatingOffer: "Updating…",
    offerUpdateError: "We could not update that offer. Try again.",
  },
  sv: {
    eyebrow: "Säljarvy",
    title: "Lägg ut domäner du redan äger.",
    lead: "Skapa en annons och bekräfta att du kontrollerar domänen med en DNS TXT-post. Varje aktiv annons får en egen Sajda-sida och en säljsida att ladda ner.",
    signInTitle: "Logga in för att börja sälja.",
    signInBody: "Du kan se aktiva annonser utan konto. Logga in för att skapa och hantera dina egna annonser.",
    signIn: "Logga in för att sälja",
    publicTitle: "Aktiva annonser",
    publicEmpty: "Det finns inga verifierade offentliga annonser ännu.",
    sellerTitle: "Skapa en domänannons",
    sellerLead: "Ange ett begärt pris och en kort beskrivning för köpare. När annonsen har skapats kan du börja verifiera att du kontrollerar domänen.",
    sellerName: "Säljarnamn som visas offentligt",
    sellerNameHint: "Visas i din offentliga annons.",
    domain: "Domännamn",
    price: "Begärt pris",
    currency: "Valuta",
    description: "Text för köpare",
    create: "Skapa annons",
    creating: "Skapar…",
    createError: "Det gick inte att skapa annonsen. Kontrollera fälten och försök igen.",
    invalidDomain: "Använd en domän på huvudnivå, till exempel northstar.dev — inte www eller en subdomän.",
    myListings: "Dina annonser",
    noListings: "Din första annons visas här.",
    open: "Öppna annons",
    statusDraft: "Utkast",
    statusProof: "DNS-post behövs",
    statusChecking: "Kontrollerar DNS",
    statusLive: "Publicerad",
    statusPaused: "Pausad",
    statusWithdrawn: "Indragen",
    statusOther: "Behöver granskning",
    proofTitle: "Bekräfta att du kontrollerar domänen",
    proofLead: "Lägg in TXT-posten nedan exakt som den visas och låt sedan Sajda kontrollera den. Det kan ta tid innan DNS-ändringar syns.",
    createProof: "Skapa DNS-kontroll",
    creatingProof: "Förbereder kontroll…",
    record: "TXT-post",
    token: "TXT-värde",
    copy: "Kopiera",
    copied: "Kopierat",
    verify: "Kontrollera DNS och publicera",
    verifying: "Kontrollerar DNS…",
    proofPending: "TXT-posten syns inte ännu. Låt den ligga kvar och försök igen snart.",
    proofLive: "Domänkontrollen är klar. Din annons är publicerad.",
    proofError: "Det gick inte att verifiera kontrollen. Granska posten och försök igen.",
    refresh: "Uppdatera annonser",
    bulkTitle: "Lägg till många domäner samtidigt",
    bulkLead: "Klistra in upp till 100 domäner. Ange ett pris per rad eller använd priset ovan som standard.",
    bulkExample: "Format: domän | pris | valuta | beskrivning",
    bulkPlaceholder: "northstar.dev | 2500 | USD | Kort, minnesvärt produktnamn\nfieldnotes.com | 8000 | USD | En ren redaktionell domän",
    bulkReview: "Granska import",
    bulkNoRows: "Klistra in minst en domän för import.",
    bulkErrors: "Rätta {count} radfel före import.",
    lineLabel: "Rad",
    bulkReady: "Annonser att skapa: {count}.",
    import: "Skapa {count} annonser",
    importing: "Skapar annonser…",
    imported: "{count} annonser skapades. Välj en för att starta DNS-kontrollen.",
    bulkDefaultDescription: "En domän som erbjuds via Sajda.",
    bulkMissingPrice: "Ange ett pris på varje rad eller ett standardpris ovan.",
    offers: "Bud från köpare",
    offersLead: "Granska varje bud och välj om du vill diskutera affären vidare.",
    offersNotice: "Bud är icke-bindande. Sajda hanterar inte betalning eller domänöverföring.",
    noOffers: "Det finns inga bud på annonsen ännu.",
    offerMessage: "Köparens meddelande",
    offerSubmitted: "Nytt bud",
    offerAccepted: "Dialog inledd",
    offerDeclined: "Avböjt",
    acceptOffer: "Fortsätt dialogen",
    declineOffer: "Avböj",
    updatingOffer: "Uppdaterar…",
    offerUpdateError: "Det gick inte att uppdatera budet. Försök igen.",
  },
  es: {
    eyebrow: "Espacio del vendedor",
    title: "Publica los dominios que ya posees.",
    lead: "Crea un anuncio y confirma que controlas el dominio con un registro DNS TXT. Cada anuncio activo tendrá su propia página en Sajda y una página de venta descargable.",
    signInTitle: "Inicia sesión para empezar a vender.",
    signInBody: "Puedes ver los anuncios activos sin cuenta. Inicia sesión para crear y gestionar tus propios anuncios.",
    signIn: "Iniciar sesión para vender",
    publicTitle: "Anuncios activos",
    publicEmpty: "Aún no hay anuncios públicos verificados.",
    sellerTitle: "Crear un anuncio de dominio",
    sellerLead: "Añade un precio solicitado y una breve descripción para los compradores. Después de crear el anuncio, podrás verificar que controlas el dominio.",
    sellerName: "Nombre público del vendedor",
    sellerNameHint: "Se muestra en tu anuncio público.",
    domain: "Nombre de dominio",
    price: "Precio solicitado",
    currency: "Moneda",
    description: "Descripción para compradores",
    create: "Crear anuncio",
    creating: "Creando…",
    createError: "No hemos podido crear el anuncio. Revisa los campos e inténtalo de nuevo.",
    invalidDomain: "Usa un dominio raíz compatible, como northstar.dev; no uses www ni un subdominio.",
    myListings: "Tus anuncios",
    noListings: "Tu primer anuncio aparecerá aquí.",
    open: "Abrir anuncio",
    statusDraft: "Borrador",
    statusProof: "Se necesita un registro DNS",
    statusChecking: "Comprobando DNS",
    statusLive: "Activo",
    statusPaused: "En pausa",
    statusWithdrawn: "Retirado",
    statusOther: "Necesita revisión",
    proofTitle: "Demuestra que controlas este dominio",
    proofLead: "Añade el registro TXT de abajo exactamente como se muestra y pide a Sajda que lo compruebe. Los cambios en DNS pueden tardar en ser visibles.",
    createProof: "Crear prueba DNS",
    creatingProof: "Preparando prueba…",
    record: "Registro TXT",
    token: "Valor TXT",
    copy: "Copiar",
    copied: "Copiado",
    verify: "Comprobar DNS y publicar",
    verifying: "Comprobando DNS…",
    proofPending: "El registro TXT aún no es visible. Déjalo en su lugar e inténtalo de nuevo en breve.",
    proofLive: "Control del dominio verificado. Tu anuncio está activo.",
    proofError: "No hemos podido verificar la prueba. Revisa el registro e inténtalo de nuevo.",
    refresh: "Actualizar anuncios",
    bulkTitle: "Añadir muchos dominios a la vez",
    bulkLead: "Pega hasta 100 dominios. Incluye un precio por línea o usa como predeterminado el precio de arriba.",
    bulkExample: "Formato: dominio | precio | moneda | descripción",
    bulkPlaceholder: "northstar.dev | 2500 | USD | Nombre de producto corto y memorable\nfieldnotes.com | 8000 | USD | Un dominio editorial limpio",
    bulkReview: "Revisar importación",
    bulkNoRows: "Pega al menos un dominio para importar.",
    bulkErrors: "Problemas que debes corregir antes de importar: {count}.",
    lineLabel: "Línea",
    bulkReady: "Anuncios listos para crear: {count}.",
    import: "Crear {count} anuncios",
    importing: "Creando anuncios…",
    imported: "Se han creado {count} anuncios. Selecciona uno para iniciar su prueba DNS.",
    bulkDefaultDescription: "Un dominio ofrecido a través de Sajda.",
    bulkMissingPrice: "Añade un precio a cada fila o introduce un precio predeterminado arriba.",
    offers: "Ofertas de compradores",
    offersLead: "Revisa cada oferta y decide si deseas continuar la conversación de venta.",
    offersNotice: "Las ofertas no son vinculantes. Sajda no procesa el pago ni la transferencia del dominio.",
    noOffers: "Aún no hay ofertas para este anuncio.",
    offerMessage: "Mensaje del comprador",
    offerSubmitted: "Nueva oferta",
    offerAccepted: "Conversación iniciada",
    offerDeclined: "Rechazada",
    acceptOffer: "Continuar la conversación",
    declineOffer: "Rechazar",
    updatingOffer: "Actualizando…",
    offerUpdateError: "No se ha podido actualizar la oferta. Inténtalo de nuevo.",
  },
  fr: {
    eyebrow: "Espace vendeur",
    title: "Publiez les domaines que vous possédez déjà.",
    lead: "Créez une annonce et confirmez que vous contrôlez le domaine avec un enregistrement DNS TXT. Chaque annonce active dispose d’une page Sajda et d’une page de vente téléchargeable.",
    signInTitle: "Connectez-vous pour commencer à vendre.",
    signInBody: "Consultez les annonces actives sans compte. Connectez-vous pour créer et gérer vos propres annonces.",
    signIn: "Se connecter pour vendre",
    publicTitle: "Annonces actives",
    publicEmpty: "Aucune annonce publique vérifiée pour le moment.",
    sellerTitle: "Créer une annonce de domaine",
    sellerLead: "Ajoutez un prix demandé et une courte description destinée aux acheteurs. Après la création de l’annonce, vous pourrez vérifier que vous contrôlez le domaine.",
    sellerName: "Nom public du vendeur",
    sellerNameHint: "Affiché sur votre annonce publique.",
    domain: "Nom de domaine",
    price: "Prix demandé",
    currency: "Devise",
    description: "Description pour l’acheteur",
    create: "Créer l’annonce",
    creating: "Création…",
    createError: "Impossible de créer cette annonce. Vérifiez les champs et réessayez.",
    invalidDomain: "Utilisez un domaine racine pris en charge, comme northstar.dev — pas www ni un sous-domaine.",
    myListings: "Vos annonces",
    noListings: "Votre première annonce apparaîtra ici.",
    open: "Ouvrir l’annonce",
    statusDraft: "Brouillon",
    statusProof: "Enregistrement DNS requis",
    statusChecking: "Vérification DNS",
    statusLive: "En ligne",
    statusPaused: "En pause",
    statusWithdrawn: "Retirée",
    statusOther: "À examiner",
    proofTitle: "Prouvez que vous contrôlez ce domaine",
    proofLead: "Ajoutez l’enregistrement TXT ci-dessous exactement comme indiqué, puis demandez à Sajda de le vérifier. Les changements DNS peuvent mettre du temps à devenir visibles.",
    createProof: "Créer une preuve DNS",
    creatingProof: "Préparation…",
    record: "Enregistrement TXT",
    token: "Valeur TXT",
    copy: "Copier",
    copied: "Copié",
    verify: "Vérifier le DNS et publier",
    verifying: "Vérification DNS…",
    proofPending: "L’enregistrement TXT n’est pas encore visible. Laissez-le en place et réessayez bientôt.",
    proofLive: "Contrôle du domaine vérifié. Votre annonce est en ligne.",
    proofError: "Nous n’avons pas pu vérifier cette preuve. Vérifiez l’enregistrement et réessayez.",
    refresh: "Actualiser les annonces",
    bulkTitle: "Ajouter plusieurs domaines à la fois",
    bulkLead: "Collez jusqu’à 100 domaines. Indiquez un prix par ligne ou utilisez le prix ci-dessus par défaut.",
    bulkExample: "Format : domaine | prix | devise | description",
    bulkPlaceholder: "northstar.dev | 2500 | USD | Nom de produit court et mémorable\nfieldnotes.com | 8000 | USD | Un domaine éditorial sobre",
    bulkReview: "Vérifier l’importation",
    bulkNoRows: "Collez au moins un domaine à importer.",
    bulkErrors: "Problèmes à corriger avant l’importation : {count}.",
    lineLabel: "Ligne",
    bulkReady: "Annonces prêtes à créer : {count}.",
    import: "Créer {count} annonces",
    importing: "Création des annonces…",
    imported: "{count} annonces créées. Sélectionnez-en une pour démarrer la preuve DNS.",
    bulkDefaultDescription: "Un domaine proposé via Sajda.",
    bulkMissingPrice: "Ajoutez un prix à chaque ligne ou saisissez un prix par défaut ci-dessus.",
    offers: "Offres d’acheteurs",
    offersLead: "Examinez chaque offre et décidez si vous souhaitez poursuivre l’échange de vente.",
    offersNotice: "Les offres sont sans engagement. Sajda ne traite ni le paiement ni le transfert du domaine.",
    noOffers: "Aucune offre pour cette annonce pour le moment.",
    offerMessage: "Message de l’acheteur",
    offerSubmitted: "Nouvelle offre",
    offerAccepted: "Échange ouvert",
    offerDeclined: "Refusée",
    acceptOffer: "Poursuivre l’échange",
    declineOffer: "Refuser",
    updatingOffer: "Mise à jour…",
    offerUpdateError: "Impossible de mettre à jour cette offre. Réessayez.",
  },
  zh: {
    eyebrow: "卖家工作区",
    title: "发布你已经拥有的域名。",
    lead: "创建挂牌，并通过一条 DNS TXT 记录确认域名控制权。每条已上线挂牌都有自己的 Sajda 页面，以及可下载的出售页面。",
    signInTitle: "登录后开始出售。",
    signInBody: "无需账户即可浏览已上线挂牌。登录后可以创建和管理自己的挂牌。",
    signIn: "登录后出售",
    publicTitle: "已上线挂牌",
    publicEmpty: "目前没有已验证的公开挂牌。",
    sellerTitle: "创建域名挂牌",
    sellerLead: "从清晰的价格和简短买家说明开始。创建后即可申请域名控制权验证。",
    sellerName: "公开卖家名称",
    sellerNameHint: "显示在公开挂牌中。",
    domain: "域名",
    price: "挂牌价格",
    currency: "货币",
    description: "面向买家的描述",
    create: "创建挂牌",
    creating: "正在创建…",
    createError: "无法创建挂牌。请检查字段后重试。",
    invalidDomain: "请使用受支持的根域名，例如 northstar.dev；不要使用 www 或子域名。",
    myListings: "你的挂牌",
    noListings: "你的第一个挂牌会显示在这里。",
    open: "打开挂牌",
    statusDraft: "草稿",
    statusProof: "需要 DNS 记录",
    statusChecking: "正在检查 DNS",
    statusLive: "已上线",
    statusPaused: "已暂停",
    statusWithdrawn: "已撤回",
    statusOther: "需要审核",
    proofTitle: "确认你拥有域名控制权",
    proofLead: "按下方内容原样添加 TXT 记录，再让 Sajda 检查。DNS 更改可能需要一段时间才能被查询到。",
    createProof: "创建 DNS 验证",
    creatingProof: "正在准备验证…",
    record: "TXT 记录",
    token: "TXT 值",
    copy: "复制",
    copied: "已复制",
    verify: "检查 DNS 并发布",
    verifying: "正在检查 DNS…",
    proofPending: "TXT 记录暂时还不可见。请保留记录，稍后再试。",
    proofLive: "域名控制权已验证。你的挂牌已上线。",
    proofError: "无法验证该记录。请检查后重试。",
    refresh: "刷新挂牌",
    bulkTitle: "一次添加多个域名",
    bulkLead: "最多粘贴 100 个域名。每行可包含价格，也可以使用上方默认价格。",
    bulkExample: "格式：域名 | 价格 | 货币 | 描述",
    bulkPlaceholder: "northstar.dev | 2500 | USD | 简短好记的产品名称\nfieldnotes.com | 8000 | USD | 简洁的编辑型域名",
    bulkReview: "检查导入",
    bulkNoRows: "请至少粘贴一个域名以导入。",
    bulkErrors: "导入前需要修正的问题：{count} 个。",
    lineLabel: "行",
    bulkReady: "可创建的挂牌：{count} 个。",
    import: "创建 {count} 个挂牌",
    importing: "正在创建挂牌…",
    imported: "已创建 {count} 个挂牌。选择一个即可开始 DNS 验证。",
    bulkDefaultDescription: "通过 Sajda 提供的域名。",
    bulkMissingPrice: "请在每行添加价格，或在上方输入默认挂牌价格。",
    offers: "买家出价",
    offersLead: "查看每份出价，决定是否继续洽谈。",
    offersNotice: "出价不具约束力。Sajda 不处理付款或域名转移。",
    noOffers: "这条挂牌目前还没有收到出价。",
    offerMessage: "买家留言",
    offerSubmitted: "新出价",
    offerAccepted: "已开启沟通",
    offerDeclined: "已拒绝",
    acceptOffer: "继续沟通",
    declineOffer: "拒绝",
    updatingOffer: "正在更新…",
    offerUpdateError: "无法更新该出价，请重试。",
  },
};

type ListingForm = {
  sellerName: string;
  domain: string;
  price: string;
  currency: MarketplaceCurrency;
  description: string;
};

const emptyForm: ListingForm = {
  sellerName: "",
  domain: "",
  price: "",
  currency: "USD",
  description: "",
};

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function statusLabel(status: MarketplaceDomainListing["status"], copy: WorkspaceCopy): string {
  if (status === "seller_declared") return copy.statusDraft;
  if (status === "proof_pending") return copy.statusProof;
  if (status === "under_review") return copy.statusChecking;
  if (status === "active") return copy.statusLive;
  if (status === "paused") return copy.statusPaused;
  if (status === "withdrawn") return copy.statusWithdrawn;
  return copy.statusOther;
}

function statusClass(status: MarketplaceDomainListing["status"]): string {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "proof_pending" || status === "under_review") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-border bg-muted text-muted-foreground";
}

function offerStatusLabel(status: MarketplaceDomainOffer["status"], copy: WorkspaceCopy): string {
  if (status === "accepted") return copy.offerAccepted;
  if (status === "declined") return copy.offerDeclined;
  return copy.offerSubmitted;
}

function offerStatusClass(status: MarketplaceDomainOffer["status"]): string {
  if (status === "accepted") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "declined" || status === "withdrawn" || status === "expired") return "border-border bg-muted text-muted-foreground";
  return "border-primary/20 bg-primary/[0.05] text-primary";
}

function formatPrice(value: number, currency: MarketplaceCurrency, language: Language): string {
  try {
    return new Intl.NumberFormat(language === "zh" ? "zh-CN" : language, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}

function CopyValue({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1700);
    } catch {
      window.prompt("Copy", value);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {copied ? copiedLabel : label}
    </Button>
  );
}

function PublicListingCard({ listing, copy, language }: { listing: MarketplacePublicDomainListing; copy: WorkspaceCopy; language: Language }) {
  return (
    <article className="sajda-surface sajda-interactive flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Globe2 className="h-5 w-5" aria-hidden="true" /></span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-emerald-800">{copy.statusLive}</span>
      </div>
      <h3 className="mt-5 break-all text-xl font-semibold tracking-[-0.035em]">{listing.domain}</h3>
      <p className="mt-2 text-lg font-semibold">{formatPrice(listing.askingPrice, listing.currency, language)}</p>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{listing.description}</p>
      <Button asChild variant="outline" className="mt-5 w-full"><Link to={`/marketplace/${listing.id}`}>{copy.open}<ArrowRight className="h-4 w-4" /></Link></Button>
    </article>
  );
}

export default function MarketplaceSellerWorkspace() {
  const { language } = useLanguage();
  const { user, session, loading: authLoading } = useAuth();
  const copy = workspaceCopy[language];
  const [form, setForm] = useState<ListingForm>(emptyForm);
  const [myListings, setMyListings] = useState<MarketplaceDomainListing[]>([]);
  const [publicListings, setPublicListings] = useState<MarketplacePublicDomainListing[]>([]);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [proof, setProof] = useState<MarketplaceDomainControlProof | null>(null);
  const [offers, setOffers] = useState<MarketplaceDomainOffer[]>([]);
  const [bulkInput, setBulkInput] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isProofing, setIsProofing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [updatingOfferId, setUpdatingOfferId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const repository = getMarketplaceRepository();
      const [publicRows, ownRows] = await Promise.all([
        repository.listPublicActiveListings(),
        user ? repository.listMyListings() : Promise.resolve([]),
      ]);
      setPublicListings(publicRows);
      setMyListings(ownRows);
      setError("");
    } catch {
      setError(copy.createError);
    } finally {
      setIsLoading(false);
    }
  }, [copy.createError, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user?.email || form.sellerName) return;
    const guessedName = user.email.split("@")[0]?.replace(/[._-]+/g, " ").trim() ?? "";
    if (guessedName.length >= 2) setForm((current) => ({ ...current, sellerName: guessedName }));
  }, [form.sellerName, user?.email]);

  const selectedListing = useMemo(
    () => myListings.find((listing) => listing.id === selectedListingId) ?? null,
    [myListings, selectedListingId],
  );

  useEffect(() => {
    if (!selectedListing) {
      setProof(null);
      setOffers([]);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const repository = getMarketplaceRepository();
        const [proofs, ownOffers] = await Promise.all([
          repository.listMyDomainControlProofs(selectedListing.id),
          repository.listMyOffers(selectedListing.id),
        ]);
        if (active) {
          setProof(proofs[0] ?? null);
          setOffers(ownOffers);
        }
      } catch {
        if (active) {
          setProof(null);
          setOffers([]);
        }
      }
    })();
    return () => { active = false; };
  }, [selectedListing]);

  const updateForm = <Key extends keyof ListingForm>(key: Key, value: ListingForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError("");
    if (message) setMessage("");
  };

  const createListing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      setError(copy.signInTitle);
      return;
    }
    setIsCreating(true);
    setError("");
    setMessage("");
    try {
      const repository = getMarketplaceRepository();
      await repository.ensureSellerProfile({ displayName: form.sellerName, defaultCurrency: form.currency });
      const listing = await repository.createListing({
        domain: form.domain,
        askingPrice: Number(form.price),
        currency: form.currency,
        description: form.description,
        sellerDisplayName: form.sellerName,
      });
      setForm((current) => ({ ...emptyForm, sellerName: current.sellerName, currency: current.currency }));
      setSelectedListingId(listing.id);
      await refresh();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setError(code === "invalid-marketplace-domain" ? copy.invalidDomain : copy.createError);
    } finally {
      setIsCreating(false);
    }
  };

  const requestProof = async () => {
    if (!selectedListing) return;
    setIsProofing(true);
    setError("");
    setMessage("");
    try {
      const newProof = await getMarketplaceRepository().beginDomainControlProof(selectedListing.id);
      setProof({
        ...newProof,
        sellerId: selectedListing.sellerId,
        submittedAt: null,
        checkedAt: null,
        verifiedAt: null,
        rejectedAt: null,
        verifierNote: null,
        updatedAt: newProof.createdAt,
      });
      await refresh();
    } catch {
      setError(copy.proofError);
    } finally {
      setIsProofing(false);
    }
  };

  const verifyProof = async () => {
    if (!proof || !session?.access_token) {
      setError(copy.signInTitle);
      return;
    }
    setIsVerifying(true);
    setError("");
    setMessage("");
    try {
      await getMarketplaceRepository().submitDomainControlProof(proof.id);
      const response = await fetch("/api/marketplace/verify-domain", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ proofId: proof.id }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      const code = body && typeof body === "object" && "code" in body ? String((body as { code?: unknown }).code ?? "") : "";
      if (response.status === 202 && code === "dns_not_ready") {
        setMessage(copy.proofPending);
      } else if (response.ok) {
        setMessage(copy.proofLive);
        await refresh();
      } else {
        setError(copy.proofError);
      }
    } catch {
      setError(copy.proofError);
    } finally {
      setIsVerifying(false);
    }
  };

  const updateOffer = async (offer: MarketplaceDomainOffer, status: "accepted" | "declined") => {
    setUpdatingOfferId(offer.id);
    setError("");
    try {
      const updated = await getMarketplaceRepository().updateOfferStatus(offer.id, status);
      setOffers((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    } catch {
      setError(copy.offerUpdateError);
    } finally {
      setUpdatingOfferId(null);
    }
  };

  const bulkParsed = useMemo(
    () => parseMarketplaceBulkListings(bulkInput, { defaultCurrency: form.currency }),
    [bulkInput, form.currency],
  );

  const bulkReady = bulkParsed.drafts.filter((draft) => {
    const price = draft.askingPrice ?? Number(form.price);
    return Number.isFinite(price) && price > 0;
  });
  const bulkPriceMissing = bulkParsed.drafts.length > bulkReady.length;

  const importBulk = async () => {
    if (!user) {
      setError(copy.signInTitle);
      return;
    }
    if (bulkParsed.errors.length || bulkParsed.drafts.length === 0 || bulkPriceMissing) return;
    setIsImporting(true);
    setError("");
    setMessage("");
    try {
      const repository = getMarketplaceRepository();
      await repository.ensureSellerProfile({ displayName: form.sellerName, defaultCurrency: form.currency });
      let count = 0;
      for (const draft of bulkParsed.drafts) {
        await repository.createListing({
          domain: draft.domain,
          askingPrice: draft.askingPrice ?? Number(form.price),
          currency: draft.currency,
          description: draft.description || form.description.trim() || copy.bulkDefaultDescription,
          sellerDisplayName: form.sellerName,
        });
        count += 1;
      }
      setBulkInput("");
      setMessage(interpolate(copy.imported, { count }));
      await refresh();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setError(code === "invalid-marketplace-domain" ? copy.invalidDomain : copy.createError);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <section className="sajda-surface-raised p-5 sm:p-7" aria-labelledby="seller-workspace-title">
      <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><StorefrontIcon /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{copy.eyebrow}</p>
            <h2 id="seller-workspace-title" className="mt-2 text-xl font-semibold tracking-[-0.035em]">{copy.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.lead}</p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => void refresh()} disabled={isLoading} className="shrink-0">
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />{copy.refresh}
        </Button>
      </div>

      {message && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{message}</p>}
      {error && <p role="alert" className="mt-5 rounded-xl border border-destructive/25 bg-destructive/[0.05] px-4 py-3 text-sm font-medium text-destructive">{error}</p>}

      {!authLoading && !user ? (
        <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 sm:p-6">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          <h3 className="mt-4 text-lg font-semibold">{copy.signInTitle}</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{copy.signInBody}</p>
          <Button asChild className="mt-5"><Link to="/auth">{copy.signIn}<ArrowRight className="h-4 w-4" /></Link></Button>
        </div>
      ) : null}

      {user ? (
        <>
          <form onSubmit={createListing} className="mt-7 border-b border-border pb-7" noValidate>
            <div className="flex items-center gap-2"><ListPlus className="h-4 w-4 text-primary" aria-hidden="true" /><h3 className="text-base font-semibold">{copy.sellerTitle}</h3></div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.sellerLead}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium"><span>{copy.sellerName}</span><Input value={form.sellerName} onChange={(event) => updateForm("sellerName", event.target.value)} maxLength={80} required /><span className="block text-xs font-normal text-muted-foreground">{copy.sellerNameHint}</span></label>
              <label className="space-y-2 text-sm font-medium"><span>{copy.domain}</span><Input value={form.domain} onChange={(event) => updateForm("domain", event.target.value)} placeholder="northstar.dev" autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></label>
              <label className="space-y-2 text-sm font-medium"><span>{copy.price}</span><Input type="number" min="1" step="1" value={form.price} onChange={(event) => updateForm("price", event.target.value)} placeholder="2500" required /></label>
              <label className="space-y-2 text-sm font-medium"><span>{copy.currency}</span><select value={form.currency} onChange={(event) => updateForm("currency", event.target.value as MarketplaceCurrency)} className="flex h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><option value="USD">USD</option><option value="SEK">SEK</option><option value="EUR">EUR</option></select></label>
            </div>
            <label className="mt-4 block space-y-2 text-sm font-medium"><span>{copy.description}</span><Textarea value={form.description} onChange={(event) => updateForm("description", event.target.value)} maxLength={1400} className="min-h-24 rounded-xl" required /></label>
            <Button type="submit" className="mt-5" disabled={isCreating}>{isCreating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{isCreating ? copy.creating : copy.create}</Button>
          </form>

          <details className="group mt-6 rounded-2xl border border-border bg-muted/[0.28] p-4 sm:p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold marker:hidden"><span className="inline-flex items-center gap-2"><Upload className="h-4 w-4 text-primary" aria-hidden="true" />{copy.bulkTitle}</span><ArrowRight className="h-4 w-4 rotate-90 transition-transform group-open:-rotate-90" aria-hidden="true" /></summary>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.bulkLead}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">{copy.bulkExample}</p>
            <Textarea value={bulkInput} onChange={(event) => setBulkInput(event.target.value)} placeholder={copy.bulkPlaceholder} className="mt-4 min-h-36 rounded-xl bg-background font-mono text-xs leading-5" />
            <div className="mt-4 rounded-xl border border-border bg-background p-3 text-sm">
              {!bulkInput.trim() ? <p className="text-muted-foreground">{copy.bulkNoRows}</p> : bulkParsed.errors.length ? <p className="text-destructive">{interpolate(copy.bulkErrors, { count: bulkParsed.errors.length })}</p> : bulkPriceMissing ? <p className="text-destructive">{copy.bulkMissingPrice}</p> : <p className="font-medium text-foreground">{interpolate(copy.bulkReady, { count: bulkReady.length })}</p>}
              {bulkParsed.errors.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">{bulkParsed.errors.slice(0, 4).map((item) => <li key={`${item.lineNumber}-${item.code}`}>{copy.lineLabel} {item.lineNumber}: {item.message}</li>)}</ul>}
            </div>
            <Button type="button" variant="outline" onClick={() => void importBulk()} disabled={isImporting || !bulkReady.length || Boolean(bulkParsed.errors.length) || bulkPriceMissing} className="mt-4">{isImporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{isImporting ? copy.importing : interpolate(copy.import, { count: bulkReady.length })}</Button>
          </details>

          <section className="mt-7" aria-labelledby="my-marketplace-listings">
            <h3 id="my-marketplace-listings" className="text-base font-semibold">{copy.myListings}</h3>
            {myListings.length ? <div className="mt-4 grid gap-3">{myListings.map((listing) => <button key={listing.id} type="button" onClick={() => setSelectedListingId(listing.id)} className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedListingId === listing.id ? "border-primary bg-primary/[0.04]" : "border-border bg-background hover:border-primary/40"}`}><span className="min-w-0"><span className="block break-all font-semibold">{listing.domain}</span><span className="mt-1 block text-sm text-muted-foreground">{formatPrice(listing.askingPrice, listing.currency, language)}</span></span><span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.09em] ${statusClass(listing.status)}`}>{statusLabel(listing.status, copy)}</span></button>)}</div> : <p className="mt-3 text-sm text-muted-foreground">{copy.noListings}</p>}
          </section>

          {selectedListing ? <section className="mt-6 rounded-2xl border border-primary/20 bg-primary/[0.035] p-5" aria-labelledby="dns-proof-title">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{selectedListing.domain}</p><h3 id="dns-proof-title" className="mt-2 text-lg font-semibold">{copy.proofTitle}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.proofLead}</p></div><KeyRound className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /></div>
            {!proof || proof.status === "expired" || proof.status === "rejected" ? <Button type="button" onClick={() => void requestProof()} disabled={isProofing} className="mt-5">{isProofing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{isProofing ? copy.creatingProof : copy.createProof}</Button> : <div className="mt-5 grid gap-4 rounded-xl border border-border bg-background p-4"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{copy.record}</p><div className="mt-2 flex flex-wrap items-center gap-2"><code className="rounded-lg bg-muted px-2.5 py-1.5 text-xs text-foreground">{proof.challengeRecord}</code><CopyValue value={proof.challengeRecord} label={copy.copy} copiedLabel={copy.copied} /></div></div><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{copy.token}</p><div className="mt-2 flex flex-wrap items-center gap-2"><code className="break-all rounded-lg bg-muted px-2.5 py-1.5 text-xs text-foreground">{proof.challengeToken}</code><CopyValue value={proof.challengeToken} label={copy.copy} copiedLabel={copy.copied} /></div></div><Button type="button" onClick={() => void verifyProof()} disabled={isVerifying} className="w-fit">{isVerifying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{isVerifying ? copy.verifying : copy.verify}</Button></div>}
            {selectedListing.status === "active" ? <Button asChild variant="outline" className="mt-4"><Link to={`/marketplace/${selectedListing.id}`}><Link2 className="h-4 w-4" aria-hidden="true" />{copy.open}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button> : null}
          </section> : null}

          {selectedListing ? <section className="mt-6 rounded-2xl border border-border bg-background p-5" aria-labelledby="marketplace-offers-title">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><MessageSquareText className="h-5 w-5" aria-hidden="true" /></span><div><h3 id="marketplace-offers-title" className="text-lg font-semibold">{copy.offers}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.offersLead}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.offersNotice}</p></div></div>
            {offers.length ? <div className="mt-5 grid gap-3">{offers.map((offer) => <article key={offer.id} className="rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-semibold">{formatPrice(offer.amount, offer.currency, language)}</p><p className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language, { dateStyle: "medium" }).format(new Date(offer.createdAt))}</p></div><span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.09em] ${offerStatusClass(offer.status)}`}>{offerStatusLabel(offer.status, copy)}</span></div>{offer.message ? <div className="mt-4 border-t border-border pt-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{copy.offerMessage}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/85">{offer.message}</p></div> : null}{offer.status === "submitted" ? <div className="mt-4 flex flex-wrap gap-3"><Button type="button" size="sm" onClick={() => void updateOffer(offer, "accepted")} disabled={updatingOfferId === offer.id}>{updatingOfferId === offer.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{updatingOfferId === offer.id ? copy.updatingOffer : copy.acceptOffer}</Button><Button type="button" size="sm" variant="outline" onClick={() => void updateOffer(offer, "declined")} disabled={updatingOfferId === offer.id}>{copy.declineOffer}</Button></div> : null}</article>)}</div> : <p className="mt-4 text-sm text-muted-foreground">{copy.noOffers}</p>}
          </section> : null}
        </>
      ) : null}

      <section className="mt-8 border-t border-border pt-7" aria-labelledby="public-listings-title">
        <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" aria-hidden="true" /><h3 id="public-listings-title" className="text-base font-semibold">{copy.publicTitle}</h3></div>
        {isLoading ? <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />{copy.refresh}</div> : publicListings.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{publicListings.map((listing) => <PublicListingCard key={listing.id} listing={listing} copy={copy} language={language} />)}</div> : <p className="mt-3 text-sm text-muted-foreground">{copy.publicEmpty}</p>}
      </section>
    </section>
  );
}

function StorefrontIcon() {
  return <Globe2 className="h-5 w-5" aria-hidden="true" />;
}
