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
        rationale: "For services, finance or operations tools that need to inspire trust from the first impression.",
        searchPrompt: "trusted service, calm clarity, dependable, direct, understated, practical",
        starterTerms: ["steady", "anchor", "clarity"],
        guardrail: "Avoid ornate or old-fashioned cues that make the name feel less accessible.",
      },
      sv: {
        title: "Lugn och förtroende",
        rationale: "För tjänster och verktyg inom finans eller verksamhetsstyrning som behöver kännas pålitliga redan vid första intrycket.",
        searchPrompt: "pålitlig tjänst, lugn tydlighet, stabil, direkt, nedtonad, praktisk",
        starterTerms: ["stadig", "ankare", "klarhet"],
        guardrail: "Undvik pompösa eller ålderdomliga uttryck som gör namnet svårt att ta till sig.",
      },
      es: {
        title: "Confianza serena",
        rationale: "Para servicios y herramientas financieras u operativas que necesitan inspirar confianza desde el primer momento.",
        searchPrompt: "servicio fiable, claridad serena, estable, directo, sobrio, práctico",
        starterTerms: ["firme", "ancla", "claro"],
        guardrail: "Evita expresiones recargadas o anticuadas que hagan el nombre menos cercano.",
      },
      fr: {
        title: "Une confiance sereine",
        rationale: "Pour les services et les outils financiers ou de gestion qui doivent inspirer confiance dès le premier contact.",
        searchPrompt: "service fiable, clarté calme, stable, direct, sobre, pratique",
        starterTerms: ["stable", "ancre", "clair"],
        guardrail: "Évitez les expressions vieillies ou trop emphatiques qui rendent le nom moins accessible.",
      },
      zh: {
        title: "沉稳可信",
        rationale: "适合服务、金融或运营工具，让人从第一印象就感到可靠。",
        searchPrompt: "可靠服务，冷静清晰，稳定，直接，克制，实用",
        starterTerms: ["稳", "锚", "明"],
        guardrail: "避免陈旧或浮夸的表达，以免名称难以亲近。",
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
        rationale: "För programvara, data- och teknikprodukter som står för precision men behöver ett namn som är lätt att säga i ett samtal.",
        searchPrompt: "teknisk produkt, precision, konstruerad, tydlig, kapabel, mänsklig, kort",
        starterTerms: ["smide", "mått", "vektor"],
        guardrail: "Undvik att stapla tekniska termer, skiljetecken och kombinationer av bokstäver och siffror.",
      },
      es: {
        title: "Claridad técnica",
        rationale: "Para productos de software, datos o ingeniería que destacan por su precisión y necesitan un nombre fácil de repetir en una llamada.",
        searchPrompt: "producto técnico, preciso, diseñado, claro, capaz, humano, conciso",
        starterTerms: ["forja", "métrica", "vector"],
        guardrail: "Evita acumular términos técnicos, signos de puntuación y combinaciones de letras y números.",
      },
      fr: {
        title: "Clarté technique",
        rationale: "Pour les logiciels et les produits de données ou d’ingénierie axés sur la précision, avec un nom facile à dire en réunion.",
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
        rationale: "För arbetsflödesverktyg och företagstjänster som hjälper team att samarbeta smidigt och tydligt.",
        searchPrompt: "teamarbete, arbetsflöde, överlämning, gemensam tydlighet, praktisk, vänlig B2B",
        starterTerms: ["tandem", "relä", "gemensam"],
        guardrail: "Undvik förkortningar och abstrakta ord om processer.",
      },
      es: {
        title: "El equipo es el producto",
        rationale: "Para herramientas de trabajo y servicios B2B que ayudan a los equipos a coordinarse de forma más sencilla y clara.",
        searchPrompt: "equipo, flujo de trabajo, relevo, claridad compartida, práctico, B2B cercano",
        starterTerms: ["tándem", "relevo", "común"],
        guardrail: "Evita siglas y términos abstractos sobre procesos.",
      },
      fr: {
        title: "L’équipe fait le produit",
        rationale: "Pour les outils de travail et les services B2B qui aident les équipes à se coordonner plus simplement et plus clairement.",
        searchPrompt: "équipe, flux de travail, relais, clarté partagée, pratique, B2B chaleureux",
        starterTerms: ["tandem", "relais", "commun"],
        guardrail: "Évitez les sigles et les termes abstraits liés aux processus.",
      },
      zh: {
        title: "团队才是产品",
        rationale: "适合工作流和 B2B 工具，帮助团队更顺畅、更清晰地协作。",
        searchPrompt: "团队协作，工作流，交接，共识，实用，亲切的 B2B",
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
        title: "Skapat för framåtrörelse",
        rationale: "För leverans-, tränings-, produktivitets- eller resetjänster som hjälper människor att gå från plan till handling.",
        searchPrompt: "framåtrörelse, framsteg, rörelse, effektiv, positiv, tydlig, modern",
        starterTerms: ["steg", "lyft", "puls"],
        guardrail: "Låt en tydlig rörelseidé räcka i namnet.",
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
        rationale: "Pour les produits de livraison, de sport, de productivité ou de voyage qui aident à passer de l’intention à l’action.",
        searchPrompt: "élan, progrès, mouvement, efficace, positif, clair, moderne",
        starterTerms: ["pas", "essor", "pouls"],
        guardrail: "Évitez de multiplier les signaux de mouvement ; un seul suffit.",
      },
      zh: {
        title: "为行动而生",
        rationale: "适合配送、健身、效率或旅行产品，帮助人们从规划走向行动。",
        searchPrompt: "势能，进展，移动，高效，积极，清晰，现代",
        starterTerms: ["步", "跃", "脉"],
        guardrail: "一个体现动感的元素就够了，无需叠加。",
      },
    },
  },
  {
    id: "place-and-memory",
    content: {
      en: {
        title: "An origin worth naming",
        rationale: "For hospitality, property, food, travel, or craft brands grounded in a real place or practice.",
        searchPrompt: "real origin, local craft, landmark, neighborhood, terrain, familiar, distinctive",
        starterTerms: ["harbor", "quarry", "northline"],
        guardrail: "Avoid combining place references that do not have a real connection.",
      },
      sv: {
        title: "Låt ursprunget ge namnet",
        rationale: "För varumärken inom hotell, fastigheter, mat, resor eller hantverk med rötter i en verklig plats eller tradition.",
        searchPrompt: "verkligt ursprung, lokalt hantverk, landmärke, kvarter, terräng, välbekant, särpräglad",
        starterTerms: ["hamn", "stenbrott", "norrled"],
        guardrail: "Undvik att kombinera platsreferenser som saknar verklig koppling.",
      },
      es: {
        title: "Un nombre con raíces",
        rationale: "Para marcas de hostelería, inmuebles, alimentación, viajes o artesanía vinculadas a un lugar o una tradición reales.",
        searchPrompt: "origen real, oficio local, hito, barrio, terreno, familiar, distintivo",
        starterTerms: ["puerto", "cantera", "norte"],
        guardrail: "Evita combinar referencias de lugares sin una conexión real.",
      },
      fr: {
        title: "Une origine qui mérite un nom",
        rationale: "Pour les marques d’hôtellerie, d’immobilier, d’alimentation, de voyage ou d’artisanat ancrées dans un lieu ou une tradition.",
        searchPrompt: "origine réelle, savoir-faire local, repère, quartier, terrain, familier, distinctif",
        starterTerms: ["port", "carrière", "ligne nord"],
        guardrail: "Évitez de combiner des références de lieux sans lien réel.",
      },
      zh: {
        title: "让来处成为名字",
        rationale: "适合酒店、地产、餐饮、旅行或手工艺品牌，以真实的地点或传统为灵感。",
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
        title: "Make it original and easy to say",
        rationale: "For a category-creating brand that needs a distinctive word people can hear, repeat, and search without extra explanation.",
        searchPrompt: "coined brand name, pronounceable, short, vowel balance, distinct, clear",
        starterTerms: ["velora", "nuvio", "merano"],
        guardrail: "Avoid unfamiliar spellings or sounds that need explanation.",
      },
      sv: {
        title: "Nyskapat och lätt att säga",
        rationale: "För ett nyskapande varumärke som behöver ett eget ord som människor lätt kan höra, upprepa och söka efter.",
        searchPrompt: "uppfunnet varumärkesnamn, uttalbart, kort, vokalbalans, särpräglat, tydligt",
        starterTerms: ["velora", "nuvio", "merano"],
        guardrail: "Undvik ovanliga stavningar eller ljud som behöver förklaras.",
      },
      es: {
        title: "Original y fácil de pronunciar",
        rationale: "Para una marca que crea categoría y necesita una palabra distintiva que se pueda escuchar, repetir y buscar sin explicaciones adicionales.",
        searchPrompt: "nombre de marca inventado, pronunciable, corto, equilibrio de vocales, distinto, claro",
        starterTerms: ["velora", "nuvio", "merano"],
        guardrail: "Evita grafías o sonidos poco familiares que requieran explicación.",
      },
      fr: {
        title: "Inventez un nom facile à prononcer",
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
        title: "Say what it does. Make it distinctive.",
        rationale: "For a practical launch where a buyer should understand the product’s purpose immediately, even if the details take a click.",
        searchPrompt: "clear category, practical, direct, useful, credible, distinctive modifier",
        starterTerms: ["ledger", "clinic", "route"],
        guardrail: "Avoid category names on their own; add one distinguishing cue.",
      },
      sv: {
        title: "Beskriv nyttan. Ge namnet en egen prägel.",
        rationale: "För produkter där kunden ska förstå nyttan direkt, även om detaljerna finns ett klick bort.",
        searchPrompt: "tydlig kategori, praktisk, direkt, användbar, trovärdig, särskiljande tillägg",
        starterTerms: ["bok", "klinik", "rutt"],
        guardrail: "Använd inte bara kategorinamnet. Lägg till något som särskiljer.",
      },
      es: {
        title: "Di lo que hace. Dale carácter propio.",
        rationale: "Para productos cuya utilidad debe entenderse al instante, aunque los detalles estén a un clic.",
        searchPrompt: "categoría clara, práctico, directo, útil, creíble, modificador distintivo",
        starterTerms: ["libro", "clínica", "ruta"],
        guardrail: "Evita los nombres de categoría por sí solos; añade un rasgo distintivo.",
      },
      fr: {
        title: "Dites ce qu’il fait. Distinguez-le.",
        rationale: "Pour les produits dont l’utilité doit se comprendre immédiatement, même si les détails demandent un clic.",
        searchPrompt: "catégorie claire, pratique, direct, utile, crédible, modificateur distinctif",
        starterTerms: ["registre", "clinique", "route"],
        guardrail: "Évitez les noms de catégorie seuls ; ajoutez un signe distinctif.",
      },
      zh: {
        title: "说清用途，也要有特色",
        rationale: "适合希望用户一眼看懂用途的产品，详细信息可以稍后再了解。",
        searchPrompt: "清晰品类，务实，直接，有用，可信，有辨识度的修饰词",
        starterTerms: ["账本", "诊所", "路径"],
        guardrail: "不要只用类别名称，加入一个有辨识度的元素。",
      },
    },
  },
  {
    id: "modern-heritage",
    content: {
      en: {
        title: "A sense of lasting quality",
        rationale: "For premium services and carefully developed brands that need to feel established without inventing a history.",
        searchPrompt: "modern heritage, premium service, crafted, enduring, tactile, refined",
        starterTerms: ["foundry", "folio", "morrow"],
        guardrail: "Avoid mixing several heritage cues in the same name.",
      },
      sv: {
        title: "Kvalitet som känns bestående",
        rationale: "För premiumtjänster och genomtänkta varumärken som ska kännas etablerade utan att hitta på en historia.",
        searchPrompt: "modern tradition, premiumtjänst, hantverk, beständigt, påtagligt, förfinat",
        starterTerms: ["gjuteri", "folio", "morgon"],
        guardrail: "Undvik att blanda för många historiska referenser i samma namn.",
      },
      es: {
        title: "Una sensación de calidad duradera",
        rationale: "Para servicios premium y marcas cuidadas que quieren transmitir solidez sin inventarse una historia.",
        searchPrompt: "herencia moderna, servicio premium, artesanal, duradero, táctil, refinado",
        starterTerms: ["fundición", "folio", "alba"],
        guardrail: "Evita mezclar varias referencias al pasado en un mismo nombre.",
      },
      fr: {
        title: "Une impression de qualité durable",
        rationale: "Pour les services haut de gamme et les marques soignées qui veulent paraître établis sans s’inventer un passé.",
        searchPrompt: "héritage moderne, service premium, artisanal, durable, tactile, raffiné",
        starterTerms: ["fonderie", "folio", "matin"],
        guardrail: "Évitez de mélanger plusieurs références patrimoniales dans un même nom.",
      },
      zh: {
        title: "传递经得起时间的质感",
        rationale: "适合高端服务和精心打造的品牌，传递成熟可靠的感觉，而不是编造历史。",
        searchPrompt: "现代传承，高端服务，工艺，耐久，触感，精致",
        starterTerms: ["铸坊", "卷册", "晨"],
        guardrail: "避免在同一名称中堆叠过多历史元素。",
      },
    },
  },
  {
    id: "care-and-trust",
    content: {
      en: {
        title: "Care with confidence",
        rationale: "For health, finance, family and essential services where the name needs to feel reassuring and professional.",
        searchPrompt: "care service, reassuring, calm, secure, considerate, clear, professional",
        starterTerms: ["well", "shelter", "kindred"],
        guardrail: "Avoid overly informal language when the product needs professional confidence.",
      },
      sv: {
        title: "Omsorg som väcker förtroende",
        rationale: "För hälsa, finans, familj och viktiga tjänster där namnet behöver kännas tryggt och professionellt.",
        searchPrompt: "omsorgstjänst, lugnande, trygg, omtänksam, tydlig, professionell",
        starterTerms: ["väl", "skydd", "nära"],
        guardrail: "Undvik alltför vardagligt språk om tjänsten behöver förmedla professionalism.",
      },
      es: {
        title: "Cercanía que inspira confianza",
        rationale: "Para servicios de salud, finanzas, familia y otros ámbitos esenciales donde el nombre debe transmitir tranquilidad y profesionalidad.",
        searchPrompt: "servicio de cuidado, tranquilizador, sereno, seguro, considerado, claro, profesional",
        starterTerms: ["bien", "refugio", "afín"],
        guardrail: "Evita un lenguaje demasiado informal cuando el producto requiere confianza profesional.",
      },
      fr: {
        title: "Une attention qui inspire confiance",
        rationale: "Pour la santé, la finance, la famille et les services essentiels où le nom doit être rassurant et professionnel.",
        searchPrompt: "service de soin, rassurant, calme, sûr, attentif, clair, professionnel",
        starterTerms: ["bien", "abri", "proche"],
        guardrail: "Évitez un langage trop informel lorsqu’un produit doit inspirer une confiance professionnelle.",
      },
      zh: {
        title: "关怀与信任",
        rationale: "适合健康、金融、家庭及其他重要服务，让名称传递安心与专业。",
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
        title: "Ett namn som fungerar internationellt",
        rationale: "För en produkt som behöver fungera på flera språk och marknader, utan att namnet kräver en uttalsguide.",
        searchPrompt: "internationellt varumärke, kort, uttalbart, neutralt, enkelt, minnesvärt",
        starterTerms: ["nivo", "ora", "mira"],
        guardrail: "Undvik namn som är svåra att uttala på dina avsedda marknader.",
      },
      es: {
        title: "Hecho para viajar",
        rationale: "Para productos presentes en distintos idiomas y mercados, con nombres que no necesiten una guía de pronunciación.",
        searchPrompt: "marca internacional, corto, pronunciable, neutro, simple, memorable",
        starterTerms: ["nivo", "ora", "mira"],
        guardrail: "Evita nombres difíciles de pronunciar en tus mercados objetivo.",
      },
      fr: {
        title: "Fait pour voyager",
        rationale: "Pour les produits présents dans plusieurs langues et marchés, avec un nom qui se prononce sans mode d’emploi.",
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
        rationale: "For clever products with enough personality to attract interest and enough substance to earn trust.",
        searchPrompt: "clever product, bright, friendly, inventive, polished, premium, memorable",
        starterTerms: ["wink", "moss", "relay"],
        guardrail: "Avoid multiple playful cues; keep the personality controlled.",
      },
      sv: {
        title: "Smart med lagom lekfullhet",
        rationale: "För smarta produkter med tillräckligt mycket personlighet för att väcka intresse och tillräcklig substans för att skapa förtroende.",
        searchPrompt: "smart produkt, positiv, vänlig, uppfinningsrik, genomarbetad, premium, minnesvärd",
        starterTerms: ["blink", "mossa", "relä"],
        guardrail: "Välj ett lekfullt inslag i stället för att blanda flera.",
      },
      es: {
        title: "Inteligente, con mesura",
        rationale: "Para productos ingeniosos con personalidad para despertar interés y solidez para inspirar confianza.",
        searchPrompt: "producto ingenioso, luminoso, amable, inventivo, pulido, premium, memorable",
        starterTerms: ["guiño", "musgo", "relevo"],
        guardrail: "Elige un detalle divertido en lugar de mezclar varios.",
      },
      fr: {
        title: "Malin, avec mesure",
        rationale: "Pour les produits astucieux, avec assez de personnalité pour éveiller l’intérêt et assez de solidité pour inspirer confiance.",
        searchPrompt: "produit malin, lumineux, chaleureux, inventif, soigné, premium, mémorable",
        starterTerms: ["clin d’œil", "mousse", "relais"],
        guardrail: "Choisissez une touche ludique plutôt que d’en multiplier les signes.",
      },
      zh: {
        title: "聪明，也要克制",
        rationale: "适合聪明实用的产品，既用个性吸引关注，也用实力赢得信任。",
        searchPrompt: "聪明产品，明亮，友好，有创意，精致，高端，易记",
        starterTerms: ["微笑", "苔", "接力"],
        guardrail: "选择一个俏皮元素就好，不必叠加。",
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
        rationale: "För analysverktyg, beslutsstöd och verksamhetssystem som gör rörig information till ett tydligt underlag att agera på.",
        searchPrompt: "beslutsstöd, insikt, signal, handling, tydligt utfall, trovärdig, kapabel",
        starterTerms: ["signal", "vektor", "tråd"],
        guardrail: "Undvik tekniketiketter som inte beskriver kundnyttan.",
      },
      es: {
        title: "Haz evidente el siguiente paso",
        rationale: "Para herramientas de análisis, apoyo a decisiones u operaciones que transforman información confusa en decisiones claras.",
        searchPrompt: "apoyo a la decisión, información, señal, acción, resultado claro, confianza, capacidad",
        starterTerms: ["señal", "vector", "hilo"],
        guardrail: "Evita etiquetas técnicas que no expliquen el resultado para el cliente.",
      },
      fr: {
        title: "Rendez le prochain choix évident",
        rationale: "Pour les outils d’analyse, d’aide à la décision ou de gestion qui transforment des informations confuses en décisions concrètes.",
        searchPrompt: "aide à la décision, éclairage, signal, action, résultat clair, confiance, capacité",
        starterTerms: ["signal", "vecteur", "fil"],
        guardrail: "Évitez les libellés techniques qui ne décrivent pas le résultat pour le client.",
      },
      zh: {
        title: "让下一步显而易见",
        rationale: "适合分析、决策支持或运营产品，把纷杂的信息变成可供行动的清晰判断。",
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
        title: "Modern tools, a human touch",
        rationale: "For modern tools that feel thoughtful, useful and approachable, with a clear purpose.",
        searchPrompt: "modern tool, thoughtful technology, maker, refined, useful, warm, contemporary",
        starterTerms: ["loom", "studio", "current"],
        guardrail: "Avoid combining metaphors that compete for attention.",
      },
      sv: {
        title: "Moderna verktyg med mänsklig känsla",
        rationale: "För moderna verktyg som är genomtänkta, användbara och lätta att ta till sig, med ett tydligt syfte.",
        searchPrompt: "modernt verktyg, genomtänkt teknik, skapare, förfinat, användbart, varmt, samtida",
        starterTerms: ["väv", "studio", "ström"],
        guardrail: "Undvik att kombinera metaforer som konkurrerar om uppmärksamheten.",
      },
      es: {
        title: "Herramientas modernas, toque humano",
        rationale: "Para herramientas modernas, útiles y cercanas, diseñadas con cuidado y con un propósito claro.",
        searchPrompt: "herramienta moderna, tecnología atenta, creador, refinado, útil, cálido, contemporáneo",
        starterTerms: ["telar", "estudio", "corriente"],
        guardrail: "Evita combinar metáforas que compiten por la atención.",
      },
      fr: {
        title: "Des outils modernes, une touche humaine",
        rationale: "Pour les outils modernes, utiles et accessibles, conçus avec soin et dans un but clair.",
        searchPrompt: "outil moderne, technologie réfléchie, créateur, raffiné, utile, chaleureux, contemporain",
        starterTerms: ["métier", "studio", "courant"],
        guardrail: "Évitez de combiner des métaphores qui se disputent l’attention.",
      },
      zh: {
        title: "现代工具，也有人情味",
        rationale: "适合用心、实用又亲切的现代工具，并有明确的用途。",
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
