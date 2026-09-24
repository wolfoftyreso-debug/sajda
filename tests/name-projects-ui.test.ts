import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { nameProjectsCopy } from "../src/i18n/nameProjectsCopy";
import { brandShortlistCopy } from "../src/i18n/brandShortlistCopy";
import type { NameProject, NameProjectInput } from "../shared/name-projects";

const c = nameProjectsCopy.en, at = "2030-01-01T12:00:00.000Z", requestId = "req_0123456789abcdef";
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
function label(node: ReactTestInstance): string { return node.children.map(child => typeof child === "string" ? child : label(child)).join(""); }
function persisted(input: NameProjectInput): NameProject { const { expectedVersion, ...value } = input; return { ...value, version: expectedVersion + 1, createdAt: at, updatedAt: at }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test("mounted name projects support same-account work, immutable retries, archive and multilingual states", async t => {
  const key = "__NAME_PROJECTS_UI_TEST__", originals = new Map([key, "window", "requestAnimationFrame", "IS_REACT_ACT_ENVIRONMENT"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  type Request = { path: string; accountId: string; signal: AbortSignal; method?: string; body?: { project: NameProjectInput } };
  const requests: Request[] = [], rows = new Map<string, NameProject>();
  const snapshot = (accountId: string) => ({ accountId, requestId, projects: [...rows.values()] });
  const fixture = { owner: "account-a", language: "en", confirms: 0,
    reply: async (request: Request): Promise<unknown> => {
      if (request.path === "/api/account/saved-domains") return { items: [{ id: "1", domain: "example.com", created_at: at }, { id: "2", domain: "example.org", created_at: at }], nextCursor: null };
      assert.equal(request.path, "/api/account/name-projects");
      if (request.body) { const row = persisted(request.body.project); rows.set(row.id, row); }
      return snapshot(request.accountId);
    },
    request: async (path: string, options: Omit<Request, "path">) => { const request = { path, ...options }; requests.push(request); return fixture.reply(request); },
    session: async () => ({ user: { id: fixture.owner }, expires_at: Date.now() / 1000 + 3600 }),
  };
  const set = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { configurable: true, value });
  set(key, fixture); set("IS_REACT_ACT_ENVIRONMENT", true); set("window", { confirm: () => { fixture.confirms++; return true; }, addEventListener() {}, removeEventListener() {} }); set("requestAnimationFrame", (run: () => void) => run());
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "projects-ui-transport-fixture", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>({user:{id:globalThis.${key}.owner,email_verified:true},loading:false});`;
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});`;
      if (file.endsWith("/src/integrations/neon/auth.ts")) return `export const accountRequest=(path,options)=>globalThis.${key}.request(path,options);export const readAccountSession=()=>globalThis.${key}.session();`;
      if (file.endsWith("/src/lib/appSurface.ts")) return "export const isNativeApp=false;";
      if (file.endsWith("/src/lib/nativeTransport.ts")) return "export const nativeShareFile=()=>{throw new Error('No native calls in web fixture')};";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const Page = (await vite.ssrLoadModule("/src/pages/NameProjects.tsx")).default;
    const tree = () => h(MemoryRouter, { initialEntries: ["/projects"] }, h(Page));
    const root = () => renderer!.root;
    const text = () => label(root());
    const button = (name: string) => { const item = root().findAllByType("button").find(node => label(node) === name); assert.ok(item, name); return item; };
    const field = (name: string) => root().findAll(node => ["input", "textarea", "select"].includes(String(node.type)) && node.props.name === name)[0];
    const change = async (name: string, value: string) => { await act(async () => { field(name).props.onChange({ target: { value } }); }); };
    const click = async (name: string) => { await act(async () => { button(name).props.onClick(); await pause(); }); };
    const posts = () => requests.filter(request => request.method === "POST");
    const submit = async (twice = false) => { await act(async () => { const handler = root().findByType("form").props.onSubmit; const event = { preventDefault() {}, currentTarget: { elements: { namedItem: () => null } } }; void handler(event); if (twice) void handler(event); await pause(); }); };
    const healthy = fixture.reply;
    const mount = async (reply = healthy) => {
      await act(async () => { renderer?.unmount(); }); requests.length = 0; rows.clear(); fixture.owner = "account-a"; fixture.language = "en"; fixture.reply = reply;
      await act(async () => { renderer = create(tree()); await pause(); });
    };
    await t.test("empty workspace creates a private brief, zero budget and ordered saved finalists with no implicit search", async () => {
      await mount(); assert.ok(text().includes(c.empty)); assert.equal(posts().length, 0);
      await click(c.create); await change("title", "My new app"); await change("description", "A private naming brief"); await change("budget.maxFirstYearCents", "0");
      await act(async () => { root().findAllByType("input").find(node => node.props.type === "checkbox" && node.parent?.children.some(child => typeof child !== "string" && label(child).includes("example.com")))!.props.onChange({ target: { checked: true } }); });
      await submit(true); assert.equal(posts().length, 1); const sent = posts()[0].body!.project;
      assert.equal(sent.title, "My new app"); assert.equal(sent.budget.maxFirstYearCents, 0); assert.equal(sent.budget.maxAnnualRenewalCents, null); assert.deepEqual(sent.shortlistDomains, ["example.com"]);
      assert.ok(text().includes(c.saved)); assert.equal(button(c.save).props.disabled, true);
      const find = root().findAll(node => typeof node.type !== "string" && node.props.state?.nameProject?.id === sent.id)[0];
      assert.ok(find); assert.equal(find.props.to, "/"); assert.equal(find.props.state.nameProjectAccountId, "account-a"); assert.equal(find.props.state.nameProject.title, "My new app");
      const form = root().findByType("form");
      const nodes = form.findAll(node => node.type === "a" && label(node) === c.find || node.type === "input" && node.props.name === "title");
      assert.equal(nodes[0].type, "a"); assert.equal(nodes[1].type, "input");
      assert.equal(form.findAll(node => node.type === "a" && label(node) === c.find).length, 1);
      assert.equal(requests.filter(request => request.path.includes("search")).length, 0);
      const archive = root().findAllByType("label").find(node => label(node) === c.archive)!;
      await act(async () => { archive.findByType("input").props.onChange({ target: { checked: true } }); });
      await submit(); assert.equal(posts()[1].body!.project.expectedVersion, 1); assert.equal(posts()[1].body!.project.archived, true);
      assert.equal(rows.get(sent.id)!.version, 2);
      assert.equal(root().findAll(node => typeof node.type !== "string" && node.props.state?.nameProject?.id === sent.id).length, 0);
      assert.ok(button(c.export));
      await act(async () => { root().findAllByType("label").find(node => label(node) === c.archive)!.findByType("input").props.onChange({ target: { checked: false } }); });
      await submit(); assert.equal(posts()[2].body!.project.expectedVersion, 2); assert.equal(rows.get(sent.id)!.archived, false);
    });
    await t.test("unconfirmed save locks edits and retries the identical UUID, version and body", async () => {
      let attempt = 0;
      await mount(async request => { if (request.method === "POST" && ++attempt === 1) throw { status: 503 }; return healthy(request); });
      await click(c.create); await change("title", "Frozen draft"); await submit();
      assert.ok(text().includes(c.saveError)); assert.ok(button(c.retrySave));
      await change("title", "Forbidden new input"); assert.equal(field("title").props.value, "Frozen draft");
      await submit(true); assert.equal(posts().length, 2); assert.deepEqual(posts()[0].body, posts()[1].body); assert.ok(text().includes(c.saved));
    });
    await t.test("late owner-A saves are cancelled and cannot populate owner B", async () => {
      const pending = deferred<unknown>();
      await mount(async request => request.method === "POST" ? pending.promise : healthy(request));
      await click(c.create); await change("title", "Private account A"); await submit(); const old = posts()[0];
      fixture.owner = "account-b"; await act(async () => { renderer!.update(tree()); await pause(); });
      assert.equal(old.signal.aborted, true); assert.ok(!text().includes("Private account A"));
      await act(async () => { pending.resolve({ accountId: "account-a", requestId, projects: [persisted(old.body!.project)] }); await pause(); });
      assert.ok(!text().includes("Private account A")); assert.ok(text().includes(c.empty));
    });
    await t.test("conflicting versions require an explicit reload instead of repeated stale saves", async () => {
      await mount(async request => { if (request.method === "POST") throw { status: 409, code: "project_conflict" }; return healthy(request); });
      await click(c.create); await change("title", "Conflicting draft"); await submit();
      assert.ok(text().includes(c.conflict)); assert.equal(button(c.save).props.disabled, true);
      await change("title", "Must not silently replace"); assert.equal(field("title").props.value, "Conflicting draft");
      await submit(); assert.equal(posts().length, 1);
      await click(c.reload); assert.ok(text().includes(c.empty));
    });
    await t.test("saved brand packages reload as configuration, reopen with owner binding and survive ordinary project edits", async () => {
      const brand = { label: "northlane", requiredTlds: ["com", "dev"], platforms: ["github" as const], markets: ["US" as const, "SE" as const], source: "user_supplied" as const };
      const frenchBrand = { ...brand, nameLanguage: "fr" as const };
      const prior = persisted({ id: "aaaaaaaa-0000-4000-8000-000000000001", expectedVersion: 3, title: "Brand candidates", description: "A private project", audience: "Founders", desiredStyle: "Short", languages: ["en"], budget: { currency: "USD", maxFirstYearCents: null, maxAnnualRenewalCents: null }, archived: false, shortlistDomains: [], brandShortlist: [brand, frenchBrand] });
      await mount(async request => { if (request.path.endsWith("name-projects") && !request.method && !rows.size) rows.set(prior.id, prior); return healthy(request); });
      assert.ok(text().includes(brandShortlistCopy.en.section)); assert.ok(text().includes(brandShortlistCopy.en.userInput));
      const reopen = root().findAll(node => typeof node.type !== "string" && node.props.to === "/name-packages" && node.props.state?.brandPackage)[0];
      assert.ok(reopen); assert.equal(reopen.props.state.nameProjectAccountId, "account-a");
      assert.deepEqual(reopen.props.state.brandPackage, brand);
      assert.deepEqual(reopen.props.state.nameProject.brandShortlist, [brand, frenchBrand]);
      const frenchReopen = root().findAll(node => typeof node.type !== "string" && node.props.to === "/name-packages" && node.props.state?.brandPackage?.nameLanguage === "fr")[0];
      assert.ok(frenchReopen); assert.deepEqual(frenchReopen.props.state.brandPackage, frenchBrand);
      assert.ok(text().includes("Name language: English")); assert.ok(text().includes("Name language: French"));
      assert.equal(requests.some(request => /search|domain-check|social/u.test(request.path)), false, "Loading saved choices never checks providers automatically");
      await change("title", "Changed project title"); await submit();
      assert.deepEqual(posts()[0].body!.project.brandShortlist, [brand, frenchBrand]); assert.equal(posts()[0].body!.project.expectedVersion, 4);
      const remove = root().findAllByType("button").find(node => node.props["aria-label"] === `${brandShortlistCopy.en.remove}: northlane (English)`)!;
      await act(async () => { remove.props.onClick(); }); await submit();
      assert.deepEqual(posts()[1].body!.project.brandShortlist, [frenchBrand], "Removing the English package preserves the same name in French");
    });
    await t.test("disabled backend remains recoverable and all five languages render their own copy", async () => {
      await mount(async request => { if (request.path.endsWith("name-projects")) throw { status: 404 }; return healthy(request); });
      assert.ok(text().includes(c.disabled)); assert.equal(root().findAllByType("form").length, 0); assert.ok(button(c.retry));
      for (const [language, copy] of Object.entries(nameProjectsCopy)) { fixture.language = language; await act(async () => { renderer!.update(tree()); }); assert.ok(text().includes(copy.title)); assert.ok(text().includes(copy.disabled)); }
      fixture.language = "en"; fixture.reply = healthy; await act(async () => { renderer!.update(tree()); }); await click(c.retry); assert.ok(text().includes(c.empty));
    });
  } finally { await act(async () => { renderer?.unmount(); }); await vite.close(); for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); } }
});
