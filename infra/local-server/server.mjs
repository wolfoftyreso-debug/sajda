/*
 * Standalone loopback runtime for immediate local use on a workstation.
 *
 * This is intentionally separate from the production Supabase deployment:
 * it provides the safe search core (candidate generation, authoritative RDAP
 * checks and transparent screening) without exposing a database, auth API,
 * service-role key, or HTTP listener to the LAN.
 */

import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = Number(process.env.NAME_QUEST_LOCAL_PORT ?? 8080);
const ALGORITHM_VERSION = "2.0.0";
const MAX_BODY_BYTES = 8_192;
const SEARCH_LIMIT_PER_MINUTE = 8;
const DEFAULT_SEARCH_CANDIDATES = 50;
const MIN_SEARCH_CANDIDATES = 50;
const MAX_SEARCH_CANDIDATES = 60;
const SUPPORTED_TLDS = new Set(["com", "net", "org", "io", "ai", "co", "dev", "app", "se", "nu", "me", "info"]);
const SUPPORTED_LOCALES = new Set(["en", "sv"]);

const REGISTRATION_PRICE_ESTIMATES_USD = {
  com: 12, net: 14, org: 13, io: 45, ai: 75, co: 28,
  dev: 18, app: 18, se: 16, nu: 18, me: 20, info: 18,
};

const TLD_SCORES = { com: 18, ai: 15, io: 13, co: 11, dev: 9, app: 8, se: 9, org: 7, net: 6, nu: 5, me: 5, info: 2 };
const MARKET_BASELINES_USD = { com: 120, ai: 85, io: 70, co: 55, dev: 50, app: 45, se: 38, org: 34, net: 30, nu: 24, me: 25, info: 18 };
const ROOTS = [
  "aero", "arc", "atlas", "aurora", "axis", "bloom", "brio", "cirra", "coda", "coral", "craft", "delta", "drift", "echo",
  "ember", "fable", "flux", "forge", "glint", "harbor", "helio", "horizon", "juniper", "kite", "lumen", "mosaic", "nexus",
  "nova", "orbit", "pivot", "prism", "pulse", "quest", "rally", "ridge", "signal", "solace", "spark", "summit", "terra",
  "tidal", "vector", "verve", "vista", "vivid", "zenith", "ande", "arv", "berg", "brisa", "bygd", "dalen", "driva", "eko",
  "form", "fram", "glimt", "gron", "hem", "klar", "kust", "lagom", "ljus", "mark", "nord", "plats", "saga", "skog", "sol",
  "spira", "stig", "trygg", "varde", "vax", "vind", "viva",
];
const PREFIXES = ["alta", "aura", "brio", "civo", "claro", "evo", "faro", "lumo", "nivo", "nova", "oro", "pico", "sora", "vela", "vero"];
const SUFFIXES = ["base", "craft", "flow", "forge", "grid", "labs", "link", "loop", "nest", "pilot", "point", "scope", "stack", "studio", "works", "zone"];
const KNOWN_WORDS = new Set([...ROOTS, "app", "art", "bank", "book", "brand", "care", "code", "data", "design", "food", "home", "idea", "life", "mind", "name", "pay", "shop", "tech", "web", "work"]);
const COMMERCIAL_SUFFIXES = new Set(["base", "craft", "flow", "forge", "grid", "lab", "labs", "link", "loop", "nest", "pilot", "point", "scope", "stack", "studio", "works", "zone"]);

let cachedBootstrap = null;
const rateLimits = new Map();

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeLocale(value) {
  return typeof value === "string" && SUPPORTED_LOCALES.has(value.toLowerCase())
    ? value.toLowerCase()
    : "en";
}

function localMessage(locale, key) {
  const messages = {
    en: {
      invalidTlds: "Select at least one supported TLD",
      tooManySearches: "Too many searches. Please wait one minute.",
      invalidSearch: "Invalid search",
      noRdapSource: "No authoritative RDAP source for this TLD",
      rdapRateLimit: "RDAP rate limit reached",
      rdapTimeout: "RDAP timed out",
      rdapFailed: "RDAP lookup failed",
    },
    sv: {
      invalidTlds: "Välj minst en stödd TLD",
      tooManySearches: "För många sökningar. Vänta en minut.",
      invalidSearch: "Ogiltig sökning",
      noRdapSource: "Ingen auktoritativ RDAP-källa för TLD",
      rdapRateLimit: "RDAP-kvot uppnådd",
      rdapTimeout: "RDAP-timeout",
      rdapFailed: "RDAP-kontroll misslyckades",
    },
  };
  return messages[locale]?.[key] ?? messages.en[key];
}

function asciiToken(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeTlds(input) {
  if (!Array.isArray(input)) return [];
  const result = [];
  for (const value of input) {
    if (typeof value !== "string") continue;
    const tld = value.trim().toLowerCase().replace(/^\./, "");
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(tld) || !SUPPORTED_TLDS.has(tld) || result.includes(tld)) continue;
    result.push(tld);
  }
  return result.slice(0, 4);
}

function normalizeDomain(value) {
  if (typeof value !== "string" || value.length > 253 || /\s/.test(value)) return null;
  const source = value.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  if (!source) return null;
  try {
    const hostname = new URL(`http://${source}`).hostname.toLowerCase();
    const labels = hostname.split(".");
    if (labels.length !== 2 || labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;
    if (!SUPPORTED_TLDS.has(labels[1])) return null;
    return hostname;
  } catch {
    return null;
  }
}

function makeSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

function themeTokens(theme) {
  if (typeof theme !== "string") return [];
  return [...new Set(theme.split(/[\s,;:/|+]+/).map(asciiToken).filter((value) => value.length >= 3 && value.length <= 14))].slice(0, 8);
}

function generateCandidates(tlds, count, theme) {
  const tokens = themeTokens(theme);
  const roots = [...new Set([...tokens, ...ROOTS])];
  const random = seededRandom(makeSeed(`${tlds.join(",")}|${tokens.join(",")}|${ALGORITHM_VERSION}`));
  const labels = new Set();
  const add = (value) => {
    const label = asciiToken(value);
    if (/^[a-z0-9]{3,25}$/.test(label)) labels.add(label);
  };

  for (const token of tokens) {
    add(token);
    add(`${token}${pick(SUFFIXES, random)}`);
    add(`${pick(PREFIXES, random)}${token}`);
  }
  for (let attempt = 0; attempt < Math.max(count * 30, 400) && labels.size < count * 3; attempt += 1) {
    const root = pick(roots, random);
    const companion = pick(roots, random);
    switch (attempt % 5) {
      case 0: add(`${root}${pick(SUFFIXES, random)}`); break;
      case 1: add(`${pick(PREFIXES, random)}${root}`); break;
      case 2: add(`${root.slice(0, 4)}${companion.slice(0, 4)}`); break;
      case 3: add(`${root}${companion.slice(0, 3)}`); break;
      default: add(`${pick(PREFIXES, random)}${companion.slice(0, 5)}`); break;
    }
  }

  const domains = [];
  for (const label of labels) {
    for (const tld of tlds) {
      domains.push(`${label}.${tld}`);
      if (domains.length >= count) return domains;
    }
  }
  return domains;
}

function priceEstimate(domain) {
  return REGISTRATION_PRICE_ESTIMATES_USD[domain.split(".").at(-1)] ?? 18;
}

function screenDomain(domain, locale = "en") {
  const label = domain.split(".")[0];
  const tld = domain.split(".")[1];
  const lengthScore = label.length <= 3 ? 38 : label.length === 4 ? 32 : label.length === 5 ? 25 : label.length === 6 ? 18 : label.length <= 8 ? 12 : label.length <= 10 ? 7 : label.length <= 12 ? 3 : 0;
  const vowels = (label.match(/[aeiouy]/g) ?? []).length;
  let pronounceabilityScore = vowels / Math.max(label.length, 1) >= 0.25 && vowels / Math.max(label.length, 1) <= 0.65 ? 7 : 2;
  if (!/[bcdfghjklmnpqrstvwxz]{4}/.test(label)) pronounceabilityScore += 3;
  if (!/(.)\1\1/.test(label)) pronounceabilityScore += 2;
  const dictionaryScore = KNOWN_WORDS.has(label) ? 12 : (KNOWN_WORDS.has(label.slice(0, 4)) || KNOWN_WORDS.has(label.slice(-4)) ? 5 : 0);
  const commercialScore = [...COMMERCIAL_SUFFIXES].some((suffix) => label.endsWith(suffix)) ? 4 : (label.length <= 6 ? 2 : 0);
  const penalties = (label.includes("-") || /\d/.test(label) ? -20 : 0) + (/(.)\1\1/.test(label) ? -5 : 0);
  const totalScore = clamp(lengthScore + (TLD_SCORES[tld] ?? 3) + pronounceabilityScore + dictionaryScore + commercialScore + penalties, 0, 100);
  const estimate = Math.round(clamp((MARKET_BASELINES_USD[tld] ?? 22) * Math.pow(1.075, Math.max(0, totalScore - 30)), priceEstimate(domain) * 1.5, 50_000));
  const confidence = Math.round(clamp(28 + Math.min(20, totalScore * 0.28) + (dictionaryScore > 0 ? 7 : 0) + (TLD_SCORES[tld] ? 4 : 0), 25, 75));
  return {
    estimatedValue: estimate,
    confidenceScore: confidence,
    signals: { labelLength: label.length, lengthScore, tldScore: TLD_SCORES[tld] ?? 3, pronounceabilityScore, dictionaryScore, commercialScore, penalties },
    rationale: locale === "sv"
      ? `Algoritm ${ALGORITHM_VERSION}: ${label.length} tecken, .${tld}, ${dictionaryScore > 0 ? "tydlig ordsignal" : "varumärkesbarhets-signal"}. Screeningvärde i USD – inte bekräftat marknadsvärde eller registrarpris.`
      : `Algorithm ${ALGORITHM_VERSION}: ${label.length} characters, .${tld}, ${dictionaryScore > 0 ? "clear word signal" : "brandability signal"}. Screening value in USD — not a confirmed market value or registrar price.`,
  };
}

async function getRdapEndpoint(tld) {
  if (!cachedBootstrap || cachedBootstrap.expiresAt <= Date.now()) {
    const response = await fetch("https://data.iana.org/rdap/dns.json", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`IANA bootstrap HTTP ${response.status}`);
    const bootstrap = await response.json();
    const endpoints = new Map();
    for (const service of bootstrap.services ?? []) {
      const [listedTlds, urls] = service;
      const endpoint = urls.find((url) => typeof url === "string" && url.startsWith("https://"));
      if (!endpoint) continue;
      for (const listed of listedTlds) endpoints.set(String(listed).toLowerCase(), endpoint);
    }
    cachedBootstrap = { endpoints, expiresAt: Date.now() + 24 * 60 * 60 * 1_000 };
  }
  return cachedBootstrap.endpoints.get(tld) ?? null;
}

async function checkAvailability(domain, locale = "en") {
  const tld = domain.split(".")[1];
  try {
    const endpoint = await getRdapEndpoint(tld);
    if (!endpoint) return { domain, tld, status: "unknown", checkMethod: "none", error: localMessage(locale, "noRdapSource") };
    const response = await fetch(new URL(`domain/${encodeURIComponent(domain)}`, endpoint), {
      headers: { Accept: "application/rdap+json, application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404) return { domain, tld, status: "available", checkMethod: "rdap", registrationPriceEstimate: priceEstimate(domain) };
    if (response.status >= 200 && response.status < 300) return { domain, tld, status: "taken", checkMethod: "rdap" };
    return { domain, tld, status: "unknown", checkMethod: "rdap", error: response.status === 429 ? localMessage(locale, "rdapRateLimit") : `RDAP HTTP ${response.status}` };
  } catch (error) {
    const message = error?.name === "TimeoutError" || error?.name === "AbortError"
      ? localMessage(locale, "rdapTimeout")
      : localMessage(locale, "rdapFailed");
    console.warn(`[local-search] ${domain}: ${message}`);
    return { domain, tld, status: "unknown", checkMethod: "none", error: message };
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

function send(response, status, body, contentType = "application/json; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  });
  response.end(body);
}

function sendJson(response, status, payload) {
  send(response, status, JSON.stringify(payload));
}

async function readJson(request, locale = "en") {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error(locale === "sv" ? "Begäran är för stor" : "Request body is too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  const parsed = JSON.parse(text || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(locale === "sv" ? "JSON-objekt krävs" : "A JSON object is required");
  return parsed;
}

function rateLimit(request) {
  const identity = request.socket.remoteAddress ?? "loopback";
  const now = Date.now();
  const current = rateLimits.get(identity);
  if (!current || now - current.startedAt >= 60_000) {
    rateLimits.set(identity, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= SEARCH_LIMIT_PER_MINUTE) return false;
  current.count += 1;
  return true;
}

const LOCALIZED_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sajda – local domain search</title><style>
:root{color-scheme:dark;--bg:#07101d;--card:#101c2d;--line:#22344d;--text:#e8f1ff;--muted:#9cb0c9;--accent:#21d4d4}*{box-sizing:border-box}body{margin:0;font:16px system-ui,-apple-system,Segoe UI,sans-serif;background:radial-gradient(circle at top,#123457,#07101d 55%);color:var(--text);min-height:100vh}.shell{max-width:1100px;margin:auto;padding:42px 20px 64px}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}h1{font-size:clamp(2rem,5vw,3.6rem);margin:0 0 10px;letter-spacing:-.05em}p{color:var(--muted);line-height:1.5}.panel,.result{background:#0c1726e8;border:1px solid var(--line);border-radius:18px;box-shadow:0 18px 60px #0004}.panel{padding:22px;margin:28px 0}label{display:block;font-weight:650;margin:0 0 8px}.theme{width:100%;border-radius:10px;border:1px solid var(--line);background:#07101d;color:var(--text);padding:13px;font:inherit}.controls{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:end;margin-top:18px}.tlds{display:flex;flex-wrap:wrap;gap:8px}.tld{border:1px solid var(--line);border-radius:999px;padding:7px 10px;color:var(--muted);cursor:pointer}.tld input{accent-color:var(--accent)}.count{width:76px;border-radius:8px;border:1px solid var(--line);padding:10px;background:#07101d;color:var(--text);font:inherit}button{border:0;border-radius:10px;padding:13px 20px;font-weight:750;font:inherit;color:#001e22;background:var(--accent);cursor:pointer}button:disabled{opacity:.55;cursor:wait}.language{display:flex;gap:3px;padding:3px;border:1px solid var(--line);border-radius:999px}.language-choice{padding:6px 9px;border-radius:999px;background:transparent;color:var(--muted);font-size:.78rem}.language-choice[aria-pressed="true"]{background:var(--accent);color:#001e22}.notice{font-size:.9rem;margin-top:17px}.summary{margin:26px 0 13px;font-weight:650}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}.result{padding:17px}.domain{font-size:1.2rem;font-weight:750;word-break:break-all}.status{display:inline-block;margin:9px 0;border-radius:99px;padding:4px 8px;font-size:.78rem;font-weight:750}.available{background:#1b5639;color:#b7ffd4}.taken{background:#4c3340;color:#ffd6de}.unknown{background:#4d4228;color:#ffe4a1}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.metric{padding:9px;background:#081321;border-radius:9px}.metric b{display:block;font-size:1rem}.metric span{font-size:.76rem;color:var(--muted)}.rationale{font-size:.84rem;margin:0}.error{color:#ffb4b4}.foot{font-size:.8rem;margin-top:25px}@media(max-width:600px){.controls{grid-template-columns:1fr}.shell{padding-top:28px}.top{flex-direction:column}.language{align-self:flex-end}}
</style></head><body><main class="shell"><div class="top"><div><h1>Sajda</h1><p id="intro"></p></div><div class="language" role="group" aria-label="Language"><button class="language-choice" type="button" data-language="en" aria-pressed="true">EN</button><button class="language-choice" type="button" data-language="sv" aria-pressed="false">SV</button></div></div><section class="panel"><label id="theme-label" for="theme"></label><input id="theme" class="theme" maxlength="100"><div class="controls"><div><label id="tlds-label"></label><div class="tlds" id="tlds"></div></div><div><label id="count-label" for="count"></label><input id="count" class="count" type="number" min="50" max="60" value="50"></div></div><div style="margin-top:20px"><button id="search" type="button"></button></div><p id="target" class="notice"></p><p id="notice" class="notice"></p></section><div id="summary" class="summary" aria-live="polite"></div><section id="results" class="grid" aria-live="polite"></section><p id="foot" class="foot"></p></main><script>
const copy={en:{title:"Sajda – local domain search",intro:"Local domain discovery with creative word combinations and RDAP verification. Every search begins with at least 50 name paths; a domain is shown as available only when registry RDAP returns <code>404</code>.",themeLabel:"Theme or keywords (optional)",placeholder:"e.g. sustainable health or software",tldsLabel:"Extensions",countLabel:"Count",search:"Search domains",checking:"Checking {count} domains…",working:"Creating and checking {count} creative candidates…",target:"Target: at least 50 creative suggestions per search.",notice:"The algorithm combines theme words, short forms, and compounds. Price and value are screening signals in USD, not a quote or market valuation. Always verify with the registrar before buying.",foot:"Only this computer can reach the service (127.0.0.1). RDAP requires internet access to IANA and registry servers.",available:"Available",taken:"Taken",unknown:"Unknown",registrationPrice:"Registration estimate",screeningValue:"Screening value",signalConfidence:"Signal confidence",source:"Source",searchFailed:"Search failed",error:"Error",summary:"Checked {checked} domains · {available} available · {unknown} uncertain"},sv:{title:"Sajda – lokal domänsökning",intro:"Lokal domänsökning med kreativa ordkombinationer och RDAP-kontroll. Varje sökning börjar med minst 50 namnspår; en domän visas som ledig endast när registry-RDAP svarar <code>404</code>.",themeLabel:"Tema eller nyckelord (valfritt)",placeholder:"t.ex. hållbar hälsa eller software",tldsLabel:"Ändelser",countLabel:"Antal",search:"Sök domäner",checking:"Kontrollerar {count} domäner…",working:"Skapar och registry-kontrollerar {count} kreativa kandidater…",target:"Mål: minst 50 kreativa förslag per sökning.",notice:"Algoritmen blandar temaord, kortformer och sammansättningar. Pris och värde är screening-signaler i USD, inte offert eller marknadsvärdering. Kontrollera alltid hos registrar innan köp.",foot:"Endast denna dator kan nå tjänsten (127.0.0.1). RDAP kräver internetåtkomst till IANA och registry-servrar.",available:"Tillgänglig",taken:"Upptagen",unknown:"Okänd",registrationPrice:"Prisestimat",screeningValue:"Screeningvärde",signalConfidence:"Signalsäkerhet",source:"Källa",searchFailed:"Sökningen misslyckades",error:"Fel",summary:"Kontrollerade {checked} domäner · {available} tillgängliga · {unknown} osäkra"}};
const tlds=["com","io","se","nu","ai","dev","app","net","org","co"],root=document.getElementById("tlds"),button=document.getElementById("search"),summary=document.getElementById("summary"),results=document.getElementById("results");let language=localStorage.getItem("name-quest.legacy-language")==="sv"?"sv":"en",latest=null;
for(const tld of tlds){const label=document.createElement("label"),box=document.createElement("input");label.className="tld";box.type="checkbox";box.value=tld;box.checked=["com","se","io"].includes(tld);label.append(box,document.createTextNode("."+tld));root.append(label)}
function text(key,values={}){return Object.entries(values).reduce((value,[name,replacement])=>value.replace("{"+name+"}",String(replacement)),copy[language][key])}
function money(value){return new Intl.NumberFormat(language==="sv"?"sv-SE":"en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(value)}
function field(label,value){const el=document.createElement("div"),b=document.createElement("b"),s=document.createElement("span");el.className="metric";b.textContent=value;s.textContent=label;el.append(b,s);return el}
function render(items){results.replaceChildren();for(const item of items){const card=document.createElement("article"),name=document.createElement("div"),status=document.createElement("span"),description=document.createElement("p");card.className="result";name.className="domain";name.textContent=item.domain;status.className="status "+item.status;status.textContent=item.status==="available"?text("available"):item.status==="taken"?text("taken"):text("unknown");card.append(name,status);if(item.status==="available"){const metrics=document.createElement("div");metrics.className="metrics";metrics.append(field(text("registrationPrice"),money(item.registrationPriceEstimate)),field(text("screeningValue"),money(item.estimatedValue)),field(text("signalConfidence"),item.confidenceScore+"/100"),field(text("source"),"RDAP"));card.append(metrics)}description.className="rationale"+(item.error?" error":"");description.textContent=item.error||item.rationale;card.append(description);results.append(card)}}
function renderSummary(data){summary.textContent=text("summary",{checked:data.checked,available:data.available,unknown:data.unknown})}
function setLanguage(next){language=next==="sv"?"sv":"en";localStorage.setItem("name-quest.legacy-language",language);document.documentElement.lang=language;document.title=text("title");document.getElementById("intro").innerHTML=text("intro");document.getElementById("theme-label").textContent=text("themeLabel");document.getElementById("theme").placeholder=text("placeholder");document.getElementById("tlds-label").textContent=text("tldsLabel");document.getElementById("count-label").textContent=text("countLabel");document.getElementById("target").textContent=text("target");document.getElementById("notice").textContent=text("notice");document.getElementById("foot").textContent=text("foot");if(!button.disabled)button.textContent=text("search");for(const choice of document.querySelectorAll("[data-language]"))choice.setAttribute("aria-pressed",String(choice.dataset.language===language));if(latest){renderSummary(latest);render(latest.results)}}
async function search(){const selected=[...root.querySelectorAll("input:checked")].map((input)=>input.value),count=Math.min(60,Math.max(50,Number(document.getElementById("count").value)||50));button.disabled=true;button.textContent=text("checking",{count});summary.className="summary";summary.textContent=text("working",{count});results.replaceChildren();try{const response=await fetch("/api/search?locale="+encodeURIComponent(language),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({theme:document.getElementById("theme").value,tlds:selected,count,locale:language})}),data=await response.json();if(!response.ok)throw new Error(data.error||text("searchFailed"));data.results.sort((a,b)=>({available:0,unknown:1,taken:2}[a.status]-({available:0,unknown:1,taken:2}[b.status])||(b.estimatedValue||0)-(a.estimatedValue||0)));latest=data;renderSummary(data);render(data.results)}catch(error){summary.textContent=text("error")+": "+error.message;summary.className="summary error"}finally{button.disabled=false;button.textContent=text("search")}}
button.addEventListener("click",search);for(const choice of document.querySelectorAll("[data-language]"))choice.addEventListener("click",()=>setLanguage(choice.dataset.language));setLanguage(language);
</script></body></html>`;

function renderLocalSearchPage() {
  return LOCALIZED_PAGE;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  const requestLocale = normalizeLocale(url.searchParams.get("locale"));
  if (request.method === "GET" && url.pathname === "/") return send(response, 200, renderLocalSearchPage(), "text/html; charset=utf-8");
  if (request.method === "GET" && url.pathname === "/api/health") return sendJson(response, 200, { ok: true, engine: "standalone-local", algorithmVersion: ALGORITHM_VERSION });
  if (request.method !== "POST" || url.pathname !== "/api/search") return sendJson(response, 404, { error: "Not found" });
  if (!rateLimit(request)) return sendJson(response, 429, { error: localMessage(requestLocale, "tooManySearches") });

  try {
    const body = await readJson(request, requestLocale);
    const locale = SUPPORTED_LOCALES.has(String(body.locale ?? "").toLowerCase())
      ? normalizeLocale(body.locale)
      : requestLocale;
    const tlds = normalizeTlds(body.tlds);
    if (tlds.length === 0) return sendJson(response, 400, { error: localMessage(locale, "invalidTlds") });
    const count = clamp(
      Math.trunc(Number(body.count) || DEFAULT_SEARCH_CANDIDATES),
      MIN_SEARCH_CANDIDATES,
      MAX_SEARCH_CANDIDATES,
    );
    const theme = typeof body.theme === "string" ? body.theme.slice(0, 100) : "";
    const candidates = generateCandidates(tlds, count, theme);
    const checked = await mapWithConcurrency(candidates, 4, async (domain) => {
      const availability = await checkAvailability(domain, locale);
      return availability.status === "available" ? { ...availability, ...screenDomain(domain, locale) } : availability;
    });
    return sendJson(response, 200, {
      locale,
      algorithmVersion: ALGORITHM_VERSION,
      checked: checked.length,
      available: checked.filter((item) => item.status === "available").length,
      unknown: checked.filter((item) => item.status === "unknown").length,
      results: checked,
    });
  } catch (error) {
    console.error("[local-search] request failed", error);
    return sendJson(response, 400, {
      error: error instanceof SyntaxError
        ? localMessage(requestLocale, "invalidSearch")
        : error instanceof Error ? error.message : localMessage(requestLocale, "invalidSearch"),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Sajda local search is running at http://${HOST}:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
