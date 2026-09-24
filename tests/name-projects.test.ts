import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createNameProjectsHandler } from "../api/account/name-projects.js";
import { createNameProjectsStore, type NameProjectsClient } from "../api/_shared/name-projects-store.js";
import { AccountAccessError } from "../api/_shared/account-error.js";
import { NAME_PROJECT_LIMIT, nameProjectInputSchema, type NameProjectInput } from "../shared/name-projects.js";

function project(overrides: Partial<NameProjectInput> = {}): NameProjectInput {
  return { id: randomUUID(), expectedVersion: 0, title: "Aurora", description: "A planning app", audience: "Independent founders",
    desiredStyle: "Short and easy to spell", languages: ["en", "sv"], budget: { currency: "USD", maxFirstYearCents: 3000, maxAnnualRenewalCents: 2000 },
    archived: false, shortlistDomains: [], ...overrides };
}
function fixture() {
  let records = new Map<string, Record<string, unknown>>();
  let snapshot = structuredClone(records);
  const owners = new Set(["owner-a", "owner-b"]);
  const saved = new Map<string, Set<string>>([["owner-a", new Set(["example.com", "example.dev"])], ["owner-b", new Set(["other.com"])]]);
  const calls: { sql: string; values: unknown[] }[] = [];
  let count = 1, failMarker = "", rollbackFails = false;
  const releases: boolean[] = [];
  const key = (values: unknown[]) => `${values[1]}:${values[0]}:${values[2]}`;
  const filtered = (values: unknown[]) => [...records.values()].filter(row => row.owner_id === values[0] && row.namespace === values[1]);
  const readable = (row: Record<string, unknown>) => ({ ...structuredClone(row), shortlist_domains: (row.shortlist_domains as string[]).filter(domain => saved.get(String(row.owner_id))?.has(domain)) });
  const client: NameProjectsClient = { release(destroy) { releases.push(Boolean(destroy)); }, async query(sql, values = []) {
    calls.push({ sql, values });
    if (failMarker && sql.includes(failMarker)) throw new Error("postgres://secret database failure");
    if (sql === "BEGIN" || sql === "BEGIN READ ONLY") { snapshot = structuredClone(records); return { rows: [] }; }
    if (sql === "ROLLBACK") { if (rollbackFails) throw new Error("Connection lost"); records = snapshot; return { rows: [] }; }
    if (sql === "COMMIT" || sql.startsWith("SET LOCAL") || sql.includes("projects:lock")) return { rows: [] };
    if (sql.includes("projects:read-owner") || sql.includes("projects:owner")) return { rows: owners.has(String(values[0])) ? [{ owner_id: values[0] }] : [] };
    if (sql.includes("projects:limit")) return { rows: [{ request_count: count }] };
    if (sql.includes("projects:list")) return { rows: filtered(values).slice(0, Number(values[2])).map(readable) };
    if (sql.includes("projects:current")) { const row = records.get(key(values)); return { rows: row ? [readable(row)] : [] }; }
    if (sql.includes("projects:count")) return { rows: [{ count: filtered(values).length }] };
    if (sql.includes("projects:saved")) return { rows: (values[1] as string[]).filter(domain => saved.get(String(values[0]))?.has(domain)).map(domain => ({ domain })) };
    if (sql.includes("projects:insert") || sql.includes("projects:update")) {
      const previous = records.get(key(values));
      if (sql.includes("projects:update") && (!previous || previous.version !== values[5])) return { rows: [] };
      const row = { namespace: values[1], owner_id: values[0], id: values[2], payload: JSON.parse(String(values[3])),
        last_input_hash: values[4], version: previous ? Number(previous.version) + 1 : 1,
        created_at: previous?.created_at ?? new Date("2026-09-13T12:00:00Z"), updated_at: new Date("2026-09-13T12:01:00Z"), shortlist_domains: [] };
      records.set(key(values), row); return { rows: [{ id: row.id }] };
    }
    if (sql.includes("projects:unlink")) { records.get(key(values))!.shortlist_domains = []; return { rows: [] }; }
    if (sql.includes("projects:link")) { records.get(key(values))!.shortlist_domains = [...values[3] as string[]]; return { rows: [] }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const makeStore = (namespace = "development") => createNameProjectsStore({ pool: { connect: async () => client },
    environment: () => ({ VERCEL: "1", VERCEL_ENV: namespace }) });
  return { store: makeStore(), makeStore, calls, releases, owners, saved, records: () => records,
    rate: (value: number) => { count = value; }, fail: (marker: string, brokenRollback = false) => { failMarker = marker; rollbackFails = brokenRollback; } };
}

test("project schema keeps brief and money semantics explicit, bounded and owner-free", () => {
  const valid = project({ title: "  Café norr  ", description: "Planera bättre 🧭", shortlistDomains: ["xn--caf-dma.se"] });
  assert.equal(nameProjectInputSchema.parse(valid).title, "Café norr");
  assert.equal(nameProjectInputSchema.parse(project({ budget: { currency: "SEK", maxFirstYearCents: null, maxAnnualRenewalCents: 0 } })).budget.maxFirstYearCents, null);
  for (const value of [
    { ...valid, title: " " }, { ...valid, title: "x".repeat(121) }, { ...valid, description: "x".repeat(2001) },
    { ...valid, audience: "x".repeat(501) }, { ...valid, desiredStyle: "x".repeat(501) },
    { ...valid, ownerId: "victim" }, { ...valid, plan: "trading" }, { ...valid, languages: [] },
    { ...valid, languages: ["en", "en"] }, { ...valid, languages: ["unknown"] },
    { ...valid, expectedVersion: -1 }, { ...valid, expectedVersion: 0.5 }, { ...valid, id: "not-an-id" },
    { ...valid, budget: { currency: "USD", maxFirstYearCents: -1, maxAnnualRenewalCents: 100 } },
    { ...valid, budget: { currency: "USD", maxFirstYearCents: 1.5, maxAnnualRenewalCents: 100 } },
    { ...valid, budget: { currency: "USD", maxFirstYearCents: Infinity, maxAnnualRenewalCents: 100 } },
    { ...valid, budget: { currency: "USD", maxFirstYearCents: 100, maxAnnualRenewalCents: 100, priceVerified: true } },
    { ...valid, shortlistDomains: ["example.com", "example.com"] }, { ...valid, shortlistDomains: ["https://example.com"] },
    { ...valid, shortlistDomains: ["example.com/path"] }, { ...valid, shortlistDomains: ["EXAMPLE.COM"] },
    { ...valid, shortlistDomains: ["localhost"] }, { ...valid, shortlistDomains: Array.from({ length: 101 }, (_, i) => `example${i}.com`) },
  ]) assert.equal(nameProjectInputSchema.safeParse(value).success, false, JSON.stringify(value));
});

test("project store persists brief, ordered shortlist and optimistic revisions with exact retries", async () => {
  const f = fixture(), input = project({ shortlistDomains: ["example.dev", "example.com"] });
  const first = await f.store.save("owner-a", input);
  assert.equal(first[0].version, 1); assert.equal(first[0].budget.maxFirstYearCents, 3000);
  assert.deepEqual(first[0].shortlistDomains, input.shortlistDomains);
  assert.deepEqual(await f.store.read("owner-a"), first);
  assert.deepEqual(await f.store.save("owner-a", input), first, "Identical create retry returns receipt without another record");
  await assert.rejects(() => f.store.save("owner-a", { ...input, title: "Different retry" }), { code: "project_conflict" });
  const edit = { ...input, expectedVersion: 1, title: "Better Aurora", shortlistDomains: ["example.com"] };
  const second = await f.store.save("owner-a", edit);
  assert.equal(second[0].version, 2); assert.equal(second[0].createdAt, first[0].createdAt);
  assert.deepEqual(await f.store.save("owner-a", edit), second);
  await assert.rejects(() => f.store.save("owner-a", input), { code: "project_conflict" });
  const archived = await f.store.save("owner-a", { ...edit, expectedVersion: 2, archived: true });
  assert.equal(archived[0].archived, true);
  assert.deepEqual([...f.saved.get("owner-a")!], ["example.com", "example.dev"], "Replacing/archiving a project never deletes saved originals");
  const lock = f.calls.findIndex(call => call.sql.includes("projects:lock"));
  const count = f.calls.findIndex(call => call.sql.includes("projects:count"));
  assert.ok(lock >= 0 && count > lock, "The account transaction lock precedes capacity checking");
  assert.match(f.calls.find(call => call.sql.includes("projects:saved"))!.sql, /user_id=\$1[\s\S]+FOR KEY SHARE/u);
});

test("brand shortlist persists in existing JSON payload and older editor saves cannot erase it", async () => {
  const f = fixture();
  const entry = { label: "northlane", requiredTlds: ["com", "se"], platforms: ["github" as const], markets: ["US" as const, "SE" as const], source: "user_supplied" as const };
  const input = project({ brandShortlist: [entry], shortlistDomains: ["example.com"] });
  const first = await f.store.save("owner-a", input);
  assert.deepEqual(first[0].brandShortlist, [entry]);
  assert.deepEqual(await f.store.save("owner-a", input), first, "Exact brand-package create retries do not duplicate records");
  assert.deepEqual(await f.store.read("owner-b"), []);
  const { brandShortlist: _omitted, ...oldEditorInput } = input;
  const legacySave = { ...oldEditorInput, expectedVersion: 1, title: "Edited in an older tab" };
  const preserved = await f.store.save("owner-a", legacySave);
  assert.equal(preserved[0].version, 2);
  assert.deepEqual(preserved[0].brandShortlist, [entry], "Omitted optional field is not a deletion command");
  assert.deepEqual(await f.store.save("owner-a", legacySave), preserved, "Legacy retry hashes still match their original payload");
  await assert.rejects(() => f.store.save("owner-a", { ...input, expectedVersion: 1, brandShortlist: [{ ...entry, markets: ["FR"] }] }), { code: "project_conflict" });
  const cleared = await f.store.save("owner-a", { ...legacySave, expectedVersion: 2, brandShortlist: [] });
  assert.deepEqual(cleared[0].brandShortlist, [], "An explicit empty list removes the saved configuration");
  assert.deepEqual(cleared[0].shortlistDomains, ["example.com"]);
});

test("brand shortlist retries reject altered stored configurations rather than accepting only a matching hash", async () => {
  const f = fixture();
  const entry = { label: "northlane", requiredTlds: ["com"], platforms: ["github" as const], markets: ["US" as const], source: "user_supplied" as const };
  const input = project({ brandShortlist: [entry] });
  await f.store.save("owner-a", input);
  const stored = f.records().values().next().value!;
  (stored.payload as { brandShortlist: typeof entry[] }).brandShortlist[0].requiredTlds = ["dev"];
  await assert.rejects(() => f.store.save("owner-a", input), { code: "project_conflict" });
});

test("stored JSONB size limits remain an editable input error before insert rather than an uncertain database save", async () => {
  const f = fixture();
  const entry = { label: "northlane", requiredTlds: ["com"], platforms: ["github" as const], markets: ["US" as const], source: "user_supplied" as const };
  const input = project({ description: "界".repeat(2000), audience: "界".repeat(500), desiredStyle: "界".repeat(500),
    brandShortlist: Array.from({ length: 25 }, (_, index) => ({ ...entry, label: `brand${index}`, note: "界".repeat(500) })) });
  assert.equal(nameProjectInputSchema.safeParse(input).success, true);
  await assert.rejects(() => f.store.save("owner-a", input), { code: "invalid_request", status: 400 });
  assert.equal(f.records().size, 0);
  assert.equal(f.calls.some(call => call.sql.includes("projects:insert")), false);
});

test("all project text rejects PostgreSQL-incompatible characters but preserves valid emoji", async () => {
  const f = fixture();
  for (const field of ["title", "description", "audience", "desiredStyle"] as const) {
    assert.equal(nameProjectInputSchema.parse(project({ [field]: "Café 🧭 🚀 中文" }))[field], "Café 🧭 🚀 中文");
    for (const invalid of ["NUL\u0000text", "lone high\ud800", "lone low\udc00", "\ud800x\udc00"]) {
      const input = project({ [field]: invalid });
      assert.equal(nameProjectInputSchema.safeParse(input).success, false);
      await assert.rejects(() => f.store.save("owner-a", input), { code: "invalid_request" });
    }
  }
  assert.equal(f.calls.length, 0, "Invalid persisted text is rejected before opening a DB connection");
  const api = apiFixture();
  assert.equal((await api.call("POST", { action: "save", project: project({ title: "Invalid\u0000title" }) })).code, 400);
  assert.equal(api.actions.some(action => action.startsWith("save:")), false);
});

test("retry receipts require matching persisted brief and an ordered subset, not merely the stored hash", async () => {
  for (const alter of [
    (row: Record<string, unknown>) => { (row.payload as Record<string, unknown>).title = "Divergent stored title"; },
    (row: Record<string, unknown>) => { (row.payload as Record<string, unknown>).budget = { currency: "USD", maxFirstYearCents: 1, maxAnnualRenewalCents: 1 }; },
    (row: Record<string, unknown>) => { row.shortlist_domains = ["example.dev", "example.com"]; },
    (row: Record<string, unknown>) => { row.shortlist_domains = ["example.com", "unexpected.com"]; },
    (row: Record<string, unknown>) => { row.last_input_hash = "0".repeat(64); },
  ]) {
    const f = fixture(), input = project({ shortlistDomains: ["example.com", "example.dev"] });
    f.saved.get("owner-a")!.add("unexpected.com");
    await f.store.save("owner-a", input);
    alter(f.records().values().next().value!);
    await assert.rejects(() => f.store.save("owner-a", input), { code: "project_conflict" });
  }
  const f = fixture(), input = project({ shortlistDomains: ["example.com", "example.dev"] });
  await f.store.save("owner-a", input);
  f.saved.get("owner-a")!.delete("example.com");
  const retried = await f.store.save("owner-a", input);
  assert.deepEqual(retried[0].shortlistDomains, ["example.dev"], "A legitimate deletion remains a successful receipt without restoring it");
  assert.equal(retried[0].version, 1);
});

test("projects isolate both account and environment, including foreign saved references", async () => {
  const f = fixture(), input = project({ shortlistDomains: ["example.com"] });
  await f.store.save("owner-a", input);
  assert.deepEqual(await f.store.read("owner-b"), []);
  assert.deepEqual(await f.makeStore("preview").read("owner-a"), []);
  await assert.rejects(() => f.store.save("owner-b", { ...input, expectedVersion: 1 }), { code: "project_conflict" });
  await assert.rejects(() => f.store.save("owner-b", input), { code: "saved_domain_required" });
  assert.deepEqual(await f.store.read("owner-b"), []);
  const owned = await f.store.save("owner-b", { ...input, shortlistDomains: ["other.com"] });
  assert.equal(owned[0].id, input.id); assert.deepEqual(owned[0].shortlistDomains, ["other.com"]);
  assert.equal((await f.store.read("owner-a"))[0].shortlistDomains[0], "example.com");
  assert.equal((await f.makeStore("preview").save("owner-a", input))[0].version, 1);
  await assert.rejects(() => f.makeStore("unknown").read("owner-a"), { code: "name_projects_unavailable" });
});

test("removed saved originals stay removed on retry; stale project edits cannot reattach them", async () => {
  const f = fixture(), input = project({ shortlistDomains: ["example.com"] });
  await f.store.save("owner-a", input);
  f.saved.get("owner-a")!.delete("example.com");
  assert.deepEqual((await f.store.save("owner-a", input))[0].shortlistDomains, []);
  await assert.rejects(() => f.store.save("owner-a", { ...input, expectedVersion: 1 }), { code: "saved_domain_required" });
  assert.equal((await f.store.read("owner-a"))[0].version, 1);
});

test("project quota is account scoped, checked on creates and does not prevent editing", async () => {
  const f = fixture();
  for (let i = 0; i < NAME_PROJECT_LIMIT; i++) await f.store.save("owner-a", project());
  await assert.rejects(() => f.store.save("owner-a", project()), { code: "project_limit" });
  const row = (await f.store.read("owner-a"))[0];
  assert.equal((await f.store.save("owner-a", project({ id: row.id, title: "Edited at capacity", expectedVersion: row.version }))).length, NAME_PROJECT_LIMIT);
});

test("project storage revalidates identity, record ownership and safely rolls back failures", async () => {
  const f = fixture(), input = project();
  await assert.rejects(() => f.store.read(""), { code: "invalid_session" });
  await assert.rejects(() => f.store.save("missing-owner", input), { code: "invalid_session" });
  await assert.rejects(() => f.store.save("owner-a", { ...input, ownerId: "victim" } as NameProjectInput), { code: "invalid_request" });
  f.fail("projects:link");
  await assert.rejects(() => f.store.save("owner-a", { ...input, shortlistDomains: ["example.com"] }), { code: "name_projects_unavailable" });
  assert.equal(f.records().size, 0);
  f.fail(""); await f.store.save("owner-a", input);
  f.owners.delete("owner-a");
  await assert.rejects(() => f.store.read("owner-a"), { code: "invalid_session" });
  f.owners.add("owner-a");
  f.records().values().next().value!.payload = { title: "Corrupt persisted payload" };
  await assert.rejects(() => f.store.read("owner-a"), { code: "name_projects_unavailable" });
  f.fail("projects:read-owner", true);
  await assert.rejects(() => f.store.read("owner-a"), { code: "name_projects_unavailable" });
  assert.equal(f.releases.at(-1), true, "A connection with failed rollback is destroyed");
});

test("project rate denial commits the counter and separates account/environment buckets", async () => {
  const f = fixture();
  await f.store.limit("owner-a"); await f.store.limit("owner-b"); await f.makeStore("preview").limit("owner-a");
  assert.equal(new Set(f.calls.filter(call => call.sql.includes("projects:limit")).map(call => call.values[0])).size, 3);
  f.rate(61); await assert.rejects(() => f.store.limit("owner-a"), { code: "rate_limited" });
  assert.equal(f.calls.at(-1)?.sql, "COMMIT");
  f.rate(NaN); await assert.rejects(() => f.store.limit("owner-a"), { code: "name_projects_unavailable" });
});

const headers = { "content-type": "application/json", origin: "https://sajda.test" };
function response() { return { code: 0, data: undefined as unknown, headers: new Map<string, string | number>(),
  setHeader(name: string, value: string | number) { this.headers.set(name.toLowerCase(), value); },
  status(code: number) { this.code = code; return this; }, json(data: unknown) { this.data = data; } }; }
function apiFixture(overrides: Parameters<typeof createNameProjectsHandler>[0] = {}) {
  const actions: string[] = [];
  const handler = createNameProjectsHandler({ enabled: () => true, authorize: async (_headers, options) => {
    assert.equal(options?.verifiedEmail, true); actions.push(`authorize:${options?.method}`);
    return { id: "owner-a", email: "fixture@example.test", emailVerified: true };
  }, store: { limit: async owner => { actions.push(`limit:${owner}`); }, read: async owner => { actions.push(`read:${owner}`); return []; },
    save: async (owner, input) => { actions.push(`save:${owner}:${input.title}`); return []; } }, ...overrides });
  async function call(method = "GET", body?: unknown, query?: Record<string, unknown>) {
    const res = response(); await handler({ method, headers, body, query }, res); return res;
  }
  return { handler, actions, call };
}

test("project API is dark by default and never trusts plan or owner supplied by clients", async () => {
  const dark = apiFixture({ enabled: () => false });
  assert.equal((await dark.call()).code, 404); assert.deepEqual(dark.actions, []);
  const f = apiFixture(), input = project();
  assert.equal((await f.call()).code, 200);
  assert.equal((await f.call("POST", { action: "save", project: input })).code, 200);
  assert.deepEqual(f.actions, ["authorize:GET", "limit:owner-a", "read:owner-a", "authorize:POST", "limit:owner-a", "save:owner-a:Aurora"]);
  for (const body of [{ action: "save", project: input, userId: "victim" }, { action: "save", project: { ...input, plan: "trading" } }]) {
    const before = f.actions.length; assert.equal((await f.call("POST", body)).code, 400);
    assert.deepEqual(f.actions.slice(before), ["authorize:POST"]);
  }
  assert.equal((await f.call("GET", undefined, { userId: "victim" })).code, 400);
  const result = await f.call();
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(result.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(result.headers.get("access-control-allow-origin"), undefined);
});

test("project API rejects malformed JSON, large inputs, unsupported methods and content types", async () => {
  const f = apiFixture();
  assert.equal((await f.call("DELETE")).code, 405);
  assert.equal((await f.call("POST", "{")).code, 400);
  assert.equal((await f.call("POST", "x".repeat(32769))).code, 413);
  const wrongType = response();
  await f.handler({ method: "POST", headers: { "content-type": "text/plain" }, body: {} }, wrongType);
  assert.equal(wrongType.code, 415);
  const malformed = response();
  await f.handler({ method: "POST", headers, get body() { throw new SyntaxError("broken parser"); } }, malformed);
  assert.equal(malformed.code, 400);
  assert.equal(f.actions.some(action => action.startsWith("save:")), false);
});

test("project API preserves auth/quota/conflict errors and redacts unexpected service failures", async () => {
  for (const [status, code] of [[401, "authentication_required"], [403, "invalid_origin"], [429, "rate_limited"], [409, "project_conflict"]] as const) {
    const f = apiFixture({ authorize: async () => { throw new AccountAccessError(code, status, "Retry safely."); } });
    const result = await f.call(); assert.equal(result.code, status);
    assert.equal(result.headers.get("retry-after"), status === 429 ? 60 : undefined);
    assert.deepEqual(f.actions, []);
  }
  const f = apiFixture({ authorize: async () => { throw new Error("postgres://secret SQL PII"); } });
  const result = await f.call(); assert.equal(result.code, 503);
  assert.doesNotMatch(JSON.stringify(result.data), /postgres|secret|SQL|PII/);
});

test("project migration enforces owner-scoped cascading references without deleting saved originals", () => {
  const sql = readFileSync(new URL("../db/migrations/0019_name_projects.sql", import.meta.url), "utf8");
  assert.match(sql, /FOREIGN KEY \(namespace, owner_id, project_id\)[\s\S]+REFERENCES sajda.name_projects\(namespace, owner_id, id\) ON DELETE CASCADE/u);
  assert.match(sql, /FOREIGN KEY \(owner_id, domain\)[\s\S]+REFERENCES sajda.saved_domains\(user_id, domain\) ON DELETE CASCADE/u);
  assert.match(sql, /REFERENCES public.sajda_auth_user\(id\) ON DELETE CASCADE/u);
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/gu) ?? []).length, 2);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE sajda.saved_domains/u);
  const publicTools = readFileSync(new URL("../api/mcp/public.ts", import.meta.url), "utf8");
  assert.doesNotMatch(publicTools, /name-projects|nameProjects/u);
});
