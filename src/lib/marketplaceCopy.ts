import type { Language } from "@/i18n/LanguageProvider";

export type MarketplaceCopy = {
  pageTitle: string;
  eyebrow: string;
  title: string;
  lead: string;
  localBadge: string;
  localNotice: string;
  createLink: string;
  localCreateLink: string;
  browseLabel: string;
  draftsLabel: string;
  draftsCount: string;
  emptyTitle: string;
  emptyBody: string;
  createTitle: string;
  createLead: string;
  domainLabel: string;
  domainPlaceholder: string;
  priceLabel: string;
  currencyLabel: string;
  categoryDomain: string;
  categoryDraftStatus: string;
  domainPanelEyebrow: string;
  domainReadinessEyebrow: string;
  domainReadinessTitle: string;
  domainReadinessLead: string;
  domainReadinessOwnership: string;
  domainReadinessSettlement: string;
  domainReadinessTransfer: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  contactLabel: string;
  contactOptional: string;
  contactPlaceholder: string;
  privacyNotice: string;
  createButton: string;
  invalidDomain: string;
  invalidPrice: string;
  missingDescription: string;
  detailEyebrow: string;
  detailTitle: string;
  localDraft: string;
  askingPrice: string;
  description: string;
  contact: string;
  notProvided: string;
  directLink: string;
  copyLink: string;
  copied: string;
  backToMarketplace: string;
  searchDomain: string;
  noCheckout: string;
  noCheckoutBody: string;
  loadingListing: string;
  notFoundTitle: string;
  notFoundBody: string;
  createFirst: string;
  localOnly: string;
  localOnlyBody: string;
  created: string;
  listingName: string;
  openListing: string;
  purchaseEnquiryEyebrow: string;
  purchaseEnquiryTitle: string;
  purchaseEnquiryLead: string;
  purchaseEnquiryLiveLead: string;
  offerAmount: string;
  offerAmountHint: string;
  buyerMessage: string;
  buyerMessagePlaceholder: string;
  purchaseEnquiryPrivacy: string;
  purchaseEnquiryButton: string;
  purchaseEnquirySendButton: string;
  purchaseEnquirySentTitle: string;
  purchaseEnquirySentBody: string;
  purchaseEnquiryReceivedTitle: string;
  purchaseEnquiryReceivedBody: string;
  purchaseEnquirySentOffer: string;
  purchaseEnquiryNew: string;
  invalidOffer: string;
  missingBuyerMessage: string;
  purchaseEnquirySaveFailed: string;
};

export const marketplaceCopy: Record<Language, MarketplaceCopy> = {
  en: {
    pageTitle: "Sajda Marketplace",
    eyebrow: "Sajda Marketplace",
    title: "List your domains for sale.",
    lead: "List a domain, confirm control by DNS, and give serious buyers a direct route to make an offer.",
    localBadge: "Local draft mode",
    localNotice: "Local test storage only. Do not add registrar logins, passwords, payment details, or transfer codes.",
    createLink: "Create a listing",
    localCreateLink: "Create a local draft",
    browseLabel: "Your local listings",
    draftsLabel: "Local drafts",
    draftsCount: "{count} local drafts",
    emptyTitle: "No local listings yet.",
    emptyBody: "Create a local draft below to preview the listing and generate a sale page you can publish separately. Nothing becomes public from this screen.",
    createTitle: "Create a local domain listing",
    createLead: "Start with the facts a buyer needs: the name, the price, and why it is worth considering.",
    domainLabel: "Domain name",
    domainPlaceholder: "northstar.dev",
    priceLabel: "Asking price",
    currencyLabel: "Currency",
    categoryDomain: "Domains",
    categoryDraftStatus: "Seller workspace",
    domainPanelEyebrow: "Domain draft",
    domainReadinessEyebrow: "Publishing roadmap",
    domainReadinessTitle: "What a live domain sale requires",
    domainReadinessLead: "This local draft is intentionally not publishable yet. These controls are required before a live seller workflow can exist.",
    domainReadinessOwnership: "Ownership signal · DNS TXT record or registrar confirmation",
    domainReadinessSettlement: "Licensed settlement · payment provider approval and clear buyer protection",
    domainReadinessTransfer: "Verified transfer · seller, buyer, terms, and an auditable handover",
    descriptionLabel: "Why this name?",
    descriptionPlaceholder: "A short, memorable domain for a product or studio.",
    contactLabel: "Contact name",
    contactOptional: "optional",
    contactPlaceholder: "Your public name",
    privacyNotice: "Keep this listing practical: no passwords, registrar credentials, payment details, or transfer codes. Sale, payment and transfer are not connected.",
    createButton: "Create listing",
    invalidDomain: "Enter a supported domain such as northstar.dev, without www or a subdomain.",
    invalidPrice: "Enter a valid asking price.",
    missingDescription: "Add a short description for the listing.",
    detailEyebrow: "Sajda Marketplace",
    detailTitle: "Domain listing",
    localDraft: "Listing draft",
    askingPrice: "Asking price",
    description: "About this name",
    contact: "Contact name",
    notProvided: "Not provided",
    directLink: "Direct listing link",
    copyLink: "Copy link",
    copied: "Copied",
    backToMarketplace: "Back to Marketplace",
    searchDomain: "Check this domain in Sajda",
    noCheckout: "No checkout, escrow, transfer, or credential handling here.",
    noCheckoutBody: "This is a browser-local draft and a shareable page template. Sajda does not verify ownership, collect money, broker a sale, or store account access in this preview.",
    loadingListing: "Loading listing…",
    notFoundTitle: "This local listing is not available here.",
    notFoundBody: "Marketplace drafts exist only in the browser that created them. Create a new local listing to preview the flow.",
    createFirst: "Create a local listing",
    localOnly: "Listing details",
    localOnlyBody: "Connect a seller account and DNS control to make this listing public across devices.",
    created: "Created",
    listingName: "Listing",
    openListing: "Open listing",
    purchaseEnquiryEyebrow: "Buyer inquiry",
    purchaseEnquiryTitle: "Send a purchase inquiry",
    purchaseEnquiryLead: "Describe your offer and the terms that matter to you.",
    purchaseEnquiryLiveLead: "Set out your offer and the terms that matter. It is attached to your signed-in Sajda account; it is not checkout and no payment is taken.",
    offerAmount: "Your offer",
    offerAmountHint: "Asking price: {price}",
    buyerMessage: "Message",
    buyerMessagePlaceholder: "A short note about your offer, intended use, and timing.",
    purchaseEnquiryPrivacy: "Keep payment details, registrar logins, passwords, and transfer codes off this form.",
    purchaseEnquiryButton: "Save inquiry",
    purchaseEnquirySendButton: "Send purchase inquiry",
    purchaseEnquirySentTitle: "Purchase inquiry prepared",
    purchaseEnquirySentBody: "The summary is kept on this page only. Nothing was sent, charged, reserved or transferred.",
    purchaseEnquiryReceivedTitle: "Purchase inquiry sent",
    purchaseEnquiryReceivedBody: "The listing team has received the details. This is still not a payment, reservation, or transfer.",
    purchaseEnquirySentOffer: "Offer recorded: {price}",
    purchaseEnquiryNew: "Prepare another inquiry",
    invalidOffer: "Enter an offer above zero.",
    missingBuyerMessage: "Add a short message of at least 12 characters.",
    purchaseEnquirySaveFailed: "The inquiry could not be saved. Please try again.",
  },
  sv: {
    pageTitle: "Sajda Marketplace",
    eyebrow: "Sajda Marketplace",
    title: "Annonsera dina domäner till försäljning.",
    lead: "Lägg ut en domän, bekräfta kontrollen med DNS och ge seriösa köpare en direkt väg att lägga bud.",
    localBadge: "Lokalt utkastläge",
    localNotice: "Endast lokal testlagring. Lägg aldrig in inloggningsuppgifter till domänleverantören, lösenord, betaluppgifter eller överlåtelsekoder.",
    createLink: "Skapa en annons",
    localCreateLink: "Skapa lokalt utkast",
    browseLabel: "Dina lokala annonser",
    draftsLabel: "Lokala utkast",
    draftsCount: "{count} lokala utkast",
    emptyTitle: "Inga lokala annonser ännu.",
    emptyBody: "Skapa ett lokalt utkast nedan för att förhandsvisa annonsen och skapa en säljsida som du kan publicera separat. Inget blir offentligt från den här vyn.",
    createTitle: "Skapa en lokal domänannons",
    createLead: "Börja med det köparen behöver: namnet, priset och varför det är värt att överväga.",
    domainLabel: "Domännamn",
    domainPlaceholder: "northstar.dev",
    priceLabel: "Begärt pris",
    currencyLabel: "Valuta",
    categoryDomain: "Domäner",
    categoryDraftStatus: "Säljarvy",
    domainPanelEyebrow: "Domänutkast",
    domainReadinessEyebrow: "Publiceringsplan",
    domainReadinessTitle: "Det här krävs för en domänförsäljning",
    domainReadinessLead: "Det här lokala utkastet går ännu inte att publicera. Följande kontroller behöver finnas på plats innan försäljning kan bli tillgänglig.",
    domainReadinessOwnership: "Ägandesignal · DNS TXT-post eller bekräftelse från registrar",
    domainReadinessSettlement: "Licensierad betalning · godkänd betalningsleverantör och tydligt köparskydd",
    domainReadinessTransfer: "Verifierad överlåtelse · säljare, köpare, villkor och spårbar överlämning",
    descriptionLabel: "Varför detta namn?",
    descriptionPlaceholder: "Ett kort, minnesvärt domännamn för en produkt eller studio.",
    contactLabel: "Kontaktperson",
    contactOptional: "valfritt",
    contactPlaceholder: "Namnet som ska visas",
    privacyNotice: "Håll annonsen praktisk: inga lösenord, registrar-uppgifter, betaluppgifter eller överlåtelsekoder. Försäljning, betalning och överlåtelse är inte anslutna.",
    createButton: "Skapa annons",
    invalidDomain: "Ange en domän på huvudnivå, till exempel northstar.dev — inte www eller en subdomän.",
    invalidPrice: "Ange ett giltigt begärt pris.",
    missingDescription: "Lägg till en kort beskrivning av annonsen.",
    detailEyebrow: "Sajda Marketplace",
    detailTitle: "Domänannons",
    localDraft: "Annonsutkast",
    askingPrice: "Begärt pris",
    description: "Om namnet",
    contact: "Kontaktperson",
    notProvided: "Inte angivet",
    directLink: "Direktlänk till annons",
    copyLink: "Kopiera länk",
    copied: "Kopierad",
    backToMarketplace: "Tillbaka till Marketplace",
    searchDomain: "Kontrollera domänen i Sajda",
    noCheckout: "Ingen kassa, escrow, överlåtelse eller hantering av inloggningar här.",
    noCheckoutBody: "Detta är ett lokalt webbläsarutkast och en mall för en delbar sida. Sajda verifierar inte ägande, samlar inte in pengar, förmedlar ingen försäljning och lagrar ingen kontoåtkomst i förhandsvisningen.",
    loadingListing: "Läser in annons…",
    notFoundTitle: "Det här lokala utkastet finns inte här.",
    notFoundBody: "Marketplace-utkast finns bara i webbläsaren där de skapades. Skapa ett nytt lokalt utkast för att förhandsvisa flödet.",
    createFirst: "Skapa en lokal annons",
    localOnly: "Annonsdetaljer",
    localOnlyBody: "Koppla ett säljarkonto och DNS-kontroll för att göra annonsen publik på alla enheter.",
    created: "Skapad",
    listingName: "Annons",
    openListing: "Öppna annons",
    purchaseEnquiryEyebrow: "Köparförfrågan",
    purchaseEnquiryTitle: "Skicka en köparförfrågan",
    purchaseEnquiryLead: "Beskriv ditt bud och vilka villkor som är viktiga för dig.",
    purchaseEnquiryLiveLead: "Beskriv ditt bud och vilka villkor som är viktiga för dig. Förfrågan kopplas till ditt inloggade Sajda-konto. Det här är inte en betalning och inget belopp dras.",
    offerAmount: "Ditt bud",
    offerAmountHint: "Begärt pris: {price}",
    buyerMessage: "Meddelande",
    buyerMessagePlaceholder: "En kort rad om ditt bud, användningsområde och tidsplan.",
    purchaseEnquiryPrivacy: "Skriv inte betaluppgifter, inloggningsuppgifter till domänleverantören, lösenord eller överlåtelsekoder i formuläret.",
    purchaseEnquiryButton: "Spara förfrågan",
    purchaseEnquirySendButton: "Skicka köparförfrågan",
    purchaseEnquirySentTitle: "Köparförfrågan är förberedd",
    purchaseEnquirySentBody: "Sammanfattningen finns endast på denna sida. Inget har skickats, debiterats, reserverats eller överlåtits.",
    purchaseEnquiryReceivedTitle: "Köparförfrågan är skickad",
    purchaseEnquiryReceivedBody: "Annonsens team har tagit emot uppgifterna. Det är fortfarande inte en betalning, reservation eller överlåtelse.",
    purchaseEnquirySentOffer: "Registrerat bud: {price}",
    purchaseEnquiryNew: "Förbered en ny förfrågan",
    invalidOffer: "Ange ett bud över noll.",
    missingBuyerMessage: "Skriv ett kort meddelande med minst 12 tecken.",
    purchaseEnquirySaveFailed: "Förfrågan kunde inte sparas. Försök igen.",
  },
  es: {
    pageTitle: "Sajda Marketplace",
    eyebrow: "Sajda Marketplace",
    title: "Anuncia tus dominios en venta.",
    lead: "Publica un dominio, confirma que lo controlas mediante DNS y permite que los compradores interesados te envíen una oferta.",
    localBadge: "Modo de borrador local",
    localNotice: "Solo almacenamiento de prueba local. No añadas inicios de sesión del registrador, contraseñas, datos de pago ni códigos de transferencia.",
    createLink: "Crear un anuncio",
    localCreateLink: "Crear borrador local",
    browseLabel: "Tus anuncios locales",
    draftsLabel: "Borradores locales",
    draftsCount: "{count} borradores locales",
    emptyTitle: "Aún no hay anuncios locales.",
    emptyBody: "Crea un borrador local abajo para ver el anuncio y generar una página de venta que podrás publicar por separado. Nada se hace público desde esta pantalla.",
    createTitle: "Crear un anuncio local de dominio",
    createLead: "Empieza con lo que necesita un comprador: el nombre, el precio y por qué merece ser considerado.",
    domainLabel: "Nombre de dominio",
    domainPlaceholder: "northstar.dev",
    priceLabel: "Precio solicitado",
    currencyLabel: "Moneda",
    categoryDomain: "Dominios",
    categoryDraftStatus: "Espacio del vendedor",
    domainPanelEyebrow: "Borrador de dominio",
    domainReadinessEyebrow: "Hoja de ruta de publicación",
    domainReadinessTitle: "Qué necesita una venta de dominio",
    domainReadinessLead: "Este borrador local todavía no se puede publicar. Los siguientes controles deben estar disponibles antes de habilitar la venta.",
    domainReadinessOwnership: "Señal de propiedad · registro DNS TXT o confirmación del registrador",
    domainReadinessSettlement: "Liquidación autorizada · aprobación del proveedor de pago y protección clara del comprador",
    domainReadinessTransfer: "Transferencia verificada · vendedor, comprador, condiciones y entrega auditable",
    descriptionLabel: "¿Por qué este nombre?",
    descriptionPlaceholder: "Un dominio breve y fácil de recordar para un producto o estudio.",
    contactLabel: "Nombre de contacto",
    contactOptional: "opcional",
    contactPlaceholder: "Tu nombre público",
    privacyNotice: "Mantén el anuncio práctico: sin contraseñas, credenciales de registrador, datos de pago ni códigos de transferencia. La venta, el pago y la transferencia no están conectados.",
    createButton: "Crear anuncio",
    invalidDomain: "Introduce un dominio raíz compatible, como northstar.dev; no uses www ni un subdominio.",
    invalidPrice: "Introduce un precio solicitado válido.",
    missingDescription: "Añade una breve descripción para el anuncio.",
    detailEyebrow: "Sajda Marketplace",
    detailTitle: "Anuncio de dominio",
    localDraft: "Borrador del anuncio",
    askingPrice: "Precio solicitado",
    description: "Sobre este nombre",
    contact: "Nombre de contacto",
    notProvided: "No indicado",
    directLink: "Enlace directo del anuncio",
    copyLink: "Copiar enlace",
    copied: "Copiado",
    backToMarketplace: "Volver al Marketplace",
    searchDomain: "Comprobar este dominio en Sajda",
    noCheckout: "Aquí no hay checkout, escrow, transferencia ni gestión de credenciales.",
    noCheckoutBody: "Es un borrador local del navegador y una plantilla de página compartible. Sajda no verifica la propiedad, cobra dinero, intermedia ventas ni almacena accesos a cuentas en esta vista previa.",
    loadingListing: "Cargando anuncio…",
    notFoundTitle: "Este anuncio local no está disponible aquí.",
    notFoundBody: "Los borradores del marketplace solo existen en el navegador que los creó. Crea un anuncio local para previsualizar el flujo.",
    createFirst: "Crear un anuncio local",
    localOnly: "Detalles del anuncio",
    localOnlyBody: "Conecta una cuenta de vendedor y control DNS para publicar este anuncio en todos los dispositivos.",
    created: "Creado",
    listingName: "Anuncio",
    openListing: "Abrir anuncio",
    purchaseEnquiryEyebrow: "Consulta del comprador",
    purchaseEnquiryTitle: "Enviar una consulta de compra",
    purchaseEnquiryLead: "Describe tu oferta y las condiciones que te importan.",
    purchaseEnquiryLiveLead: "Describe tu oferta y las condiciones que te importan. La consulta se vincula a tu cuenta de Sajda. No es un proceso de pago y no se realiza ningún cobro.",
    offerAmount: "Tu oferta",
    offerAmountHint: "Precio solicitado: {price}",
    buyerMessage: "Mensaje",
    buyerMessagePlaceholder: "Una nota breve sobre tu oferta, uso previsto y plazos.",
    purchaseEnquiryPrivacy: "No incluyas datos de pago, inicios de sesión del registrador, contraseñas ni códigos de transferencia.",
    purchaseEnquiryButton: "Guardar consulta",
    purchaseEnquirySendButton: "Enviar consulta de compra",
    purchaseEnquirySentTitle: "Consulta de compra preparada",
    purchaseEnquirySentBody: "El resumen solo se conserva en esta página. No se ha enviado, cobrado, reservado ni transferido nada.",
    purchaseEnquiryReceivedTitle: "Consulta de compra enviada",
    purchaseEnquiryReceivedBody: "El equipo del anuncio ha recibido los datos. Sigue sin ser un pago, una reserva ni una transferencia.",
    purchaseEnquirySentOffer: "Oferta registrada: {price}",
    purchaseEnquiryNew: "Preparar otra consulta",
    invalidOffer: "Introduce una oferta superior a cero.",
    missingBuyerMessage: "Añade un mensaje breve de al menos 12 caracteres.",
    purchaseEnquirySaveFailed: "No se pudo guardar la consulta. Inténtalo de nuevo.",
  },
  fr: {
    pageTitle: "Sajda Marketplace",
    eyebrow: "Sajda Marketplace",
    title: "Proposez vos domaines à la vente.",
    lead: "Publiez un domaine, confirmez que vous le contrôlez par DNS et permettez aux acheteurs intéressés de vous faire une offre.",
    localBadge: "Mode brouillon local",
    localNotice: "Stockage de test local uniquement. N’ajoutez jamais d’identifiants de fournisseur de domaines, de mots de passe, de données de paiement ni de codes de transfert.",
    createLink: "Créer une annonce",
    localCreateLink: "Créer un brouillon local",
    browseLabel: "Vos annonces locales",
    draftsLabel: "Brouillons locaux",
    draftsCount: "{count} brouillons locaux",
    emptyTitle: "Aucune annonce locale pour l’instant.",
    emptyBody: "Créez un brouillon local ci-dessous pour prévisualiser l’annonce et générer une page de vente à publier séparément. Rien ne devient public depuis cet écran.",
    createTitle: "Créer une annonce locale de domaine",
    createLead: "Commencez par ce dont un acheteur a besoin : le nom, le prix et ce qui le rend intéressant.",
    domainLabel: "Nom de domaine",
    domainPlaceholder: "northstar.dev",
    priceLabel: "Prix demandé",
    currencyLabel: "Devise",
    categoryDomain: "Domaines",
    categoryDraftStatus: "Espace vendeur",
    domainPanelEyebrow: "Brouillon de domaine",
    domainReadinessEyebrow: "Feuille de route de publication",
    domainReadinessTitle: "Les conditions nécessaires à une vente de domaine",
    domainReadinessLead: "Ce brouillon local ne peut pas encore être publié. Les contrôles suivants doivent être en place avant que la vente soit disponible.",
    domainReadinessOwnership: "Signal de propriété · enregistrement DNS TXT ou confirmation registrar",
    domainReadinessSettlement: "Règlement agréé · approbation du prestataire de paiement et protection acheteur claire",
    domainReadinessTransfer: "Transfert vérifié · vendeur, acheteur, conditions et remise traçable",
    descriptionLabel: "Pourquoi ce nom ?",
    descriptionPlaceholder: "Un domaine concis et mémorable pour un produit ou un studio ambitieux.",
    contactLabel: "Nom du contact",
    contactOptional: "facultatif",
    contactPlaceholder: "Votre nom public",
    privacyNotice: "Gardez l’annonce pratique : pas de mots de passe, identifiants registrar, données de paiement ni codes de transfert. Vente, paiement et transfert ne sont pas connectés.",
    createButton: "Créer l’annonce",
    invalidDomain: "Saisissez un domaine racine pris en charge, comme northstar.dev — pas www ni un sous-domaine.",
    invalidPrice: "Saisissez un prix demandé valide.",
    missingDescription: "Ajoutez une courte description à l’annonce.",
    detailEyebrow: "Sajda Marketplace",
    detailTitle: "Annonce de domaine",
    localDraft: "Brouillon d’annonce",
    askingPrice: "Prix demandé",
    description: "À propos de ce nom",
    contact: "Nom du contact",
    notProvided: "Non indiqué",
    directLink: "Lien direct de l’annonce",
    copyLink: "Copier le lien",
    copied: "Copié",
    backToMarketplace: "Retour au Marketplace",
    searchDomain: "Vérifier ce domaine dans Sajda",
    noCheckout: "Pas de paiement, séquestre, transfert ni gestion d’identifiants ici.",
    noCheckoutBody: "Il s’agit d’un brouillon local du navigateur et d’un modèle de page partageable. Sajda ne vérifie pas la propriété, n’encaisse pas d’argent, n’intermédie pas la vente et ne stocke pas l’accès à un compte dans cet aperçu.",
    loadingListing: "Chargement de l’annonce…",
    notFoundTitle: "Cette annonce locale n’est pas disponible ici.",
    notFoundBody: "Les brouillons Marketplace n’existent que dans le navigateur où ils ont été créés. Créez une annonce locale pour tester le parcours.",
    createFirst: "Créer une annonce locale",
    localOnly: "Détails de l’annonce",
    localOnlyBody: "Connectez un compte vendeur et une preuve DNS pour publier cette annonce sur tous les appareils.",
    created: "Créé",
    listingName: "Annonce",
    openListing: "Ouvrir l’annonce",
    purchaseEnquiryEyebrow: "Demande de l’acheteur",
    purchaseEnquiryTitle: "Envoyer une demande d’achat",
    purchaseEnquiryLead: "Présentez votre offre et les conditions importantes.",
    purchaseEnquiryLiveLead: "Présentez votre offre et les conditions importantes. Elle est associée à votre compte Sajda connecté ; ce n’est pas un paiement et aucun montant n’est prélevé.",
    offerAmount: "Votre offre",
    offerAmountHint: "Prix demandé : {price}",
    buyerMessage: "Message",
    buyerMessagePlaceholder: "Une note brève sur votre offre, votre usage prévu et votre calendrier.",
    purchaseEnquiryPrivacy: "N’ajoutez pas de données de paiement, d’identifiants de fournisseur de domaines, de mots de passe ni de codes de transfert.",
    purchaseEnquiryButton: "Enregistrer la demande",
    purchaseEnquirySendButton: "Envoyer la demande d’achat",
    purchaseEnquirySentTitle: "Demande d’achat préparée",
    purchaseEnquirySentBody: "Le résumé est conservé sur cette page uniquement. Rien n’a été envoyé, facturé, réservé ni transféré.",
    purchaseEnquiryReceivedTitle: "Demande d’achat envoyée",
    purchaseEnquiryReceivedBody: "L’équipe de l’annonce a reçu les informations. Ce n’est toujours ni un paiement, ni une réservation, ni un transfert.",
    purchaseEnquirySentOffer: "Offre enregistrée : {price}",
    purchaseEnquiryNew: "Préparer une autre demande",
    invalidOffer: "Saisissez une offre supérieure à zéro.",
    missingBuyerMessage: "Ajoutez un court message d’au moins 12 caractères.",
    purchaseEnquirySaveFailed: "La demande n’a pas pu être enregistrée. Réessayez.",
  },
  zh: {
    pageTitle: "Sajda 市场",
    eyebrow: "Sajda Marketplace",
    title: "发布你的待售域名。",
    lead: "发布域名，通过 DNS 确认你拥有控制权，让有意向的买家直接出价。",
    localBadge: "本地草稿模式",
    localNotice: "仅本地测试存储。请勿填写注册商登录信息、密码、付款资料或转移代码。",
    createLink: "创建挂牌",
    localCreateLink: "创建本地草稿",
    browseLabel: "你的本地挂牌",
    draftsLabel: "本地草稿",
    draftsCount: "{count} 个本地草稿",
    emptyTitle: "尚无本地挂牌。",
    emptyBody: "在下方创建本地草稿，即可预览挂牌并生成可另行发布的出售页面。这里不会自动公开任何内容。",
    createTitle: "创建本地域名挂牌",
    createLead: "从买家需要的信息开始：名称、价格，以及值得考虑的原因。",
    domainLabel: "域名",
    domainPlaceholder: "northstar.dev",
    priceLabel: "要价",
    currencyLabel: "货币",
    categoryDomain: "域名",
    categoryDraftStatus: "卖家工作区",
    domainPanelEyebrow: "域名草稿",
    domainReadinessEyebrow: "发布路线图",
    domainReadinessTitle: "域名交易需要哪些保障",
    domainReadinessLead: "这个本地草稿目前还不能发布。开放正式出售流程前，需要先具备以下措施。",
    domainReadinessOwnership: "所有权信号 · DNS TXT 记录或注册商确认",
    domainReadinessSettlement: "受许可的结算 · 付款提供商批准和明确的买方保护",
    domainReadinessTransfer: "已验证的转移 · 卖家、买家、条款和可审计的交接",
    descriptionLabel: "为何选择此名称？",
    descriptionPlaceholder: "适合产品或工作室的简短、易记域名。",
    contactLabel: "联系人姓名",
    contactOptional: "可选",
    contactPlaceholder: "你的公开名称",
    privacyNotice: "请保持挂牌信息简单：不要填写密码、注册商凭据、付款资料或转移代码。出售、付款和转移尚未接入。",
    createButton: "创建挂牌",
    invalidDomain: "请输入受支持的根域名，例如 northstar.dev；不要使用 www 或子域名。",
    invalidPrice: "请输入有效的要价。",
    missingDescription: "请为挂牌添加简短说明。",
    detailEyebrow: "Sajda 市场",
    detailTitle: "域名挂牌",
    localDraft: "挂牌草稿",
    askingPrice: "要价",
    description: "关于此名称",
    contact: "联系人姓名",
    notProvided: "未提供",
    directLink: "挂牌直接链接",
    copyLink: "复制链接",
    copied: "已复制",
    backToMarketplace: "返回市场",
    searchDomain: "在 Sajda 中检查此域名",
    noCheckout: "这里没有结账、托管、转移或凭据处理。",
    noCheckoutBody: "这是一个浏览器本地草稿和可分享页面模板。Sajda 不会在此预览中验证所有权、收取资金、撮合交易或存储账户访问权限。",
    loadingListing: "正在加载挂牌…",
    notFoundTitle: "此本地挂牌在这里不可用。",
    notFoundBody: "市场草稿只存在于创建它的浏览器中。请创建一个本地挂牌来预览流程。",
    createFirst: "创建本地挂牌",
    localOnly: "挂牌详情",
    localOnlyBody: "连接卖家账户并验证 DNS 控制权后，即可发布这条挂牌，让买家在其他设备上查看。",
    created: "已创建",
    listingName: "挂牌",
    openListing: "打开挂牌",
    purchaseEnquiryEyebrow: "买家咨询",
    purchaseEnquiryTitle: "发送购买咨询",
    purchaseEnquiryLead: "写下你的报价和重要条件。",
    purchaseEnquiryLiveLead: "写下你的报价和重要条件。它会关联到已登录的 Sajda 账户；这不是结账，也不会扣款。",
    offerAmount: "你的报价",
    offerAmountHint: "要价：{price}",
    buyerMessage: "留言",
    buyerMessagePlaceholder: "简要说明你的报价、预期用途和时间安排。",
    purchaseEnquiryPrivacy: "请不要填写付款资料、注册商登录信息、密码或转移代码。",
    purchaseEnquiryButton: "保存咨询",
    purchaseEnquirySendButton: "发送购买咨询",
    purchaseEnquirySentTitle: "购买咨询已准备",
    purchaseEnquirySentBody: "摘要仅保留在此页面中。没有发送、扣款、预留或转移任何内容。",
    purchaseEnquiryReceivedTitle: "购买咨询已发送",
    purchaseEnquiryReceivedBody: "负责该挂牌的团队已收到信息。这不代表付款、预留或转移已完成。",
    purchaseEnquirySentOffer: "已记录报价：{price}",
    purchaseEnquiryNew: "准备另一份咨询",
    invalidOffer: "请输入大于零的报价。",
    missingBuyerMessage: "请添加至少 12 个字符的简短留言。",
    purchaseEnquirySaveFailed: "无法保存咨询。请重试。",
  },
};

export function interpolateMarketplace(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

export function formatMarketplacePrice(value: number, currency: string, language: Language): string {
  const locales: Record<Language, string> = {
    en: "en-US",
    sv: "sv-SE",
    es: "es-ES",
    fr: "fr-FR",
    zh: "zh-CN",
  };

  return new Intl.NumberFormat(locales[language], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
