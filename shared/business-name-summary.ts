import { z } from "zod/v4";
import type { NamePackageIntelligence } from "./name-package-intelligence.js";

type Package = NamePackageIntelligence["packages"][number];
type Locale = "en" | "sv" | "es" | "fr" | "zh";
const count = z.number().int().min(0).max(10);
export const businessNameSummarySchema = z.strictObject({
  locale: z.enum(["en", "sv", "es", "fr", "zh"]),
  headline: z.string().min(1).max(250),
  explanation: z.string().min(1).max(3000),
  counts: z.strictObject({
    requested: count.min(1), returned: count, missing: count,
    candidate_limit: count.min(1), generated_candidates: count,
    assessed_candidates: count, eligible_candidates: count,
    registered_only_candidates: count, unconfirmed_candidates: count, unassessed_candidates: count,
  }),
  reasons: z.array(z.strictObject({
    code: z.enum(["requested_domains_taken", "availability_unconfirmed", "candidates_not_assessed", "insufficient_candidates_generated"]),
    candidate_count: count.min(1), message: z.string().min(1).max(700),
  })).max(4),
  next_steps: z.array(z.strictObject({
    action: z.enum(["review_results", "change_endings", "refine_brief", "retry_checks"]),
    label: z.string().min(1).max(500),
  })).min(1).max(3),
}).superRefine((value, context) => {
  const c = value.counts;
  if (c.missing !== c.requested - c.returned || c.returned !== Math.min(c.requested, c.eligible_candidates)
    || c.assessed_candidates !== c.eligible_candidates + c.registered_only_candidates + c.unconfirmed_candidates
    || c.generated_candidates !== c.assessed_candidates + c.unassessed_candidates
    || c.generated_candidates > c.candidate_limit) {
    context.addIssue({ code: "custom", message: "Summary counts must describe the same bounded search without overlap." });
  }
});
export type BusinessNameSummary = z.infer<typeof businessNameSummarySchema>;

/** Eligibility and explanations share the exact same evidence predicate. */
export function eligibleBusinessDomains(pkg: Package, tlds: readonly string[]) {
  return pkg.evidence.domains.filter(domain => domain.status === "available" && domain.authoritative
    && domain.freshness.status === "fresh" && domain.classification === "OBSERVED" && !domain.requested_alternative
    && tlds.some(tld => domain.domain === `${pkg.canonical_name}.${tld}`));
}

const copy: Record<Locale, {
  headline: (returned: number, requested: number) => string;
  assessed: (n: number) => string;
  missing: (n: number) => string;
  registered: (n: number) => string;
  unconfirmed: (n: number) => string;
  unassessed: (n: number) => string;
  generated: (n: number) => string;
  bounded: (n: number) => string;
  criterion: string;
  review: string; endings: string; brief: string; retry: string;
}> = {
  en: {
    headline: (n, target) => `Found ${n} of ${target} requested names.`,
    assessed: n => `We assessed ${n} candidate names in this run.`,
    missing: n => `${n} more names are needed to reach your requested count.`,
    registered: n => `${n} candidates were excluded because every selected domain ending was observed registered.`,
    unconfirmed: n => `${n} candidates were excluded because an available domain could not be confirmed. Unknown or outdated status does not mean a domain is taken.`,
    unassessed: n => `${n} generated candidates had no assessment result. Their availability is unknown.`,
    generated: n => `This brief produced only ${n} candidate names to assess.`,
    bounded: n => `This was a limited search of up to ${n} candidates, not an exhaustive search of all available names.`,
    criterion: "Every recommendation had at least one selected domain ending observed available at the stated check time. This does not establish company-name or trademark rights.",
    review: "Review the names and recheck domain availability before choosing.",
    endings: "Select additional domain endings and run a new search.",
    brief: "Adjust the business description or keywords to explore different names.",
    retry: "Retry the unconfirmed domain checks later; repeating the same brief does not generate a new candidate pool.",
  },
  sv: {
    headline: (n, target) => `Vi hittade ${n} av ${target} önskade namn.`,
    assessed: n => `Vi granskade ${n} namnförslag i den här körningen.`,
    missing: n => `Det saknas ${n} namn för att nå det antal du bad om.`,
    registered: n => `${n} förslag valdes bort eftersom samtliga valda domänändelser var registrerade vid kontrollen.`,
    unconfirmed: n => `${n} förslag valdes bort eftersom ingen ledig domän kunde bekräftas. Okänd eller inaktuell status betyder inte att domänen är upptagen.`,
    unassessed: n => `${n} genererade förslag saknade kontrollresultat. Deras tillgänglighet är okänd.`,
    generated: n => `Beskrivningen gav bara ${n} namnförslag att granska.`,
    bounded: n => `Sökningen var begränsad till högst ${n} förslag. Den omfattade inte alla namn som kan vara lediga.`,
    criterion: "Varje rekommenderat namn hade minst en vald domänändelse som var ledig vid den angivna kontrolltiden. Det innebär inte rätt till företagsnamnet eller varumärket.",
    review: "Granska namnen och kontrollera domänstatus igen innan du väljer.",
    endings: "Välj fler domänändelser och gör en ny sökning.",
    brief: "Ändra verksamhetsbeskrivningen eller nyckelorden för att få andra namnförslag.",
    retry: "Kontrollera de obekräftade domänerna igen senare. Samma beskrivning ger inte en ny uppsättning namn.",
  },
  es: {
    headline: (n, target) => `Encontramos ${n} de los ${target} nombres solicitados.`,
    assessed: n => `Evaluamos ${n} candidatos en esta búsqueda.`,
    missing: n => `Faltan ${n} nombres para alcanzar la cantidad solicitada.`,
    registered: n => `Se excluyeron ${n} candidatos porque todas las extensiones seleccionadas figuraban como registradas.`,
    unconfirmed: n => `Se excluyeron ${n} candidatos porque no pudimos confirmar ningún dominio disponible. Un estado desconocido o desactualizado no significa que el dominio esté registrado.`,
    unassessed: n => `${n} candidatos generados no tenían resultados de comprobación. Su disponibilidad es desconocida.`,
    generated: n => `La descripción solo produjo ${n} candidatos para evaluar.`,
    bounded: n => `Esta búsqueda se limitó a ${n} candidatos; no abarcó todos los nombres que podrían estar disponibles.`,
    criterion: "Cada recomendación tenía al menos una extensión seleccionada disponible en la fecha indicada. Esto no acredita derechos sobre nombres de empresa ni marcas.",
    review: "Revisa los nombres y comprueba de nuevo los dominios antes de elegir.",
    endings: "Selecciona más extensiones de dominio y realiza una nueva búsqueda.",
    brief: "Modifica la descripción del negocio o las palabras clave para explorar otros nombres.",
    retry: "Vuelve a comprobar más tarde los dominios sin confirmar; repetir la misma descripción no genera nuevos candidatos.",
  },
  fr: {
    headline: (n, target) => `Nous avons trouvé ${n} noms sur les ${target} demandés.`,
    assessed: n => `Nous avons examiné ${n} propositions lors de cette recherche.`,
    missing: n => `Il manque ${n} noms pour atteindre le nombre demandé.`,
    registered: n => `${n} propositions ont été écartées car toutes les extensions sélectionnées étaient déjà enregistrées lors du contrôle.`,
    unconfirmed: n => `${n} propositions ont été écartées faute de domaine dont la disponibilité pouvait être confirmée. Un statut inconnu ou ancien ne signifie pas que le domaine est pris.`,
    unassessed: n => `${n} propositions générées n’avaient aucun résultat de contrôle. Leur disponibilité reste inconnue.`,
    generated: n => `La description n’a produit que ${n} propositions à examiner.`,
    bounded: n => `Cette recherche était limitée à ${n} propositions et ne couvrait pas tous les noms potentiellement disponibles.`,
    criterion: "Chaque nom recommandé avait au moins une extension sélectionnée disponible à la date indiquée. Cela ne prouve aucun droit sur un nom d’entreprise ou une marque.",
    review: "Examinez les noms et vérifiez à nouveau les domaines avant de choisir.",
    endings: "Sélectionnez d’autres extensions et lancez une nouvelle recherche.",
    brief: "Modifiez la description de l’activité ou les mots-clés pour explorer d’autres noms.",
    retry: "Réessayez plus tard les contrôles non confirmés ; la même description ne génère pas de nouveaux candidats.",
  },
  zh: {
    headline: (n, target) => `已找到所需 ${target} 个名称中的 ${n} 个。`,
    assessed: n => `本次评估了 ${n} 个候选名称。`,
    missing: n => `距离您要求的数量还差 ${n} 个名称。`,
    registered: n => `${n} 个候选被排除，因为所选的全部域名后缀在检查时均已注册。`,
    unconfirmed: n => `${n} 个候选被排除，因为无法确认其域名可注册。状态未知或过时不等于域名已被注册。`,
    unassessed: n => `${n} 个已生成的候选没有检查结果，其可注册状态未知。`,
    generated: n => `该业务描述仅生成了 ${n} 个候选名称供评估。`,
    bounded: n => `本次搜索最多评估 ${n} 个候选，并未穷尽所有可能可用的名称。`,
    criterion: "每个推荐名称至少有一个所选域名后缀在所示检查时间可注册。这不代表拥有企业名称或商标权。",
    review: "查看推荐名称，并在选择前再次检查域名状态。",
    endings: "选择更多域名后缀并重新搜索。",
    brief: "调整业务描述或关键词以探索其他名称。",
    retry: "稍后重试尚未确认的域名；重复相同描述不会生成新的候选名称。",
  },
};

export function buildBusinessNameSummary(input: {
  locale: Locale; requestedCount: number; returnedCount: number; candidateLimit: number;
  generatedCount: number; tlds: readonly string[]; intelligence: NamePackageIntelligence;
}): BusinessNameSummary {
  const { packages } = input.intelligence;
  let eligible = 0, registered = 0;
  for (const pkg of packages) {
    if (eligibleBusinessDomains(pkg, input.tlds).length) { eligible++; continue; }
    if (input.tlds.every(tld => pkg.evidence.domains.some(domain =>
      domain.domain === `${pkg.canonical_name}.${tld}` && !domain.requested_alternative
      && domain.status === "taken" && domain.authoritative && domain.classification === "OBSERVED"
      && domain.freshness.status === "fresh"))) registered++;
  }
  const unconfirmed = packages.length - eligible - registered;
  const unassessed = input.generatedCount - packages.length;
  const missing = input.requestedCount - input.returnedCount;
  const text = copy[input.locale];
  const reasons: BusinessNameSummary["reasons"] = [];
  if (missing) {
    if (registered) reasons.push({ code: "requested_domains_taken", candidate_count: registered, message: text.registered(registered) });
    if (unconfirmed) reasons.push({ code: "availability_unconfirmed", candidate_count: unconfirmed, message: text.unconfirmed(unconfirmed) });
    if (unassessed) reasons.push({ code: "candidates_not_assessed", candidate_count: unassessed, message: text.unassessed(unassessed) });
    if (input.generatedCount < input.requestedCount) reasons.push({ code: "insufficient_candidates_generated",
      candidate_count: input.requestedCount - input.generatedCount, message: text.generated(input.generatedCount) });
  }
  const next_steps: BusinessNameSummary["next_steps"] = missing ? [
    ...(unconfirmed || unassessed ? [{ action: "retry_checks" as const, label: text.retry }] : []),
    { action: "change_endings", label: text.endings }, { action: "refine_brief", label: text.brief },
  ] : [{ action: "review_results", label: text.review }];
  return businessNameSummarySchema.parse({
    locale: input.locale, headline: text.headline(input.returnedCount, input.requestedCount),
    explanation: [text.assessed(packages.length), ...reasons.map(reason => reason.message),
      ...(missing ? [text.missing(missing)] : []), text.criterion, text.bounded(input.candidateLimit)].join(" "),
    counts: { requested: input.requestedCount, returned: input.returnedCount, missing, candidate_limit: input.candidateLimit,
      generated_candidates: input.generatedCount, assessed_candidates: packages.length, eligible_candidates: eligible,
      registered_only_candidates: registered, unconfirmed_candidates: unconfirmed, unassessed_candidates: unassessed },
    reasons, next_steps,
  });
}
