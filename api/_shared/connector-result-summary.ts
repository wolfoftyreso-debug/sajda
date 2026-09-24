import type { ConnectorShortlistRequest, ConnectorShortlistResult } from "./connector-shortlist.js";

type Locale = ConnectorShortlistRequest["locale"];
type Reason = "availability_unconfirmed" | "over_budget" | "price_unconfirmed" | "unusable_observations";
type Action = "review_results" | "adjust_search" | "adjust_budget" | "retry_later" | "contact_support";
type Stop = "target_reached" | "candidate_pool_exhausted" | "work_limit" | "provider_unavailable"
  | "exact_pricing_not_configured" | "registrar_authorization_required" | "provider_rate_limited";
type Copy = {
  headline: (returned: number, requested: number) => string;
  missing: (n: number) => string;
  provisional: (n: number) => string;
  reasons: Record<Reason, (n: number) => string>;
  stops: Record<Stop, string>;
  actions: Record<Action, string>;
  unknownStop: string;
  caveat: string;
};

const copy: Record<Locale, Copy> = {
  en: {
    headline: (n, total) => `Found ${n} of ${total} requested domains with confirmed prices within your budget.`,
    missing: n => `${n} confirmed matches are still missing.`,
    provisional: n => `${n} additional ideas have only extension-price estimates. They do not count as confirmed budget matches.`,
    reasons: {
      availability_unconfirmed: n => `${n} checks lacked current, confirmed availability. Unknown or outdated status does not mean a domain is taken.`,
      over_budget: n => `${n} candidates were excluded because the compared price exceeded the budget.`,
      price_unconfirmed: n => `${n} candidates lacked a usable, current exact-domain price in the requested currency.`,
      unusable_observations: n => `${n} observations were unusable because domain data was unsupported, duplicated or conflicting.`,
    },
    stops: {
      target_reached: "The requested number of confirmed matches was reached.",
      candidate_pool_exhausted: "The available candidate pool for this search was exhausted. This does not mean no other suitable domains exist.",
      work_limit: "This search reached its time or provider-check limit before confirming the requested number.",
      provider_unavailable: "The registrar price service could not complete its checks. Missing prices remain unconfirmed.",
      exact_pricing_not_configured: "Sajda's exact-domain price connection is not configured. Changing your budget will not fix that connection.",
      registrar_authorization_required: "Sajda's registrar price connection was rejected and needs attention from support. Changing your budget will not fix it.",
      provider_rate_limited: "The registrar temporarily limited price checks; the remaining prices could not be confirmed.",
    },
    actions: { review_results: "Review the confirmed matches and confirm taxes and final price with the registrar.",
      adjust_search: "Change the brief, name ideas or domain endings and search again.", adjust_budget: "Increase the budget only if it suits your needs, then search again.",
      retry_later: "Try again later to recheck availability and prices; more results are not guaranteed.", contact_support: "Contact Sajda support about the registrar price connection." },
    unknownStop: "The checks did not establish the requested number of confirmed matches; missing results remain unconfirmed.",
    caveat: "No domain is reserved or purchased. These are observed prices, not guaranteed final checkout totals.",
  },
  sv: {
    headline: (n, total) => `Vi hittade ${n} av ${total} önskade domäner med bekräftat pris inom din budget.`,
    missing: n => `Det saknas fortfarande ${n} bekräftade träffar.`,
    provisional: n => `${n} ytterligare idéer har bara uppskattade priser för domänändelsen. De räknas inte som bekräftade budgetträffar.`,
    reasons: {
      availability_unconfirmed: n => `${n} kontroller saknade aktuell, bekräftad tillgänglighet. Okänd eller inaktuell status betyder inte att domänen är upptagen.`,
      over_budget: n => `${n} förslag valdes bort eftersom jämförelsepriset låg över budgeten.`,
      price_unconfirmed: n => `${n} förslag saknade ett användbart, aktuellt pris för den exakta domänen i vald valuta.`,
      unusable_observations: n => `${n} observationer kunde inte användas eftersom domänuppgifterna saknade stöd, var dubblerade eller motsägelsefulla.`,
    },
    stops: {
      target_reached: "Vi nådde det antal bekräftade träffar du bad om.",
      candidate_pool_exhausted: "Förslagen i den här sökningen är genomgångna. Det betyder inte att det saknas andra lämpliga domäner.",
      work_limit: "Sökningen nådde sin tidsgräns eller gränsen för leverantörskontroller innan tillräckligt många träffar kunde bekräftas.",
      provider_unavailable: "Domänleverantörens pristjänst kunde inte slutföra kontrollerna. Saknade priser är fortfarande obekräftade.",
      exact_pricing_not_configured: "Sajdas anslutning för exakta domänpriser är inte konfigurerad. Att ändra budgeten löser inte anslutningsproblemet.",
      registrar_authorization_required: "Sajdas prisanslutning nekades av domänleverantören och behöver åtgärdas av supporten. Att ändra budgeten löser inte problemet.",
      provider_rate_limited: "Domänleverantören begränsade tillfälligt antalet priskontroller. Återstående priser kunde inte bekräftas.",
    },
    actions: { review_results: "Granska de bekräftade träffarna och kontrollera skatt och slutpris hos leverantören.",
      adjust_search: "Ändra beskrivningen, namnidéerna eller domänändelserna och sök igen.", adjust_budget: "Höj budgeten om det passar dig och gör sedan en ny sökning.",
      retry_later: "Försök igen senare för att kontrollera tillgänglighet och priser. Fler träffar kan inte garanteras.", contact_support: "Kontakta Sajdas support om anslutningen till domänleverantörens pristjänst." },
    unknownStop: "Kontrollerna gav inte det antal bekräftade träffar du bad om. Saknade resultat är fortfarande obekräftade.",
    caveat: "Ingen domän är reserverad eller köpt. Priserna är observationer, inte garanterade slutpriser i kassan.",
  },
  es: {
    headline: (n, total) => `Encontramos ${n} de los ${total} dominios solicitados con precios confirmados dentro de tu presupuesto.`,
    missing: n => `Aún faltan ${n} resultados confirmados.`,
    provisional: n => `${n} ideas adicionales solo tienen precios estimados de la extensión. No cuentan como resultados confirmados dentro del presupuesto.`,
    reasons: {
      availability_unconfirmed: n => `${n} comprobaciones no tenían disponibilidad actual confirmada. Un estado desconocido o desactualizado no significa que el dominio esté registrado.`,
      over_budget: n => `Se excluyeron ${n} candidatos porque el precio comparado superaba el presupuesto.`,
      price_unconfirmed: n => `${n} candidatos no tenían un precio actual y válido para el dominio exacto en la moneda solicitada.`,
      unusable_observations: n => `${n} observaciones no se pudieron utilizar porque los datos del dominio no eran compatibles, estaban duplicados o eran contradictorios.`,
    },
    stops: {
      target_reached: "Se alcanzó la cantidad de resultados confirmados solicitada.",
      candidate_pool_exhausted: "Se agotaron los candidatos de esta búsqueda. Esto no significa que no existan otros dominios adecuados.",
      work_limit: "La búsqueda alcanzó su límite de tiempo o de consultas al proveedor antes de confirmar la cantidad solicitada.",
      provider_unavailable: "El servicio de precios del registrador no pudo completar las comprobaciones. Los precios pendientes siguen sin confirmar.",
      exact_pricing_not_configured: "La conexión de Sajda para consultar precios de dominios exactos no está configurada. Cambiar el presupuesto no resolverá este problema.",
      registrar_authorization_required: "El registrador rechazó la conexión de precios de Sajda y el soporte debe revisarla. Cambiar el presupuesto no resolverá el problema.",
      provider_rate_limited: "El registrador limitó temporalmente las consultas de precios; no se pudieron confirmar los precios restantes.",
    },
    actions: { review_results: "Revisa los resultados confirmados y comprueba los impuestos y el precio final con el registrador.",
      adjust_search: "Modifica la descripción, las ideas de nombres o las extensiones y busca de nuevo.", adjust_budget: "Aumenta el presupuesto solo si te conviene y vuelve a buscar.",
      retry_later: "Inténtalo más tarde para volver a comprobar disponibilidad y precios; no se garantizan más resultados.", contact_support: "Contacta con el soporte de Sajda sobre la conexión de precios del registrador." },
    unknownStop: "Las comprobaciones no establecieron la cantidad de resultados solicitada; los resultados pendientes siguen sin confirmar.",
    caveat: "No se ha reservado ni comprado ningún dominio. Son precios observados, no importes finales garantizados.",
  },
  fr: {
    headline: (n, total) => `Nous avons trouvé ${n} des ${total} domaines demandés avec un prix confirmé dans votre budget.`,
    missing: n => `Il manque encore ${n} résultats confirmés.`,
    provisional: n => `${n} idées supplémentaires n'ont qu'un prix estimé pour l'extension. Elles ne comptent pas comme des résultats confirmés dans le budget.`,
    reasons: {
      availability_unconfirmed: n => `${n} vérifications n'avaient pas de disponibilité actuelle confirmée. Un statut inconnu ou périmé ne signifie pas que le domaine est enregistré.`,
      over_budget: n => `${n} candidats ont été exclus car le prix comparé dépassait le budget.`,
      price_unconfirmed: n => `${n} candidats n'avaient pas de prix actuel exploitable pour le domaine exact dans la devise demandée.`,
      unusable_observations: n => `${n} observations étaient inutilisables car les données de domaine étaient non prises en charge, dupliquées ou contradictoires.`,
    },
    stops: {
      target_reached: "Le nombre de résultats confirmés demandé a été atteint.",
      candidate_pool_exhausted: "Tous les candidats de cette recherche ont été examinés. Cela ne signifie pas qu'aucun autre domaine adapté n'existe.",
      work_limit: "La recherche a atteint sa limite de temps ou de vérifications auprès du fournisseur avant de confirmer le nombre demandé.",
      provider_unavailable: "Le service de prix du bureau d'enregistrement n'a pas pu terminer les vérifications. Les prix manquants restent non confirmés.",
      exact_pricing_not_configured: "La connexion de Sajda pour les prix des domaines exacts n'est pas configurée. Modifier votre budget ne résoudra pas ce problème.",
      registrar_authorization_required: "Le bureau d'enregistrement a refusé la connexion de prix de Sajda ; l'assistance doit intervenir. Modifier le budget ne résoudra pas le problème.",
      provider_rate_limited: "Le bureau d'enregistrement a temporairement limité les vérifications de prix ; les prix restants n'ont pas pu être confirmés.",
    },
    actions: { review_results: "Examinez les résultats confirmés et vérifiez les taxes et le prix final auprès du bureau d'enregistrement.",
      adjust_search: "Modifiez la description, les idées de noms ou les extensions, puis relancez la recherche.", adjust_budget: "Augmentez le budget seulement si cela vous convient, puis relancez la recherche.",
      retry_later: "Réessayez plus tard pour vérifier la disponibilité et les prix ; davantage de résultats ne sont pas garantis.", contact_support: "Contactez l'assistance Sajda au sujet de la connexion de prix du bureau d'enregistrement." },
    unknownStop: "Les vérifications n'ont pas établi le nombre de résultats demandé ; les résultats manquants restent non confirmés.",
    caveat: "Aucun domaine n'est réservé ni acheté. Il s'agit de prix observés, pas de totaux garantis au paiement.",
  },
  zh: {
    headline: (n, total) => `您请求了 ${total} 个域名，我们找到了 ${n} 个价格已确认且符合预算的结果。`,
    missing: n => `仍缺少 ${n} 个已确认的结果。`,
    provisional: n => `另有 ${n} 个建议仅提供域名后缀的估算价格，不计入已确认的预算内结果。`,
    reasons: {
      availability_unconfirmed: n => `${n} 项检查缺少当前已确认的可用状态。状态未知或过期并不意味着域名已被注册。`,
      over_budget: n => `${n} 个候选域名因用于比较的价格超出预算而被排除。`,
      price_unconfirmed: n => `${n} 个候选域名缺少以所选货币计价的有效、当前的确切域名价格。`,
      unusable_observations: n => `${n} 项记录因域名数据不受支持、重复或冲突而无法使用。`,
    },
    stops: {
      target_reached: "已达到您请求的已确认结果数量。",
      candidate_pool_exhausted: "本次搜索的候选项已全部检查完毕。这不意味着不存在其他合适的域名。",
      work_limit: "搜索在确认足够结果之前达到了时间或服务商查询次数上限。",
      provider_unavailable: "注册商的价格服务未能完成检查，缺失的价格仍未确认。",
      exact_pricing_not_configured: "Sajda 尚未配置确切域名价格查询连接。调整预算无法解决该连接问题。",
      registrar_authorization_required: "注册商拒绝了 Sajda 的价格查询连接，需要客服处理。调整预算无法解决此问题。",
      provider_rate_limited: "注册商暂时限制了价格查询，剩余价格未能确认。",
    },
    actions: { review_results: "查看已确认的结果，并向注册商核实税费和最终价格。", adjust_search: "修改业务描述、名称建议或域名后缀后重新搜索。",
      adjust_budget: "仅在符合您需求时提高预算，然后重新搜索。", retry_later: "稍后重试以重新核实可用状态和价格；无法保证获得更多结果。",
      contact_support: "就注册商价格查询连接问题联系 Sajda 客服。" },
    unknownStop: "检查未能确认您请求的结果数量，缺失结果仍未确认。",
    caveat: "没有域名被预订或购买。这些是观察到的价格，并非保证的最终结账总额。",
  },
};

/** Presentation only: no changes to eligibility, counts, provider work or budget. */
export function buildConnectorResultSummary(result: Pick<ConnectorShortlistResult,
  "requestedCount" | "confirmedCount" | "shortfall" | "provisionalCount" | "exclusions"> & { search: { stopReason: string } }, locale: Locale) {
  const text = copy[locale];
  const e = result.exclusions;
  const groups: Record<Reason, number> = {
    availability_unconfirmed: (e.not_available ?? 0) + (e.unverified_availability ?? 0) + (e.stale_availability ?? 0),
    over_budget: e.over_budget ?? 0,
    price_unconfirmed: (e.unpriced ?? 0) + (e.invalid_offer ?? 0) + (e.stale_price ?? 0)
      + (e.unconfirmed_exact_offer ?? 0) + (e.currency_unavailable ?? 0),
    unusable_observations: (e.unsupported_domain ?? 0) + (e.duplicate_domain ?? 0),
  };
  const reasons = (Object.keys(groups) as Reason[]).filter(code => groups[code] > 0)
    .map(code => ({ code, observation_count: groups[code], message: text.reasons[code](groups[code]) }));
  const stopReason = result.search.stopReason;
  const stop = Object.hasOwn(text.stops, stopReason) ? text.stops[stopReason as Stop] : text.unknownStop;
  const actions: Action[] = result.confirmedCount > 0 ? ["review_results"] : [];
  if (result.shortfall > 0) {
    if (["exact_pricing_not_configured", "registrar_authorization_required"].includes(stopReason)) actions.push("contact_support");
    else if (["provider_unavailable", "provider_rate_limited", "work_limit"].includes(stopReason)) actions.push("retry_later");
    else actions.push("adjust_search");
    if (groups.over_budget > 0 && !["exact_pricing_not_configured", "registrar_authorization_required"].includes(stopReason)) actions.push("adjust_budget");
  }
  return {
    locale, headline: text.headline(result.confirmedCount, result.requestedCount),
    explanation: [result.shortfall > 0 ? text.missing(result.shortfall) : "", stop, ...reasons.map(reason => reason.message),
      result.provisionalCount > 0 ? text.provisional(result.provisionalCount) : "", text.caveat].filter(Boolean).join(" "),
    counts: { requested: result.requestedCount, returned: result.confirmedCount, missing: result.shortfall, provisional: result.provisionalCount },
    stop_reason: stopReason, reasons, next_steps: actions.map(action => ({ action, label: text.actions[action] })),
  };
}
