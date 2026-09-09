import assert from "node:assert/strict";
import test from "node:test";
import { createLostDomainsEngine, extractSourceCandidates, rankAssessments, scoreLostDomainOpportunity, type LostDomainCandidate, type Assessment,
  type EngineDependencies } from "../api/_shared/lost-domains-engine";
import { createSafeFetcher } from "../api/_shared/lost-domains-fetch";
import { isLostDomainOpportunity } from "../shared/lost-domain-opportunity";
import { analyzeTradingMarketFit } from "../shared/trading-market-fit.js";

const instant = Date.parse("2026-09-09T10:00:00Z");
const source = { url: "https://source.example.com/resources", allowedHost: "source.example.com" };
const candidate: LostDomainCandidate = { domain: "alpha.dev", sourceUrl: source.url,
  targetUrl: "https://alpha.dev/dead", anchor: "Independent community resource", sensitive: false };
const notFound = { status: 404, headers: { "content-type": "application/rdap+json" }, body: '{"errorCode":404}' };
const html = '<html><a href="https://alpha.dev/dead">Independent resource</a></html>';
const nodata = () => { throw Object.assign(new Error("not found"), { code: "ENOTFOUND" }); };
function harness(options: {
  robots?: { status: number; headers: Record<string, string>; body: string };
  registry?: { status: number; headers: Record<string, string>; body: string };
  page?: { status: number; headers: Record<string, string>; body: string };
  apex?: { status: number; headers: Record<string, string>; body: string };
  missingWebsite?: boolean;
  dns?: EngineDependencies["dns"];
  registryGate?: EngineDependencies["registryGate"];
  registryBackoff?: EngineDependencies["registryBackoff"];
} = {}) {
  const requests: string[] = [];
  const fetch = createSafeFetcher({ now: () => instant, lookup: async host => {
    if (host === "alpha.dev" && options.missingWebsite) return nodata();
    return [{ address: "93.184.216.34", family: 4 }];
  }, transport: async input => {
    requests.push(input.url.href);
    const value = input.url.pathname === "/robots.txt"
      ? options.robots ?? { status: 200, headers: { "content-type": "text/plain" }, body: "" }
      : input.url.hostname === "pubapi.registry.google" || input.url.hostname === "rdap.verisign.com"
      ? options.registry ?? notFound
      : input.url.pathname === "/" && options.apex ? options.apex
      : options.page ?? { status: 404, headers: { "content-type": "text/html" }, body: html };
    return { ...value, url: input.url.href };
  } });
  const engine = createLostDomainsEngine({ fetch, now: () => instant, dns: options.dns ?? nodata,
    registryGate: options.registryGate, registryBackoff: options.registryBackoff });
  return { ...engine, requests };
}
const registered = { status: 200, headers: { "content-type": "application/rdap+json" }, body: JSON.stringify({
  objectClassName: "domain", ldhName: "ALPHA.DEV", status: ["redemption period", "pending delete"],
  events: [{ eventAction: "expiration", eventDate: "2026-09-01T00:00:00Z" }],
  entities: [{ vcardArray: ["vcard", ["email", {}, "text", "private@example.com"]] }],
}) };

test("source extraction uses PSL, exact provenance and sensitivity without fetching links", () => {
  const results = extractSourceCandidates(`<base href="https://attacker.com/">
    <a href="/own">Own page</a><a href="https://www.example.com/other">Same registrable owner</a>
    <a href="https://alpha.dev/dead?ref=public">First <strong>resource</strong></a>
    <a href="https://alpha.dev/login?token=SECRET">Log in</a>
    <a href="https://user.github.io/app">Hosted tenant, not registrable</a>
    <a href="https://project.co.uk/a">Multi-label suffix</a><a href="https://bücher.com/">Unicode hostname</a>
    <a href="javascript:alert(1)">Unsafe</a><a href="http://plain.com/">Non-TLS</a>
    <a href="https://127.0.0.1/">Internal</a><a href="mailto:private@example.com">Mail</a>`, source.url);
  assert.equal(results.length, 3);
  assert.deepEqual(results[0], { ...candidate, anchor: "First resource", sensitive: true });
  assert.equal(results[1].domain, "project.co.uk"); assert.equal(results[2].domain, "xn--bcher-kva.com");
  assert.ok(results.every(item => item.sourceUrl === source.url));
  assert.doesNotMatch(JSON.stringify(results), /SECRET|token|private@/u);
  assert.equal(extractSourceCandidates(html.repeat(100), source.url).length, 1);
});

test("source extraction bounds scan count, result count and anchor length", () => {
  const many = Array.from({ length: 1100 }, (_unused, index) => `<a href="https://name${index}.com/">${"x".repeat(300)}</a>`).join("");
  const results = extractSourceCandidates(many, source.url, 1000);
  assert.equal(results.length, 60); assert.ok(results.every(item => item.anchor.length <= 160));
  assert.equal(extractSourceCandidates(many, source.url, 3).length, 3);
});

test("curated project links retain only a bounded factual heading and exclude site chrome", () => {
  const result = extractSourceCandidates(`<nav><a href="https://navigation.com/">Navigation</a></nav>
    <section><h2>Projects</h2><section><h3>Alpha Project<a class="headerlink" href="#alpha">#</a></h3>
    <p>This full description must never be retained.</p><a href="https://alpha.dev/">Website</a></section>
    <section><h3>Firefox Account Server</h3><a href="https://identity.dev/">Website</a></section></section>
    <article><h2>${"Long name ".repeat(40)}</h2><a href="https://short.org/">Demo</a></article>
    <footer><a href="https://credits.org/">Theme credits</a></footer>`, source.url);
  assert.equal(result.length, 3);
  assert.equal(result[0].anchor, "Alpha Project · Website");
  assert.equal(result[1].sensitive, true);
  assert.ok(result[2].anchor.length <= 160);
  assert.doesNotMatch(JSON.stringify(result), /description|navigation.com|credits.org|#alpha/u);
  assert.equal(extractSourceCandidates('<a href="https://alpha.dev/">Website</a>', source.url)[0].anchor, "Website");
});

test("approved awesome categories select primary project websites, never definition/repository/demo links", () => {
  const category = "https://awesome-selfhosted.net/tags/bookmarks-and-link-sharing.html";
  // Observed category layout; factual link labels, no copied descriptions.
  const page = `<section id="bookmarks"><h1>Bookmarks</h1>
    <p><a href="https://en.wikipedia.org/wiki/Bookmark_(digital)">bookmarks</a></p>
    <section id="software"><h2>Software</h2>
      <section id="betula"><h3>Betula<a class="headerlink" href="#betula">#</a></h3><p>
        <a href="https://joinbetula.org/">Website</a> <a href="https://codeberg.org/bouncepaw/betula">Source Code</a>
        <a href="https://demo-betula.org/">Demo</a><a href="https://secondary-betula.org/">Website</a></p></section>
      <section id="buku"><h3>Buku</h3><a href="https://github.com/jarun/buku">Website</a></section>
      <section id="generic-demo"><h3>Demo-only project</h3><a href="https://demo-only.org/">Demo</a></section>
      <section id="codeberg"><h3>Codeberg</h3><a href="https://codeberg.org/">Website</a></section>
      <section id="sensitive"><h3>Account Server</h3><a href="https://accounts-project.org/">Website</a></section>
      <section id="ambiguous"><h3>Malformed path</h3><a href="https://bad-project.org/resource?token=private">Website</a></section>
    </section></section><footer><a href="https://theme.org/">Website</a></footer>`;
  for (const url of [category, "https://awesome-selfhosted.net/tags/wikis.html"]) {
    const result = extractSourceCandidates(page, url);
    assert.deepEqual(result.map(row => row.domain), ["joinbetula.org", "codeberg.org", "accounts-project.org", "bad-project.org"]);
    assert.equal(result[0].anchor, "Betula · Website");
    assert.equal(result[1].anchor, "Codeberg · Website");
    assert.equal(result[2].sensitive, true); assert.equal(result[3].sensitive, true);
    assert.equal(result[3].targetUrl, "https://bad-project.org/resource");
    assert.equal(extractSourceCandidates(page, url, 1)[0].domain, "joinbetula.org");
    assert.doesNotMatch(JSON.stringify(result), /wikipedia|github.com|demo-betula|secondary-betula|token|private/u);
  }
  // New publishers/categories require their own review, not automatic guessing.
  for (const url of [source.url, "https://awesome-selfhosted.net/tags/other.html",
    "https://awesome-selfhosted.net.evil.com/tags/bookmarks-and-link-sharing.html"]) {
    assert.equal(extractSourceCandidates(page, url)[0].domain, "wikipedia.org");
  }
  assert.deepEqual(extractSourceCandidates('<a href="https://alpha.dev/">Website</a>', category), []);
});

test("source requires approved host, robots and a real HTML page; empty robots allows", async () => {
  const engine = harness({ page: { status: 200, headers: { "content-type": "text/html;charset=utf-8" }, body: html } });
  const result = await engine.discoverSource(source);
  assert.equal(result.candidates[0].domain, "alpha.dev"); assert.equal(result.observedAt, new Date(instant).toISOString());
  assert.deepEqual(engine.requests, ["https://source.example.com/robots.txt", source.url]);
  await assert.rejects(engine.discoverSource({ ...source, allowedHost: "other.com" }), /invalid_source/u);
  await assert.rejects(engine.discoverSource({ ...source, url: source.url + "?token=secret" }), /invalid_source/u);
  const unavailable = harness(); await assert.rejects(unavailable.discoverSource(source), /source_unavailable/u);
});

test("robots disallow, blocking status, malformed body and crawl delay never fetch a source page", async () => {
  for (const robots of [
    { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /" },
    { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: SajdaResearch\nDisallow: /resources" },
    { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nCrawl-delay: 5" },
    { status: 200, headers: { "content-type": "text/html" }, body: "<html>Error</html>" },
    { status: 200, headers: { "content-type": "text/plain" }, body: "<html>Error</html>" },
    ...[301, 401, 403, 429, 500, 503].map(status => ({ status, headers: { "content-type": "text/plain" }, body: "" })),
  ]) {
    const engine = harness({ robots }); await assert.rejects(engine.discoverSource(source), /robots_/u);
    assert.deepEqual(engine.requests, ["https://source.example.com/robots.txt"]);
  }
  const missingRobots = harness({ robots: { status: 404, headers: {}, body: "" }, page: { status: 200, headers: { "content-type": "text/html" }, body: html } });
  assert.equal((await missingRobots.discoverSource(source)).candidates.length, 1);
});

test("a dead URL and missing address cannot override a registered domain or lifecycle", async () => {
  const result = await harness({ registry: registered }).inspectCandidate(candidate);
  assert.equal(result.registryStatus, "registered"); assert.equal(result.reviewStatus, "registered");
  assert.ok(result.evidence.some(item => item.outcome === "dead_url")); assert.ok(result.evidence.some(item => item.outcome === "no_address"));
  assert.deepEqual(result.evidence.find(item => item.kind === "registry")?.details?.statuses, ["redemption period", "pending delete"]);
  assert.equal(result.registrability, "unverified"); assert.equal(result.confirmedRegistrable, false);
  assert.doesNotMatch(JSON.stringify(result), /private@example|vcard|entities/u);
  assert.deepEqual(rankAssessments([result], instant).confirmed, []);
});

test("registry not found creates only a review candidate, never verified registrability", async () => {
  const result = await harness({ missingWebsite: true }).inspectCandidate(candidate);
  assert.equal(result.registryStatus, "registry_not_found"); assert.equal(result.reviewStatus, "review_candidate");
  assert.equal(result.registrability, "unverified"); assert.equal(result.confirmedRegistrable, false);
  assert.ok(result.risk.reasons.includes("trademark_not_checked")); assert.ok(result.risk.reasons.includes("registrar_not_checked"));
  const ranked = rankAssessments([result], instant);
  assert.equal(ranked.review.length, 1); assert.equal(ranked.confirmed.length, 0);
  assert.ok(result.potentialScore <= 60 && result.confidenceScore <= 70);
});

test("HTML/mismatched RDAP 404 or transport errors are unknown, not absence", async () => {
  for (const registry of [
    { status: 404, headers: { "content-type": "text/html" }, body: "Not found" },
    { status: 404, headers: { "content-type": "application/rdap+json" }, body: '{"errorCode":404,"ldhName":"alpha.dev"}' },
    { status: 200, headers: { "content-type": "application/rdap+json" }, body: '{"objectClassName":"domain","ldhName":"other.dev"}' },
    { status: 503, headers: { "content-type": "application/rdap+json" }, body: '{}' },
  ]) {
    const result = await harness({ registry }).inspectCandidate(candidate);
    assert.equal(result.registryStatus, "unknown"); assert.equal(rankAssessments([result], instant).review.length, 0);
  }
});

test("unsupported TLD stays unknown and never guesses an API endpoint", async () => {
  const engine = harness(); const result = await engine.inspectCandidate({ ...candidate, domain: "alpha.se", targetUrl: "https://alpha.se/dead" });
  assert.equal(result.registryStatus, "unknown"); assert.ok(result.risk.reasons.includes("unsupported_registry"));
  assert.ok(!engine.requests.some(url => /rdap|registry\.google/u.test(url)));
});

test("identity/dependency targets are excluded before network work; active mail is excluded", async () => {
  const sensitive = harness();
  const result = await sensitive.inspectCandidate({ ...candidate, targetUrl: "https://alpha.dev/oauth" });
  assert.equal(result.reviewStatus, "excluded"); assert.equal(sensitive.requests.length, 0);
  const mail = harness({ dns: async (_domain, kind) => kind === "mx" ? [{ exchange: "mx.example.com", priority: 10 }] : nodata() });
  const mailed = await mail.inspectCandidate(candidate);
  assert.equal(mailed.reviewStatus, "excluded"); assert.ok(mailed.risk.reasons.includes("active_mail_dependency"));
  assert.equal(rankAssessments([mailed], instant).review.length, 0);
});

test("query redaction and encoded dependency paths never create a fabricated dead URL", async () => {
  const discovered = extractSourceCandidates('<a href="https://alpha.dev/resource?id=123">Resource</a>', source.url)[0];
  assert.equal(discovered.targetUrl, "https://alpha.dev/resource"); assert.equal(discovered.sensitive, true);
  for (const input of [discovered, { ...candidate, targetUrl: "https://alpha.dev/%6cogin" },
    { ...candidate, targetUrl: "https://alpha.dev/bundle%2ejs" }, { ...candidate, targetUrl: "https://alpha.dev/dead?token=secret" }]) {
    const engine = harness(); const assessment = await engine.inspectCandidate(input);
    assert.equal(assessment.reviewStatus, "excluded"); assert.equal(engine.requests.length, 0);
    assert.equal(assessment.evidence.length, 0);
  }
});

test("redirects must pass destination robots before following the outgoing link", async () => {
  const requests: string[] = [];
  const fetch = createSafeFetcher({ now: () => instant, lookup: async () => [{ address: "93.184.216.34", family: 4 }], transport: async input => {
    requests.push(input.url.href);
    const value = input.url.hostname === "pubapi.registry.google" ? notFound
      : input.url.pathname === "/robots.txt" ? { status: 200, headers: { "content-type": "text/plain" },
        body: input.url.hostname === "blocked.com" ? "User-agent: *\nDisallow: /" : "" }
      : { status: 302, headers: { location: "https://blocked.com/resource" }, body: "" };
    return { ...value, url: input.url.href };
  } });
  const engine = createLostDomainsEngine({ fetch, dns: nodata, now: () => instant });
  const assessment = await engine.inspectCandidate(candidate);
  assert.ok(requests.includes("https://blocked.com/robots.txt")); assert.ok(!requests.includes("https://blocked.com/resource"));
  assert.equal(assessment.evidence.find(item => item.kind === "target_http")?.outcome, "unknown");
  assert.equal(assessment.evidence.find(item => item.kind === "target_http")?.details?.error, "robots_disallowed");
});

test("live DNS conflicts with registry absence; private DNS is excluded", async () => {
  for (const address of ["93.184.216.34", "127.0.0.1"]) {
    const engine = harness({ dns: async (_domain, kind) => kind === "mx" ? [] : [{ address, family: 4 }] });
    const result = await engine.inspectCandidate(candidate);
    assert.equal(result.reviewStatus, address === "127.0.0.1" ? "excluded" : "inconclusive");
    assert.equal(rankAssessments([result], instant).review.length, 0);
  }
});

test("429 honors durable and process cooldown; denied or failed gate never invokes registry", async () => {
  const backoffs: [string, number][] = [];
  const engine = harness({ registry: { status: 429, headers: { "retry-after": "120" }, body: "" },
    registryBackoff: async (endpoint, until) => { backoffs.push([endpoint, until]); } });
  const first = await engine.inspectCandidate(candidate), second = await engine.inspectCandidate(candidate);
  assert.equal(first.evidence.find(item => item.kind === "registry")?.outcome, "rate_limited");
  assert.equal(second.registryStatus, "unknown"); assert.equal(backoffs.length, 1); assert.equal(backoffs[0][1], instant + 120_000);
  assert.equal(engine.requests.filter(url => url.includes("/rdap/domain/")).length, 1);
  for (const registryGate of [async () => false, async () => { throw new Error("Private database error"); }]) {
    const blocked = harness({ registryGate }); const result = await blocked.inspectCandidate(candidate);
    assert.equal(result.registryStatus, "unknown"); assert.ok(!blocked.requests.some(url => url.includes("registry.google")));
    assert.doesNotMatch(JSON.stringify(result), /Private database/u);
  }
  const storageFailure = harness({ registry: { status: 429, headers: {}, body: "" },
    registryBackoff: async () => { throw new Error("Private storage error"); } });
  const limited = (await storageFailure.inspectCandidate(candidate)).evidence.find(item => item.kind === "registry");
  assert.equal(limited?.outcome, "rate_limited"); assert.equal(limited?.details?.backoffPersisted, false);
  assert.doesNotMatch(JSON.stringify(limited), /Private storage/u);
});

test("candidate provenance mismatches reject before work; a forged available flag has no effect", async () => {
  const engine = harness({ registry: registered });
  await assert.rejects(engine.inspectCandidate({ ...candidate, domain: "other.dev" }), /invalid_candidate/u);
  assert.equal(engine.requests.length, 0);
  const fake = { ...candidate, registryStatus: "registry_not_found", availabilityVerified: true };
  assert.equal((await engine.inspectCandidate(fake)).registryStatus, "registered");
});

test("rank excludes expired/future/forged evidence and caps the review list at thirty", async () => {
  const result = await harness({ missingWebsite: true }).inspectCandidate(candidate);
  assert.equal(rankAssessments([result], instant + 16 * 60_000).review.length, 0);
  assert.equal(rankAssessments([result], instant - 1).review.length, 0);
  const forged = structuredClone(result); forged.evidence.find(item => item.kind === "registry")!.source = "https://attacker.com/";
  assert.equal(rankAssessments([forged], instant).review.length, 0);
  const forgedPrice = { ...result, registrability: "verified", confirmedRegistrable: true } as unknown as Assessment;
  assert.equal(rankAssessments([forgedPrice], instant).review.length, 0);
  const many = Array.from({ length: 35 }, (_value, index) => {
    const domain = `name${index}.dev`;
    return { ...structuredClone(result), domain, targetUrl: `https://${domain}/dead`, evidence: result.evidence.map(item => item.kind === "registry"
      ? { ...item, source: `https://pubapi.registry.google/rdap/domain/${domain}` } : item.kind === "target_http"
      ? { ...item, source: item.source.replace("alpha.dev", domain) } : item) };
  });
  const ranked = rankAssessments([...many, many[0]], instant);
  assert.equal(ranked.review.length, 30); assert.equal(new Set(ranked.review.map(item => item.domain)).size, 30);
  assert.equal(ranked.excluded.length, 5);
  assert.equal(new Set([...ranked.review, ...ranked.excluded].map(item => item.domain)).size, 35);
  assert.equal(ranked.confirmed.length, 0);
});

test("external cancellation settles all candidate evidence and never returns a positive queue", async () => {
  const controller = new AbortController();
  const engine = createLostDomainsEngine({ fetch: async () => new Promise(() => {}), dns: async () => new Promise(() => {}) });
  const operation = engine.inspectCandidate(candidate, { signal: controller.signal }); controller.abort();
  const result = await operation; assert.equal(result.registryStatus, "unknown"); assert.equal(result.reviewStatus, "inconclusive");
  assert.equal(rankAssessments([result]).review.length, 0);
});

test("already cancelled inspection safely consumes underlying rejected operations", async () => {
  const controller = new AbortController(); controller.abort();
  const engine = createLostDomainsEngine({ fetch: async () => { throw new Error("Rejected transport"); },
    dns: async () => { throw new Error("Rejected DNS"); } });
  const result = await engine.inspectCandidate(candidate, { signal: controller.signal });
  assert.equal(result.registryStatus, "unknown"); assert.equal(result.reviewStatus, "inconclusive");
  await new Promise(resolve => setImmediate(resolve));
});

test("four corroborating checks produce an explained priority, with no valuation or purchase claim", async () => {
  const result = await harness({ missingWebsite: true }).inspectCandidate(candidate);
  assert.equal(result.opportunity?.tier, "priority_review");
  assert.ok(isLostDomainOpportunity(result.opportunity));
  assert.equal(result.opportunityScore, result.opportunity?.score);
  assert.deepEqual(result.opportunity?.breakdown, { registry: 40, dns: 15, mail: 10, website: 5, name: 20, source: 10, penalties: 0 });
  assert.deepEqual(result.opportunity?.missingChecks, ["registrar", "history", "trademark", "market_comparables"]);
  assert.equal(result.confidenceScore, 70);
  assert.equal(result.confirmedRegistrable, false);
  assert.ok(result.evidence.some(row => row.kind === "target_http" && row.source === "https://alpha.dev/"
    && row.outcome === "unreachable" && row.details?.scope === "apex"));
  assert.equal(result.evidence.filter(row => row.kind === "target_http").length, 2);
});

test("a broken linked path and working apex cannot be promoted by an absent registry record", async () => {
  const engine = harness({ apex: { status: 200, headers: { "content-type": "text/html" }, body: "Live site" } });
  const result = await engine.inspectCandidate(candidate);
  assert.equal(result.reviewStatus, "inconclusive");
  assert.equal(result.opportunity?.tier, "watch");
  assert.ok(result.opportunity!.score <= 29);
  assert.ok(result.opportunity!.reasons.includes("broken_url_not_domain_expiry"));
  assert.ok(result.opportunity!.reasons.includes("conflicting_observations"));
  assert.ok(result.evidence.some(row => row.source === candidate.targetUrl && row.outcome === "dead_url"));
  assert.ok(result.evidence.some(row => row.source === "https://alpha.dev/" && row.outcome === "responding"));
  assert.equal(rankAssessments([result], instant).review.length, 0);
});

test("every actual HTTP response including 404, forbidden and server error contradicts registry absence", async () => {
  for (const status of [200, 403, 404, 410, 429, 500, 503]) {
    const result = await harness({ page: { status, headers: { "content-type": "text/html" }, body: "" } }).inspectCandidate(candidate);
    assert.equal(result.reviewStatus, "inconclusive", `HTTP ${status}`);
    assert.equal(result.opportunity?.tier, "watch");
    assert.equal(rankAssessments([result], instant).review.length, 0);
  }
});

test("a root source link gets one HTTP probe and duplicate observations cannot inflate coverage", async () => {
  const engine = harness();
  const result = await engine.inspectCandidate({ ...candidate, targetUrl: "https://alpha.dev/" });
  assert.equal(result.evidence.filter(row => row.kind === "target_http").length, 1);
  assert.equal(engine.requests.filter(url => url === "https://alpha.dev/").length, 1);
  assert.equal(result.confidenceScore, 70);
  const eligible = await harness({ missingWebsite: true }).inspectCandidate(candidate);
  const repeated = { ...eligible, evidence: [...eligible.evidence, ...eligible.evidence] };
  assert.equal(scoreLostDomainOpportunity(repeated, instant).score, eligible.opportunityScore);
});

test("DNS and mail uncertainty independently block the opportunity queue", async () => {
  for (const unavailable of ["addresses", "mx"] as const) {
    const result = await harness({ missingWebsite: true, dns: async (_domain, kind) => {
      if (kind === unavailable) throw Object.assign(new Error("Unavailable"), { code: "ESERVFAIL" });
      return kind === "mx" ? [] : nodata();
    } }).inspectCandidate(candidate);
    assert.equal(result.reviewStatus, "inconclusive");
    assert.equal(result.opportunity?.tier, "watch");
    assert.ok(result.opportunity?.missingChecks.includes(unavailable === "mx" ? "mail" : "dns"));
    assert.equal(rankAssessments([result], instant).review.length, 0);
  }
});

test("robots denial leaves a partial review and never becomes an unreachable-website bonus", async () => {
  const engine = harness({ robots: { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /" } });
  const result = await engine.inspectCandidate(candidate);
  assert.equal(result.reviewStatus, "review_candidate");
  assert.equal(result.opportunity?.tier, "review");
  assert.equal(result.opportunity?.breakdown.website, 0);
  assert.ok(result.opportunity?.missingChecks.includes("website"));
  assert.ok(result.opportunity!.score <= 69);
  assert.ok(engine.requests.every(url => /registry.google|robots.txt/u.test(url)));
  assert.equal(rankAssessments([result], instant).review.length, 1);
});

test("active mail excludes even an otherwise promising unregistered signal", async () => {
  const result = await harness({ missingWebsite: true, dns: async (_domain, kind) => kind === "mx"
    ? [{ exchange: "mx.example.com", priority: 10 }] : nodata() }).inspectCandidate(candidate);
  assert.equal(result.opportunity?.tier, "excluded");
  assert.equal(result.opportunityScore, 0);
  const forged = { ...result, reviewStatus: "review_candidate", risk: { level: "review", reasons: [] }, opportunityScore: 100 } as Assessment;
  assert.equal(rankAssessments([forged], instant).review.length, 0);
  assert.equal(scoreLostDomainOpportunity(forged, instant).score, 0);
});

test("real negative evidence outranks a broken registered website and stored scores are not trusted", async () => {
  const genuine = await harness({ missingWebsite: true }).inspectCandidate(candidate);
  const broken = await harness({ registry: registered }).inspectCandidate(candidate);
  assert.ok(genuine.opportunityScore! > broken.opportunityScore!);
  assert.ok(broken.opportunityScore! <= 19);
  const altered = { ...genuine, opportunityScore: 0, confidenceScore: 0, potentialScore: 0 };
  const ranked = rankAssessments([altered], instant);
  assert.equal(ranked.review[0].opportunityScore, genuine.opportunityScore);
  assert.equal(ranked.review[0].opportunity?.tier, "priority_review");
});

test("fresh registry evidence cannot hide expired DNS, active HTTP or invalid provenance", async () => {
  const result = await harness({ missingWebsite: true }).inspectCandidate(candidate);
  const stale = { ...result, evidence: result.evidence.map(row => row.kind === "dns"
    ? { ...row, observedAt: new Date(instant - 16 * 60_000).toISOString(), expiresAt: new Date(instant - 60_000).toISOString() } : row) };
  assert.equal(rankAssessments([stale], instant).review.length, 0);
  assert.ok(scoreLostDomainOpportunity(stale, instant).missingChecks.includes("dns"));
  const wrongSource = { ...result, sourceUrl: "https://alpha.dev/list" };
  assert.equal(rankAssessments([wrongSource], instant).review.length, 0);
  const contradiction = { ...result, evidence: [...result.evidence, { ...result.evidence.find(row => row.kind === "target_http")!,
    outcome: "dead_url", details: { httpStatus: 404 } }] };
  assert.equal(rankAssessments([contradiction], instant).review.length, 0);
});

test("private HTTP resolution is excluded even when registry and direct DNS checks disagree", async () => {
  const fetch = createSafeFetcher({ now: () => instant, lookup: async host => [{ address: host === "alpha.dev" ? "127.0.0.1" : "93.184.216.34", family: 4 }],
    transport: async input => ({ ...notFound, url: input.url.href }) });
  const result = await createLostDomainsEngine({ fetch, dns: nodata, now: () => instant }).inspectCandidate(candidate);
  assert.equal(result.reviewStatus, "excluded");
  assert.equal(result.opportunity?.tier, "excluded");
  assert.ok(result.risk.reasons.includes("non_public_http_address"));
});

test("equally dated duplicate exclusions cannot be hidden by input order", async () => {
  const candidateResult = await harness({ missingWebsite: true }).inspectCandidate(candidate);
  const excludedResult = await harness({ missingWebsite: true, dns: async (_domain, kind) => kind === "mx"
    ? [{ exchange: "mx.example.com", priority: 1 }] : nodata() }).inspectCandidate(candidate);
  for (const rows of [[candidateResult, excludedResult], [excludedResult, candidateResult]]) {
    const result = rankAssessments(rows, instant);
    assert.equal(result.review.length, 0);
    assert.equal(result.excluded.length, 1);
    assert.equal(result.excluded[0].opportunity?.tier, "excluded");
  }
});

test("technical evidence tier outranks name fit, then recomputed name fit orders valid candidates", async () => {
  const base = await harness({ missingWebsite: true }).inspectCandidate(candidate);
  const renamed = (domain: string): Assessment => ({ ...structuredClone(base), domain,
    targetUrl: base.targetUrl.replace(candidate.domain, domain),
    evidence: base.evidence.map(row => ({ ...row, source: row.source.replace(candidate.domain, domain) })) });
  const weakPriority = renamed("qxzry.dev"), strongPriority = renamed("cloudtools.dev"), strongReview = renamed("software.dev");
  strongReview.evidence = strongReview.evidence.map(row => row.kind === "target_http"
    ? { ...row, outcome: "unknown", details: { error: "robots_disallowed" } } : row);
  weakPriority.marketFit = { ...analyzeTradingMarketFit(weakPriority.domain), score: 100 };
  strongPriority.marketFit = { ...analyzeTradingMarketFit(strongPriority.domain), score: 0 };
  const original = structuredClone([strongReview, weakPriority, strongPriority]);
  const ranked = rankAssessments([strongReview, weakPriority, strongPriority], instant);
  assert.deepEqual(ranked.review.map(row => row.domain), ["cloudtools.dev", "qxzry.dev", "software.dev"]);
  assert.deepEqual(ranked.review.map(row => row.opportunity?.tier), ["priority_review", "priority_review", "review"]);
  assert.ok(ranked.review[0].marketFit!.score > ranked.review[1].marketFit!.score);
  assert.ok(ranked.review[2].marketFit!.score > ranked.review[1].marketFit!.score);
  assert.deepEqual([strongReview, weakPriority, strongPriority], original);
  assert.equal(ranked.confirmed.length, 0); assert.ok(ranked.review.every(row => row.confirmedRegistrable === false));
});

test("rotated source selection includes a meaningful name after the first sixty links", () => {
  const early = Array.from({ length: 90 }, (_unused, i) => `<a href="https://resource${i}.dev/">Resource</a>`).join("");
  const html = early + '<a href="https://cloudtools.dev/">Cloud tools</a>';
  assert.equal(extractSourceCandidates(html, source.url).some(row => row.domain === "cloudtools.dev"), false);
  const rotated = extractSourceCandidates(html, source.url, 60, "server-run-1");
  assert.equal(rotated.length, 60); assert.equal(rotated[0].domain, "cloudtools.dev");
  assert.equal(new Set(rotated.map(row => row.domain)).size, 60);
});

test("exploration is deterministic within a run and rotates the remaining bounded sample across runs", () => {
  const html = Array.from({ length: 140 }, (_unused, i) => `<a href="https://resource${i}.dev/">Resource</a>`).join("");
  const first = extractSourceCandidates(html, source.url, 60, "run-one");
  const repeat = extractSourceCandidates(html, source.url, 60, "run-one");
  const next = extractSourceCandidates(html, source.url, 60, "run-two");
  assert.deepEqual(first, repeat); assert.deepEqual(first.slice(0, 40), next.slice(0, 40));
  assert.notDeepEqual(first.slice(40).map(row => row.domain), next.slice(40).map(row => row.domain));
  assert.ok([...first, ...next].every(row => /^resource\d+\.dev$/u.test(row.domain)));
  const bounded = '<a href="https://bounded.dev/">Resource</a>'.repeat(1_000) + '<a href="https://cloudtools.dev/">Too late</a>';
  assert.equal(extractSourceCandidates(bounded, source.url, 60, "run-one").some(row => row.domain === "cloudtools.dev"), false);
});

test("late sensitive duplicates remain exclusions before normal or rotated selection", () => {
  const html = '<a href="https://cloudtools.dev/">Cloud tools</a>'
    + Array.from({ length: 75 }, (_unused, i) => `<a href="https://resource${i}.dev/">Resource</a>`).join("")
    + '<a href="https://cloudtools.dev/login?token=secret">Sign in</a>';
  const legacy = extractSourceCandidates(html, source.url, 60);
  assert.equal(legacy.find(row => row.domain === "cloudtools.dev")?.sensitive, true);
  const selected = extractSourceCandidates(html, source.url, 60, "run-one");
  assert.ok(selected.filter(row => row.domain === "cloudtools.dev").every(row => row.sensitive));
  const all = extractSourceCandidates(html, source.url, 60, "run-one");
  assert.doesNotMatch(JSON.stringify([...legacy, ...all]), /secret|token=/u);
  assert.equal(new Set(selected.map(row => row.domain)).size, selected.length);
});
