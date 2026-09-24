import type { Language } from "./LanguageProvider";
import type { NamePackageMarketCode } from "../../shared/name-package-markets";

const en = {
  title: "Countries for name review", help: "Choose where you plan to use the name. This sets a manual company-name and trademark review plan, independently of language and domain extensions. It does not check or clear a name.",
  usa: "USA", eu: "European Union (27)", usaEu: "USA + EU", all: "All listed countries ({count})", choose: "Choose individual countries", selected: "{count} countries selected", minimum: "Keep at least one country selected.",
  coverageTitle: "Company-name and trademark review", coverage: "0 / {count} countries checked", incomplete: "No candidate has been checked in these registers. Official links guide your own review; choosing countries adds no legal evidence or score points.",
  sources: "Official sources and required follow-up", company: "Company name", trademark: "Trademark", notChecked: "Not checked", manual: "Manual review", cardPointer: "Review the official sources for your selected countries", companyHelp: "Company-name rules depend on the country and, in some places, the state or province. Domain availability is not approval to register a company name.", trademarkHelp: "Review relevant trademark registers and other applicable rights in each target country. A domain or company registration is not trademark clearance.",
  catalogDate: "Source catalog reviewed (not a name check)", chosen: "Selected countries", followUp: "Required follow-up",
  followUps: {
    not_legal_clearance: "This is not legal clearance.", national_company_rules: "Check the local company-name and registration rules.",
    national_and_regional_trademarks: "Check national rights as well as EU-wide trademarks; an EU search alone is not a complete clearance.",
    choose_us_state: "Choose the relevant U.S. state and its business-name register. There is no single national company-name approval here.",
    state_and_unregistered_rights: "USPTO covers federal trademarks. State registrations and unregistered rights require separate review.",
    participating_collections_only: "WIPO includes participating collections, not every local register or right.",
    subnational_register_coverage: "Canadian federal information does not replace provincial and territorial register checks.",
    language_limited_directory: "Japan’s English corporate-number directory is a limited identity directory, not approval of a company name. Review the relevant Japanese-language sources.",
  },
};
type MarketsCopy = Omit<typeof en, "followUps"> & { followUps: Record<keyof typeof en.followUps, string> };

export const namePackageMarketsCopy: Record<Language, MarketsCopy> = {
  en,
  sv: {
    title: "Länder för namngranskning", help: "Välj var namnet ska användas. Det skapar en plan för manuell kontroll av företagsnamn och varumärken, oberoende av språk och domänändelser. Namnet kontrolleras eller godkänns inte här.",
    usa: "USA", eu: "Europeiska unionen (27)", usaEu: "USA + EU", all: "Alla listade länder ({count})", choose: "Välj enskilda länder", selected: "{count} länder valda", minimum: "Behåll minst ett valt land.",
    coverageTitle: "Granskning av företagsnamn och varumärke", coverage: "0 / {count} länder kontrollerade", incomplete: "Inget namnförslag har kontrollerats i dessa register. Officiella länkar hjälper din egen granskning; valda länder ger inga juridiska belägg eller poäng.",
    sources: "Officiella källor och kontroller som återstår", company: "Företagsnamn", trademark: "Varumärke", notChecked: "Ej kontrollerat", manual: "Manuell granskning", cardPointer: "Granska de officiella källorna för dina valda länder", companyHelp: "Reglerna för företagsnamn beror på land och ibland delstat eller provins. En ledig domän innebär inte att företagsnamnet får registreras.", trademarkHelp: "Granska relevanta varumärkesregister och andra tillämpliga rättigheter i varje målmarknad. En domän- eller företagsregistrering innebär inte att varumärket är klarerat.",
    catalogDate: "Källförteckning granskad (inte en namnkontroll)", chosen: "Valda länder", followUp: "Kontroller som återstår",
    followUps: {
      not_legal_clearance: "Detta är ingen juridisk klarering.", national_company_rules: "Kontrollera lokala regler för företagsnamn och registrering.",
      national_and_regional_trademarks: "Kontrollera nationella rättigheter och EU-varumärken; en EU-sökning räcker inte för full klarering.",
      choose_us_state: "Välj relevant amerikansk delstat och dess företagsregister. Här finns inget gemensamt nationellt godkännande av företagsnamn.",
      state_and_unregistered_rights: "USPTO omfattar federala varumärken. Delstatliga registreringar och oregistrerade rättigheter behöver granskas separat.",
      participating_collections_only: "WIPO omfattar anslutna samlingar, inte samtliga lokala register och rättigheter.",
      subnational_register_coverage: "Kanadensisk federal information ersätter inte kontroller i provinsernas och territoriernas register.",
      language_limited_directory: "Japans engelska företagsnummerkatalog är en begränsad identitetskatalog, inte ett godkännande av företagsnamn. Granska relevanta japanskspråkiga källor.",
    },
  },
  es: {
    title: "Países para revisar el nombre", help: "Elige dónde usarás el nombre. Esto crea un plan de revisión manual de nombres de empresa y marcas, independiente del idioma y de las extensiones de dominio. No comprueba ni autoriza el nombre.",
    usa: "EE. UU.", eu: "Unión Europea (27)", usaEu: "EE. UU. + UE", all: "Todos los países listados ({count})", choose: "Elegir países individuales", selected: "{count} países seleccionados", minimum: "Mantén al menos un país seleccionado.",
    coverageTitle: "Revisión de nombres de empresa y marcas", coverage: "0 / {count} países comprobados", incomplete: "Ningún nombre propuesto se ha comprobado en estos registros. Los enlaces oficiales orientan tu revisión; elegir países no aporta pruebas jurídicas ni puntos.",
    sources: "Fuentes oficiales y revisiones pendientes", company: "Nombre de empresa", trademark: "Marca", notChecked: "Sin comprobar", manual: "Revisión manual", cardPointer: "Revisar las fuentes oficiales de tus países seleccionados", companyHelp: "Las reglas sobre nombres de empresa dependen del país y, a veces, del estado o la provincia. Un dominio disponible no autoriza el registro de una empresa.", trademarkHelp: "Revisa los registros de marcas y otros derechos aplicables en cada país. Registrar un dominio o una empresa no supone una autorización de marca.",
    catalogDate: "Catálogo de fuentes revisado (no es una comprobación del nombre)", chosen: "Países seleccionados", followUp: "Revisiones pendientes",
    followUps: {
      not_legal_clearance: "Esto no constituye una autorización jurídica.", national_company_rules: "Comprueba las normas locales de nombres de empresa y registro.",
      national_and_regional_trademarks: "Comprueba derechos nacionales y marcas de la UE; una búsqueda europea no constituye una revisión completa.",
      choose_us_state: "Elige el estado estadounidense pertinente y su registro empresarial. No hay una aprobación nacional única del nombre de empresa aquí.",
      state_and_unregistered_rights: "USPTO cubre marcas federales. Los registros estatales y los derechos no registrados requieren otra revisión.",
      participating_collections_only: "WIPO incluye colecciones participantes, no todos los registros ni derechos locales.",
      subnational_register_coverage: "La información federal canadiense no sustituye las consultas provinciales y territoriales.",
      language_limited_directory: "El directorio japonés de números corporativos en inglés es un directorio de identidad limitado, no una aprobación del nombre. Revisa las fuentes pertinentes en japonés.",
    },
  },
  fr: {
    title: "Pays pour examiner le nom", help: "Choisissez où utiliser le nom. Cela prépare un examen manuel des noms d’entreprise et des marques, indépendamment de la langue et des extensions de domaine. Le nom n’est ni vérifié ni autorisé ici.",
    usa: "États-Unis", eu: "Union européenne (27)", usaEu: "États-Unis + UE", all: "Tous les pays répertoriés ({count})", choose: "Choisir des pays individuellement", selected: "{count} pays sélectionnés", minimum: "Conservez au moins un pays sélectionné.",
    coverageTitle: "Examen des noms d’entreprise et des marques", coverage: "0 / {count} pays vérifiés", incomplete: "Aucun nom proposé n’a été vérifié dans ces registres. Les liens officiels guident votre examen ; sélectionner des pays n’ajoute ni preuve juridique ni points.",
    sources: "Sources officielles et vérifications nécessaires", company: "Nom d’entreprise", trademark: "Marque", notChecked: "Non vérifié", manual: "Examen manuel", cardPointer: "Examiner les sources officielles des pays sélectionnés", companyHelp: "Les règles dépendent du pays et parfois de l’État ou de la province. La disponibilité d’un domaine n’autorise pas l’enregistrement d’un nom d’entreprise.", trademarkHelp: "Examinez les registres de marques et les autres droits applicables dans chaque pays. L’enregistrement d’un domaine ou d’une entreprise ne vaut pas validation d’une marque.",
    catalogDate: "Catalogue de sources examiné (pas une vérification du nom)", chosen: "Pays sélectionnés", followUp: "Vérifications nécessaires",
    followUps: {
      not_legal_clearance: "Ceci n’est pas une validation juridique.", national_company_rules: "Vérifiez les règles locales sur les noms et l’immatriculation des entreprises.",
      national_and_regional_trademarks: "Vérifiez les droits nationaux et les marques de l’UE ; une recherche européenne seule ne suffit pas.",
      choose_us_state: "Choisissez l’État américain concerné et son registre des entreprises. Il n’existe pas ici d’autorisation nationale unique du nom d’entreprise.",
      state_and_unregistered_rights: "USPTO couvre les marques fédérales. Les enregistrements des États et les droits non enregistrés exigent un examen distinct.",
      participating_collections_only: "WIPO couvre les collections participantes, pas tous les registres ou droits locaux.",
      subnational_register_coverage: "Les informations fédérales canadiennes ne remplacent pas les vérifications provinciales et territoriales.",
      language_limited_directory: "Le répertoire japonais de numéros d’entreprise en anglais est limité à l’identité, et ne valide pas les noms. Consultez les sources pertinentes en japonais.",
    },
  },
  zh: {
    title: "名称审查的目标国家", help: "选择计划使用名称的国家。这会建立企业名称和商标的人工审查计划，与语言和域名后缀无关。这里不会检查或批准任何名称。",
    usa: "美国", eu: "欧盟（27国）", usaEu: "美国 + 欧盟", all: "所有列出的国家（{count}）", choose: "选择各个国家", selected: "已选择 {count} 个国家", minimum: "请至少保留一个国家。",
    coverageTitle: "企业名称与商标审查", coverage: "已检查 0 / {count} 个国家", incomplete: "尚未在这些登记系统中核查任何候选名称。官方链接仅供你自行审查；选择国家不会增加法律证据或评分。",
    sources: "官方来源和待完成的检查", company: "企业名称", trademark: "商标", notChecked: "未检查", manual: "人工审查", cardPointer: "查看所选国家的官方来源", companyHelp: "企业名称规则取决于国家，有时也取决于州或省。域名可注册不代表企业名称获准注册。", trademarkHelp: "请在每个目标国家审查相关商标登记和其他适用权利。注册域名或企业不等于完成商标法律审查。",
    catalogDate: "来源目录审查日期（并非名称核查日期）", chosen: "所选国家", followUp: "待完成的检查",
    followUps: {
      not_legal_clearance: "这不是法律许可。", national_company_rules: "请检查当地的企业名称及登记规则。",
      national_and_regional_trademarks: "请同时检查国家权利和欧盟商标；仅搜索欧盟数据库不足以完成全面审查。",
      choose_us_state: "请确定相关美国州及其企业登记处。这里没有统一的全国企业名称批准。",
      state_and_unregistered_rights: "USPTO 涵盖联邦商标。州级登记及未注册权利需要另行审查。",
      participating_collections_only: "WIPO 仅涵盖参与的数据集合，并非所有本地登记和权利。",
      subnational_register_coverage: "加拿大联邦资料不能替代省和地区登记的核查。",
      language_limited_directory: "日本英文企业编号目录是范围有限的身份目录，并非企业名称批准系统。请审查相关日语来源。",
    },
  },
};

export function namePackageCountryName(code: NamePackageMarketCode, language: string): string {
  try { return new Intl.DisplayNames([language], { type: "region" }).of(code) ?? code; }
  catch { return code; }
}

export function marketCountText(text: string, count: number): string { return text.replace("{count}", String(count)); }
