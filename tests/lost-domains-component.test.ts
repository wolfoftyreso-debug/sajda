import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import type { LostDomainsSnapshot, LostDomainRun } from "../src/lib/lostDomains";
import { analyzeTradingMarketFit } from "../shared/trading-market-fit";
import { analyzeTradingDossier } from "../shared/trading-dossier";
import { evaluateTradingAcquisition } from "../shared/trading-acquisition";
import { TRADING_REGISTRAR_ENDPOINT } from "../shared/trading-registrar";

const origin = "https://sajda.example.test";
const requestId = "req_0123456789abcdef";
const reportId = "10000000-0000-4000-8000-000000000001";
const activeId = "10000000-0000-4000-8000-000000000002";
const pause = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function label(node: ReactTestInstance): string { return node.children.map(child => typeof child === "string" ? child : label(child)).join(""); }
function run(status: LostDomainRun["status"] = "succeeded", id = reportId): LostDomainRun {
  const time = new Date(Date.now() - 10_000).toISOString();
  return { id, status, createdAt: time, updatedAt: time, completedAt: ["queued", "running"].includes(status) ? null : time,
    sourceCount: 1, candidateCount: 1, completedCount: status === "succeeded" ? 1 : 0, failedCount: 0 };
}
function snapshot(owner = "account-a", domain = "private-alpha.dev"): LostDomainsSnapshot {
  return { accountId: owner, requestId, access: true, enabled: true, sourcesAvailable: 1, activeRun: null, latestRun: run(), latestAttempt: run(),
    candidates: [{ domain, sourceUrl: "https://source.example.test/links", targetUrl: `https://${domain}/`, anchor: "Fixture", sensitive: false,
      registryStatus: "registry_not_found", registrability: "unverified", confirmedRegistrable: false, reviewStatus: "review_candidate",
      evidence: [{ kind: "registry", source: `https://pubapi.registry.google/rdap/domain/${domain}`, method: "rdap", outcome: "registry_not_found",
        observedAt: new Date(Date.now() - 10_000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }],
      risk: { level: "review", reasons: ["registrar_not_checked", "history_not_checked"] }, potentialScore: 55, confidenceScore: 50 }] };
}
function empty(owner = "account-a", access = true): LostDomainsSnapshot {
  return { ...snapshot(owner), access, activeRun: null, latestRun: null, latestAttempt: null, candidates: [] };
}
function running(owner = "account-a"): LostDomainsSnapshot {
  return { ...snapshot(owner), activeRun: run("running", activeId), latestAttempt: run("running", activeId) };
}

// Real React component + real request/session/validation client. Only test-local
// context providers, DOM wrappers, polling clocks and HTTP fixtures are replaced.
// Nothing here enables plans or injects fictitious data into the actual app.
test("mounted Lost Domains protects explicit work, private reports and concurrent recovery", async t => {
  const originals = new Map(["window", "__LOST_DOMAINS_COMPONENT_TEST__", "IS_REACT_ACT_ENVIRONMENT"]
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch;
  const fixture = { owner: "account-a" as string | null, language: "en", signOut: async () => {}, billingVerified: (_owner: string) => {} };
  const setGlobal = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { configurable: true, value });
  setGlobal("__LOST_DOMAINS_COMPONENT_TEST__", fixture);
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const polls = new Map<number, () => void>();
  const clocks = new Map<number, () => void>();
  let timerId = 10000;
  setGlobal("window", { location: { origin, hostname: "sajda.example.test", pathname: "/plus" },
    setTimeout: (callback: () => void, delay: number) => {
      if (delay === 10_000 || delay === 30_000) { const id = ++timerId; polls.set(id, callback); return id; }
      return setTimeout(callback, delay);
    },
    clearTimeout: (id: ReturnType<typeof setTimeout> | number) => { if (typeof id === "number") polls.delete(id); else clearTimeout(id); },
    setInterval: (callback: () => void) => { const id = ++timerId; clocks.set(id, callback); return id; },
    clearInterval: (id: number) => clocks.delete(id),
  });
  const mocks = new Map([
    ["/src/contexts/AuthContext.tsx", "export const useAuth = () => ({ loading:false, signOut:globalThis.__LOST_DOMAINS_COMPONENT_TEST__.signOut, user: globalThis.__LOST_DOMAINS_COMPONENT_TEST__.owner ? {id:globalThis.__LOST_DOMAINS_COMPONENT_TEST__.owner,email:'qa@example.test'} : null });"],
    ["/src/i18n/LanguageProvider.tsx", "export const useLanguage = () => ({ language:globalThis.__LOST_DOMAINS_COMPONENT_TEST__.language }); export const applyDocumentMetadata = () => {};"],
    ["/src/components/LanguageSwitcher.tsx", "export default function LanguageSwitcher() { return null; }"],
    ["/src/components/PlusBilling.tsx", "export default function PlusBilling({onStatusVerified}) { globalThis.__LOST_DOMAINS_COMPONENT_TEST__.billingVerified=onStatusVerified; return null; }"],
    ["/src/components/ui/button.tsx", "import {createElement as h,forwardRef} from 'react'; export const Button=forwardRef(({children,...props},ref)=>h('button',{...props,ref},children));"],
  ]);
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"' },
    plugins: [{ name: "lost-domains-component-test-boundaries", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      for (const [suffix, code] of mocks) if (normalized.endsWith(suffix)) return code;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  const requests: { method: string; body?: { action: string; requestKey?: string; runId?: string; domain?: string }; owner: string | null; signal?: AbortSignal | null }[] = [];
  let reply: (request: typeof requests[number]) => Response | Promise<Response> = () => Response.json(snapshot());
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), origin);
    assert.equal(url.origin, origin, "Fixtures never make external requests");
    assert.equal(init.credentials, "same-origin");
    if (url.pathname === "/api/auth/get-session") return Response.json(fixture.owner ? {
      user: { id: fixture.owner, email: "qa@example.test", emailVerified: true, name: "QA", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" },
      session: { id: "session-a", userId: fixture.owner, createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    } : null);
    assert.equal(url.pathname, "/api/account/lost-domains");
    const request = { method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined,
      owner: new Headers(init.headers).get("x-sajda-account"), signal: init.signal };
    requests.push(request);
    // Deferred responses may deliberately ignore abort. Production guards must
    // still reject their late completion after unmount/account change/cancel.
    return reply(request);
  };
  try {
    const { default: LostDomains } = await vite.ssrLoadModule("/src/pages/LostDomains.tsx");
    const tree = () => h(MemoryRouter, { initialEntries: ["/plus"] }, h(LostDomains));
    const text = () => label(renderer!.root);
    const button = (name: string) => {
      const found = renderer!.root.findAllByType("button").find(item => label(item) === name);
      assert.ok(found, `Expected button ${name}`); return found;
    };
    const until = async (predicate: () => boolean) => {
      for (let i = 0; i < 150 && !predicate(); i++) await act(async () => { await pause(5); });
      assert.ok(predicate(), "Expected mounted state settles");
    };
    const click = async (name: string) => { await act(async () => { button(name).props.onClick(); await pause(); }); };
    const mount = async (response = snapshot(), owner: string | null = "account-a", language = "en") => {
      if (renderer) await act(async () => { renderer!.unmount(); });
      polls.clear(); clocks.clear(); requests.length = 0; fixture.owner = owner; fixture.language = language;
      reply = () => Response.json(response);
      await act(async () => { renderer = create(tree(), { unstable_isConcurrent: true }); await pause(); });
      if (owner) await until(() => !/Loading your report|Laddar din rapport/u.test(text()));
    };
    const actionRequests = (action?: string) => requests.filter(row => row.method === "POST" && (!action || row.body?.action === action));
    const poll = async () => {
      assert.equal(polls.size, 1, "Exactly one continuation timer is scheduled");
      const [id, callback] = [...polls][0]; polls.delete(id);
      await act(async () => { callback(); await pause(); });
    };

    await t.test("guest sees plan limits before signup without loading private data", async () => {
      await mount(empty(), null);
      assert.equal(requests.length, 0); assert.equal(polls.size, 0);
      assert.match(text(), /An account does not automatically include Trading/);
      const pricing = label(renderer!.root.findByType("aside"));
      assert.match(pricing, /What's included/);
      assert.match(pricing, /up to 24 approved source pages and 600 names/);
      assert.match(pricing, /Up to 30 priority names proceed through 3 time-separated review rounds/);
      assert.match(pricing, /at most 2 new runs per day per account/);
    });

    await t.test("a Plus report loads without automatically starting work", async () => {
      await mount();
      assert.match(text(), /private-alpha\.dev/);
      assert.match(text(), /availability unconfirmed/);
      assert.match(text(), /0 — provider check unavailable/);
      assert.equal(actionRequests().length, 0); assert.equal(polls.size, 0);
    });

    await t.test("Trading report filters change only the visible report and keep subscription below the workspace", async () => {
      await mount();
      assert.equal(renderer!.root.findAllByType("aside").length,0,"An active account does not see the sales card before work");
      assert.match(text(),/Account and Trading subscription/);
      const input=renderer!.root.findByType("input");
      await act(async()=>{input.props.onChange({target:{value:"no-match"}});await pause();});
      assert.match(text(),/0 \/ 1 checks match this selection/);
      assert.doesNotMatch(text(),/private-alpha\.dev/);
      assert.equal(button("Export CSV").props.disabled,true);
      await act(async()=>{input.props.onChange({target:{value:""}});await pause();});
      assert.match(text(),/private-alpha\.dev/);assert.equal(button("Export CSV").props.disabled,false);
      const status=renderer!.root.findAllByType("select")[0];
      await act(async()=>{status.props.onChange({target:{value:"registered"}});await pause();});
      assert.match(text(),/0 \/ 1 checks match this selection/);
      assert.equal(actionRequests().length,0,"Filtering and exporting never initiate crawling");
    });

    await t.test("name fit and archive samples are localized, explainable and independent of registration", async () => {
      const response=snapshot("account-a","cloudbilling.com"),candidate=response.candidates[0];
      candidate.marketFit=analyzeTradingMarketFit(candidate.domain);
      const source=new URL("https://index.commoncrawl.org/CC-MAIN-2026-35-index");
      source.search=new URLSearchParams({url:candidate.domain,matchType:"host",output:"json",limit:"5",fl:"url,timestamp,status"}).toString();
      candidate.archive={source:"common_crawl",domain:candidate.domain,status:"observed",reason:"crawl_sightings",checkedAt:new Date().toISOString(),
        sourceUrl:source.href,collection:"CC-MAIN-2026-35",sampleCount:2,earliestSampleAt:"2026-08-20T10:00:00.000Z",latestSampleAt:"2026-08-21T10:00:00.000Z",
        sampleStatuses:[200,404],priorExistence:true,sampleLimit:5,collectionLimit:1};
      candidate.registryStatus="registered";candidate.reviewStatus="registered";
      response.sourcesAvailable=2;
      await mount(response);
      assert.match(text(),/2 approved source pages available now/);
      assert.match(text(),/Recognized words: cloud \+ billing/u);
      assert.match(text(),/Exploratory use casesSoftware or digital service/u);
      assert.match(text(),/No buyers or purchase interest have been identified/u);
      assert.match(text(),/Meaning · max 40\+36/u);
      assert.match(text(),/At most 5 metadata observations from 1 collection/u);
      assert.match(text(),/not the domain's first or last use ever/u);
      assert.match(text(),/HTTP statuses in the sample200, 404/u);
      const archiveLink=renderer!.root.findAllByType("a").find(node=>node.props.href===source.href);
      assert.ok(archiveLink);assert.equal(archiveLink.props.rel,"noopener noreferrer");assert.equal(archiveLink.props.referrerPolicy,"no-referrer");
      const status=renderer!.root.findAllByType("select")[0];
      await act(async()=>{status.props.onChange({target:{value:"strong_fit"}});await pause();});
      assert.match(text(),/1 \/ 1 checks match this selection/u);
      assert.match(text(),/this filter can also include registered domains/u);
      assert.match(text(),/cloudbilling.comRegistered/u);
      assert.equal(actionRequests().length,0);
      await mount(response,"account-a","sv");
      assert.match(text(),/Tolkade ord: cloud \+ billing/u);
      assert.match(text(),/Användningsidéer att undersöka/u);
      assert.match(text(),/Inga köpare eller köpintressen har identifierats/u);
      assert.match(text(),/Tidigast i stickprovet/u);
      assert.doesNotMatch(text(),/Recognized words|Exploratory use cases|Metadata samples/u);
    });

    await t.test("unknown archive evidence stays unknown and a final recheck phase shows its own progress", async () => {
      const response=running(),candidate=response.candidates[0];
      candidate.archive={source:"common_crawl",domain:candidate.domain,status:"unknown",reason:"timeout",checkedAt:new Date().toISOString(),
        sourceUrl:null,collection:null,sampleCount:null,earliestSampleAt:null,latestSampleAt:null,sampleStatuses:[],priorExistence:null,sampleLimit:5,collectionLimit:1};
      response.activeRun={...response.activeRun!,capacity:{sourceLimit:24,candidateLimit:600},sourceCount:2,candidateCount:600,completedCount:600,verificationCount:10,completedVerificationCount:3};
      response.latestAttempt=response.activeRun;
      await mount(response);
      assert.match(text(),/Missing archive data does not prove that the domain has no history/u);
      assert.doesNotMatch(text(),/Earliest in the sample|Latest in the sample/u);
      assert.match(text(),/Rechecking the highest-priority candidates/u);
      assert.match(text(),/Final rechecks3 \/ 10/u);
      assert.match(text(),/up to 24 source pages and 600 names/u);
      assert.match(text(),/Up to 30 priority names are rechecked in 1 rounds/u);
      assert.equal(actionRequests().length,0);assert.equal(polls.size,1);
    });

    await t.test("scheduled deep-review gaps refresh status without triggering new checks", async () => {
      const response = running();
      response.activeRun = { ...response.activeRun!, verificationRound: 2, verificationMaxRounds: 3,
        verificationCount: 60, completedVerificationCount: 30, nextCheckAt: new Date(Date.now() + 7_200_000).toISOString() };
      response.latestAttempt = response.activeRun;
      await mount(response);
      assert.match(text(), /Next check no earlier than/u);
      assert.match(text(), /A planned wait, not a failure/u);
      assert.match(text(), /Review round2 \/ 3/u);
      assert.match(text(), /at least 20 minutes, then 2 hours, then 12 hours/u);
      await poll();
      await until(() => polls.size === 1);
      assert.equal(actionRequests().length, 0, "Waiting never spends a mutation or starts network checks");
      assert.equal(requests.length, 2);
      assert.equal(requests[1].method, "GET");
      await click("Stop this run");
      assert.equal(actionRequests("cancel").length, 1, "Scheduled waits can still be cancelled");
    });

    await t.test("technical dossier and acquisition gaps explain research-only status in both languages", async () => {
      const response = snapshot("account-a", "cloudbilling.com"), candidate = response.candidates[0];
      candidate.sourceUrl = "https://catalog.org/projects";
      candidate.dossier = analyzeTradingDossier(candidate, { now: Date.now(), sourceApproved: true });
      candidate.acquisition = evaluateTradingAcquisition({ domain: candidate.domain });
      await mount(response);
      assert.match(text(), /Technical deep review/u);
      assert.match(text(), /Research only — purchase evidence missing/u);
      assert.match(text(), /No verified low-price signal/u);
      assert.match(text(), /Current quote for this exact domain/u);
      assert.match(text(), /Sourced comparable sales and a reviewed value range/u);
      assert.doesNotMatch(text(), /Buy now|Guaranteed profit/u);
      await mount(response, "account-a", "sv");
      assert.match(text(), /Teknisk djupgranskning/u);
      assert.match(text(), /Ingen verifierad lågprissignal/u);
      assert.match(text(), /Källbelagda jämförbara försäljningar/u);
    });

    await t.test("exact registrar prices are USD, incomplete totals are explicit, and stale quotes are hidden", async () => {
      const response = snapshot("account-a", "cloudbilling.com"), candidate = response.candidates[0];
      candidate.registrar = { version: 1, provider: "porkbun", method: "official_registrar_api", domain: candidate.domain,
        sourceUrl: TRADING_REGISTRAR_ENDPOINT + candidate.domain, status: "checked", reason: "registrar_checked",
        checkedAt: new Date(Date.now()-1_000).toISOString(), expiresAt: new Date(Date.now()+299_000).toISOString(), availability: "available", currency: "USD",
        annualRegistrationMinor: 1025, renewalPriceMinor: 1250, regularAnnualRegistrationMinor: 1025, minRegistrationYears: 1,
        firstYearPromo: false, premium: false, minimumRegistrationSubtotalMinor: 1025, taxTreatment: "unknown", feesTreatment: "unknown",
        mandatoryAddOns: "unknown", renewalTermYears: null };
      await mount(response);
      assert.match(text(), /Registrar check · Porkbun/u);
      assert.match(text(), /USD\s*10\.25/u);
      assert.match(text(), /USD\s*12\.50/u);
      assert.match(text(), /Reported renewal price · term not established/u);
      assert.doesNotMatch(text(), /Renewal price per year/u);
      assert.match(text(), /not a final payable total or a reservation/u);
      assert.doesNotMatch(text(), /0 — provider check unavailable/u);
      candidate.registrar.checkedAt = new Date(Date.now()-601_000).toISOString();
      candidate.registrar.expiresAt = new Date(Date.parse(candidate.registrar.checkedAt)+300_000).toISOString();
      await mount(response);
      assert.match(text(), /The quote needs refreshing/u);
      assert.doesNotMatch(text(), /USD\s*10\.25|USD\s*12\.50/u);
    });

    await t.test("quote refresh is disabled when unavailable and never starts on viewing or filtering", async () => {
      const response = snapshot();
      response.quoteRefreshEnabled = false;
      await mount(response);
      assert.equal(button("Update price and availability").props.disabled, true);
      assert.match(text(), /Direct price refresh is unavailable/u);
      assert.equal(actionRequests("refresh_quote").length, 0);
      await mount(response, "account-a", "sv");
      assert.match(text(), /Uppdatera pris och tillgänglighet/u);
      assert.match(text(), /Direkt prisuppdatering är inte tillgänglig/u);
    });

    await t.test("manual quote refresh is single-flight, preserves evidence and never repeats automatically", async () => {
      const response = snapshot("account-a", "cloudbilling.com"), candidate=response.candidates[0];
      response.quoteRefreshEnabled = true;
      const originalEvidence = structuredClone(candidate.evidence);
      await mount(response);
      const gate=deferred<Response>();
      reply=()=>gate.promise;
      await act(async()=>{const refresh=button("Update price and availability");refresh.props.onClick();refresh.props.onClick();await pause();});
      assert.equal(actionRequests("refresh_quote").length,1);
      const body=actionRequests("refresh_quote")[0].body!;
      assert.equal(body.domain,"cloudbilling.com");assert.equal(body.runId,reportId);
      assert.match(body.requestKey!,/^[0-9a-f-]{36}$/u);
      assert.equal(button("Checking price…").props.disabled,true);
      response.quoteUpdates={"cloudbilling.com":{status:"failed",requestedAt:new Date().toISOString(),failureCode:"timeout",evidence:null}};
      await act(async()=>{gate.resolve(Response.json(response));await pause();});
      await until(()=>text().includes("The price refresh did not return a new reliable response"));
      assert.deepEqual(response.candidates[0].evidence,originalEvidence);
      assert.equal(polls.size,0,"No quote retry timer is created");
      assert.equal(actionRequests("refresh_quote").length,1);
      reply=()=>Response.json(response);
      await click("Update price and availability");
      await until(()=>actionRequests("refresh_quote").length===2);
      assert.notEqual(actionRequests("refresh_quote")[1].body!.requestKey,body.requestKey,"An explicit retry after a confirmed terminal failure is a new request");
      assert.match(text(),/technical review and its validity are not refreshed/u);
    });

    await t.test("successful quote refresh updates USD evidence without renewing technical timestamps", async () => {
      const response=snapshot("account-a","cloudbilling.com"),candidate=response.candidates[0];response.quoteRefreshEnabled=true;
      const originalTechnicalTime=candidate.evidence[0].observedAt;
      await mount(response);
      const checkedAt=new Date(Date.now()-1_000).toISOString();
      const refreshed={version:1 as const,provider:"porkbun" as const,method:"official_registrar_api" as const,domain:candidate.domain,
        sourceUrl:TRADING_REGISTRAR_ENDPOINT+candidate.domain,status:"checked" as const,reason:"registrar_checked" as const,checkedAt,
        expiresAt:new Date(Date.parse(checkedAt)+300_000).toISOString(),availability:"available" as const,currency:"USD" as const,
        annualRegistrationMinor:975,renewalPriceMinor:1300,regularAnnualRegistrationMinor:975,minRegistrationYears:1,firstYearPromo:false,premium:false,
        minimumRegistrationSubtotalMinor:975,taxTreatment:"unknown" as const,feesTreatment:"unknown" as const,mandatoryAddOns:"unknown" as const,renewalTermYears:null};
      const updated={...response,candidates:[{...candidate,registrar:refreshed}],quoteUpdates:{[candidate.domain]:{status:"succeeded" as const,requestedAt:checkedAt,evidence:refreshed}}};
      reply=()=>Response.json(updated);
      await click("Update price and availability");
      await until(()=>text().includes("The price refresh is complete"));
      assert.match(text(),/USD\s*9\.75/u);
      assert.match(text(),/Original quote observation time/u);
      assert.ok(renderer!.root.findAllByType("time").some(node=>node.props.dateTime===originalTechnicalTime),"Original technical observation time remains displayed");
      assert.equal(actionRequests("refresh_quote").length,1);assert.equal(polls.size,0);
    });

    await t.test("uncertain quote refresh reuses its UUID and pending status blocks resubmission", async () => {
      const response=snapshot();response.quoteRefreshEnabled=true;
      await mount(response);
      reply=()=>Response.json({code:"lost_domains_unavailable",requestId,error:"Unavailable"},{status:503});
      await click("Update price and availability");
      await until(()=>text().includes("The response could not be confirmed. Refresh status first."));
      const key=actionRequests("refresh_quote")[0].body!.requestKey;
      response.quoteUpdates={"private-alpha.dev":{status:"pending",requestedAt:new Date().toISOString(),evidence:null}};
      reply=()=>Response.json(response);
      await click("Update price and availability");
      await until(()=>text().includes("The quote request is processing"));
      assert.equal(actionRequests("refresh_quote")[1].body!.requestKey,key);
      assert.equal(button("Update price and availability").props.disabled,true);
      const before=actionRequests().length;
      await click("Refresh status");
      assert.equal(actionRequests().length,before,"Status recovery is read-only");
      assert.equal(polls.size,0);
    });

    await t.test("all 600 inspected names remain searchable in the latest report", async () => {
      const response=snapshot(),template=response.candidates[0];
      response.candidates=Array.from({length:600},(_,index)=>{const domain=`report-${String(index).padStart(3,"0")}.dev`;return {...template,domain,targetUrl:`https://${domain}/`};});
      response.latestRun={...run(),candidateCount:600,completedCount:600,verificationCount:30,completedVerificationCount:30};response.latestAttempt=response.latestRun;
      await mount(response);
      assert.match(text(),/600 \/ 600 checks match this selection/u);
      assert.match(text(),/Final rechecks: 30 \/ 30/u);
      assert.match(text(),/50 \/ 570 other checks displayed/u);
      assert.match(text(),/report-079.dev/u);
      assert.doesNotMatch(text(),/report-080.dev|report-599.dev/u);
      await click("Show 50 more");
      assert.match(text(),/100 \/ 570 other checks displayed/u);
      assert.match(text(),/report-129.dev/u);
      assert.doesNotMatch(text(),/report-130.dev/u);
      const input=renderer!.root.findByType("input");
      await act(async()=>{input.props.onChange({target:{value:"report-599"}});await pause();});
      assert.match(text(),/1 \/ 600 checks match this selection/u);
      assert.match(text(),/report-599.dev/u);
      await act(async()=>{input.props.onChange({target:{value:""}});await pause();});
      assert.match(text(),/50 \/ 570 other checks displayed/u,"Changing the search resets the rendered batch");
      await click("Show 50 more");
      const extension=renderer!.root.findAllByType("select")[1];
      await act(async()=>{extension.props.onChange({target:{value:"dev"}});await pause();});
      assert.match(text(),/50 \/ 570 other checks displayed/u,"Changing the extension resets the rendered batch");
      await click("Show 50 more");
      reply=()=>Response.json({...response,latestRun:{...response.latestRun!,id:activeId}});
      await click("Refresh status");
      await until(()=>text().includes("50 / 570 other checks displayed"));
      assert.doesNotMatch(text(),/report-080.dev/u,"A new completed report resets the rendered batch");
      assert.equal(actionRequests().length,0);
    });

    await t.test("a report subset notice persists with its report and clears only when replaced or access is removed",async()=>{
      const response={...snapshot(),candidatesOmitted:12};
      await mount(response);
      assert.match(text(),/Report subset: 12 check rows were omitted/u);
      assert.match(text(),/Search and CSV include only the returned subset/u);
      reply=()=>Response.json({...empty(),latestAttempt:run("cancelled",activeId)});
      await click("Refresh status");
      await until(()=>text().includes("Stopped"));
      assert.match(text(),/Report subset: 12 check rows were omitted/u);
      assert.match(text(),/private-alpha.dev/u);
      reply=()=>Response.json({...snapshot(),candidatesOmitted:0});
      await click("Refresh status");
      await until(()=>!text().includes("Report subset"));
      await mount(response,"account-a","sv");
      assert.match(text(),/Begränsat rapportunderlag: 12 kontrollrader utelämnades/u);
      assert.match(text(),/Sökning och CSV omfattar endast det hämtade underlaget/u);
      reply=()=>Response.json(empty("account-a",false));
      await click("Uppdatera status");
      await until(()=>!text().includes("Begränsat rapportunderlag"));
      assert.doesNotMatch(text(),/private-alpha.dev/u);
    });

    await t.test("two same-batch start clicks send one immutable request; uncertain retry keeps its UUID", async () => {
      await mount();
      const pending = deferred<Response>(); reply = request => request.method === "POST" ? pending.promise : Response.json(snapshot());
      const start = button("Start a new review");
      await act(async () => { start.props.onClick(); start.props.onClick(); await pause(); });
      await until(() => actionRequests("start").length === 1);
      const key = actionRequests("start")[0].body!.requestKey;
      assert.match(key!, /^[a-f0-9-]{36}$/u); assert.equal(actionRequests("start")[0].owner, "account-a");
      assert.match(text(), /private-alpha\.dev/, "Starting another review keeps the previous report visible");
      await act(async () => { pending.resolve(Response.json({ code: "lost_domains_unavailable", requestId }, { status: 503 })); await pause(); });
      await until(() => text().includes("Retry starting"));
      reply = () => Response.json(running());
      await click("Retry starting");
      await until(() => text().includes("Current review"));
      assert.equal(actionRequests("start").length, 2);
      assert.equal(actionRequests("start")[1].body!.requestKey, key);
      assert.equal(polls.size, 1);
    });

    await t.test("an already active Plus run advances only on its bounded timer and never starts a new run", async () => {
      await mount(running());
      assert.equal(actionRequests().length, 0);
      await poll();
      await until(() => actionRequests("advance").length === 1 && polls.size === 1);
      assert.deepEqual(actionRequests("advance")[0].body, { action: "advance", runId: activeId });
      assert.equal(actionRequests("start").length, 0);
    });

    await t.test("a first active run explains pending results instead of asking for another start", async () => {
      const response = running(); response.latestRun = null; response.candidates = [];
      await mount(response);
      assert.match(text(), /Your first report is being prepared/);
      assert.doesNotMatch(text(), /No completed report yet|Start a review when the engine/);
      assert.equal(button("Start a new review").props.disabled, true);
    });

    await t.test("verified billing queues one server permission reload after an in-flight workspace GET", async () => {
      await mount(empty("account-a", false));
      const pending = deferred<Response>(); reply = () => pending.promise;
      await click("Refresh status"); await until(() => requests.length === 2);
      await act(async () => { fixture.billingVerified("account-a"); await pause(); });
      assert.equal(requests.length, 2, "Existing GET is not interrupted or duplicated");
      assert.match(text(), /An account does not automatically include Trading/);
      reply = () => Response.json(snapshot());
      await act(async () => { pending.resolve(Response.json(empty("account-a", false))); await pause(); });
      await until(() => text().includes("private-alpha.dev"));
      assert.deepEqual(requests.map(row => row.method), ["GET", "GET", "GET"]);
      assert.equal(actionRequests().length, 0); assert.equal(polls.size, 0);
      await act(async () => { fixture.billingVerified("account-b"); await pause(); });
      assert.equal(requests.length, 3, "A stale notification cannot reload another account's workspace");
    });

    await t.test("diagnostics expose evidence without promoting stale or excluded domains into findings", async () => {
      const response = snapshot(); response.latestRun = run("partial");
      response.candidates[0].evidence[0].observedAt = new Date(Date.now() - 20 * 60_000).toISOString();
      response.candidates[0].evidence[0].expiresAt = new Date(Date.now() - 5 * 60_000).toISOString();
      response.candidates.push({ ...response.candidates[0], domain: "sensitive-beta.dev", sensitive: true, reviewStatus: "excluded",
        registryStatus: "unknown", evidence: [], risk: { level: "excluded", reasons: ["sensitive_dependency_or_identity_link"] } });
      await mount(response);
      assert.match(text(), /This report is incomplete/);
      assert.match(text(), /registry check is too old/);
      assert.match(text(), /link may support sign-in, payment or another sensitive function/);
      assert.match(text(), /No network observation was saved/);
      assert.match(text(), /No current review candidates/);
      assert.equal(renderer!.root.findAllByType("a").filter(node => String(node.props["aria-label"]).includes("sensitive-beta.dev")).length, 0);
    });

    await t.test("attributed source data carries its license independently of Sajda's own observations", async () => {
      const response = snapshot(); response.candidates[0].sourceUrl = "https://awesome-selfhosted.net/tags/bookmarks-and-link-sharing.html";
      await mount(response);
      assert.match(text(), /Source data: awesome-selfhosted community · © 2015–2026/);
      assert.match(text(), /Selected links and project names are used under CC BY-SA 3.0/);
      assert.match(text(), /Sajda's checks are separate. No affiliation or endorsement/);
      assert.equal(renderer!.root.findAllByType("a").filter(node => node.props.href === "https://creativecommons.org/licenses/by-sa/3.0/").length, 1);
      await mount(); assert.doesNotMatch(text(), /Source data: awesome-selfhosted/);
    });

    await t.test("fresh overflow keeps a current label without raising the top-thirty cap; expired evidence stays stale", async () => {
      const response = snapshot(), template = response.candidates[0];
      response.candidates = Array.from({ length: 31 }, (_, index) => {
        const domain = `fresh-${String(index).padStart(2, "0")}.dev`;
        return { ...template, domain, targetUrl: `https://${domain}/`,
          evidence: template.evidence.map(item => ({ ...item, source: `https://pubapi.registry.google/rdap/domain/${domain}` })) };
      });
      response.latestRun = { ...run(), candidateCount: 31, completedCount: 31 };
      response.latestAttempt = response.latestRun;
      await mount(response);
      assert.match(text(), /fresh-30\.devFresh check · outside the top 30/);
      assert.doesNotMatch(text(), /registry check is too old|Needs a fresh check/);
      const lists = renderer!.root.findAllByType("ol");
      const rankedList = lists.find(node => label(node).includes("fresh-00.dev"));
      assert.ok(rankedList); assert.equal(rankedList.children.length, 30);
      assert.doesNotMatch(label(rankedList), /fresh-30\.dev/);
      assert.equal(actionRequests().length, 0);

      response.candidates[30] = { ...response.candidates[30], evidence: [{ ...template.evidence[0],
        observedAt: new Date(Date.now() - 20 * 60_000).toISOString(), expiresAt: new Date(Date.now() - 5 * 60_000).toISOString() }] };
      await mount(response);
      assert.match(text(), /fresh-30\.devNeeds a fresh check/);
      assert.match(text(), /registry check is too old/);
      assert.doesNotMatch(text(), /Fresh check · outside the top 30/);
    });

    await t.test("sign-out is single-flight, stops new work and does not falsely claim success after failure", async () => {
      await mount(); const pending = deferred<void>(); let calls = 0;
      fixture.signOut = () => { calls++; return pending.promise; };
      await act(async () => { renderer!.update(tree()); await pause(); });
      const leave = button("Sign out");
      await act(async () => { leave.props.onClick(); leave.props.onClick(); await pause(); });
      assert.equal(calls, 1); assert.equal(button("Start a new review").props.disabled, true);
      assert.equal(button("Refresh status").props.disabled, true);
      await act(async () => { pending.resolve(); await pause(); });
      await until(() => text().includes("Sign out"));
      fixture.signOut = async () => { throw new Error("provider details not for users"); };
      await act(async () => { renderer!.update(tree()); await pause(); });
      await click("Sign out");
      await until(() => text().includes("Sign-out could not be confirmed"));
      assert.match(text(), /qa@example.test|private-alpha.dev/);
      assert.doesNotMatch(text(), /provider details/);
    });

    await t.test("409 joins the existing durable run by GET without creating another key or another start", async () => {
      await mount();
      reply = request => request.method === "POST" ? Response.json({ code: "run_in_progress", requestId }, { status: 409 }) : Response.json(running());
      await click("Start a new review");
      await until(() => text().includes("Current review") && polls.size === 1);
      assert.equal(actionRequests("start").length, 1);
      assert.deepEqual(requests.map(row => row.method), ["GET", "POST", "GET"]);
      assert.match(text(), /private-alpha\.dev/);
    });

    await t.test("revocation removes the report and its cached copy cannot resurface after a later empty grant", async () => {
      await mount(); assert.match(text(), /private-alpha\.dev/);
      reply = () => Response.json(empty("account-a", false));
      await click("Refresh status");
      await until(() => text().includes("An account does not automatically include Trading"));
      assert.doesNotMatch(text(), /private-alpha\.dev/); assert.equal(clocks.size, 0); assert.equal(polls.size, 0);
      reply = () => Response.json(empty());
      await click("Refresh status");
      await until(() => text().includes("No completed report yet"));
      assert.doesNotMatch(text(), /private-alpha\.dev/, "Private cached content was discarded, not merely hidden");
    });

    await t.test("switching accounts aborts a pending receipt and never exposes the previous account's report", async () => {
      await mount();
      const pending = deferred<Response>();
      reply = request => request.method === "POST" ? pending.promise : Response.json(snapshot(request.owner!, "private-bravo.dev"));
      await click("Start a new review");
      await until(() => actionRequests("start").length === 1);
      const signal = actionRequests("start")[0].signal;
      fixture.owner = "account-b";
      await act(async () => { renderer!.update(tree()); await pause(); });
      await until(() => text().includes("private-bravo.dev"));
      assert.equal(signal?.aborted, true);
      assert.doesNotMatch(text(), /private-alpha\.dev/);
      await act(async () => { pending.resolve(Response.json(running())); await pause(); });
      assert.match(text(), /private-bravo\.dev/); assert.doesNotMatch(text(), /private-alpha\.dev|Current review/);
      assert.equal(polls.size, 0);
    });

    await t.test("cancelling while advance is pending sends one cancellation and ignores late progress", async () => {
      await mount(running());
      const advancing = deferred<Response>(), cancelling = deferred<Response>();
      reply = request => request.body?.action === "advance" ? advancing.promise : cancelling.promise;
      await poll(); await until(() => actionRequests("advance").length === 1);
      const stop = button("Stop this run");
      await act(async () => { stop.props.onClick(); stop.props.onClick(); await pause(); });
      await until(() => actionRequests("cancel").length === 1);
      assert.equal(actionRequests("advance")[0].signal?.aborted, true);
      assert.deepEqual(actionRequests("cancel")[0].body, { action: "cancel", runId: activeId });
      await act(async () => { cancelling.resolve(Response.json({ ...snapshot(), latestAttempt: run("cancelled", activeId) })); await pause(); });
      await until(() => !text().includes("Current review"));
      assert.match(text(), /Stopped/); assert.match(text(), /private-alpha\.dev/); assert.equal(polls.size, 0);
      await act(async () => { advancing.resolve(Response.json(running())); await pause(); });
      assert.doesNotMatch(text(), /Current review/); assert.match(text(), /Stopped/); assert.equal(polls.size, 0);
    });

    await t.test("leaving the page aborts in-flight work and clears timers without claiming server cancellation", async () => {
      await mount(running());
      const pending = deferred<Response>(); reply = () => pending.promise;
      await poll(); await until(() => actionRequests("advance").length === 1);
      const signal = actionRequests("advance")[0].signal;
      await act(async () => { renderer!.unmount(); }); renderer = undefined;
      assert.equal(signal?.aborted, true); assert.equal(polls.size, 0); assert.equal(clocks.size, 0);
      await act(async () => { pending.resolve(Response.json(running())); await pause(); });
      assert.equal(actionRequests("cancel").length, 0);
    });
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
