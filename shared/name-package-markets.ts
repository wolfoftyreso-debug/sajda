import { z } from "zod/v4";

/** Catalog review dates describe links/scope, never a check of a candidate name. */
export const NAME_PACKAGE_MARKET_CATALOG_VERSION = "name-package-markets-2026-09-13" as const;
export const EU_NAME_PACKAGE_MARKETS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
] as const;
export const NAME_PACKAGE_MARKET_CODES = ["US", ...EU_NAME_PACKAGE_MARKETS, "IS", "LI", "NO", "GB", "CH", "CA", "AU", "NZ", "SG", "JP"] as const;
export type NamePackageMarketCode = typeof NAME_PACKAGE_MARKET_CODES[number];
export const DEFAULT_NAME_PACKAGE_MARKETS: readonly NamePackageMarketCode[] = ["US", ...EU_NAME_PACKAGE_MARKETS];

const SOURCE_SCOPES = ["national_company_register", "business_register_directory", "national_company_registration_guidance", "state_company_registration_guidance",
  "federal_trademark_search", "national_trademark_search", "regional_trademark_search", "participating_trademark_collections", "corporate_identity_directory"] as const;
const FOLLOW_UP = ["not_legal_clearance", "national_company_rules", "national_and_regional_trademarks",
  "choose_us_state", "state_and_unregistered_rights", "participating_collections_only", "subnational_register_coverage", "language_limited_directory"] as const;
const officialSourceSchema = z.strictObject({
  name: z.string().min(1).max(140), url: z.string().url().max(512).refine(value => value.startsWith("https://")),
  scope: z.enum(SOURCE_SCOPES), access: z.literal("manual"), reviewed_on: z.literal("2026-09-13"),
});
export type NamePackageMarketSource = z.infer<typeof officialSourceSchema>;
const manualCheckSchema = z.strictObject({ status: z.literal("not_checked"), sources: z.array(officialSourceSchema).min(1).max(3) });
export const namePackageMarketCoverageSchema = z.strictObject({
  catalog_version: z.literal(NAME_PACKAGE_MARKET_CATALOG_VERSION),
  requested_markets: z.array(z.enum(NAME_PACKAGE_MARKET_CODES)).min(1).max(NAME_PACKAGE_MARKET_CODES.length),
  checked_markets: z.array(z.never()).max(0), automated_checks_available: z.literal(false),
  checks: z.array(z.strictObject({
    market: z.enum(NAME_PACKAGE_MARKET_CODES), company: manualCheckSchema, trademark: manualCheckSchema,
    required_follow_up: z.array(z.enum(FOLLOW_UP)).min(1).max(FOLLOW_UP.length),
  })).min(1).max(NAME_PACKAGE_MARKET_CODES.length),
}).superRefine((value, context) => {
  const selected = new Set(value.requested_markets);
  const checks = new Set(value.checks.map(check => check.market));
  if (selected.size !== value.requested_markets.length || checks.size !== value.checks.length
    || checks.size !== selected.size || [...checks].some(market => !selected.has(market))) {
    context.addIssue({ code: "custom", message: "Market review paths must match the unique requested markets." });
  }
});
export type NamePackageMarketCoverage = z.infer<typeof namePackageMarketCoverageSchema>;

const manual = (name: string, url: string, scope: NamePackageMarketSource["scope"]): NamePackageMarketSource =>
  ({ name, url, scope, access: "manual", reviewed_on: "2026-09-13" });
const BRIS = manual("European e-Justice / BRIS", "https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-search-company-eu/general-information-find-company_en", "business_register_directory");
const EUIPO = manual("EUIPO / TMview", "https://www.euipo.europa.eu/en/search-ip", "regional_trademark_search");
const WIPO = manual("WIPO Global Brand Database", "https://www.wipo.int/en/web/global-brand-database", "participating_trademark_collections");

// National register destinations listed by the European Commission's BRIS directory.
// A directory link is deliberately used where its listed national endpoint is HTTP-only.
const EUROPEAN_COMPANY_REGISTERS: Record<typeof EU_NAME_PACKAGE_MARKETS[number] | "IS" | "LI" | "NO", NamePackageMarketSource> = {
  AT: manual("Firmenbuch", "https://www.justiz.gv.at/service/datenbanken/firmenbuch/firmenbuchabfrage.2c9484852308c2a601240b693e1c0860.de.html", "national_company_register"),
  BE: manual("Crossroads Bank for Enterprises", "https://economie.fgov.be/en/themes/enterprises/crossroads-bank-enterprises", "national_company_register"),
  BG: manual("Registry Agency", "https://portal.registryagency.bg", "national_company_register"),
  HR: manual("Court Register", "https://sudreg.pravosudje.hr/", "national_company_register"),
  CY: BRIS,
  CZ: manual("Public Register", "https://or.justice.cz/ias/ui/rejstrik", "national_company_register"),
  DK: manual("CVR", "https://datacvr.virk.dk/", "national_company_register"),
  EE: manual("e-Business Register", "https://ariregister.rik.ee/eng", "national_company_register"),
  FI: manual("Finnish Patent and Registration Office", "https://www.prh.fi/en/index.html", "national_company_register"),
  FR: manual("Infogreffe", "https://www.infogreffe.com/", "national_company_register"),
  DE: manual("Handelsregister", "https://www.handelsregister.de/rp_web/welcome.do?language=en", "national_company_register"),
  GR: BRIS,
  HU: manual("Company Information System", "https://occsz.e-cegjegyzek.hu/info/page/ceginfo", "national_company_register"),
  IE: manual("Companies Registration Office", "https://www.cro.ie/", "national_company_register"),
  IT: manual("Italian Business Register", "https://italianbusinessregister.it", "national_company_register"),
  LV: manual("Register of Enterprises", "https://www.ur.gov.lv/en/", "national_company_register"),
  LT: manual("Centre of Registers", "https://www.registrucentras.lt", "national_company_register"),
  LU: manual("Luxembourg Business Registers", "https://www.lbr.lu", "national_company_register"),
  MT: manual("Malta Business Registry", "https://mbr.mt/", "national_company_register"),
  NL: manual("KVK Business Register", "https://www.kvk.nl/english/ordering-products-from-the-commercial-register/", "national_company_register"),
  PL: manual("National Court Register", "https://ekrs.ms.gov.pl/web/wyszukiwarka-krs/strona-glowna/index.html", "national_company_register"),
  PT: manual("Institute of Registries and Notary", "https://irn.justica.gov.pt/", "national_company_register"),
  RO: manual("National Trade Register Office", "https://www.onrc.ro/index.php/en", "national_company_register"),
  SK: BRIS,
  SI: manual("AJPES Business Register", "https://www.ajpes.si/prs/Default.asp?language=english", "national_company_register"),
  ES: manual("Registradores", "https://www.registradores.org", "national_company_register"),
  SE: manual("Bolagsverket / Verksamt — company name guidance", "https://verksamt.se/bolagsverket/hjalp-att-valja-foretagsnamn", "national_company_registration_guidance"),
  IS: manual("Iceland Revenue and Customs — Company Register", "https://www.skatturinn.is/fyrirtaekjaskra/", "national_company_register"),
  LI: manual("Liechtenstein — company index and register access", "https://www.llv.li/en/business/register-cadastre/commercial-register-hr-/company-index---excerpt-from-the-commercial-register", "business_register_directory"),
  NO: manual("Brønnøysund Register Centre", "https://www.brreg.no/en/searching-our-registers/", "national_company_register"),
};

// Official human-facing services. Public search does not authorize automated bulk querying.
const EXTRA_MARKET_SOURCES = {
  GB: {
    company: manual("Companies House", "https://www.gov.uk/guidance/searching-the-companies-house-register", "national_company_register"),
    trademark: manual("UK Intellectual Property Office", "https://www.gov.uk/search-for-trademark", "national_trademark_search"),
  },
  CH: {
    company: manual("Zefix", "https://www.zefix.admin.ch/en/search/entity/welcome", "national_company_register"),
    trademark: manual("Swissreg / IPI", "https://www.ige.ch/en/services/digital-resources/databases-and-directories/swissreg/trade-mark-database", "national_trademark_search"),
  },
  CA: {
    company: manual("Canada — business name and registry guidance", "https://www.canada.ca/en/services/business/start/choosing-a-business-name-2.html", "business_register_directory"),
    trademark: manual("Canadian Intellectual Property Office", "https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/trademarks/introduction-canadian-trademarks-database", "national_trademark_search"),
  },
  AU: {
    company: manual("ASIC — companies and organizations", "https://www.asic.gov.au/online-services/search-asic-registers/company-and-organisation-registers", "national_company_register"),
    trademark: manual("IP Australia — trademark search", "https://search.ipaustralia.gov.au/trademarks", "national_trademark_search"),
  },
  NZ: {
    company: manual("New Zealand Companies Register", "https://app.companiesoffice.govt.nz/companies/app/ui/pages/companies/search", "national_company_register"),
    trademark: manual("IPONZ — search and manage IP", "https://www.iponz.govt.nz/manage-ip/", "national_trademark_search"),
  },
  SG: {
    company: manual("ACRA Bizfile", "https://www.bizfile.gov.sg/home", "national_company_register"),
    trademark: manual("IPOS Digital Hub", "https://digitalhub.ipos.gov.sg/FAMN/eservice/IP4SG/MN_BasicSearch", "national_trademark_search"),
  },
  JP: {
    company: manual("National Tax Agency — Corporate Number directory (English subset)", "https://www.houjin-bangou.nta.go.jp/en/", "corporate_identity_directory"),
    trademark: manual("Japan Patent Office — J-PlatPat search guide", "https://www.jpo.go.jp/e/support/j_platpat/trademark_search.html", "national_trademark_search"),
  },
} satisfies Partial<Record<NamePackageMarketCode, { company: NamePackageMarketSource; trademark: NamePackageMarketSource }>>;
const EEA_TRADEMARK_SOURCES: Partial<Record<NamePackageMarketCode, NamePackageMarketSource>> = {
  NO: manual("Norwegian Industrial Property Office", "https://www.patentstyret.no/en/search-databases", "national_trademark_search"),
  IS: manual("Icelandic Intellectual Property Office", "https://isipo.is/en/search/trademark", "national_trademark_search"),
};

/** Strict, deterministic normalization. An invalid selection must never silently widen the scope. */
export function normalizeNamePackageMarkets(value: readonly string[] = DEFAULT_NAME_PACKAGE_MARKETS): NamePackageMarketCode[] {
  if (!Array.isArray(value) || !value.length || value.length > NAME_PACKAGE_MARKET_CODES.length
    || value.some(code => !NAME_PACKAGE_MARKET_CODES.includes(code as NamePackageMarketCode))) throw new Error("Select supported markets.");
  const selected = new Set(value);
  return NAME_PACKAGE_MARKET_CODES.filter(code => selected.has(code));
}

/** A review plan, not evidence from a register: no network calls and no checked country claims. */
export function buildNamePackageMarketCoverage(markets?: readonly string[]): NamePackageMarketCoverage {
  const requested = normalizeNamePackageMarkets(markets);
  return namePackageMarketCoverageSchema.parse({
    catalog_version: NAME_PACKAGE_MARKET_CATALOG_VERSION, requested_markets: requested,
    checked_markets: [], automated_checks_available: false,
    checks: requested.map(market => {
      const usa = market === "US", eu = EU_NAME_PACKAGE_MARKETS.includes(market as typeof EU_NAME_PACKAGE_MARKETS[number]);
      const extra = market in EXTRA_MARKET_SOURCES ? EXTRA_MARKET_SOURCES[market as keyof typeof EXTRA_MARKET_SOURCES] : null;
      const nationalTrademark = EEA_TRADEMARK_SOURCES[market];
      const company = usa
        ? manual("U.S. Small Business Administration — state registration", "https://www.sba.gov/counseling/launch-your-business/", "state_company_registration_guidance")
        : extra?.company ?? EUROPEAN_COMPANY_REGISTERS[market as keyof typeof EUROPEAN_COMPANY_REGISTERS];
      const trademarks = usa
        ? [manual("USPTO — federal trademark search", "https://www.uspto.gov/trademarks/search", "federal_trademark_search")]
        : extra ? [extra.trademark] : eu ? [EUIPO] : nationalTrademark ? [nationalTrademark] : [WIPO];
      return { market, company: { status: "not_checked", sources: [company] }, trademark: { status: "not_checked", sources: trademarks },
        required_follow_up: usa ? ["not_legal_clearance", "choose_us_state", "state_and_unregistered_rights"]
          : eu ? ["not_legal_clearance", "national_company_rules", "national_and_regional_trademarks"]
            : market === "CA" ? ["not_legal_clearance", "national_company_rules", "subnational_register_coverage"]
              : market === "JP" ? ["not_legal_clearance", "national_company_rules", "language_limited_directory"]
                : extra || nationalTrademark ? ["not_legal_clearance", "national_company_rules"]
            : ["not_legal_clearance", "national_company_rules", "participating_collections_only"],
      };
    }),
  });
}
