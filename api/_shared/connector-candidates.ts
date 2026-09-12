import { NAMES_API_TLDS } from "./names-contract.js";
import { asciiNameToken, joinNameWords, nameQualitySignals } from "./search-quality.mjs";

export interface ConnectorCandidateInput {
  query: string;
  tlds: string[];
  /** Candidate-pool size, not the final shortlist size. */
  count?: number;
  /** Optional caller-provided labels, never domains, URLs or instructions. */
  candidateSeeds?: string[];
}
export type ConnectorCandidateDirection = "benefit" | "descriptive" | "metaphor" | "audience" | "brandable" | "host_seed";
export interface ConnectorCandidate {
  domain: string; label: string; tld: string; direction: ConnectorCandidateDirection;
  /** Local language/form heuristic, not market value, availability or trademark clearance. */
  namingScore: number; rationale: string; source: "rules" | "host_seed";
}
type Language = "en" | "sv";
interface Concept {
  id: string; title: Record<Language, string>; triggers: string[];
  roots: Record<Language, string[]>; companions: Record<Language, string[]>;
}
const words = (value: string): string[] => value.split(" ");
const concept = (id: string, en: string, sv: string, triggers: string, rootsEn: string, rootsSv: string,
  companionsEn: string, companionsSv: string): Concept => ({ id, title: { en, sv }, triggers: words(triggers),
  roots: { en: words(rootsEn), sv: words(rootsSv) }, companions: { en: words(companionsEn), sv: words(companionsSv) } });

// Product jobs supply the anchors. Audience adjectives and words such as
// "app" never become adjacent raw-token compounds like "appindependent".
const concepts: Concept[] = [
  concept("planning", "planning and focus", "planering och fokus",
    "plan plans planning planner productivity productive task tasks calendar schedule routine focus agenda planering planerar planerings kalender schema uppgift uppgifter produktiv fokus",
    "plan day pace focus task agenda route week", "plan dag takt fokus steg tid kalender ordning",
    "lane grove harbor path pilot flow nest trail view rhythm", "stig rum nav lyft blick glimt spar verk kompass lund"),
  concept("finance", "money and financial organisation", "ekonomi och ordning",
    "finance financial budget money accounting bookkeeping savings saving wealth ledger invoice invoices ekonomi ekonomisk pengar bokforing bokfor redovisning spara sparande faktura saldo",
    "ledger penny budget balance folio tally saving coin", "saldo krona budget balans spara bokfor konto faktura",
    "nest lane view harbor guide leaf compass grove path wise", "blick nav rum stig balans glimt verk lund spar kompass"),
  concept("design", "design and creative work", "design och skapande",
    "design designer designing creative studio graphic typography branding art illustration fotograf photo photography designstudio formgivning formgivare kreativ skapande konst foto fotografi",
    "form pixel canvas frame craft shape color studio", "form farg linje ram skiss atelje yta bild",
    "grove loom lane nest field thread tide bloom harbor muse", "verk rum lund glimt nav vav stig spar blick huset"),
  concept("wellbeing", "care and wellbeing", "hälsa och omsorg",
    "health healthy wellness wellbeing meditation sleep mental fitness care healthcare halsa halsovard vard omsorg valmaende meditation somn sov traning",
    "care rest pulse vital mind sleep bloom kind", "halsa vila puls balans omsorg somn ro kraft",
    "nest grove path harbor leaf spring lane meadow circle rhythm", "rum stig lund glimt nav kompass lyft blick vagen huset"),
  concept("learning", "learning and discovery", "lärande och kunskap",
    "learn learning discovery education educational school lesson skill study studying tutor teaching course courses larande lara utbildning skola lektion kunskap kurs studier lasa undervisning",
    "learn lesson skill study mentor note curio school", "lara kunskap studie skola lasa lektion tanke kurs",
    "path grove spark nest spring trail field compass lane bloom", "stig glimt rum lyft nav lund verk spar kompass huset"),
  concept("food", "food and hospitality", "mat och gästfrihet",
    "food restaurant cooking cook kitchen bakery cafe coffee tea catering pizza dining bread mat restaurang kok kock bageri kafe kaffe catering pizza brod fika",
    "kitchen grain table harvest crumb brew bean bite", "mat kok bord skord brod brygg bona fika",
    "grove craft nook lane field nest leaf circle harbor bloom", "rum verk lund glimt nav huset garden hantverk stigen bord"),
  concept("commerce", "shops and customer experience", "handel och kundupplevelse",
    "shop store retail ecommerce commerce marketplace shopping sales butik webbutik webbshop handel ehandel marknad salj kundupplevelse",
    "shop market basket cart shelf parcel trade order", "butik handel korg varu paket torg order hylla",
    "lane grove nest harbor trail craft circle field path bloom", "rum nav stig verk lund glimt huset blick lyft spar"),
  concept("construction", "building and craft", "byggande och hantverk",
    "build builder building construction contractor carpentry repair workshop architecture architect bygg byggfirma byggforetag snickare hantverk verkstad arkitektur arkitekt renovering",
    "beam craft frame stone roof build timber structure", "bygg tak grund hus stomme tra form hantverk",
    "line grove forge field craft harbor lane nest mark pillar", "verk linje lund glimt rum mark nav kraft spar huset"),
  concept("nature", "nature and sustainable living", "natur och hållbarhet",
    "nature garden gardening eco ecology sustainable sustainability forest plants plant environment outdoor natur tradgard ekologisk eko hallbar hallbarhet skog vaxt vaxter miljo odling friluft",
    "leaf grove root green bloom garden earth seed", "lov skog rot gron blom odla jord fro",
    "path craft nest lane field spring circle trail harbor rhythm", "stig verk rum lund glimt garden nav spar liv vagen"),
  concept("technology", "software and developer tools", "programvara och utveckling",
    "code coding software developer developers programming api data analytics saas technology technical cloud automation developer-tools kod kodning programvara utvecklare programmering data analys teknik teknisk moln automatisering",
    "code data logic signal stack query sync byte", "kod data logik signal flode nod analys moln",
    "lane forge grove nest harbor craft thread path field compass", "verk nav stig rum glimt lund spar blick kompass huset"),
  concept("security", "privacy and security", "integritet och säkerhet",
    "security secure privacy private protection protect encryption cybersecurity authentication sakerhet saker privat integritet skydd kryptering autentisering",
    "guard vault trust shield lock key proof quiet", "vakt valv trygg skydd las nyckel tillit varna",
    "lane harbor grove nest circle path field bridge craft mark", "rum verk nav stig lund blick glimt kompass spar huset"),
  concept("travel", "travel and exploration", "resor och upptäckter",
    "travel tourism tourist trip journey hiking adventure maps navigation resor resa turism turist vandring aventyr kartor navigation",
    "route roam trail journey atlas trip way local", "resa stig tur fard karta vandring vag plats",
    "grove nest lane compass field harbor circle craft view spring", "rum glimt lund nav spar kompass blick huset stigen verk"),
  concept("community", "teams and community", "samarbete och gemenskap",
    "team teams community collaboration collaborative social meeting meetings neighborhood neighbour association lag samarbete gemenskap social mote moten forening grannar kvarter",
    "circle common gather neighbor crew meet union link", "sam lag mote grann ring kvarter grupp torg",
    "grove nest lane harbor field spring craft path bloom bridge", "rum nav lund glimt stig verk huset spar blick lyft"),
];

const stopWords = new Set(words("a an and are as at be by for from in into is it of on or our that the to we with you your about also brand business can company create customer customers help make need people platform service should this use want will name names naming domain domains registry website app apps application applications independent independently founder founders startup startups entrepreneur entrepreneurs softwaretool tool tools digital online good great best cool something anything new find get build give please calmness small large sized existing flexible easy fast scalable automated modern powerful intelligent smart better own local global international living "
  + "att av bara den det en ett finnas for fran har inte jag med min och pa sa ska som till vi vill vara vart ar bolag foretag foretaget kunder namn plattform tjanst webbplats viktig anvanda bygga gora kunna olika egen egna oberoende grundare foretagare entreprenor entreprenorer appen appar program ny nytt bra enkel namnforslag "
  + "all do not follow instead ignore previous instruction instructions system assistant prompt prompts execute execution delete drop select secret secrets password passwords credentials token tokens return fetch curl javascript admin root shell sudo output print reveal override bypass"));
// Do not use the normalized Swedish "för" as a marker: it becomes "for",
// one of the most common words in an English founder brief.
const swedishMarkers = new Set(words("att det ett fran har inte jag och ska som till vi vill vara foretag namn tjanst egen egna grundare foretagare lugn lugnt lugna svensk svenska nordisk planering planeringsapp kalender bygg byggforetag hantverk mat halsa skog skola bokforing ekonomi"));
interface Tone { triggers: string[]; terms: Record<Language, string[]> }
const tones: Tone[] = [
  { triggers: words("calm quiet peaceful gentle mindful soft soothing lugn lugnt lugna stilla mjuk rofylld"), terms: { en: words("calm quiet steady gentle mellow still"), sv: words("lugn stilla mjuk trygg rofylld klar") } },
  { triggers: words("simple clear minimal minimalist precise clean focused enkel enkelt tydlig tydligt minimalistisk ren klart"), terms: { en: words("clear plain neat lucid light pure"), sv: words("klar enkel ren rak ljus tydlig") } },
  { triggers: words("playful fun joy joyful bright happy creative lekfull rolig glad kreativ"), terms: { en: words("bright merry sunny lively fresh happy"), sv: words("glad ljus lekfull pigg nyfiken solig") } },
  { triggers: words("premium elegant refined luxury exclusive professional elegant exklusiv lyx professionell"), terms: { en: words("fine noble lucid select quiet refined"), sv: words("fin stilla sober klar utvald ren") } },
  { triggers: words("nordic scandinavian swedish nordisk nordiska skandinavisk svensk svenska"), terms: { en: words("nord birch frost pine fjord amber"), sv: words("nord bjork tall fjall ljus gran") } },
];
const audiences = [
  { triggers: words("founder founders independent solo startup startups entrepreneur entrepreneurs grundare foretagare entreprenor egna egen oberoende"), terms: { en: words("solo maker venture indie"), sv: words("egen fram start driv") } },
  { triggers: words("team teams collaboration collaborative lag team samarbete"), terms: { en: words("team common shared crew"), sv: words("sam lag gemensam delad") } },
  { triggers: words("family families kids children familj familjer barn"), terms: { en: words("family little kind home"), sv: words("familj liten glad hemma") } },
];
const genericParts = new Set([...stopWords, ...tones.flatMap(tone => [...tone.triggers, ...tone.terms.en, ...tone.terms.sv])]);
const genericSingles = new Set([...genericParts, ...concepts.flatMap(entry => [...entry.triggers, ...entry.roots.en, ...entry.roots.sv, ...entry.companions.en, ...entry.companions.sv])]);
const match = (token: string, trigger: string): boolean => token === trigger || trigger.length >= 5 && token.startsWith(trigger);
const distinct = (values: string[]): string[] => [...new Set(values)];
const lexical = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function onlyGenericParts(label: string): boolean {
  const reached = new Set([0]);
  for (let start = 0; start < label.length; start++) {
    if (!reached.has(start)) continue;
    for (let end = start + 2; end <= label.length; end++) if (genericParts.has(label.slice(start, end))) reached.add(end);
  }
  return reached.has(label.length);
}
function safeLabel(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40 || !/^(?:\p{Script=Latin}\p{M}*)+$/u.test(value)
    || /\p{Default_Ignorable_Code_Point}/u.test(value)) return null;
  const label = asciiNameToken(value);
  if (!/^[a-z]{6,20}$/u.test(label) || genericSingles.has(label) || onlyGenericParts(label)
    || /(.)\1\1/u.test(label) || /^(.{2,})\1$/u.test(label) || nameQualitySignals(label).score < 65) return null;
  return label;
}
function safeHostLabel(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 63
    || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(value)) return null;
  const label = value.toLowerCase();
  if (label.startsWith("xn--") || genericSingles.has(label) || onlyGenericParts(label)
    || /(.)\1\1/u.test(label) || /^(.{2,})\1$/u.test(label)) return null;
  return label;
}
interface LabelCandidate { label: string; direction: ConnectorCandidateDirection; score: number; rationale: string; anchor: string; source: "rules" | "host_seed" }

/** Pure, bounded naming exploration. Every returned domain still needs registry
 * and exact-price checks; ranking is lexical relevance/form plus diversity. */
export function generateConnectorCandidates(input: ConnectorCandidateInput): ConnectorCandidate[] {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some(key => !["query", "tlds", "count", "candidateSeeds"].includes(key))
    || typeof input.query !== "string" || input.query.trim().length < 1 || input.query.length > 100
    || !Array.isArray(input.tlds) || input.tlds.length < 1 || input.tlds.length > NAMES_API_TLDS.length
    || input.tlds.some(tld => !NAMES_API_TLDS.includes(tld as typeof NAMES_API_TLDS[number])) || new Set(input.tlds).size !== input.tlds.length
    || input.count !== undefined && (!Number.isInteger(input.count) || input.count < 1 || input.count > 120)
    || input.candidateSeeds !== undefined && (!Array.isArray(input.candidateSeeds) || input.candidateSeeds.length > 30)) throw new Error("Invalid connector candidate request.");
  const query = input.query.trim();
  if (Array.from(query).some(character => { const point = character.codePointAt(0)!; return point < 32 || point === 127 || point >= 0xd800 && point <= 0xdfff; })
    || /(?:[a-z][a-z\d+.-]*:\/\/|\b(?:https?|mailto|javascript|data):|(?:^|[\s([{])\/\/)/iu.test(query)
    || /[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?(?:\.[\p{L}][\p{L}\p{N}-]{1,62})+/iu.test(query)
    || /[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[\u3002\uff0e\uff61][a-z]{2,63}/iu.test(query)
    || /[<>]/u.test(query)) throw new Error("Use a plain naming brief without URLs, domains or markup.");
  const count = input.count ?? 120;
  const tokens = distinct((query.toLowerCase().match(/\p{L}+/gu) ?? []).map(asciiNameToken).filter(Boolean));
  const language: Language = tokens.some(token => swedishMarkers.has(token)) || /[åäö]/iu.test(query) ? "sv" : "en";
  const matched = concepts.map(entry => ({ entry, hits: tokens.filter(token => entry.triggers.some(trigger => match(token, trigger))) }))
    .filter(value => value.hits.length).sort((a, b) => b.hits.length - a.hits.length || tokens.indexOf(a.hits[0]) - tokens.indexOf(b.hits[0])).slice(0, 2);
  const selectedTones = tones.filter(tone => tokens.some(token => tone.triggers.some(trigger => match(token, trigger))));
  const audienceTerms = distinct(audiences.filter(audience => tokens.some(token => audience.triggers.some(trigger => match(token, trigger)))).flatMap(audience => audience.terms[language]));
  const ignored = new Set([...stopWords, ...tones.flatMap(tone => tone.triggers), ...audiences.flatMap(audience => audience.triggers)]);
  const references = tokens.filter(token => token.length >= 3 && token.length <= 12 && /^[a-z]+$/u.test(token)
    && ![...ignored].some(trigger => match(token, trigger)) && !concepts.some(entry => entry.triggers.some(trigger => match(token, trigger)))).slice(0, matched.length ? 2 : 4);
  const anchors = distinct([...matched.flatMap(value => value.entry.roots[language]), ...references]).slice(0, 18);
  const modifiers = distinct(selectedTones.flatMap(tone => tone.terms[language]));
  if (!modifiers.length) modifiers.push(...(language === "sv" ? words("klar fin ljus trygg ny") : words("clear bright kind fresh open")));
  const companions = distinct(matched.flatMap(value => value.entry.companions[language]));
  if (!companions.length) companions.push(...(language === "sv" ? words("verk rum stig nav glimt lund blick spar lyft huset") : words("craft lane grove nest path guide field harbor view loom")));
  const tools = language === "sv" ? words("plan blick verk guide karta bok tavla nav rum") : words("desk guide book board map kit notes canvas compass");
  const topic = matched.map(value => value.entry.title[language]).join(language === "sv" ? " och " : " and ") || (language === "sv" ? "dina nyckelord" : "your supplied keywords");
  const labels = new Map<string, LabelCandidate>();
  const add = (raw: string, direction: ConnectorCandidateDirection, relevance: number, anchor: string, left: string, right: string, source: "rules" | "host_seed" = "rules") => {
    const label = source === "host_seed" ? safeHostLabel(raw) : safeLabel(raw);
    if (!label) return;
    const score = Math.min(94, Math.round(nameQualitySignals(label).score * 0.62 + relevance));
    const explanation = source === "host_seed"
      ? language === "sv" ? "Namnspår från den anslutna assistenten; stavning och form har granskats lokalt, inte betydelse eller rättigheter."
        : "Name supplied by the connected assistant; spelling and form were screened locally, not meaning or rights."
      : language === "sv" ? `Kombinerar ${left} och ${right} som namnspår för ${topic}.`
        : `Combines ${left} and ${right} as a naming direction for ${topic}.`;
    const rationale = `${explanation} ${language === "sv" ? "Heuristik, inte värdering eller tillgänglighetsbesked." : "A heuristic, not a valuation or availability check."}`;
    const candidate = { label, direction, score, rationale, anchor, source };
    const current = labels.get(label);
    if (!current || score > current.score || score === current.score && current.source === "host_seed" && source === "rules") labels.set(label, candidate);
  };
  for (const anchor of anchors) {
    for (const modifier of modifiers) add(joinNameWords(modifier, anchor), "benefit", 29, anchor, modifier, anchor);
    for (const companion of companions) add(joinNameWords(anchor, companion), "metaphor", 24, anchor, anchor, companion);
    for (const tool of tools) add(joinNameWords(anchor, tool), "descriptive", 26, anchor, anchor, tool);
    for (const audience of audienceTerms) add(joinNameWords(audience, anchor), "audience", 25, anchor, audience, anchor);
    if (anchor.length <= 7 && /[^aeiouy]$/u.test(anchor)) {
      for (const ending of words("ora iva ara ello via uno")) add(joinNameWords(anchor, ending), "brandable", 20, anchor, anchor, ending);
    }
  }
  for (const seed of input.candidateSeeds ?? []) {
    const label = safeHostLabel(seed);
    if (!label) continue;
    const anchor = anchors.find(value => label.includes(value));
    add(label, "host_seed", anchor ? 27 : 15, anchor ?? label, "", "", "host_seed");
  }
  // Prefer genuinely different labels, not one name repeated under every TLD.
  // A modest diversity penalty stops one root/direction monopolising the pool;
  // namingScore itself remains the unmodified, explainable language heuristic.
  const pending = [...labels.values()];
  const selected: LabelCandidate[] = [];
  const directions = new Map<string, number>(), anchorCounts = new Map<string, number>();
  while (pending.length && selected.length < count) {
    const rank = (value: LabelCandidate) => value.score - (directions.get(value.direction) ?? 0) * 1.5 - (anchorCounts.get(value.anchor) ?? 0) * 2;
    pending.sort((a, b) => rank(b) - rank(a) || b.score - a.score || lexical(a.label, b.label));
    const next = pending.shift()!;
    selected.push(next);
    directions.set(next.direction, (directions.get(next.direction) ?? 0) + 1);
    anchorCounts.set(next.anchor, (anchorCounts.get(next.anchor) ?? 0) + 1);
  }
  return selected.map((candidate, index) => {
    const tld = input.tlds[index % input.tlds.length];
    return { domain: `${candidate.label}.${tld}`, label: candidate.label, tld, direction: candidate.direction,
      namingScore: candidate.score, rationale: candidate.rationale, source: candidate.source };
  });
}
