import type { Language } from "./LanguageProvider";

export const namePackageResultCopy: Record<Language, {
  count: string; targetCount: string; partial: string; availability: string; taken: string; unknown: string;
  boundaries: string; adjust: string; failedTitle: string; failedEmpty: string; failedRetained: string; failedNext: string;
}> = {
  en: {
    count: "Candidate name packages: {count}", targetCount: "{count} of {target} candidate name packages",
    partial: "This search returned only {count} distinct names to compare. We have not added filler to reach {target}. This was a limited search, not proof that no other names exist.",
    availability: "Names with at least one currently verified available domain: {available} of {count}.",
    taken: "Only registered domains among the selected extensions: {count}.",
    unknown: "No confirmed available domain: {count}. Checks are missing, incomplete or out of date.",
    boundaries: "These are candidates, not fully cleared brands. Company names, trademarks and social-handle registration remain unverified.",
    adjust: "Adjust the brief or domain extensions", failedTitle: "No new result this time",
    failedEmpty: "No new result was produced. We cannot confirm whether this was caused by a lack of candidates or unavailable checks.",
    failedRetained: "No new result was produced. The previous results below are unchanged and do not answer the latest search.",
    failedNext: "Adjust the brief or domain extensions above and search again. If checks are temporarily unavailable, retry later.",
  },
  sv: {
    count: "{count} namnförslag med paket", targetCount: "{count} av {target} namnförslag med paket",
    partial: "Den här sökningen gav bara {count} olika namn att jämföra. Vi har inte fyllt ut listan för att nå {target}. Sökningen var begränsad — det betyder inte att det saknas fler namn.",
    availability: "{available} av {count} paket har minst en domän som är verifierat ledig med aktuell kontroll.",
    taken: "{count} paket har enbart registrerade domäner bland de valda ändelserna.",
    unknown: "{count} paket saknar bekräftat ledig domän eftersom en eller flera kontroller saknas, är ofullständiga eller för gamla.",
    boundaries: "Det här är förslag, inte färdigkontrollerade varumärken. Företagsnamn, varumärkesrätt och registrering av sociala användarnamn är ännu inte verifierade.",
    adjust: "Ändra beskrivning eller domänändelser", failedTitle: "Inget nytt resultat den här gången",
    failedEmpty: "Sökningen gav inget nytt resultat. Vi kan inte avgöra om det beror på för få kandidater eller att kontroller inte kunde slutföras.",
    failedRetained: "Sökningen gav inget nytt resultat. Dina tidigare resultat nedan är oförändrade och besvarar inte den senaste sökningen.",
    failedNext: "Ändra beskrivning eller domänändelser ovan och sök igen. Om kontrollerna tillfälligt inte fungerar kan du försöka senare.",
  },
  es: {
    count: "Propuestas de nombre con paquete: {count}", targetCount: "{count} de {target} propuestas de nombre con paquete",
    partial: "Esta búsqueda solo devolvió {count} nombres distintos para comparar. No hemos añadido relleno para llegar a {target}. La búsqueda fue limitada: no significa que no existan más nombres.",
    availability: "Nombres con al menos un dominio cuya disponibilidad está verificada y vigente: {available} de {count}.",
    taken: "Solo dominios registrados entre las extensiones elegidas: {count}.",
    unknown: "Sin ningún dominio disponible confirmado: {count}. Faltan comprobaciones, están incompletas o han caducado.",
    boundaries: "Son candidatos, no marcas plenamente validadas. Las denominaciones sociales, las marcas y el registro de nombres de usuario siguen sin verificarse.",
    adjust: "Cambiar la descripción o las extensiones", failedTitle: "Esta vez no hay resultados nuevos",
    failedEmpty: "No se obtuvo un resultado nuevo. No podemos confirmar si faltaban candidatos o si las comprobaciones no estaban disponibles.",
    failedRetained: "No se obtuvo un resultado nuevo. Los resultados anteriores siguen sin cambios y no responden a la última búsqueda.",
    failedNext: "Cambia la descripción o las extensiones de arriba y vuelve a buscar. Si las comprobaciones no están disponibles temporalmente, inténtalo más tarde.",
  },
  fr: {
    count: "Propositions de noms avec leurs éléments : {count}", targetCount: "{count} sur {target} propositions de noms avec leurs éléments",
    partial: "Cette recherche n’a renvoyé que {count} noms distincts à comparer. Aucun nom n’a été ajouté pour atteindre {target}. La recherche était limitée : cela ne prouve pas qu’il n’existe aucun autre nom.",
    availability: "Noms avec au moins un domaine dont la disponibilité est vérifiée et récente : {available} sur {count}.",
    taken: "Uniquement des domaines enregistrés parmi les extensions choisies : {count}.",
    unknown: "Sans domaine confirmé disponible : {count}. Certaines vérifications manquent, sont incomplètes ou trop anciennes.",
    boundaries: "Il s’agit de candidats, pas de marques entièrement validées. Les noms d’entreprise, les marques et l’enregistrement des identifiants sociaux restent à vérifier.",
    adjust: "Modifier la description ou les extensions", failedTitle: "Aucun nouveau résultat cette fois",
    failedEmpty: "Aucun nouveau résultat n’a été produit. Nous ne pouvons pas confirmer s’il manquait des candidats ou si les vérifications étaient indisponibles.",
    failedRetained: "Aucun nouveau résultat n’a été produit. Les résultats précédents ci-dessous sont inchangés et ne répondent pas à la dernière recherche.",
    failedNext: "Modifiez la description ou les extensions ci-dessus et relancez la recherche. Si les vérifications sont temporairement indisponibles, réessayez plus tard.",
  },
  zh: {
    count: "{count} 个候选命名方案", targetCount: "目标 {target} 个，本次获得 {count} 个候选命名方案",
    partial: "本次搜索仅返回 {count} 个不同的名称供比较。我们没有为了凑齐 {target} 个而添加名称。这是一次有限搜索，并不代表没有其他合适的名称。",
    availability: "{count} 个方案中，{available} 个至少有一个域名经近期核查确认可注册。",
    taken: "{count} 个方案在所选后缀下的域名均已注册。",
    unknown: "{count} 个方案尚无确认可注册的域名，因为部分核查缺失、未完成或已经过期。",
    boundaries: "这些是候选方案，并非已获全面批准的品牌。企业名称、商标权以及社交用户名能否注册，仍未核实。",
    adjust: "调整描述或域名后缀", failedTitle: "本次没有新结果",
    failedEmpty: "本次未产生新结果。我们无法确认是候选名称不足，还是核查暂时无法完成。",
    failedRetained: "本次未产生新结果。下方之前的结果保持不变，不对应最新一次搜索。",
    failedNext: "请调整上方的描述或域名后缀后重新搜索。如果核查暂时不可用，请稍后重试。",
  },
};

export function packageResultText(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) => key in values ? String(values[key]) : match);
}
