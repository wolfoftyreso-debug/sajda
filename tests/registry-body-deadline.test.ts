import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import handler from "../api/domain-search.js";

const loopiaUrl = "https://www.loopia.se/domannamn/detaljerad_prislista/";
const porkbunUrl = "https://api.porkbun.com/api/json/v3/pricing/get";
let fixtureNumber = 0, requestNumber = 0;
interface Payload {
  results: Array<{ status: string; authoritative: boolean; error?: string;
    registrarOffers: Array<{ providerId: string; priceStatus: string; registrationPriceInclVat?: number; registrationPrice?: number }> }>;
}
function fixture(t: TestContext) {
  const now = Date.UTC(2038, 0, 1) + ++fixtureNumber * 24 * 3600000;
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now });
  const savedKey = process.env.TLDES_API_KEY;
  delete process.env.TLDES_API_KEY;
  t.after(() => {
    if (savedKey === undefined) delete process.env.TLDES_API_KEY; else process.env.TLDES_API_KEY = savedKey;
  });
  const signals: AbortSignal[] = [], responses: Response[] = [], diagnostics: unknown[] = [];
  t.mock.method(console, "warn", (value: string) => diagnostics.push(JSON.parse(value)));
  const control = {
    loopia: async (): Promise<Response> => new Response('<table><tr><td>.com </td><td><span class="with_tax">249,00</span><span class="without_tax">199,20</span></td><td><span class="with_tax">349,00</span></td></tr></table>', { headers: { "content-type": "text/html" } }),
    porkbun: async (): Promise<Response> => Response.json({ status: "SUCCESS", pricing: { com: { registration: "10.00", renewal: "12.00" } } }),
    tldes: async (): Promise<Response> => Response.json({ updated: new Date().toISOString(), registrars: [] }),
    registry: async (): Promise<Response> => Response.json({ errorCode: 404 }, { status: 404, headers: { "content-type": "application/rdap+json" } }),
  };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    assert.ok(init?.signal, "Every provider request needs a cancellation signal.");
    signals.push(init.signal);
    const result = url === loopiaUrl ? await control.loopia() : url === porkbunUrl ? await control.porkbun()
      : new URL(url).hostname === "tldes.com" ? await control.tldes() : await (async () => {
        assert.match(url, /^https:\/\/rdap\.verisign\.com\/com\/v1\/domain\/deadlinefixture\d+\.com$/u);
        return control.registry();
      })();
    responses.push(result);
    return result;
  });
  return { control, signals, responses, diagnostics };
}
async function invoke(providers = ["loopia"]): Promise<Payload> {
  const result = { status: 0, payload: {} as Payload }, id = ++requestNumber;
  const response = {
    setHeader() {}, status(value: number) { result.status = value; return response; },
    json(value: unknown) { result.payload = value as Payload; }, end() {},
  };
  await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `deadline-fixture-${id}` },
    body: { domains: [`deadlinefixture${id}.com`], providers, locale: "en" } }, response);
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  return result.payload;
}
function stalledBody(contentType: string, headers: Record<string, string> = {}, status = 200) {
  let cancellations = 0, controller!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    // Deliberately broken cleanup must not keep the handler waiting either.
    cancel() { cancellations++; return new Promise<void>(() => {}); },
  }), { status, headers: { "content-type": contentType, ...headers } });
  return { response, controller, cancellations: () => cancellations };
}
function offer(payload: Payload, provider: string) {
  const result = payload.results[0].registrarOffers.find(value => value.providerId === provider);
  assert.ok(result); return result;
}

test("Loopia headers do not disarm the body deadline; even hung cancellation returns an unpriced result", async t => {
  const f = fixture(t), body = stalledBody("text/html");
  f.control.loopia = async () => body.response;
  let completed = false;
  const pending = invoke().then(value => { completed = true; return value; });
  await nextTurn();
  t.mock.timers.tick(7499); await nextTurn(); assert.equal(completed, false);
  t.mock.timers.tick(1);
  const payload = await pending;
  assert.equal(payload.results[0].status, "available");
  assert.equal(offer(payload, "loopia").priceStatus, "unavailable");
  assert.equal(offer(payload, "loopia").registrationPriceInclVat, undefined);
  assert.equal(body.cancellations(), 1); assert.equal(body.response.body?.locked, false);
  assert.ok(f.signals.every(signal => signal.aborted));
  assert.deepEqual(f.diagnostics, [{ event: "registrar_price_unavailable", provider: "loopia", reason: "timeout" }]);
});

test("a stalled registry body becomes unknown at 3500ms and releases its reader without relying on fetch abort", async t => {
  const f = fixture(t), body = stalledBody("application/rdap+json", {}, 404);
  f.control.registry = async () => body.response;
  let completed = false;
  const pending = invoke(["cloudflare"]).then(value => { completed = true; return value; });
  await nextTurn();
  t.mock.timers.tick(3499); await nextTurn(); assert.equal(completed, false);
  t.mock.timers.tick(1);
  const payload = await pending;
  assert.equal(payload.results[0].status, "unknown"); assert.equal(payload.results[0].authoritative, false);
  assert.equal(body.cancellations(), 1); assert.equal(body.response.body?.locked, false);
  assert.ok(f.signals.every(signal => signal.aborted));
  assert.doesNotMatch(JSON.stringify(payload), /Provider response timed out|stack/u);
});

for (const provider of ["porkbun", "tldes"] as const) test(`${provider} body shares the price deadline and cannot block other registry evidence`, async t => {
  const f = fixture(t), body = stalledBody("application/json");
  f.control[provider] = async () => body.response;
  if (provider === "tldes") process.env.TLDES_API_KEY = "synthetic-test-key";
  const pending = invoke([provider === "tldes" ? "cloudflare" : provider]);
  await nextTurn(); t.mock.timers.tick(7500);
  const payload = await pending;
  assert.equal(payload.results[0].status, "available");
  assert.notEqual(offer(payload, provider === "tldes" ? "cloudflare" : provider).priceStatus, "verified");
  assert.equal(body.cancellations(), 1); assert.equal(body.response.body?.locked, false);
  assert.ok(f.signals.every(signal => signal.aborted));
  assert.doesNotMatch(JSON.stringify(payload), /synthetic-test-key/u);
});

test("successful price and registry reads retain evidence and clean up without a later timeout diagnostic", async t => {
  const f = fixture(t);
  const payload = await invoke(["loopia", "porkbun"]);
  assert.equal(payload.results[0].status, "available"); assert.equal(payload.results[0].authoritative, true);
  assert.equal(offer(payload, "loopia").registrationPriceInclVat, 249);
  assert.equal(offer(payload, "porkbun").registrationPrice, 10);
  assert.equal(f.diagnostics.length, 0);
  assert.ok(f.responses.every(response => !response.body?.locked));
  assert.ok(f.signals.every(signal => signal.aborted));
  t.mock.timers.tick(60000); await nextTurn();
  assert.equal(f.diagnostics.length, 0);
});

test("HTTP errors cancel unread provider bodies immediately, even when cancellation never resolves", async t => {
  const f = fixture(t), price = stalledBody("text/html", {}, 503), registry = stalledBody("text/html", {}, 503);
  f.control.loopia = async () => price.response; f.control.registry = async () => registry.response;
  const payload = await invoke();
  assert.equal(payload.results[0].status, "unknown"); assert.equal(payload.results[0].authoritative, false);
  assert.equal(offer(payload, "loopia").priceStatus, "unavailable");
  assert.equal(price.cancellations(), 1); assert.equal(registry.cancellations(), 1);
  assert.ok(f.responses.every(response => !response.body?.locked));
  assert.ok(f.signals.every(signal => signal.aborted));
});

for (const mode of ["declared", "streamed"] as const) test(`${mode} oversized price and registry bodies are cancelled without reading unbounded data`, async t => {
  const f = fixture(t);
  const price = stalledBody("text/html", mode === "declared" ? { "content-length": "1000001" } : {});
  const registry = stalledBody("application/rdap+json", mode === "declared" ? { "content-length": "262145" } : {}, 404);
  if (mode === "streamed") {
    price.controller.enqueue(new Uint8Array(1000001)); registry.controller.enqueue(new Uint8Array(262145));
  }
  f.control.loopia = async () => price.response; f.control.registry = async () => registry.response;
  const payload = await invoke();
  assert.equal(payload.results[0].status, "unknown"); assert.equal(payload.results[0].authoritative, false);
  assert.equal(offer(payload, "loopia").priceStatus, "unavailable");
  assert.equal(price.cancellations(), 1); assert.equal(registry.cancellations(), 1);
  assert.ok(f.responses.every(response => !response.body?.locked));
});

test("a stream error cannot leak provider data or leave reader locks behind", async t => {
  const f = fixture(t), body = stalledBody("application/rdap+json", {}, 404);
  f.control.registry = async () => body.response;
  const pending = invoke(["cloudflare"]);
  await nextTurn(); body.controller.error(new Error("private provider token secret"));
  const payload = await pending;
  assert.equal(payload.results[0].status, "unknown"); assert.equal(body.response.body?.locked, false);
  assert.doesNotMatch(JSON.stringify(payload), /private provider token secret/u);
  assert.ok(f.signals.every(signal => signal.aborted));
});

test("a provider ignoring abort before headers cannot block the deadline and its late body is cancelled", async t => {
  const f = fixture(t), body = stalledBody("text/html");
  let deliver!: (response: Response) => void;
  f.control.loopia = () => new Promise(resolve => { deliver = resolve; });
  const pending = invoke();
  await nextTurn(); t.mock.timers.tick(7500);
  const payload = await pending;
  assert.equal(offer(payload, "loopia").priceStatus, "unavailable");
  deliver(body.response); await nextTurn();
  assert.equal(body.cancellations(), 1); assert.equal(body.response.body?.locked, false);
});
