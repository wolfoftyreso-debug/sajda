import type { Language } from "@/i18n/LanguageProvider";

export interface SajdaInspirationDirection {
  /** A stable ID so the same direction can be remembered across languages. */
  id: string;
  /** The strategic naming route shown to the person searching. */
  title: string;
  /** A concise explanation of the route's distinctiveness. */
  rationale: string;
  /** A ready-to-use semantic brief for Sajda's existing search input. */
  searchPrompt: string;
  /** Three starting signals, not claims that these names are available. */
  starterTerms: readonly string[];
  /** A practical constraint that makes the direction more useful than filler. */
  guardrail: string;
}

/**
 * The inputs we can truthfully use to tailor a curated naming route. These are
 * deliberately small, local transformations: Sajda never claims that a
 * pre-written direction was fetched or generated remotely.
 */
export interface SajdaInspirationSearchContext {
  keyword?: string;
  brief?: string;
  selectedTlds?: readonly string[];
  isAdvanced?: boolean;
}

export interface ContextualSajdaInspiration {
  /** The route passed back to the regular search when someone accepts it. */
  direction: SajdaInspirationDirection;
  /** Terms actually extracted from the visible search input. */
  inputTerms: readonly string[];
  /** Whether the current route has a person-provided search signal behind it. */
  hasContext: boolean;
  /** The most relevant current source, used only for accurate interface copy. */
  source: "brief" | "search" | "none";
  /** Extensions selected for the availability check, not a naming claim. */
  selectedTlds: readonly string[];
}

type LocalizedDirection = Record<Language, Omit<SajdaInspirationDirection, "id">>;

const directions: ReadonlyArray<{ id: string; content: LocalizedDirection }> = [
  {
    id: "quiet-confidence",
    content: {
      en: {
        title: "Quiet confidence",
        rationale: "For a service, finance, or operations product that must sound steady before a buyer has read the second sentence.",
        searchPrompt: "trusted service, calm clarity, dependable, direct, understated, practical",
        starterTerms: ["steady", "anchor", "clarity"],
        guardrail: "Avoid ornate or old-fashioned cues that make the name feel less accessible.",
      },
      sv: {
        title: "Stilla tillit",
        rationale: "För en tjänst, finans- eller driftprodukt som måste kännas stabil innan köparen har läst andra meningen.",
        searchPrompt: "pålitlig tjänst, lugn tydlighet, stabil, direkt, nedtonad, praktisk",
        starterTerms: ["stadig", "ankare", "klarhet"],
        guardrail: "Undvik ålderdomliga eller pompösa signaler som gör namnet mindre tillgängligt.",
      },
      es: {
        title: "Confianza serena",
        rationale: "Para un servicio, producto financiero u operativo que debe sonar estable antes de que la persona compradora lea la segunda frase.",
        searchPrompt: "servicio fiable, claridad serena, estable, directo, sobrio, práctico",
        starterTerms: ["firme", "ancla", "claro"],
        guardrail: "Evita señales antiguas o recargadas que hagan el nombre menos accesible.",
      },
      fr: {
        title: "Une confiance sereine",
        rationale: "Pour un service, un produit financier ou opérationnel qui doit sembler fiable avant même la deuxième phrase.",
        searchPrompt: "service fiable, clarté calme, stable, direct, sobre, pratique",
        starterTerms: ["stable", "ancre", "clair"],
        guardrail: "Évitez les signaux trop anciens ou emphatiques qui rendent le nom moins accessible.",
      },
      zh: {
        title: "沉稳可信",
        rationale: "适合服务、金融或运营产品：在买家读到第二句话前，就先让人感到稳妥。",
        searchPrompt: "可靠服务，冷静清晰，稳定，直接，克制，实用",
        starterTerms: ["稳", "锚", "明"],
        guardrail: "避免过于陈旧或铺张的暗示，以免名称显得难以亲近。",
      },
    },
  },
  {
    id: "precise-craft",
    content: {
      en: {
        title: "Technical clarity",
        rationale: "For software, data, or engineering products that sell accuracy but still need a name a customer can repeat on a call.",
        searchPrompt: "technical product, precise, engineered, clear, capable, human, concise",
        starterTerms: ["forge", "metric", "vector"],
        guardrail: "Avoid stacked technical markers, punctuation, or letter-number styling.",
      },
      sv: {
        title: "Teknisk tydlighet",
        rationale: "För mjukvara, data- eller ingenjörsprodukter som säljer precision men fortfarande behöver ett namn kunden kan upprepa i ett samtal.",
        searchPrompt: "teknisk produkt, precision, konstruerad, tydlig, kapabel, mänsklig, kort",
        starterTerms: ["smide", "mått", "vektor"],
        guardrail: "Undvik staplade tekniska markörer, skiljetecken och bokstavs- eller sifferstil.",
      },
      es: {
        title: "Claridad técnica",
        rationale: "Para productos de software, datos o ingeniería que venden precisión y aún necesitan un nombre que un cliente repita en una llamada.",
        searchPrompt: "producto técnico, preciso, diseñado, claro, capaz, humano, conciso",
        starterTerms: ["forja", "métrica", "vector"],
        guardrail: "Evita marcadores técnicos acumulados, signos y estilos de letras o números.",
      },
      fr: {
        title: "Clarté technique",
        rationale: "Pour les logiciels, données ou produits d’ingénierie qui vendent la précision, mais dont le nom doit rester facile à répéter en réunion.",
        searchPrompt: "produit technique, précis, conçu, clair, capable, humain, concis",
        starterTerms: ["forge", "métrique", "vecteur"],
        guardrail: "Évitez l’accumulation de codes techniques, de ponctuation ou de lettres et chiffres.",
      },
      zh: {
        title: "专业且清晰",
        rationale: "适合软件、数据或工程产品：既体现精准，也让客户能在通话中自然复述名字。",
        searchPrompt: "技术产品，精准，工程感，清晰，可靠，人性化，简洁",
        starterTerms: ["铸", "量", "向量"],
        guardrail: "避免堆叠技术标记、标点符号或字母数字式写法。",
      },
    },
  },
  {
    id: "human-systems",
    content: {
      en: {
        title: "The team is the product",
        rationale: "For workflow and B2B tools where the buyer needs teams to coordinate with less friction and greater clarity.",
        searchPrompt: "team workflow, collaboration, handoff, shared clarity, practical, friendly B2B",
        starterTerms: ["tandem", "relay", "common"],
        guardrail: "Avoid acronyms and abstract process language.",
      },
      sv: {
        title: "Teamet är produkten",
        rationale: "För arbetsflödes- och B2B-verktyg där köparen behöver att team samarbetar smidigare och tydligare.",
        searchPrompt: "teamarbete, arbetsflöde, överlämning, gemensam tydlighet, praktisk, vänlig B2B",
        starterTerms: ["tandem", "relä", "gemensam"],
        guardrail: "Undvik förkortningar och abstrakt processpråk.",
      },
      es: {
        title: "El equipo es el producto",
        rationale: "Para herramientas de flujo de trabajo y B2B donde se necesita que los equipos se coordinen con menos fricción y mayor claridad.",
        searchPrompt: "equipo, flujo de trabajo, relevo, claridad compartida, práctico, B2B cercano",
        starterTerms: ["tándem", "relevo", "común"],
        guardrail: "Evita siglas y lenguaje de procesos abstracto.",
      },
      fr: {
        title: "L’équipe fait le produit",
        rationale: "Pour les outils de flux de travail et B2B où les équipes doivent mieux se coordonner, avec moins de friction et plus de clarté.",
        searchPrompt: "équipe, flux de travail, relais, clarté partagée, pratique, B2B chaleureux",
        starterTerms: ["tandem", "relais", "commun"],
        guardrail: "Évitez les sigles et le langage de processus abstrait.",
      },
      zh: {
        title: "团队才是产品",
        rationale: "适合工作流和 B2B 工具：帮助团队以更低摩擦、更清晰的方式协作。",
        searchPrompt: "团队协作，工作流，交接，共享清晰，实用，友好的B2B",
        starterTerms: ["同路", "接力", "共识"],
        guardrail: "避免缩写和抽象的流程术语。",
      },
    },
  },
  {
    id: "movement-and-energy",
    content: {
      en: {
        title: "Built for momentum",
        rationale: "For delivery, fitness, productivity, or travel products that help people move from planning to action with clarity.",
        searchPrompt: "momentum, progress, movement, efficient, upbeat, clear, modern",
        starterTerms: ["stride", "lift", "pulse"],
        guardrail: "Avoid multiple motion cues; one is enough.",
      },
      sv: {
        title: "Byggt för momentum",
        rationale: "För leverans-, tränings-, produktivitets- eller reseprodukter som hjälper människor från planering till handling med tydlighet.",
        searchPrompt: "momentum, framsteg, rörelse, effektiv, positiv, tydlig, modern",
        starterTerms: ["steg", "lyft", "puls"],
        guardrail: "Undvik flera rörelsesignaler; en räcker.",
      },
      es: {
        title: "Hecho para avanzar",
        rationale: "Para productos de reparto, bienestar, productividad o viajes que ayudan a pasar de la planificación a la acción con claridad.",
        searchPrompt: "impulso, progreso, movimiento, eficiente, optimista, claro, moderno",
        starterTerms: ["paso", "alza", "pulso"],
        guardrail: "Evita varias señales de movimiento; una es suficiente.",
      },
      fr: {
        title: "Conçu pour l’élan",
        rationale: "Pour les produits de livraison, de forme, de productivité ou de voyage qui font passer de l’intention à l’action avec clarté.",
        searchPrompt: "élan, progrès, mouvement, efficace, positif, clair, moderne",
        starterTerms: ["pas", "essor", "pouls"],
        guardrail: "Évitez de multiplier les signaux de mouvement ; un seul suffit.",
      },
      zh: {
        title: "为行动而生",
        rationale: "适合配送、健身、效率或旅行产品：帮助人们从规划走向清晰的行动。",
        searchPrompt: "势能，进展，移动，高效，积极，清晰，现代",
        starterTerms: ["步", "跃", "脉"],
        guardrail: "避免使用多个运动暗示；一个就够。",
      },
    },
  },
  {
    id: "place-and-memory",
    content: {
      en: {
        title: "An origin worth naming",
        rationale: "For hospitality, property, food, travel, or craft brands grounded in a real place or practice.",
        searchPrompt: "real origin, local craft, landmark, neighbourhood, terrain, familiar, distinctive",
        starterTerms: ["harbor", "quarry", "northline"],
        guardrail: "Avoid combining place references that do not have a real connection.",
      },
      sv: {
        title: "Ett ursprung värt att namnge",
        rationale: "För hotell-, fastighets-, mat-, rese- eller hantverksvarumärken med förankring i en verklig plats eller praktik.",
        searchPrompt: "verkligt ursprung, lokalt hantverk, landmärke, kvarter, terräng, välbekant, särpräglad",
        starterTerms: ["hamn", "brott", "norrled"],
        guardrail: "Undvik att kombinera platsreferenser som saknar verklig koppling.",
      },
      es: {
        title: "Un origen que merece nombre",
        rationale: "Para marcas de hostelería, propiedad, comida, viajes u oficio ancladas en un lugar o una práctica reales.",
        searchPrompt: "origen real, oficio local, hito, barrio, terreno, familiar, distintivo",
        starterTerms: ["puerto", "cantera", "nortelínea"],
        guardrail: "Evita combinar referencias de lugares sin una conexión real.",
      },
      fr: {
        title: "Une origine qui mérite un nom",
        rationale: "Pour les marques d’hospitalité, d’immobilier, de cuisine, de voyage ou d’artisanat ancrées dans un lieu ou une pratique réelle.",
        searchPrompt: "origine réelle, savoir-faire local, repère, quartier, terrain, familier, distinctif",
        starterTerms: ["port", "carrière", "ligne nord"],
        guardrail: "Évitez de combiner des références de lieux sans lien réel.",
      },
      zh: {
        title: "值得命名的来处",
        rationale: "适合酒店、地产、餐饮、旅行或工艺品牌：以真实地点或真实做法为基础。",
        searchPrompt: "真实来处，本地工艺，地标，街区，地貌，熟悉，有辨识度",
        starterTerms: ["港", "石场", "北线"],
        guardrail: "避免组合没有真实关联的地点线索。",
      },
    },
  },
  {
    id: "invented-but-readable",
    content: {
      en: {
        title: "Coin it, then make it sayable",
        rationale: "For a category-creating brand that needs a distinctive word people can hear, repeat, and search without extra explanation.",
        searchPrompt: "coined brand name, pronounceable, short, vowel balance, distinct, clear",
        starterTerms: ["velora", "nuvio", "merano"],
        guardrail: "Avoid unfamiliar spellings or sounds that need explanation.",
      },
      sv: {
        title: "Hitta på det, men gör det sägbart",
        rationale: "För ett kategoriskapande varumärke som behöver ett eget ord människor kan höra, upprepa och söka utan extra förklaring.",
        searchPrompt: "uppfunnet varumärkesnamn, uttalbart, kort, vokalbalans, särpräglat, tydligt",
        starterTerms: ["velora", "nuvio", "merano"],
        guardrail: "Undvik ovanliga stavningar eller ljud som behöver förklaras.",
      },
      es: {
        title: "Invéntalo, pero que se pueda decir",
        rationale: "Para una marca que crea categoría y necesita una palabra distintiva que se pueda escuchar, repetir y buscar sin explicaciones adicionales.",
        searchPrompt: "nombre de marca inventado, pronunciable, corto, equilibrio de vocales, distinto, claro",
        starterTerms: ["velora", "nuvio", "merano"],
        guardrail: "Evita grafías o sonidos poco familiares que requieran explicación.",
      },
      fr: {
        title: "Inventez-le, puis rendez-le dicible",
        rationale: "Pour une marque qui crée une catégorie et a besoin d’un mot distinctif que l’on peut entendre, répéter et rechercher sans explication supplémentaire.",
        searchPrompt: "nom de marque inventé, prononçable, court, équilibre des voyelles, distinct, clair",
        starterTerms: ["velora", "nuvio", "merano"],
        guardrail: "Évitez les orthographes ou sons peu familiers qui demandent une explication.",
      },
      zh: {
        title: "原创，也要好念",
        rationale: "适合要开创品类的品牌：名字应足够独特，让人能听懂、复述并搜索，无需额外解释。",
        searchPrompt: "原创品牌名，易发音，短，元音平衡，有辨识度，清晰",
        starterTerms: ["velora", "nuvio", "merano"],
        guardrail: "避免需要额外解释的陌生拼写或发音。",
      },
    },
  },
  {
    id: "clear-category",
    content: {
      en: {
        title: "Say what it does. Then own it.",
        rationale: "For a practical launch where a buyer should understand the product’s purpose immediately, even if the details take a click.",
        searchPrompt: "clear category, practical, direct, useful, credible, ownable modifier",
        starterTerms: ["ledger", "clinic", "route"],
        guardrail: "Avoid category names on their own; add one distinguishing cue.",
      },
      sv: {
        title: "Säg vad det gör. Gör det sedan eget.",
        rationale: "För en praktisk lansering där köparen ska förstå produktens syfte direkt, även om detaljerna kräver ett klick.",
        searchPrompt: "tydlig kategori, praktisk, direkt, användbar, trovärdig, egen modifierare",
        starterTerms: ["bok", "klinik", "rutt"],
        guardrail: "Undvik enbart kategorinamn; lägg till en särskiljande signal.",
      },
      es: {
        title: "Di lo que hace. Hazlo tuyo.",
        rationale: "Para un lanzamiento práctico donde la persona compradora debe entender el propósito del producto al instante, aunque los detalles requieran un clic.",
        searchPrompt: "categoría clara, práctico, directo, útil, creíble, modificador distintivo",
        starterTerms: ["libro", "clínica", "ruta"],
        guardrail: "Evita los nombres de categoría por sí solos; añade un rasgo distintivo.",
      },
      fr: {
        title: "Dites ce que cela fait. Puis appropriez-vous-le.",
        rationale: "Pour un lancement pragmatique où l’acheteur doit comprendre immédiatement l’objectif du produit, même si les détails demandent un clic.",
        searchPrompt: "catégorie claire, pratique, direct, utile, crédible, modificateur distinctif",
        starterTerms: ["registre", "clinique", "route"],
        guardrail: "Évitez les noms de catégorie seuls ; ajoutez un signe distinctif.",
      },
      zh: {
        title: "说清用途，再做成你的",
        rationale: "适合务实上线：买家应立刻理解产品的用途，即使详细说明还需要点进去看。",
        searchPrompt: "清晰品类，务实，直接，有用，可信，有辨识度的修饰词",
        starterTerms: ["账本", "诊所", "路径"],
        guardrail: "避免单独使用品类名称；加入一个可区分的线索。",
      },
    },
  },
  {
    id: "modern-heritage",
    content: {
      en: {
        title: "Established on purpose",
        rationale: "For premium services and considered brands that need enough weight to support a careful purchase without relying on borrowed history.",
        searchPrompt: "modern heritage, premium service, crafted, enduring, tactile, refined",
        starterTerms: ["foundry", "folio", "morrow"],
        guardrail: "Avoid mixing several heritage cues in the same name.",
      },
      sv: {
        title: "Etablerat med avsikt",
        rationale: "För premiumtjänster och genomtänkta varumärken som behöver tillräcklig tyngd för ett genomtänkt köp utan att låna historisk tyngd.",
        searchPrompt: "modernt arv, premiumtjänst, hantverk, beständigt, taktilt, förfinat",
        starterTerms: ["gjuteri", "folio", "morgon"],
        guardrail: "Undvik att blanda flera arvssignaler i samma namn.",
      },
      es: {
        title: "Establecida a propósito",
        rationale: "Para servicios premium y marcas cuidadas que necesitan suficiente peso para respaldar una compra meditada, sin recurrir a una historia prestada.",
        searchPrompt: "herencia moderna, servicio premium, artesanal, duradero, táctil, refinado",
        starterTerms: ["fundición", "folio", "alba"],
        guardrail: "Evita mezclar varias señales de herencia en el mismo nombre.",
      },
      fr: {
        title: "Établi, volontairement",
        rationale: "Pour les services haut de gamme et les marques soignées qui ont besoin de poids pour soutenir un achat réfléchi sans emprunter une histoire.",
        searchPrompt: "héritage moderne, service premium, artisanal, durable, tactile, raffiné",
        starterTerms: ["fonderie", "folio", "matin"],
        guardrail: "Évitez de mélanger plusieurs références patrimoniales dans un même nom.",
      },
      zh: {
        title: "有意显得成熟",
        rationale: "适合高端服务与讲究的品牌：要有足够分量支持慎重购买，而不依赖借来的历史感。",
        searchPrompt: "现代传承，高端服务，工艺，耐久，触感，精致",
        starterTerms: ["铸坊", "卷册", "晨"],
        guardrail: "避免在同一名称中混用多个传承线索。",
      },
    },
  },
  {
    id: "care-and-trust",
    content: {
      en: {
        title: "Care with confidence",
        rationale: "For health, finance, family, and essential services where reassurance matters and the name must support clear professional trust.",
        searchPrompt: "care service, reassuring, calm, secure, considerate, clear, professional",
        starterTerms: ["well", "shelter", "kindred"],
        guardrail: "Avoid overly informal language when the product needs professional confidence.",
      },
      sv: {
        title: "Omsorg med förtroende",
        rationale: "För hälsa, finans, familj och viktiga tjänster där trygghet spelar roll och namnet måste stödja ett tydligt professionellt förtroende.",
        searchPrompt: "omsorgstjänst, lugnande, trygg, omtänksam, tydlig, professionell",
        starterTerms: ["väl", "skydd", "nära"],
        guardrail: "Undvik alltför informellt språk när produkten behöver professionellt förtroende.",
      },
      es: {
        title: "Cuidado con confianza",
        rationale: "Para salud, finanzas, familia y servicios esenciales donde tranquilizar importa y el nombre debe respaldar una confianza profesional clara.",
        searchPrompt: "servicio de cuidado, tranquilizador, sereno, seguro, considerado, claro, profesional",
        starterTerms: ["bien", "refugio", "afín"],
        guardrail: "Evita un lenguaje demasiado informal cuando el producto requiere confianza profesional.",
      },
      fr: {
        title: "Du soin avec confiance",
        rationale: "Pour la santé, la finance, la famille et les services essentiels où rassurer compte et où le nom doit soutenir une confiance professionnelle claire.",
        searchPrompt: "service de soin, rassurant, calme, sûr, attentif, clair, professionnel",
        starterTerms: ["bien", "abri", "proche"],
        guardrail: "Évitez un langage trop informel lorsqu’un produit doit inspirer une confiance professionnelle.",
      },
      zh: {
        title: "关怀与信任",
        rationale: "适合健康、金融、家庭和关键服务：安心很重要，名称也应支持清晰的专业信任。",
        searchPrompt: "关怀服务，令人安心，平静，安全，体贴，清晰，专业",
        starterTerms: ["安好", "庇护", "亲近"],
        guardrail: "当产品需要专业可信度时，避免过于随意的表达。",
      },
    },
  },
  {
    id: "global-clarity",
    content: {
      en: {
        title: "Built to travel",
        rationale: "For a product that needs to work across languages and time zones without needing a pronunciation guide.",
        searchPrompt: "international brand, short, pronounceable, neutral, simple, memorable",
        starterTerms: ["nivo", "ora", "mira"],
        guardrail: "Avoid names that are hard to pronounce across your intended markets.",
      },
      sv: {
        title: "Byggt för att resa",
        rationale: "För en produkt som ska fungera över språk och tidszoner utan uttalsguide.",
        searchPrompt: "internationellt varumärke, kort, uttalbart, neutralt, enkelt, minnesvärt",
        starterTerms: ["nivo", "ora", "mira"],
        guardrail: "Undvik namn som är svåra att uttala på dina avsedda marknader.",
      },
      es: {
        title: "Hecho para viajar",
        rationale: "Para un producto que debe funcionar entre idiomas y zonas horarias sin necesitar guía de pronunciación.",
        searchPrompt: "marca internacional, corto, pronunciable, neutro, simple, memorable",
        starterTerms: ["nivo", "ora", "mira"],
        guardrail: "Evita nombres difíciles de pronunciar en tus mercados objetivo.",
      },
      fr: {
        title: "Fait pour voyager",
        rationale: "Pour un produit qui doit fonctionner entre les langues et les fuseaux horaires sans guide de prononciation.",
        searchPrompt: "marque internationale, court, prononçable, neutre, simple, mémorable",
        starterTerms: ["nivo", "ora", "mira"],
        guardrail: "Évitez les noms difficiles à prononcer sur vos marchés cibles.",
      },
      zh: {
        title: "为跨境而生",
        rationale: "适合需要跨越语言和时区的产品，名称不应需要额外附上发音指南。",
        searchPrompt: "国际品牌，短，易发音，中性，简单，易记",
        starterTerms: ["nivo", "ora", "mira"],
        guardrail: "避免在目标市场中难以发音的名称。",
      },
    },
  },
  {
    id: "playful-intelligence",
    content: {
      en: {
        title: "Smart, with restraint",
        rationale: "For a clever product that needs enough charm to invite a click, but enough discipline to keep a buyer confident after the demo.",
        searchPrompt: "clever product, bright, friendly, inventive, polished, premium, memorable",
        starterTerms: ["wink", "moss", "relay"],
        guardrail: "Avoid multiple playful cues; keep the personality controlled.",
      },
      sv: {
        title: "Smart med återhållsamhet",
        rationale: "För en klurig produkt som behöver tillräcklig charm för ett klick, men tillräcklig disciplin för att köparen ska känna sig trygg efter demon.",
        searchPrompt: "klurig produkt, ljus, vänlig, uppfinningsrik, polerad, premium, minnesvärd",
        starterTerms: ["blink", "mossa", "relä"],
        guardrail: "Undvik flera lekfulla signaler; håll personligheten kontrollerad.",
      },
      es: {
        title: "Inteligente, con mesura",
        rationale: "Para un producto ingenioso que necesita suficiente encanto para invitar a un clic y suficiente disciplina para dar confianza después de la demo.",
        searchPrompt: "producto ingenioso, luminoso, amable, inventivo, pulido, premium, memorable",
        starterTerms: ["guiño", "musgo", "relevo"],
        guardrail: "Evita varias señales lúdicas; mantén la personalidad controlada.",
      },
      fr: {
        title: "Malin, avec mesure",
        rationale: "Pour un produit astucieux qui a besoin d’assez de charme pour inviter au clic, et d’assez de discipline pour rassurer après la démo.",
        searchPrompt: "produit malin, lumineux, chaleureux, inventif, soigné, premium, mémorable",
        starterTerms: ["clin", "mousse", "relais"],
        guardrail: "Évitez de multiplier les signaux ludiques ; gardez une personnalité maîtrisée.",
      },
      zh: {
        title: "聪明，也要克制",
        rationale: "适合机灵的产品：既要有足够魅力让人愿意点开，也要在演示之后让买家保持信心。",
        searchPrompt: "聪明产品，明亮，友好，有创意，精致，高端，易记",
        starterTerms: ["微笑", "苔", "接力"],
        guardrail: "避免叠加多个俏皮线索；保持个性克制。",
      },
    },
  },
  {
    id: "decision-signal",
    content: {
      en: {
        title: "Make the next move obvious",
        rationale: "For analytics, decision-support, or operations products that turn a messy dashboard into a decision someone can actually make.",
        searchPrompt: "decision support, insight, signal, action, clear outcome, trustworthy, capable",
        starterTerms: ["signal", "vector", "thread"],
        guardrail: "Avoid technology labels that do not communicate the customer outcome.",
      },
      sv: {
        title: "Gör nästa steg självklart",
        rationale: "För analys-, beslutsstöds- eller operationsprodukter som gör en rörig dashboard till ett beslut någon faktiskt kan fatta.",
        searchPrompt: "beslutsstöd, insikt, signal, handling, tydligt utfall, trovärdig, kapabel",
        starterTerms: ["signal", "vektor", "tråd"],
        guardrail: "Undvik tekniketiketter som inte beskriver kundnyttan.",
      },
      es: {
        title: "Haz evidente el siguiente paso",
        rationale: "Para productos de analítica, apoyo a decisiones u operaciones que convierten un panel confuso en una decisión que alguien puede tomar de verdad.",
        searchPrompt: "apoyo a la decisión, información, señal, acción, resultado claro, confianza, capacidad",
        starterTerms: ["señal", "vector", "hilo"],
        guardrail: "Evita etiquetas técnicas que no expliquen el resultado para el cliente.",
      },
      fr: {
        title: "Rendez le prochain choix évident",
        rationale: "Pour les produits d’analytique, d’aide à la décision ou d’opérations qui transforment un tableau de bord confus en décision réellement actionnable.",
        searchPrompt: "aide à la décision, éclairage, signal, action, résultat clair, confiance, capacité",
        starterTerms: ["signal", "vecteur", "fil"],
        guardrail: "Évitez les libellés techniques qui ne décrivent pas le résultat pour le client.",
      },
      zh: {
        title: "让下一步显而易见",
        rationale: "适合分析、决策支持或运营产品：把混乱的仪表盘变成一个人真正能做出的决定。",
        searchPrompt: "决策支持，洞察，信号，行动，清晰结果，可信，有能力",
        starterTerms: ["信号", "向量", "线索"],
        guardrail: "避免无法说明客户成果的技术标签。",
      },
    },
  },
  {
    id: "future-craft",
    content: {
      en: {
        title: "New tools, human finish",
        rationale: "For modern tools that should feel considered and useful in a buyer’s hands, with a clear product purpose.",
        searchPrompt: "modern tool, thoughtful technology, maker, refined, useful, warm, contemporary",
        starterTerms: ["loom", "studio", "current"],
        guardrail: "Avoid combining metaphors that compete for attention.",
      },
      sv: {
        title: "Nya verktyg, mänsklig finish",
        rationale: "För moderna verktyg som ska kännas genomtänkta och användbara i köparens hand, med ett tydligt produktsyfte.",
        searchPrompt: "modernt verktyg, genomtänkt teknik, skapare, förfinat, användbart, varmt, samtida",
        starterTerms: ["väv", "studio", "ström"],
        guardrail: "Undvik att kombinera metaforer som konkurrerar om uppmärksamheten.",
      },
      es: {
        title: "Herramientas nuevas, acabado humano",
        rationale: "Para herramientas modernas que deben sentirse cuidadas y útiles en manos de quien compra, con un propósito de producto claro.",
        searchPrompt: "herramienta moderna, tecnología atenta, creador, refinado, útil, cálido, contemporáneo",
        starterTerms: ["telar", "estudio", "corriente"],
        guardrail: "Evita combinar metáforas que compiten por la atención.",
      },
      fr: {
        title: "Nouveaux outils, finition humaine",
        rationale: "Pour les outils modernes qui doivent sembler soignés et utiles entre les mains de l’acheteur, avec un objectif produit clair.",
        searchPrompt: "outil moderne, technologie réfléchie, créateur, raffiné, utile, chaleureux, contemporain",
        starterTerms: ["métier", "studio", "courant"],
        guardrail: "Évitez de combiner des métaphores qui se disputent l’attention.",
      },
      zh: {
        title: "新工具，人情味收尾",
        rationale: "适合现代工具：要让买家拿在手里感觉用心且实用，并有清晰的产品目标。",
        searchPrompt: "现代工具，用心技术，创作者，精致，实用，温暖，当代",
        starterTerms: ["织", "工作室", "潮流"],
        guardrail: "避免组合彼此争夺注意力的隐喻。",
      },
    },
  },
];

export const SAJDA_INSPIRATION_IDS = directions.map(({ id }) => id);

const ignoredInputTerms = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "com", "dev", "for", "from", "in", "into", "is", "it", "of", "on", "or", "the", "to", "with", "www",
  "ai", "app", "biz", "co", "edu", "info", "io", "net", "org", "se", "uk",
  "att", "av", "det", "en", "ett", "eller", "för", "från", "i", "inte", "med", "och", "om", "på", "som", "till", "vad", "vi",
  "con", "de", "del", "el", "en", "la", "las", "los", "para", "por", "que", "un", "una", "y",
  "au", "aux", "avec", "ce", "ces", "dans", "des", "du", "et", "le", "les", "pour", "sur", "une", "vous",
]);

function clipInputTerm(term: string) {
  return term.length > 24 ? `${term.slice(0, 23)}…` : term;
}

function extractInputTerms(value: string) {
  const terms = value
    .normalize("NFKC")
    .match(/[\p{L}\p{N}]+(?:[\p{L}\p{N}'-]+)*/gu) ?? [];
  const uniqueTerms = new Set<string>();

  for (const term of terms) {
    const normalized = term.toLocaleLowerCase();
    const hasLetter = /\p{L}/u.test(normalized);
    const isLongEnough = normalized.length > 1 || /[\u3400-\u9fff]/u.test(normalized);
    if (!hasLetter || !isLongEnough || ignoredInputTerms.has(normalized)) continue;
    uniqueTerms.add(clipInputTerm(normalized));
    if (uniqueTerms.size === 3) break;
  }

  return [...uniqueTerms];
}

/**
 * Combines the selected curated route with words from the person's current
 * draft. This gives the returned search prompt a real, inspectable source
 * while retaining the useful guardrails from the curated route.
 */
export function getContextualSajdaInspiration(
  language: Language,
  id: string,
  context: SajdaInspirationSearchContext = {},
): ContextualSajdaInspiration {
  const baseDirection = getSajdaInspirationDirection(language, id);
  const brief = context.isAdvanced ? context.brief?.trim() ?? "" : "";
  const keyword = context.keyword?.trim() ?? "";
  const source = brief ? "brief" : keyword ? "search" : "none";
  // A short theme can complement a longer brief. Keeping both in the visible
  // source terms makes that composition inspectable instead of mysterious.
  const inputTerms = extractInputTerms([keyword, brief].filter(Boolean).join(" "));
  const selectedTlds = [...new Set((context.selectedTlds ?? [])
    .map((tld) => tld.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean))];

  if (!inputTerms.length) {
    return {
      direction: baseDirection,
      inputTerms,
      hasContext: false,
      source,
      selectedTlds,
    };
  }

  const starterTerms = [...new Set([...inputTerms, ...baseDirection.starterTerms])].slice(0, 3);
  return {
    direction: {
      ...baseDirection,
      // This prompt is intentionally composed from the visible terms above,
      // so accepting the route meaningfully changes the ensuing search.
      searchPrompt: `${inputTerms.join(", ")}, ${baseDirection.searchPrompt}`,
      starterTerms,
    },
    inputTerms,
    hasContext: true,
    source,
    selectedTlds,
  };
}

/**
 * Returns the complete, localized set of strategic directions. These are
 * prompt-ready naming routes, not availability or trademark assertions.
 */
export function getSajdaInspirationDirections(language: Language): SajdaInspirationDirection[] {
  return directions.map(({ id, content }) => ({ id, ...content[language] }));
}

export function getSajdaInspirationDirection(
  language: Language,
  id: string,
): SajdaInspirationDirection {
  const direction = getSajdaInspirationDirections(language).find((candidate) => candidate.id === id);
  return direction ?? getSajdaInspirationDirections(language)[0];
}
