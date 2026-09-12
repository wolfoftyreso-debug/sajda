import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { tradingPortalCopy } from "../src/i18n/tradingPortalCopy";
import type { LostDomainAssessment } from "../src/lib/lostDomains";
import type { TradingScenario, TradingScenarioInput } from "../shared/trading-scenarios";
import { tradingScenarioSchema } from "../shared/trading-scenarios";
import { analyzeTradingMarketFit } from "../shared/trading-market-fit";
import { TRADING_REGISTRAR_ENDPOINT } from "../shared/trading-registrar";

const now = Date.UTC(2030, 0, 20, 12);
const iso = (offset = 0) => new Date(now + offset).toISOString();
const requestId = "req_0123456789abcdef";
const c = tradingPortalCopy.en;
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
function label(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : label(child)).join("");
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function scenario(title = "Private account A thesis"): TradingScenario {
  return tradingScenarioSchema.parse({
    id: "10000000-0000-4000-8000-000000000001", domain: "private-alpha.com", title, thesis: "Private research note A",
    catalyst: "Potential future use", invalidation: "No observed demand", reviewOn: "2030-01-21", stance: "neutral", analysisMode: "balanced",
    assumptions: { acquisitionUsd: 100, annualRenewalUsd: 20, otherCostsUsd: 20, holdingMonths: 24,
      sellingFeePercent: 10, saleProbabilityPercent: 50, bearSaleUsd: 80, baseSaleUsd: 300, bullSaleUsd: 600 },
    version: 1, createdAt: iso(-60_000), updatedAt: iso(-60_000),
  }) as TradingScenario;
}
const snapshot = (accountId = "account-a", scenarios: TradingScenario[] = []) => ({ accountId, requestId, scenarios });
function persisted(input: TradingScenarioInput, changes: Partial<TradingScenario> = {}): TradingScenario {
  const { expectedVersion, ...fields } = input;
  return tradingScenarioSchema.parse({ ...fields, version: expectedVersion + 1, createdAt: iso(-60_000), updatedAt: iso(), ...changes }) as TradingScenario;
}
/** Synthetic protocol observations for UI testing, never actual live market data. */
function candidate(domain: string, confidenceScore: number, options: { excluded?: boolean; quote?: boolean } = {}): LostDomainAssessment {
  const row: LostDomainAssessment = {
    domain, sourceUrl: "https://example.test/fixture", targetUrl: `https://${domain}/`, anchor: "Synthetic fixture",
    sensitive: Boolean(options.excluded), registryStatus: "registry_not_found", registrability: "unverified", confirmedRegistrable: false,
    reviewStatus: options.excluded ? "excluded" : "review_candidate", potentialScore: 0, confidenceScore,
    marketFit: analyzeTradingMarketFit(domain), risk: { level: options.excluded ? "excluded" : "review",
      reasons: options.excluded ? ["sensitive", "rights_check", "history_check"] : ["manual_review"] },
    evidence: options.excluded ? [] : (["registry", "dns", "target_http", "mail"] as const).map(kind => ({
      kind, source: "https://example.test/fixture", method: "fixture", observedAt: iso(-60_000), expiresAt: iso(60_000),
      outcome: ({ registry: "registry_not_found", dns: "no_address", target_http: "dead_url", mail: "no_explicit_mx" } as const)[kind],
    })),
  };
  if (options.quote) row.registrar = {
    version: 1, provider: "porkbun", method: "official_registrar_api", domain, sourceUrl: TRADING_REGISTRAR_ENDPOINT + domain,
    status: "checked", reason: "registrar_checked", checkedAt: iso(-60_000), expiresAt: iso(60_000), availability: "available", currency: "USD",
    annualRegistrationMinor: 1200, renewalPriceMinor: 1500, regularAnnualRegistrationMinor: 1200, minRegistrationYears: 1,
    firstYearPromo: false, premium: false, minimumRegistrationSubtotalMinor: 1200, taxTreatment: "unknown", feesTreatment: "unknown",
    mandatoryAddOns: "unknown", renewalTermYears: null,
  };
  return row;
}
const candidates = () => [candidate("cloud.com", 10), candidate("cloudtools.com", 95),
  candidate("xqrmz.com", 100, { quote: true }), candidate("risk.app", 0, { excluded: true })];

// The real component, controls, copy, ranking, scenario math and client validators are mounted.
// Only the account transport/session boundary is replaced. No live API call or actual auth bypass.
test("mounted Trading portal preserves hypotheses, real save acknowledgement and account isolation", async t => {
  const key = "__SAJDA_TRADING_PORTAL_TEST__";
  const originals = new Map([key, "window", "IS_REACT_ACT_ENVIRONMENT"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch;
  type Request = { path: string; accountId: string; signal?: AbortSignal; method?: string; body?: { action: string; scenario: TradingScenarioInput } };
  const requests: Request[] = [];
  const fixture = {
    owner: "account-a" as string | null, expired: false, accessLost: 0, confirms: 0, confirm: true,
    reply: async (_request: Request): Promise<unknown> => snapshot(),
    request: async (requestPath: string, options: Omit<Request, "path">): Promise<unknown> => {
      const request = { path: requestPath, ...options }; requests.push(request);
      assert.equal(requestPath, "/api/account/trading-scenarios");
      return fixture.reply(request);
    },
    session: async () => fixture.owner ? { user: { id: fixture.owner }, expires_at: Date.now() / 1000 + (fixture.expired ? -1 : 60) } : null,
  };
  const setGlobal = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, value });
  setGlobal(key, fixture);
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setGlobal("window", { confirm: () => { fixture.confirms++; return fixture.confirm; } });
  globalThis.fetch = async () => { throw new Error("Trading portal tests must not make a live request"); };
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } },
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "trading-portal-account-boundary", enforce: "pre", load(id) {
      if (id.replaceAll("\\", "/").endsWith("/src/integrations/neon/auth.ts")) return `
        export const accountRequest=(path,options)=>globalThis.${key}.request(path,options);
        export const readAccountSession=()=>globalThis.${key}.session();`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const { default: TradingPortal } = await vite.ssrLoadModule("/src/components/TradingPortal.tsx");
    const client = await vite.ssrLoadModule("/src/lib/tradingScenarios.ts");
    let currentCandidates: LostDomainAssessment[] = [];
    const tree = () => h(TradingPortal, { accountId: fixture.owner ?? "account-a", language: "en", candidates: currentCandidates,
      now, onAccessLost: () => { fixture.accessLost++; } });
    const root = () => renderer!.root;
    const text = () => label(root());
    const button = (name: string) => {
      const node = root().findAllByType("button").find(item => label(item) === name);
      assert.ok(node, `Expected button: ${name}`); return node;
    };
    const field = (name: string) => {
      const owner = root().findAllByType("label").find(item => item.children[0] === name);
      assert.ok(owner, `Expected labelled field: ${name}`);
      const node = owner.findAll(item => ["input", "textarea", "select"].includes(String(item.type)))[0];
      assert.ok(node, `Expected input: ${name}`); return node;
    };
    const until = async (predicate: () => boolean) => {
      for (let i = 0; i < 100 && !predicate(); i++) await act(async () => { await pause(); });
      assert.ok(predicate(), "Expected mounted state to settle");
    };
    const click = async (name: string) => { await act(async () => { button(name).props.onClick(); await pause(); }); };
    const change = async (name: string, value: string) => { await act(async () => { field(name).props.onChange({ target: { value } }); }); };
    const submit = async (twice = false) => {
      await act(async () => {
        const handler = root().findByType("form").props.onSubmit;
        void handler({ preventDefault() {} }); if (twice) void handler({ preventDefault() {} }); await pause();
      });
    };
    const posts = () => requests.filter(request => request.method === "POST");
    const mount = async (options: { rows?: TradingScenario[]; candidates?: LostDomainAssessment[]; reply?: typeof fixture.reply; wait?: boolean } = {}) => {
      if (renderer) await act(async () => { renderer!.unmount(); });
      requests.length = 0; fixture.owner = "account-a"; fixture.expired = false; fixture.accessLost = 0; fixture.confirms = 0; fixture.confirm = true;
      currentCandidates = options.candidates ?? [];
      fixture.reply = options.reply ?? (async () => snapshot("account-a", options.rows ?? []));
      await act(async () => { renderer = create(tree()); await pause(); });
      if (options.wait !== false) await until(() => requests.length === 1 && button(c.createThesis).props.disabled === false);
    };
    const fill = async (title = "My independent scenario") => {
      await click(c.tabs.scenarios);
      for (const [name, value] of [[c.domain, "EXAMPLE.COM"], [c.scenarioName, title], [c.thesis, "My hypothesis, not market evidence"],
        [c.catalyst, "A proposed demand catalyst"], [c.invalidation, "Demand does not emerge"], [c.reviewOn, "2030-02-28"],
        [c.acquisitionUsd, "100"], [c.annualRenewalUsd, "20"], [c.otherCostsUsd, "20"], [c.holdingMonths, "24"],
        [c.sellingFeePercent, "10"], [c.saleProbabilityPercent, "50"], [c.bearSaleUsd, "80"], [c.baseSaleUsd, "300"], [c.bullSaleUsd, "600"]]) {
        await change(name, value);
      }
    };

    await t.test("four navigable views have real empty states, not invented charts or results", async () => {
      await mount();
      const nav = root().findByType("nav");
      assert.deepEqual(nav.findAllByType("button").map(label), Object.values(c.tabs));
      assert.equal(button(c.tabs.radar).props["aria-pressed"], true);
      assert.match(text(), /No domains in this view yet/u);
      await click(c.tabs.twin); assert.match(text(), /Choose a domain to examine/u);
      await click(c.tabs.scenarios); assert.match(text(), /Build your first scenario/u);
      assert.equal(field(c.acquisitionUsd).props.value, "");
      assert.equal(field(c.saleProbabilityPercent).props.value, "");
      await click(c.tabs.journal); assert.match(text(), /Your journal is empty/u);
      assert.equal(posts().length, 0);
    });

    await t.test("analysis modes change real candidate order, retain evidence caveats and open the selected twin", async () => {
      await mount({ candidates: candidates() });
      const order = () => root().findAllByType("button").map(label).filter(value => /^(?:cloud\.com|cloudtools\.com|xqrmz\.com|risk\.app)/u.test(value)).map(value => value.match(/^[a-z]+\.(?:com|app)/u)![0]);
      assert.equal(order()[0], "cloudtools.com");
      await click(c.modes.brand); assert.equal(order()[0], "cloud.com");
      assert.ok(text().includes(c.modeHelp.brand));
      await click(c.modes.acquisition); assert.equal(order()[0], "xqrmz.com");
      await click(c.modes.risk); assert.equal(order()[0], "risk.app");
      assert.ok(text().includes(c.modeDisclaimer));
      assert.ok(text().includes(c.trendNote));
      await change(c.searchDomains, "xqrmz"); assert.deepEqual(order(), ["xqrmz.com"]);
      const domainButton = root().findAllByType("button").find(item => label(item).startsWith("xqrmz.com"))!;
      await act(async () => { domainButton.props.onClick(); });
      assert.equal(button(c.tabs.twin).props["aria-pressed"], true);
      assert.equal(label(root().findByType("h3")), "xqrmz.com");
      for (const name of Object.values(c.evidenceLabels).slice(0, 5)) assert.ok(text().includes(name));
      assert.ok(text().includes("$12.00"));
      assert.ok(text().includes(c.noPriceHistory));
      assert.ok(text().includes(c.evidenceNotice));
      await click(c.openScenario);
      assert.equal(field(c.domain).props.value, "xqrmz.com");
      assert.equal(field(c.modeLabel).props.value, "risk");
      assert.equal(field(c.acquisitionUsd).props.value, "", "An observed registrar subtotal never silently fills a total-cost assumption");
      assert.equal(posts().length, 0);
    });

    await t.test("the twin distinguishes fresh unknown, expired, missing and tied conflicting registry observations", async () => {
      const tile = (name: string) => root().findAllByType("h4").find(node => label(node) === name)!.parent!;
      const registryStatus = () => tile(c.evidenceLabels.registry).findAllByType("p").map(label);
      const freshUnknown = candidate("cloud.com", 80);
      freshUnknown.evidence[0] = { ...freshUnknown.evidence[0], outcome: "unknown" };
      await mount({ candidates: [freshUnknown] });
      const radar = root().findAllByType("button").find(node => label(node).startsWith("cloud.com"))!;
      assert.match(label(radar), /3\/4/u, "An unknown newest check is not counted as observed coverage");
      await click(c.tabs.twin);
      assert.equal(registryStatus()[0], c.unknown);
      assert.equal(registryStatus()[1], c.unknown);
      assert.ok(!label(tile(c.evidenceLabels.registry)).includes(c.observed));
      assert.ok(!label(tile(c.evidenceLabels.registry)).includes(c.evidenceExpired));
      assert.ok(!label(tile(c.evidenceLabels.registry)).includes(c.stateLabels.registry_not_found), "The aggregate cannot overwrite an unknown newer observation");

      const expired = candidate("cloud.com", 80);
      expired.evidence[0] = { ...expired.evidence[0], observedAt: iso(-20 * 60_000), expiresAt: iso(-5 * 60_000) };
      await mount({ candidates: [expired] }); await click(c.tabs.twin);
      assert.equal(registryStatus()[0], c.evidenceExpired);
      assert.equal(registryStatus()[1], c.stateLabels.registry_not_found, "An old result stays visible as history, not current evidence");

      const missing = candidate("cloud.com", 80);
      missing.evidence = missing.evidence.filter(item => item.kind !== "registry");
      await mount({ candidates: [missing] }); await click(c.tabs.twin);
      assert.deepEqual(registryStatus(), [c.missing]);
      assert.equal(tile(c.evidenceLabels.registry).findAllByType("time").length, 0);

      const conflicting = candidate("cloud.com", 80);
      conflicting.evidence.push({ ...conflicting.evidence[0], outcome: "registered" });
      await mount({ candidates: [conflicting] });
      assert.match(label(root().findAllByType("button").find(node => label(node).startsWith("cloud.com"))!), /3\/4/u);
      await click(c.tabs.twin);
      assert.equal(registryStatus()[0], c.unknown);
      assert.equal(registryStatus()[1], c.unknown, "Equal-time contradictory observations have no chosen winner");
      assert.ok(!label(tile(c.evidenceLabels.registry)).includes(c.observed));
      assert.ok(!label(tile(c.evidenceLabels.registry)).includes(c.stateLabels.registered));

      const newest = candidate("cloud.com", 80);
      newest.evidence.push({ ...newest.evidence[0], outcome: "registered", observedAt: iso(-30_000) });
      assert.equal(newest.registryStatus, "registry_not_found");
      await mount({ candidates: [newest] }); await click(c.tabs.twin);
      assert.equal(registryStatus()[0], c.observed);
      assert.equal(registryStatus()[1], c.stateLabels.registered, "Twin uses the newest registry outcome, not the report aggregate");
      assert.ok(label(tile(c.evidenceLabels.registry)).includes("https://example.test/fixture"));
      assert.equal(posts().length, 0);
    });

    await t.test("registrar unavailability is distinct from registry registration and partial/stale quotes stay explicit", async () => {
      const tile = (name: string) => root().findAllByType("h4").find(node => label(node) === name)!.parent!;
      const unavailable = candidate("cloud.com", 80, { quote: true });
      unavailable.registrar!.availability = "unavailable";
      await mount({ candidates: [unavailable] }); await click(c.tabs.twin);
      const registry = tile(c.evidenceLabels.registry), price = tile(c.evidenceLabels.price);
      assert.ok(label(registry).includes(c.stateLabels.registry_not_found));
      assert.ok(!label(registry).includes(c.stateLabels.registered));
      assert.match(label(price), /Porkbun · Unavailable to register/u);
      assert.ok(!label(price).includes(c.stateLabels.registered), "A registrar refusal does not become proof of a registry record");
      assert.match(label(price), /\$12\.00/u);
      assert.match(label(price), /Registration for the minimum term, before unconfirmed extras/u);
      assert.match(label(price), /not a final payable total or a reservation/u);
      assert.match(label(price), /Tax, fees, mandatory add-ons and the renewal contract term are unverified/u);
      assert.equal(price.findAllByType("time")[0].props.dateTime, unavailable.registrar!.checkedAt);

      for (const timeRange of [
        { checkedAt: iso(-10 * 60_000), expiresAt: iso(-5 * 60_000) },
        { checkedAt: iso(60_000), expiresAt: iso(120_000) },
      ]) {
        const stale = candidate("cloud.com", 80, { quote: true });
        Object.assign(stale.registrar!, timeRange);
        await mount({ candidates: [stale] }); await click(c.tabs.twin);
        const hidden = tile(c.evidenceLabels.price);
        assert.equal(hidden.findAllByType("p")[0].children[0], "—");
        assert.ok(label(hidden).includes(c.missing));
        assert.doesNotMatch(label(hidden), /\$12\.00|Available to register|Unavailable to register/u);
      }
      assert.equal(posts().length, 0, "Evidence viewing performs no quote refresh or acquisition mutation");
    });

    await t.test("user input calculates outcomes, but journal and saved status require the returned persisted snapshot", async () => {
      await mount(); await fill("  My independent scenario  ");
      assert.ok(text().includes(c.assumptionNotice));
      for (const value of ["$160.00", "$177.78", "$355.56", "-$160.00", "-$25.00", "$380.00"]) assert.ok(text().includes(value), value);
      const pending = deferred<unknown>(); fixture.reply = async () => pending.promise;
      await submit(true);
      assert.equal(posts().length, 1, "Synchronous double submit sends one mutation");
      const sent = posts()[0].body!.scenario;
      assert.equal(sent.domain, "example.com"); assert.equal(sent.title, "My independent scenario");
      assert.equal(sent.expectedVersion, 0); assert.match(sent.id, /^[a-f0-9-]{36}$/u);
      assert.ok(text().includes(c.saving)); assert.ok(!text().includes(c.scenarioSaved));
      await act(async () => { pending.resolve(snapshot("account-a", [persisted(sent, { title: "Server-confirmed title" })])); await pause(); });
      await until(() => text().includes(c.scenarioSaved));
      assert.equal(field(c.scenarioName).props.value, "Server-confirmed title");
      await click(c.tabs.journal);
      assert.match(text(), /Server-confirmed title/u);
      assert.equal(root().findAllByType("article").length, 1);
      assert.match(text(), /Version 1/u);
      await click(c.openScenarioEdit);
      await change(c.thesis, "Revised reasoning");
      fixture.reply = async request => snapshot("account-a", [persisted(request.body!.scenario)]);
      await submit(); await until(() => text().includes(c.scenarioSaved));
      assert.equal(posts().length, 2);
      assert.equal(posts()[1].body!.scenario.id, sent.id);
      assert.equal(posts()[1].body!.scenario.expectedVersion, 1);
      await click(c.tabs.journal); assert.match(text(), /Version 2/u);
      assert.equal(root().findAllByType("article").length, 1);
    });

    await t.test("unconfirmed saves preserve the draft and retry the same mutation id without fake success", async () => {
      await mount(); await fill("Keep this draft");
      const pending = deferred<unknown>(); fixture.reply = async () => pending.promise;
      await submit(true); assert.equal(posts().length, 1);
      await act(async () => { pending.reject({ status: 503, requestId }); await pause(); });
      await until(() => text().includes(c.saveError));
      assert.equal(field(c.scenarioName).props.value, "Keep this draft");
      assert.equal(field(c.acquisitionUsd).props.value, "100");
      assert.ok(!text().includes(c.scenarioSaved));
      assert.ok(text().includes(c.unsaved));
      const first = posts()[0].body!.scenario;
      fixture.reply = async request => snapshot("account-a", [persisted(request.body!.scenario)]);
      await submit(); await until(() => text().includes(c.scenarioSaved));
      assert.deepEqual(posts()[1].body!.scenario, first, "A transport retry reuses the exact id and version");
    });

    await t.test("editing after an uncertain create retains its UUID and cannot create a duplicate scenario", async () => {
      await mount(); await fill("Original submitted thesis");
      const serverRows = new Map<string, TradingScenario>();
      fixture.reply = async request => {
        if (!request.body) return snapshot("account-a", [...serverRows.values()]);
        const sent = request.body.scenario;
        if (serverRows.has(sent.id)) throw { status: 409, code: "scenario_conflict", requestId };
        serverRows.set(sent.id, persisted(sent));
        // Persistence succeeded; the acknowledgement was lost before the browser could confirm it.
        throw { status: 503, requestId };
      };
      await submit(); await until(() => text().includes(c.saveError));
      const original = posts()[0].body!.scenario;
      assert.equal(serverRows.size, 1);
      assert.ok(!text().includes(c.scenarioSaved));
      await change(c.scenarioName, "Edited after uncertain response");
      await change(c.baseSaleUsd, "350");
      await submit(); await until(() => root().findAllByProps({ role: "alert" }).length > 0 && !text().includes(c.saving));
      const retry = posts()[1].body!.scenario;
      assert.equal(retry.id, original.id, "Editing must not allocate a second create UUID after an uncertain commit");
      assert.equal(retry.expectedVersion, 0, "The browser has not confirmed a saved version yet");
      assert.equal(retry.title, "Edited after uncertain response");
      assert.equal(retry.assumptions.baseSaleUsd, 350);
      assert.equal(serverRows.size, 1, "Only the first durable scenario exists");
      assert.ok(text().includes(c.conflict));
      assert.equal(field(c.scenarioName).props.value, "Edited after uncertain response");
      assert.ok(!text().includes(c.scenarioSaved));
      await click(c.reload); await until(() => text().includes("Original submitted thesis"));
      assert.equal(root().findAllByType("article").length, 1);
    });

    await t.test("a cross-tab conflict requires loading and editing the latest persisted version", async () => {
      await mount({ rows: [scenario()] }); await click(c.tabs.journal); await click(c.openScenarioEdit);
      await change(c.thesis, "Unsaved reasoning from this tab");
      fixture.reply = async () => { throw { status: 409, code: "scenario_conflict", requestId }; };
      await submit(); await until(() => text().includes(c.conflict));
      assert.equal(field(c.thesis).props.value, "Unsaved reasoning from this tab");
      assert.ok(!text().includes(c.scenarioSaved));
      const updated = { ...scenario(), version: 2, thesis: "Saved from another tab", updatedAt: iso() };
      fixture.reply = async () => snapshot("account-a", [updated]);
      await click(c.reload); await until(() => text().includes("Saved from another tab"));
      await click(c.openScenarioEdit);
      assert.equal(fixture.confirms, 1, "Replacing local unsaved reasoning remains deliberate");
      assert.equal(field(c.thesis).props.value, "Saved from another tab");
      await change(c.thesis, "Merged reasoning after reload");
      fixture.reply = async request => snapshot("account-a", [persisted(request.body!.scenario)]);
      await submit(); await until(() => text().includes(c.scenarioSaved));
      assert.equal(posts().at(-1)!.body!.scenario.expectedVersion, 2);
      assert.equal(posts().at(-1)!.body!.scenario.id, scenario().id);
    });

    await t.test("missing acknowledgement or invalid input never creates a saved notice or journal row", async () => {
      await mount(); await click(c.tabs.scenarios); await submit();
      assert.equal(posts().length, 0); assert.ok(text().includes(c.invalidInput));
      await fill("Unacknowledged draft");
      fixture.reply = async () => snapshot();
      await submit(); await until(() => root().findAllByProps({ role: "alert" }).length > 0);
      assert.ok(!text().includes(c.scenarioSaved));
      assert.equal(field(c.scenarioName).props.value, "Unacknowledged draft");
      await click(c.tabs.journal); assert.equal(root().findAllByType("article").length, 0);
    });

    await t.test("dirty draft replacement asks once and cancellation does not discard user input", async () => {
      await mount(); await fill("Do not discard"); fixture.confirm = false;
      await click(c.resetDraft);
      assert.equal(fixture.confirms, 1); assert.equal(field(c.scenarioName).props.value, "Do not discard");
      fixture.confirm = true; await click(c.resetDraft);
      assert.equal(fixture.confirms, 2); assert.equal(field(c.scenarioName).props.value, "");
      assert.equal(posts().length, 0);
    });

    await t.test("account change clears prior rows, search and draft; a late save cannot restore private data", async () => {
      await mount({ rows: [scenario()], candidates: candidates() });
      await change(c.searchDomains, "private-query-a.com");
      await fill("Private pending A draft");
      const pending = deferred<unknown>(); fixture.reply = async () => pending.promise;
      await submit(); const sent = posts()[0].body!.scenario, oldSignal = posts()[0].signal;
      fixture.owner = "account-b"; currentCandidates = [];
      fixture.reply = async request => snapshot(request.accountId);
      await act(async () => { renderer!.update(tree()); await pause(); });
      await until(() => requests.some(request => request.accountId === "account-b"));
      assert.equal(oldSignal?.aborted, true);
      assert.equal(field(c.searchDomains).props.value, "");
      assert.doesNotMatch(text(), /Private pending A draft|Private account A thesis|private-alpha/u);
      await act(async () => { pending.resolve(snapshot("account-a", [persisted(sent)])); await pause(); });
      await click(c.tabs.journal); assert.equal(root().findAllByType("article").length, 0);
      assert.ok(!text().includes(c.scenarioSaved));
      await click(c.tabs.scenarios); assert.equal(field(c.scenarioName).props.value, ""); assert.equal(field(c.domain).props.value, "");
    });

    await t.test("a late initial response cannot repopulate another account's journal", async () => {
      const pending = deferred<unknown>();
      await mount({ wait: false, reply: async () => pending.promise });
      const oldSignal = requests[0].signal;
      fixture.owner = "account-b"; fixture.reply = async () => snapshot("account-b");
      await act(async () => { renderer!.update(tree()); await pause(); });
      await until(() => requests.length === 2);
      assert.equal(oldSignal?.aborted, true);
      await act(async () => { pending.resolve(snapshot("account-a", [scenario()])); await pause(); });
      await click(c.tabs.journal); assert.equal(root().findAllByType("article").length, 0);
      assert.doesNotMatch(text(), /Private account A thesis|private-alpha/u);
    });

    await t.test("session ownership loss and lost Trading access clear private drafts rather than exposing a retry path", async () => {
      for (const failure of ["owner", "expired", "forbidden"] as const) {
        await mount({ rows: [scenario()] }); await fill("Sensitive draft to forget");
        fixture.reply = async request => {
          if (failure === "owner") fixture.owner = "account-b";
          if (failure === "expired") fixture.expired = true;
          if (failure === "forbidden") throw { status: 403, requestId };
          return snapshot("account-a", [persisted(request.body!.scenario)]);
        };
        await submit(); await until(() => fixture.accessLost === 1);
        assert.equal(root().findAllByType("form").length, 0);
        assert.doesNotMatch(text(), /Sensitive draft to forget|Private account A thesis|private-alpha/u);
        assert.ok(!text().includes(c.scenarioSaved));
      }
    });

    await t.test("client boundary rejects corrupt snapshots, owner mismatches and duplicate rows before any journal render", async () => {
      const good = snapshot("account-a", [scenario()]);
      assert.deepEqual(client.parseTradingScenariosSnapshot(good, "account-a"), good);
      for (const value of [null, [], { ...good, extra: true }, { ...good, requestId: "raw-debug-data" },
        { ...good, scenarios: [scenario(), scenario()] }, { ...good, scenarios: [{ ...scenario(), assumptions: { ...scenario().assumptions, acquisitionUsd: "10" } }] }]) {
        assert.throws(() => client.parseTradingScenariosSnapshot(value, "account-a"), (error: { code?: string }) => error.code === "invalid");
      }
      assert.throws(() => client.parseTradingScenariosSnapshot(good, "account-b"), (error: { code?: string }) => error.code === "account_changed");
      requests.length = 0;
      await assert.rejects(client.saveTradingScenario({ accountId: "account-a" }, { ...scenario(), expectedVersion: 0 }),
        (error: { code?: string }) => error.code === "invalid");
      assert.equal(requests.length, 0, "Metadata is never sent as a mutation even when a caller bypasses TypeScript");
    });

    await t.test("client maps operational failures to bounded product errors without exposing raw diagnostics", async () => {
      fixture.owner = "account-a"; fixture.expired = false;
      for (const [failure, expected] of [
        [{ status: 401 }, "unauthenticated"], [{ status: 403 }, "trading_required"],
        [{ status: 409 }, "conflict"], [{ status: 409, code: "scenario_limit" }, "limit"],
        [{ status: 400 }, "invalid"], [{ status: 503 }, "unavailable"], [{ code: "account_changed" }, "account_changed"],
      ] as const) {
        fixture.reply = async () => { throw { ...failure, requestId, message: "Internal sensitive diagnostic" }; };
        await assert.rejects(client.getTradingScenarios({ accountId: "account-a" }), (error: { code?: string; requestId?: string; message?: string }) => {
          assert.equal(error.code, expected); assert.equal(error.requestId, requestId);
          assert.doesNotMatch(error.message ?? "", /Internal sensitive diagnostic/u); return true;
        });
      }
      fixture.reply = async () => { throw { status: 503, requestId: "raw SQL and secrets" }; };
      await assert.rejects(client.getTradingScenarios({ accountId: "account-a" }), (error: { requestId?: string }) => error.requestId === undefined);
    });
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [name, original] of originals) {
      if (original) Object.defineProperty(globalThis, name, original); else Reflect.deleteProperty(globalThis, name);
    }
  }
});
