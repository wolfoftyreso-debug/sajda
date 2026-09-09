import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";
import { analyzeTradingMarketFit } from "../shared/trading-market-fit";
import type { TradingArchiveEvidence } from "../shared/trading-archive";
import { analyzeTradingDossier } from "../shared/trading-dossier";
import { evaluateTradingAcquisition } from "../shared/trading-acquisition";
import { TRADING_REGISTRAR_ENDPOINT } from "../shared/trading-registrar";

const id = "9b08f03e-08bb-4f90-904a-a7e99a268e58";
const requestKey = "0f5768ee-cba4-4224-9471-cba5d63274c6";
const requestId = "req_0123456789abcdef";
const observed = "2026-09-09T10:00:00.000Z";
const expiry = "2026-09-09T10:15:00.000Z";
const run = (status = "succeeded") => ({ id, status, createdAt: observed, updatedAt: observed,
  completedAt: ["queued", "running"].includes(status) ? null : observed,
  sourceCount: 1, candidateCount: 1, completedCount: 1, failedCount: 0 });
const candidate = () => ({ domain: "namnfixture.dev", sourceUrl: "https://source.example.test/links", targetUrl: "https://namnfixture.dev/",
  anchor: "Name fixture", sensitive: false, registryStatus: "registry_not_found", registrability: "unverified", confirmedRegistrable: false,
  reviewStatus: "review_candidate", evidence: [{ kind: "registry", source: "https://pubapi.registry.google/rdap/domain/namnfixture.dev",
    method: "rdap", observedAt: observed, expiresAt: expiry, outcome: "registry_not_found", details: { httpStatus: 404 } }],
  risk: { level: "review", reasons: ["registrar_not_checked", "history_not_checked", "trademark_not_checked"] }, potentialScore: 55, confidenceScore: 65 });
const snapshot = () => ({ accountId: "account-a", requestId, access: true, enabled: true, sourcesAvailable: 1,
  activeRun: null, latestRun: run(), latestAttempt: run(), candidates: [candidate()] });

test("Lost Domains client enforces owner scope, safe response semantics and fresh evidence", async t => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const origin = "https://sajda.example.test";
  const requests: { url: URL; init: RequestInit }[] = [];
  let owner: string | null = "account-a";
  let sessionExpiry = Date.now() + 60_000;
  let reply: (init: RequestInit) => Response = () => Response.json(snapshot());
  let duringResponse: (() => void) | undefined;
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"' } });
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin, hostname: "sajda.example.test" }, setTimeout, clearTimeout } });
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input)); requests.push({ url, init });
      if (url.pathname === "/api/auth/get-session") return Response.json(owner ? {
        user: { id: owner, email: "qa@example.test", emailVerified: true, name: "QA", createdAt: observed, updatedAt: observed },
        session: { id: "session-a", userId: owner, createdAt: observed, updatedAt: observed, expiresAt: new Date(sessionExpiry).toISOString() },
      } : null);
      assert.equal(url.pathname, "/api/account/lost-domains");
      duringResponse?.();
      return reply(init);
    };
    const client = await vite.ssrLoadModule("/src/lib/lostDomains.ts");
    const failedWith = (code: string) => (error: unknown) => error instanceof Error && error.name === "LostDomainsError" && (error as Error & { code: string }).code === code;
    const posts = () => requests.filter(item => item.url.pathname === "/api/account/lost-domains" && item.init.method === "POST");

    await t.test("reading a report never starts work; each mutation sends exact same-origin scoped JSON", async () => {
      const before = posts().length;
      const result = await client.getLostDomains({ accountId: "account-a" });
      assert.equal(result.candidates[0].confirmedRegistrable, false);
      assert.equal(result.candidates[0].registrability, "unverified");
      assert.equal(posts().length, before);
      for (const action of [{ action: "start", requestKey }, { action: "advance", runId: id }, { action: "cancel", runId: id },
        { action: "refresh_quote", runId: id, domain: "namnfixture.dev", requestKey }]) {
        await client.changeLostDomains({ accountId: "account-a" }, action);
        assert.deepEqual(JSON.parse(String(posts().at(-1)!.init.body)), action);
      }
      for (const { url, init } of requests) {
        assert.equal(url.origin, origin); assert.equal(init.credentials, "same-origin");
        assert.equal(new Headers(init.headers).has("authorization"), false);
      }
      for (const { init } of posts()) {
        assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
        assert.equal(new Headers(init.headers).get("x-sajda-account"), "account-a");
        assert.equal(new Headers(init.headers).get("content-type"), "application/json");
      }
    });

    await t.test("failed starts retry the same caller-owned idempotency key; caller mutation cannot replace in-flight identity", async () => {
      reply = () => Response.json({ code: "lost_domains_unavailable", error: "private provider internals", requestId }, { status: 503 });
      await assert.rejects(client.changeLostDomains({ accountId: "account-a" }, { action: "start", requestKey }), failedWith("unavailable"));
      reply = () => Response.json(snapshot());
      const scope = { accountId: "account-a" }, action = { action: "start", requestKey };
      const pending = client.changeLostDomains(scope, action);
      scope.accountId = "account-b"; action.requestKey = id;
      await pending;
      assert.deepEqual(posts().slice(-2).map(item => JSON.parse(String(item.init.body))), [
        { action: "start", requestKey }, { action: "start", requestKey },
      ]);
    });

    await t.test("access denial, failed session, disable switch and limits never produce a report", async () => {
      for (const [status, code, expected] of [[401, "authentication_required", "unauthenticated"], [403, "plus_required", "plus_required"],
        [403, "email_verification_required", "email_verification_required"], [409, "account_changed", "account_changed"],
        [409, "run_busy", "run_conflict"], [429, "rate_limited", "rate_limited"], [503, "engine_disabled", "disabled"],
        [503, "sources_unavailable", "no_sources"], [503, "database_timeout", "unavailable"]] as const) {
        reply = () => Response.json({ code, error: "private infrastructure detail", requestId }, { status });
        await assert.rejects(client.getLostDomains({ accountId: "account-a" }), error => {
          assert.equal(failedWith(expected)(error), true); assert.doesNotMatch(String(error), /private infrastructure/u); return true;
        });
      }
      reply = () => Response.json({ ...snapshot(), access: false, activeRun: null, latestRun: null, latestAttempt: null, candidates: [] });
      assert.equal((await client.getLostDomains({ accountId: "account-a" })).access, false);
    });

    await t.test("malformed JSON, contradictory success and unvalidated fields fail closed", async () => {
      reply = () => new Response("not-json", { status: 200 });
      await assert.rejects(client.getLostDomains({ accountId: "account-a" }), failedWith("unavailable"));
      const bad: unknown[] = [null, [], { ...snapshot(), access: "true" }, { ...snapshot(), enabled: 1 }, { ...snapshot(), requestId: "anything" },
        { ...snapshot(), ok: false }, { ...snapshot(), code: "premium_required" }, { ...snapshot(), latestAttempt: undefined },
        { ...snapshot(), latestRun: run("running") }, { ...snapshot(), activeRun: run("succeeded") },
        { ...snapshot(), access: false }, { ...snapshot(), candidates: [candidate(), candidate()] },
        { ...snapshot(), latestRun: { ...run(), completedCount: 2 } },
        { ...snapshot(), candidates: [{ ...candidate(), confirmedRegistrable: true }] },
        { ...snapshot(), candidates: [{ ...candidate(), registrability: "available" }] },
        { ...snapshot(), candidates: [{ ...candidate(), potentialScore: 150 }] },
        { ...snapshot(), candidates: [{ ...candidate(), sourceUrl: "javascript:alert(1)" }] },
        { ...snapshot(), candidates: [{ ...candidate(), targetUrl: "https://user:pass@example.test/" }] },
        { ...snapshot(), candidates: [{ ...candidate(), targetUrl: "http://example.test/" }] },
        { ...snapshot(), candidates: [{ ...candidate(), registryStatus: "registered" }] },
        { ...snapshot(), candidates: [{ ...candidate(), risk: { level: "excluded", reasons: [] } }] },
        { ...snapshot(), candidates: [{ ...candidate(), sensitive: true }] }];
      for (const value of bad) assert.throws(() => client.parseLostDomainsSnapshot(value, "account-a"), failedWith("invalid_response"));
      assert.throws(() => client.parseLostDomainsSnapshot({ ...snapshot(), accountId: "account-b" }, "account-a"), failedWith("account_changed"));
    });

    await t.test("an expired, future, non-RDAP or mismatched observation never enters the review list", () => {
      const parsed = client.parseLostDomainsSnapshot(snapshot(), "account-a");
      assert.equal(client.freshReviewCandidates(parsed.candidates, Date.parse(observed) + 60_000).length, 1);
      assert.equal(client.freshReviewCandidates(parsed.candidates, Date.parse(expiry)).length, 0);
      assert.equal(client.freshReviewCandidates(parsed.candidates, Date.parse(observed) - 1).length, 0);
      for (const change of [{ method: "dns" }, { outcome: "registered" }, { expiresAt: "2026-09-09T10:30:00.000Z" }]) {
        const changed = { ...parsed.candidates[0], evidence: [{ ...parsed.candidates[0].evidence[0], ...change }] };
        assert.equal(client.freshReviewCandidates([changed], Date.parse(observed) + 60_000).length, 0);
      }
      const forty = Array.from({ length: 40 }, (_, index) => ({ ...parsed.candidates[0], domain: `name${index}.dev` }));
      const now = Date.parse(observed) + 60_000;
      assert.equal(client.freshReviewCandidates(forty, now).length, 30);
      assert.equal(forty.filter(row => client.isFreshReviewCandidate(row, now)).length, 40, "Display overflow is not stale evidence");
      assert.equal(client.isFreshReviewCandidate(forty[30], Date.parse(expiry)), false, "Actual expiry still invalidates overflow");
      assert.equal(client.isFreshReviewCandidate({ ...forty[30], reviewStatus: "registered", registryStatus: "registered" }, now), false);
      assert.equal(client.isFreshReviewCandidate({ ...forty[30], reviewStatus: "inconclusive", registryStatus: "unknown" }, now), false);
    });

    await t.test("report and latest attempt are distinct so failure never overwrites the prior completed report", () => {
      const parsed = client.parseLostDomainsSnapshot({ ...snapshot(), latestAttempt: { ...run("failed"), id: requestKey } }, "account-a");
      assert.equal(parsed.latestRun.status, "succeeded"); assert.equal(parsed.latestAttempt.status, "failed"); assert.equal(parsed.candidates.length, 1);
    });

    await t.test("account observation history survives parsing without refreshing registry evidence and rejects false changes",()=>{
      const history={firstObservedAt:"2026-09-08T10:00:00Z",lastObservedAt:observed,observations:2,independentSources:1,
        previousRegistryStatus:"registered",previousObservedAt:"2026-09-08T10:00:00Z",registryChanged:true,windowDays:180};
      const payload={...snapshot(),candidates:[{...candidate(),observationHistory:history}]};
      const parsed=client.parseLostDomainsSnapshot(payload,"account-a");
      assert.deepEqual(parsed.candidates[0].observationHistory,history);
      assert.equal(parsed.candidates[0].evidence[0].expiresAt,expiry);
      for(const change of [{registryChanged:true,previousRegistryStatus:"unknown"},{windowDays:999},{independentSources:3},
        {firstObservedAt:"2099-01-01T00:00:00Z"},{previousObservedAt:null},{observations:0}]) {
        assert.throws(()=>client.parseLostDomainsSnapshot({...snapshot(),candidates:[{...candidate(),observationHistory:{...history,...change}}]},"account-a"),failedWith("invalid_response"));
      }
    });

    await t.test("optional name and archive evidence are strictly bound to their candidate and preserve timestamps", () => {
      const domain = candidate().domain, marketFit = analyzeTradingMarketFit(domain);
      const source = new URL("https://index.commoncrawl.org/CC-MAIN-2026-35-index");
      source.search = new URLSearchParams({url:domain,matchType:"host",output:"json",limit:"5",fl:"url,timestamp,status"}).toString();
      const archive: TradingArchiveEvidence = { source:"common_crawl", domain, status:"observed", reason:"crawl_sightings", checkedAt:observed,
        sourceUrl:source.href, collection:"CC-MAIN-2026-35", sampleCount:1, earliestSampleAt:"2026-08-20T10:00:00.000Z", latestSampleAt:"2026-08-20T10:00:00.000Z",
        sampleStatuses:[404], priorExistence:true, sampleLimit:5, collectionLimit:1 };
      const enhanced = {...candidate(),marketFit,archive};
      const result = client.parseLostDomainsSnapshot({...snapshot(),candidates:[enhanced]},"account-a");
      assert.deepEqual(result.candidates[0].marketFit,marketFit);
      assert.deepEqual(result.candidates[0].archive,archive);
      assert.equal(result.candidates[0].evidence[0].expiresAt,expiry);
      for (const row of [
        {...enhanced,marketFit:{...marketFit,score:100}}, {...enhanced,marketFit:analyzeTradingMarketFit("cloudbilling.com")},
        {...enhanced,marketFit:{...marketFit,buyerUseCases:["confirmed_buyer"]}}, {...enhanced,marketFit:null},
        {...enhanced,archive:{...archive,domain:"cloudbilling.com"}}, {...enhanced,archive:{...archive,sourceUrl:"https://attacker.test/"}},
        {...enhanced,archive:{...archive,sampleCount:500}}, {...enhanced,archive:{...archive,estimatedTraffic:100}},
        {...enhanced,archive:{...archive,latestSampleAt:"2099-01-01T00:00:00.000Z"}}, {...enhanced,archive:null},
      ]) assert.throws(()=>client.parseLostDomainsSnapshot({...snapshot(),candidates:[row]},"account-a"),failedWith("invalid_response"));
      assert.equal(client.parseLostDomainsSnapshot(snapshot(),"account-a").candidates[0].marketFit,undefined,"Older reports remain readable");
    });

    await t.test("the full 600-name report and separate final rechecks validate while impossible capacity fails closed", () => {
      const candidates = Array.from({length:600},(_,index)=>({...candidate(),domain:`name-${index}.dev`,targetUrl:`https://name-${index}.dev/`}));
      const fullRun = {...run(),sourceCount:24,candidateCount:600,completedCount:600,capacity:{sourceLimit:24,candidateLimit:600},verificationCount:30,completedVerificationCount:30};
      const full = {...snapshot(),latestRun:fullRun,latestAttempt:fullRun,candidates};
      const result = client.parseLostDomainsSnapshot(full,"account-a");
      assert.equal(result.candidates.length,600);
      assert.deepEqual(result.latestRun.capacity,{sourceLimit:24,candidateLimit:600});
      assert.equal(result.latestRun.completedVerificationCount,30);
      const legacy = {...run(),capacity:{sourceLimit:3,candidateLimit:60}};
      assert.equal(client.parseLostDomainsSnapshot({...snapshot(),latestRun:legacy},"account-a").latestRun.capacity.candidateLimit,60);
      for (const change of [
        {candidateCount:601},{sourceCount:25},{capacity:{sourceLimit:25,candidateLimit:600}},{capacity:{sourceLimit:24,candidateLimit:601}},
        {capacity:{sourceLimit:0,candidateLimit:600}},{capacity:{sourceLimit:24,candidateLimit:0}},{capacity:{sourceLimit:3,candidateLimit:60}},
        {capacity:{sourceLimit:24,candidateLimit:600,extra:true}},{verificationCount:31},{verificationCount:29},{completedVerificationCount:31},
        {verificationCount:undefined},{completedVerificationCount:undefined},{completedVerificationCount:-1},
      ]) assert.throws(()=>client.parseLostDomainsSnapshot({...full,latestRun:{...fullRun,...change}},"account-a"),failedWith("invalid_response"));
      assert.throws(()=>client.parseLostDomainsSnapshot({...full,candidates:[...candidates,{...candidate(),domain:"overflow.dev"}]},"account-a"),failedWith("invalid_response"));
    });

    await t.test("quote refresh metadata is report-scoped and strict, preserving original quote dates",()=>{
      const updates={"namnfixture.dev":{status:"pending",requestedAt:observed,evidence:null}};
      const parsed=client.parseLostDomainsSnapshot({...snapshot(),quoteRefreshEnabled:true,quoteUpdates:updates},"account-a");
      assert.equal(parsed.quoteRefreshEnabled,true);assert.deepEqual(parsed.quoteUpdates,updates);
      for(const change of [
        {quoteRefreshEnabled:"true"},{quoteUpdates:[]},{quoteUpdates:{"other.com":updates["namnfixture.dev"]}},
        {quoteUpdates:{"namnfixture.dev":{...updates["namnfixture.dev"],requestedAt:"bad"}}},
        {quoteUpdates:{"namnfixture.dev":{...updates["namnfixture.dev"],status:"succeeded"}}},
        {quoteUpdates:{"namnfixture.dev":{...updates["namnfixture.dev"],status:"available"}}},
        {quoteUpdates:{"namnfixture.dev":{...updates["namnfixture.dev"],providerSecret:"bad"}}},
      ])assert.throws(()=>client.parseLostDomainsSnapshot({...snapshot(),...change},"account-a"),failedWith("invalid_response"));
      assert.throws(()=>client.parseLostDomainsSnapshot({...snapshot(),access:false,latestRun:null,latestAttempt:null,candidates:[],quoteUpdates:updates},"account-a"),failedWith("invalid_response"));
    });

    await t.test("quote-specific failures preserve clear retry semantics and invalid mutation identities never send",async()=>{
      for(const [code,status] of [["quote_in_progress",409],["quote_cooldown",429],["quote_daily_limit",429],["quote_candidate_unavailable",409],["quote_request_expired",409],["quote_unavailable",503]]){
        reply=()=>Response.json({code,error:"Private details",requestId},{status});
        await assert.rejects(client.changeLostDomains({accountId:"account-a"},{action:"refresh_quote",runId:id,domain:"namnfixture.dev",requestKey}),failedWith(code));
      }
      reply=()=>Response.json(snapshot());
      const before=posts().length;
      for(const changes of [{runId:"bad"},{domain:"https://other.com"},{domain:"CAPITAL.COM"},{requestKey:"bad"}]){
        await assert.rejects(client.changeLostDomains({accountId:"account-a"},{action:"refresh_quote",runId:id,domain:"namnfixture.dev",requestKey,...changes}),failedWith("invalid_response"));
      }
      assert.equal(posts().length,before);
    });

    await t.test("deep-round metadata and evidence dossiers are strictly validated", () => {
      const item = { ...candidate(), sourceUrl: "https://catalog.org/projects" };
      const dossier = analyzeTradingDossier(item as Parameters<typeof analyzeTradingDossier>[0], { now: Date.parse(observed), sourceApproved: true });
      const acquisition = evaluateTradingAcquisition({ domain: item.domain }, Date.parse(observed));
      const result = client.parseLostDomainsSnapshot({ ...snapshot(), candidates: [{ ...item, dossier, acquisition }] }, "account-a");
      assert.deepEqual(result.candidates[0].dossier, dossier);
      assert.deepEqual(result.candidates[0].acquisition, acquisition);
      assert.equal(client.isFreshReviewCandidate({ ...item, dossier: { ...dossier, status: "reject" } }, Date.parse(observed)), false);
      assert.equal(client.isFreshReviewCandidate({ ...item, acquisition: { ...acquisition, status: "excluded" } }, Date.parse(observed)), false);
      assert.equal(client.isFreshReviewCandidate({ ...item, registrar: { availability: "unavailable" } }, Date.parse(observed)), false);
      const registrar = { version: 1, provider: "porkbun", method: "official_registrar_api", domain: item.domain,
        sourceUrl: TRADING_REGISTRAR_ENDPOINT + item.domain, status: "unknown", reason: "not_configured", checkedAt: observed,
        expiresAt: "2026-09-09T10:05:00.000Z", availability: "unknown", currency: "USD", annualRegistrationMinor: null,
        renewalPriceMinor: null, regularAnnualRegistrationMinor: null, minRegistrationYears: null, firstYearPromo: null,
        premium: null, minimumRegistrationSubtotalMinor: null, taxTreatment: "unknown", feesTreatment: "unknown", mandatoryAddOns: "unknown", renewalTermYears: null };
      assert.deepEqual(client.parseLostDomainsSnapshot({ ...snapshot(), candidates: [{ ...item, registrar }] }, "account-a").candidates[0].registrar, registrar);
      assert.throws(() => client.parseLostDomainsSnapshot({ ...snapshot(), candidates: [{ ...item, registrar: { ...registrar, annualRegistrationMinor: 0 } }] }, "account-a"), failedWith("invalid_response"));
      assert.throws(() => client.parseLostDomainsSnapshot({ ...snapshot(), candidates: [{ ...item, registrar: { ...registrar, domain: "other.com" } }] }, "account-a"), failedWith("invalid_response"));
      for (const change of [{ dossier: { ...dossier, domain: "other.com" } }, { dossier: { ...dossier, status: "ready_for_price_review" } },
        { acquisition: { ...acquisition, domain: "other.com" } }, { acquisition: { ...acquisition, readyForAcquisitionReview: true } }]) {
        assert.throws(() => client.parseLostDomainsSnapshot({ ...snapshot(), candidates: [{ ...item, dossier, acquisition, ...change }] }, "account-a"), failedWith("invalid_response"));
      }
      const deep = { ...run("running"), verificationRound: 3, verificationMaxRounds: 3, verificationCount: 90, completedVerificationCount: 60,
        nextCheckAt: "2026-09-10T10:00:00.000Z" };
      const parsed = client.parseLostDomainsSnapshot({ ...snapshot(), activeRun: deep }, "account-a");
      assert.equal(parsed.activeRun.verificationCount, 90);
      for (const change of [{ verificationCount: 91 }, { verificationRound: 4 }, { verificationRound: 3, verificationMaxRounds: 2 },
        { nextCheckAt: "invalid" }, { nextCheckAt: "2026-09-01T00:00:00Z" }, { verificationMaxRounds: undefined }]) {
        assert.throws(() => client.parseLostDomainsSnapshot({ ...snapshot(), activeRun: { ...deep, ...change } }, "account-a"), failedWith("invalid_response"));
      }
    });

    await t.test("omitted rows are explicit, bounded with returned rows and never exposed without report access",()=>{
      assert.equal(client.parseLostDomainsSnapshot(snapshot(),"account-a").candidatesOmitted,undefined);
      assert.equal(client.parseLostDomainsSnapshot({...snapshot(),candidatesOmitted:0},"account-a").candidatesOmitted,0);
      assert.equal(client.parseLostDomainsSnapshot({...snapshot(),candidatesOmitted:599},"account-a").candidatesOmitted,599);
      assert.equal(client.parseLostDomainsSnapshot({...snapshot(),candidates:[],candidatesOmitted:600},"account-a").candidatesOmitted,600);
      for(const candidatesOmitted of [-1,600,601,0.5,"1",null,NaN,Infinity]) {
        assert.throws(()=>client.parseLostDomainsSnapshot({...snapshot(),candidatesOmitted},"account-a"),failedWith("invalid_response"));
      }
      const empty={...snapshot(),activeRun:null,latestRun:null,latestAttempt:null,candidates:[],candidatesOmitted:1};
      assert.throws(()=>client.parseLostDomainsSnapshot(empty,"account-a"),failedWith("invalid_response"));
      assert.throws(()=>client.parseLostDomainsSnapshot({...empty,access:false},"account-a"),failedWith("invalid_response"));
    });

    await t.test("owner changes, session expiration and abort reject late results", async () => {
      reply = () => Response.json(snapshot());
      owner = "account-b";
      const countBefore = posts().length;
      await assert.rejects(client.changeLostDomains({ accountId: "account-a" }, { action: "start", requestKey }), failedWith("account_changed"));
      assert.equal(posts().length, countBefore);
      owner = "account-a"; duringResponse = () => { owner = "account-b"; };
      await assert.rejects(client.getLostDomains({ accountId: "account-a" }), failedWith("account_changed"));
      owner = "account-a"; duringResponse = () => { sessionExpiry = Date.now() - 1000; };
      await assert.rejects(client.getLostDomains({ accountId: "account-a" }), failedWith("unauthenticated"));
      sessionExpiry = Date.now() + 60_000;
      const controller = new AbortController(); duringResponse = () => controller.abort();
      await assert.rejects(client.getLostDomains({ accountId: "account-a", signal: controller.signal }), error => error instanceof Error && error.name === "AbortError");
      duringResponse = undefined;
      await assert.rejects(client.changeLostDomains({ accountId: "account-a" }, { action: "start", requestKey: "invalid" }), failedWith("invalid_response"));
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    await vite.close();
  }
});

test("Lost Domains UI wires only explicit starts and owner-scoped cancellable polling", async () => {
  const source = await readFile(new URL("../src/pages/LostDomains.tsx", import.meta.url), "utf8");
  assert.match(source, /function start\(\)/u);
  assert.match(source, /startKey\.current \?\?= \{ owner: accountId, key: crypto\.randomUUID\(\) \}/u);
  assert.match(source, /!snapshot\?\.access \|\| !snapshot\.enabled \|\| !activeRun \|\| paused \|\| busy/u);
  assert.match(source, /action: "advance", runId: activeRun\.id/u);
  assert.match(source, /action: "cancel", runId: activeRun\.id/u);
  assert.match(source, /failure\.code === "run_conflict"/u);
  assert.match(source, /accept\(await getLostDomains\(scope\)\)/u);
  assert.match(source, /\}, waiting \? 30_000 : 10_000\)/u);
  assert.match(source, /Date\.parse\(activeRun\.nextCheckAt\) > Date\.now\(\)\) void request\(\)/u);
  assert.match(source, /if \(!activeRun \|\| cancelling\.current\) return/u);
  assert.match(source, /window\.clearTimeout\(timer\)/u);
  assert.match(source, /ownerRef\.current === accountId/u);
  assert.doesNotMatch(source, /localStorage|sessionStorage|dangerouslySetInnerHTML/u);
  assert.match(source, /snapshot\.latestAttempt/u);
  assert.match(source, /rel="noopener noreferrer"/u);
});
