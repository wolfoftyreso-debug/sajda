import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/domain-search";

const porkbunUrl = "https://api.porkbun.com/api/json/v3/pricing/get";
const loopiaUrl = "https://www.loopia.se/domannamn/detaljerad_prislista/";
const hour = 60 * 60_000;
let sequence = 0;
let clockSequence = 0;

interface Offer {
  providerId: string;
  purchaseUrl: string;
  priceSourceUrl: string;
  priceStatus: string;
  dataSource: string;
  connectorState: string;
  priceScope?: string;
  currency?: string;
  registrationPrice?: number;
  renewalPrice?: number;
  registrationPriceInclVat?: number;
  taxTreatment?: string;
  checkedAt: string | null;
  priceVerified: boolean;
  note?: string;
}
interface Result {
  domain: string;
  tld: string;
  status: string;
  authoritative: boolean;
  registrarOffers: Offer[];
}
interface Payload {
  providers: Array<{ id: string; livePriceConnection: boolean; dataSource: string }>;
  results: Result[];
}
async function request(body: Record<string, unknown> = {}) {
  const result = { code: 0, body: {} as Payload };
  const response = {
    setHeader() {},
    status(code: number) { result.code = code; return this; },
    json(value: unknown) { result.body = value as Payload; },
    end() {},
  };
  await handler({ method: "POST", headers: {
    "content-type": "application/json", "x-forwarded-for": `registrar-fixture-${++sequence}`,
  }, body: { domains: [`registrarfixture${sequence}.com`], providers: ["porkbun"], locale: "en", ...body } }, response);
  assert.equal(result.code, 200, JSON.stringify(result.body));
  return result.body;
}
function fixture(t: TestContext) {
  const now = Date.UTC(2030, 0, 1) + ++clockSequence * 4 * hour;
  t.mock.timers.enable({ apis: ["Date"], now });
  const envNames = ["TLDES_API_KEY", "NAME_QUEST_PROVIDER_PORKBUN_PRICE_API_URL", "NAME_QUEST_PROVIDER_PORKBUN_PRICE_API_TOKEN"];
  const saved = envNames.map(name => [name, process.env[name]] as const);
  envNames.forEach(name => { delete process.env[name]; });
  t.after(() => { for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  } });
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const diagnostics: unknown[] = [];
  t.mock.method(console, "warn", (message: string) => { diagnostics.push(JSON.parse(message)); });
  const control = {
    price: async (_init?: RequestInit): Promise<Response> => Response.json({ status: "SUCCESS", pricing: {
      com: { registration: "11.08", renewal: "11.08" }, dev: { registration: "12.50", renewal: "12.50" },
    } }),
    registryTaken: false,
    loopia: async (): Promise<Response> => new Response('<table><tr><td>.com </td><td><span class="with_tax">249,00</span><span class="without_tax">199,20</span></td><td><span class="with_tax">349,00</span></td></tr></table>', { headers: { "content-type": "text/html" } }),
    tldes: () => Response.json({ updated: new Date().toISOString(), registrars: [] }),
  };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === porkbunUrl) return control.price(init);
    if (url === loopiaUrl) return control.loopia();
    if (new URL(url).hostname === "tldes.com") return control.tldes();
    assert.match(url, /^https:\/\/(rdap\.verisign\.com|pubapi\.registry\.google|rdap\.publicinterestregistry\.org|rdap\.identitydigital\.services|rdap\.centralnic\.com|rdap\.nic\.biz)\//);
    const domain = decodeURIComponent(new URL(url).pathname.split("/domain/").at(-1)!);
    return control.registryTaken
      ? Response.json({ objectClassName: "domain", ldhName: domain }, { headers: { "content-type": "application/rdap+json" } })
      : Response.json({ errorCode: 404 }, { status: 404, headers: { "content-type": "application/rdap+json" } });
  });
  return { control, calls, diagnostics, now, priceCalls: () => calls.filter(call => call.url === porkbunUrl) };
}
function offer(payload: Payload, provider = "porkbun", tld = "com") {
  const found = payload.results.find(result => result.tld === tld)?.registrarOffers.find(item => item.providerId === provider);
  assert.ok(found);
  return found;
}

test("Porkbun public USD prices preserve Loopia and unconnected providers without asserting availability", async t => {
  const f = fixture(t);
  f.control.registryTaken = true;
  process.env.NAME_QUEST_PROVIDER_PORKBUN_PRICE_API_URL = "http://127.0.0.1/private";
  process.env.NAME_QUEST_PROVIDER_PORKBUN_PRICE_API_TOKEN = "private-test-token";
  const payload = await request({ providers: ["porkbun", "loopia", "cloudflare"] });
  const price = offer(payload);
  assert.equal(payload.results[0].status, "taken");
  assert.equal(payload.results[0].authoritative, true);
  assert.equal(price.currency, "USD");
  assert.equal(price.registrationPrice, 11.08);
  assert.equal(price.renewalPrice, 11.08);
  assert.equal(price.priceScope, "standard_tld");
  assert.equal(price.taxTreatment, "unknown");
  assert.equal(price.dataSource, "official_provider_api");
  assert.equal(price.priceStatus, "verified");
  assert.equal(price.priceVerified, true);
  assert.equal(price.checkedAt, new Date(f.now).toISOString());
  assert.equal(price.priceSourceUrl, porkbunUrl);
  assert.equal(new URL(price.purchaseUrl).hostname, "porkbun.com");
  assert.equal(offer(payload, "loopia").currency, "SEK");
  assert.equal(offer(payload, "loopia").registrationPriceInclVat, 249);
  assert.equal(offer(payload, "cloudflare").priceStatus, "not_connected");
  assert.equal(offer(payload, "cloudflare").registrationPrice, undefined);
  assert.equal(payload.providers.find(provider => provider.id === "porkbun")?.livePriceConnection, true);
  const call = f.priceCalls()[0];
  assert.equal(call.init?.method, "GET");
  assert.equal(call.init?.redirect, "error");
  assert.equal(call.init?.body, undefined);
  assert.ok(call.init?.signal);
  assert.deepEqual(call.init?.headers, { Accept: "application/json", "User-Agent": "Sajda-Price-Check/1.0" });
  assert.doesNotMatch(JSON.stringify(f.calls) + JSON.stringify(payload), /private-test-token|127\.0\.0\.1/);
  assert.deepEqual(f.diagnostics, [], "Successful source snapshots must not create failure logs");
});

test("provider failure diagnostics are fixed-schema, payload-free and bounded by snapshot caching", async t => {
  const f = fixture(t);
  const sensitive = "private-price-payload-domain.example-secret";
  f.control.loopia = async () => new Response(sensitive, { status: 403, headers: { "content-type": "text/html" } });
  f.control.price = async () => Response.json({ error: sensitive }, { status: 503 });
  const providers = ["loopia", "porkbun"];
  const first = await request({ providers, domains: ["private-query.com", "private-query.dev"] });
  assert.equal(offer(first, "loopia").priceVerified, false);
  assert.equal(offer(first, "porkbun").priceVerified, false);
  const ordered = () => [...f.diagnostics].sort((a, b) => (a as { provider: string }).provider.localeCompare((b as { provider: string }).provider));
  const expected = [
    { event: "registrar_price_unavailable", provider: "loopia", reason: "http_error", status: 403 },
    { event: "registrar_price_unavailable", provider: "porkbun", reason: "http_error", status: 503 },
  ];
  assert.deepEqual(ordered(), expected);
  await request({ providers });
  assert.equal(f.diagnostics.length, 2, "Cached failures must not log again for another name or request");
  t.mock.timers.setTime(f.now + 60_000);
  await request({ providers });
  assert.equal(f.diagnostics.length, 4, "Exactly one record per provider refresh, not per domain");
  assert.doesNotMatch(JSON.stringify(f.diagnostics), /private-|https?:|secret|payload/);
});

test("content, parser and transport failures never forward untrusted error details into logs", async t => {
  const f = fixture(t);
  f.control.loopia = async () => new Response("secret-page", { headers: { "content-type": "application/json" } });
  f.control.price = async () => new Response("secret-invalid-json", { headers: { "content-type": "application/json" } });
  await request({ providers: ["loopia", "porkbun"] });
  assert.ok(f.diagnostics.some(row => (row as { reason: string }).reason === "unexpected_content_type"));
  assert.ok(f.diagnostics.some(row => (row as { reason: string }).reason === "invalid_response"));
  t.mock.timers.setTime(f.now + 60_000);
  f.control.loopia = async () => { throw new Error("secret-url https://private.example/account"); };
  f.control.price = async () => { throw new Error("secret-api-key"); };
  await request({ providers: ["loopia", "porkbun"] });
  assert.equal(f.diagnostics.filter(row => (row as { reason: string }).reason === "request_failed").length, 2);
  assert.doesNotMatch(JSON.stringify(f.diagnostics), /secret|private|https?:/);
});

test("empty supported price snapshots produce one diagnostic without inventing offers", async t => {
  const f = fixture(t);
  f.control.loopia = async () => new Response("<html>No price table</html>", { headers: { "content-type": "text/html" } });
  f.control.price = async () => Response.json({ status: "SUCCESS", pricing: {} });
  const payload = await request({ providers: ["loopia", "porkbun"] });
  assert.equal(offer(payload, "loopia").priceVerified, false);
  assert.equal(offer(payload).priceVerified, false);
  assert.equal(f.diagnostics.length, 2);
  assert.ok(f.diagnostics.every(row => (row as { reason: string }).reason === "no_usable_prices"));
});

test("published price snapshots coalesce requests, cover later suffixes, and expire after fifteen minutes", async t => {
  const f = fixture(t);
  let release!: (value: Response) => void;
  f.control.price = () => new Promise(resolve => { release = resolve; });
  const first = request();
  const second = request({ domains: ["registrar-cache.dev"] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.priceCalls().length, 1);
  release(Response.json({ status: "SUCCESS", pricing: {
    com: { registration: "11.08", renewal: "11.08" }, dev: { registration: "12.50", renewal: "12.50" },
  } }));
  const [a, b] = await Promise.all([first, second]);
  assert.equal(offer(a).registrationPrice, 11.08);
  assert.equal(offer(b, "porkbun", "dev").registrationPrice, 12.5);
  t.mock.timers.setTime(f.now + 15 * 60_000 - 1);
  await request({ domains: ["registrar-cache-later.dev"], locale: "sv" });
  assert.equal(f.priceCalls().length, 1);
  t.mock.timers.setTime(f.now + 15 * 60_000);
  f.control.price = async () => Response.json({ status: "SUCCESS", pricing: { com: { registration: "12.08", renewal: "12.08" } } });
  assert.equal(offer(await request()).registrationPrice, 12.08);
  assert.equal(f.priceCalls().length, 2);
});

test("malformed prices, special naming systems, and injected links cannot become verified offers", async t => {
  const f = fixture(t);
  f.control.price = async () => Response.json({ status: "SUCCESS", pricing: {
    com: { registration: "11.08", renewal: "12.00", purchaseUrl: "http://localhost/", coupons: { registration: { amount: 100 } } },
    net: { registration: "-1", renewal: "12" }, org: { registration: true, renewal: "12" },
    dev: { registration: "1e2", renewal: "12" }, app: { registration: "12" },
    ai: { registration: "1000001", renewal: "12" }, xyz: { registration: "1", renewal: "1", specialType: "handshake" },
    info: { registration: 1, renewal: 1 }, biz: { registration: "12 USD", renewal: "12" },
    se: { registration: "10", renewal: "10" }, nu: { registration: "0", renewal: "0" },
  } });
  const suffixes = ["com", "net", "org", "dev", "app", "ai", "xyz", "info", "biz", "se", "nu"];
  const payload = await request({ domains: suffixes.map(tld => `registrar-schema.${tld}`) });
  for (const tld of suffixes.filter(value => !["com", "se", "nu"].includes(value))) {
    assert.equal(offer(payload, "porkbun", tld).priceStatus, "unavailable", tld);
    assert.equal(offer(payload, "porkbun", tld).registrationPrice, undefined, tld);
  }
  assert.equal(offer(payload).registrationPrice, 11.08, "Coupon amount must not replace the default price");
  assert.equal(new URL(offer(payload).purchaseUrl).hostname, "porkbun.com");
  assert.equal(offer(payload, "porkbun", "nu").registrationPrice, 0);
  assert.equal(payload.results.find(result => result.tld === "se")?.status, "unknown");
  assert.equal(payload.results.find(result => result.tld === "se")?.authoritative, false);
});

test("upstream failures remain unavailable, are cached for one minute, and never revive stale prices", async t => {
  const f = fixture(t);
  assert.equal(offer(await request()).priceVerified, true);
  t.mock.timers.setTime(f.now + 15 * 60_000);
  f.control.price = async () => { throw new Error("private upstream failure"); };
  const failed = offer(await request());
  assert.equal(failed.priceStatus, "unavailable");
  assert.equal(failed.priceVerified, false);
  assert.equal(failed.registrationPrice, undefined);
  assert.equal(failed.checkedAt, new Date(f.now + 15 * 60_000).toISOString());
  assert.doesNotMatch(JSON.stringify(failed), /private upstream/);
  t.mock.timers.setTime(f.now + 16 * 60_000 - 1);
  await request();
  assert.equal(f.priceCalls().length, 2);
  t.mock.timers.setTime(f.now + 16 * 60_000);
  f.control.price = async () => Response.json({ status: "SUCCESS", pricing: { com: { registration: "13", renewal: "13" } } });
  assert.equal(offer(await request()).registrationPrice, 13);
  assert.equal(f.priceCalls().length, 3);
});

test("HTTP, content-type, JSON, schema, and response-size failures fail closed", async t => {
  const f = fixture(t);
  const responses = [
    () => Response.json({ status: "SUCCESS", pricing: {} }, { status: 503 }),
    () => new Response('{"status":"SUCCESS","pricing":{}}', { headers: { "content-type": "text/html" } }),
    () => new Response("{", { headers: { "content-type": "application/json" } }),
    () => Response.json({ status: "ERROR", pricing: { com: { registration: "12", renewal: "12" } } }),
    () => Response.json({ status: "SUCCESS", pricing: [] }),
    () => Response.json({ status: "SUCCESS", pricing: {} }, { headers: { "content-length": "1000001" } }),
    () => new Response(" ".repeat(1_000_001), { headers: { "content-type": "application/json" } }),
  ];
  for (let i = 0; i < responses.length; i++) {
    t.mock.timers.setTime(f.now + i * 61_000);
    f.control.price = async () => responses[i]();
    const failed = offer(await request());
    assert.equal(failed.priceStatus, "unavailable");
    assert.equal(failed.registrationPrice, undefined);
    assert.ok(failed.checkedAt);
  }
  assert.equal(f.priceCalls().length, responses.length);
});

test("a stalled JSON body is aborted by the price timeout", async t => {
  const f = fixture(t);
  t.mock.timers.reset();
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: f.now });
  let signal: AbortSignal | null | undefined;
  let bodyRead!: () => void;
  const reading = new Promise<void>(resolve => { bodyRead = resolve; });
  f.control.price = async init => {
    signal = init?.signal;
    return new Response(new ReadableStream({
      start(controller) {
        signal?.addEventListener("abort", () => controller.error(new Error("timed out")), { once: true });
      },
      pull() { bodyRead(); },
    }), { headers: { "content-type": "application/json" } });
  };
  const pending = request();
  await reading;
  t.mock.timers.tick(7_500);
  assert.equal(offer(await pending).priceStatus, "unavailable");
  assert.equal(signal?.aborted, true);
  assert.deepEqual(f.diagnostics, [{ event: "registrar_price_unavailable", provider: "porkbun", reason: "timeout" }]);
});

test("Porkbun is fetched only when selected and works in Swipe with no price feed key", async t => {
  const f = fixture(t);
  await request({ providers: ["cloudflare"] });
  assert.equal(f.priceCalls().length, 0);
  const payload = await request({ domains: undefined, swipe: true, count: 5, tlds: ["dev"] });
  assert.equal(payload.results.length, 5);
  assert.ok(payload.results.every(result => result.status === "available" && result.registrarOffers[0].currency === "USD"));
  assert.equal(f.priceCalls().length, 1);
  assert.equal(f.calls.filter(call => new URL(call.url).hostname === "tldes.com").length, 0);
});

test("configured TLDES remains a fallback with its own provenance and provider links", async t => {
  const f = fixture(t);
  process.env.TLDES_API_KEY = "test-key-not-for-output";
  f.control.price = async () => Response.json({ status: "SUCCESS", pricing: {} });
  f.control.tldes = () => Response.json({ updated: new Date().toISOString(), registrars: [
    { name: "porkbun.com", currency: "USD", prices: [["com", "14.50", "15.50"]] },
    { name: "namecheap.com", currency: "USD", prices: [["com", "16.50", "17.50"]] },
  ] });
  const payload = await request({ providers: ["porkbun", "namecheap"] });
  assert.equal(offer(payload).dataSource, "tldes_price_feed");
  assert.equal(offer(payload).registrationPrice, 14.5);
  assert.equal(offer(payload, "namecheap").registrationPrice, 16.5);
  assert.equal(new URL(offer(payload, "namecheap").purchaseUrl).hostname, "www.namecheap.com");
  assert.doesNotMatch(JSON.stringify(payload), /test-key-not-for-output/);
});
