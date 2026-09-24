import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { brandShortlistCopy } from "../src/i18n/brandShortlistCopy";
import type { BrandShortlistEntry, NameProject, NameProjectInput } from "../shared/name-projects";

const copy = brandShortlistCopy.en, requestId = "req_0123456789abcdef", at = "2030-01-01T00:00:00.000Z";
const entry: BrandShortlistEntry = { label: "northlane", nameLanguage: "fr", requiredTlds: ["com", "dev"], platforms: ["github"], markets: ["US", "SE"], source: "user_supplied" };
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
function text(node: ReactTestInstance): string { return node.children.map(child => typeof child === "string" ? child : text(child)).join(""); }
function saved(input: NameProjectInput): NameProject { const { expectedVersion, ...row } = input; return { ...row, version: expectedVersion + 1, createdAt: at, updatedAt: at }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test("brand-package saving uses explicit, revisioned, account-safe actions and recoverable exact retries", async t => {
  const key = "__BRAND_PACKAGE_SAVE_TEST__", originals = new Map([key, "IS_REACT_ACT_ENVIRONMENT"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  type Request = { accountId: string; signal: AbortSignal; method?: string; body?: { project: NameProjectInput } };
  const requests: Request[] = [], rows = new Map<string, NameProject>();
  const snapshot = (accountId: string) => ({ accountId, requestId, projects: [...rows.values()] });
  const fixture = { owner: "owner-a", language: "en", verified: true,
    reply: async (request: Request): Promise<unknown> => { if (request.body) rows.set(request.body.project.id, saved(request.body.project)); return snapshot(request.accountId); },
    request: async (url: string, options: Request) => { assert.equal(url, "/api/account/name-projects"); requests.push(options); return fixture.reply(options); },
    session: async () => ({ user: { id: fixture.owner }, expires_at: Date.now() / 1000 + 3600 }),
  };
  Object.defineProperty(globalThis, key, { configurable: true, value: fixture });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false }, resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "save-package-transport-fixture", enforce: "pre", load(id) {
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/contexts/AuthContext.tsx")) return `export const useAuth=()=>({user:{id:globalThis.${key}.owner,email_verified:globalThis.${key}.verified},loading:false});`;
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${key}.language});`;
      if (file.endsWith("/src/lib/nameProjectsFeature.ts")) return "export const nameProjectsEnabled=true;";
      if (file.endsWith("/src/integrations/neon/auth.ts")) return `export const accountRequest=(url,options)=>globalThis.${key}.request(url,options);export const readAccountSession=()=>globalThis.${key}.session();`;
      // Render the dialog contents without DOM portals. This tests component
      // state and requests, not browser focus, geometry or the Radix primitives.
      if (file.endsWith("/src/components/ui/dialog.tsx")) return `import {createElement as h} from 'react'; export const Dialog=props=>h('section',{'data-dialog':true,onOpenChange:props.onOpenChange,open:props.open},props.open?props.children:null); export const DialogContent=props=>h('div',{},props.children); export const DialogHeader=props=>h('header',{},props.children); export const DialogTitle=props=>h('h2',{},props.children); export const DialogDescription=props=>h('p',{},props.children);`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const Component = (await vite.ssrLoadModule("/src/components/SaveBrandPackageButton.tsx")).SaveBrandPackageButton;
    const tree = (projectId?: string) => h(MemoryRouter, {}, h(Component, { entry, projectId }));
    const root = () => renderer!.root;
    const button = (label: string) => { const result = root().findAllByType("button").find(item => text(item) === label); assert.ok(result, label); return result; };
    const posts = () => requests.filter(request => request.method === "POST");
    const healthy = fixture.reply;
    const mount = async (reply = healthy, initial?: NameProject) => {
      await act(async () => { renderer?.unmount(); }); requests.length = 0; rows.clear(); fixture.owner = "owner-a"; fixture.verified = true; fixture.language = "en"; fixture.reply = reply;
      if (initial) rows.set(initial.id, initial);
      await act(async () => { renderer = create(tree(initial?.id)); await pause(); });
    };
    const open = async () => { await act(async () => { button(copy.save).props.onClick(); await pause(); }); };
    const submit = async (twice = false) => { await act(async () => { const handler = root().findByType("form").props.onSubmit; const event = { preventDefault() {} }; handler(event); if (twice) handler(event); await pause(); }); };
    await t.test("no network until opened; creating a project saves only explicit user configuration once", async () => {
      await mount(); assert.equal(requests.length, 0);
      await open(); assert.equal(requests.length, 1); assert.equal(posts().length, 0);
      await submit(true); assert.equal(posts().length, 1);
      const sent = posts()[0].body!.project;
      assert.deepEqual(sent.brandShortlist, [entry]); assert.deepEqual(sent.shortlistDomains, []);
      assert.equal(sent.brandShortlist?.[0].nameLanguage, "fr", "English interface locale cannot overwrite the chosen French name language");
      assert.deepEqual(sent.languages, ["fr"], "New project language reflects the selected package language, not the interface");
      assert.equal(sent.expectedVersion, 0); assert.equal(sent.title, entry.label);
      assert.ok(text(root()).includes(copy.saved));
      assert.equal(root().findAll(node => node.type === "a" && text(node) === copy.view)[0].props.href, "/projects");
    });
    await t.test("saving into a project keeps its whole brief, revision and existing shortlists", async () => {
      const prior: NameProject = { id: "aaaaaaaa-0000-4000-8000-000000000001", version: 7, createdAt: at, updatedAt: at, title: "Existing project", description: "Keep this brief", audience: "Founders", desiredStyle: "Minimal", languages: ["sv"], budget: { currency: "SEK", maxFirstYearCents: 20000, maxAnnualRenewalCents: 10000 }, archived: false, shortlistDomains: ["example.com"], brandShortlist: [{ ...entry, label: "oldbrand" }] };
      await mount(healthy, prior); await open(); await submit();
      const sent = posts()[0].body!.project;
      assert.equal(sent.expectedVersion, 7); assert.equal(sent.title, prior.title); assert.equal(sent.description, prior.description); assert.deepEqual(sent.budget, prior.budget);
      assert.deepEqual(sent.shortlistDomains, ["example.com"]); assert.deepEqual(sent.brandShortlist, [prior.brandShortlist![0], entry]);
    });
    await t.test("an unconfirmed save survives closing and retries the identical operation", async () => {
      let count = 0;
      await mount(async request => { if (request.method === "POST" && ++count === 1) throw { status: 503 }; return healthy(request); });
      await open(); await submit(); assert.ok(text(root()).includes(copy.failed));
      assert.equal(root().findByType("fieldset").props.disabled, true);
      await act(async () => { root().findByProps({ "data-dialog": true }).props.onOpenChange(false); });
      assert.ok(text(root()).includes(copy.pending));
      const reads = requests.filter(request => !request.method).length;
      await open(); assert.equal(requests.filter(request => !request.method).length, reads);
      await submit(true); assert.equal(posts().length, 2); assert.deepEqual(posts()[0].body, posts()[1].body);
      assert.ok(text(root()).includes(copy.saved));
    });
    await t.test("a stale revision requires reloading and is never automatically overwritten", async () => {
      await mount(async request => { if (request.method === "POST") throw { status: 409 }; return healthy(request); });
      await open(); await submit(); assert.ok(text(root()).includes(copy.conflict));
      await submit(); assert.equal(posts().length, 1);
      await act(async () => { button(copy.reload).props.onClick(); await pause(); });
      assert.equal(root().findByType("fieldset").props.disabled, false);
    });
    await t.test("switching accounts aborts a late save and removes all private result state", async () => {
      const pending = deferred<unknown>();
      await mount(async request => request.method === "POST" ? pending.promise : healthy(request));
      await open(); await submit(); const old = posts()[0];
      fixture.owner = "owner-b";
      await act(async () => { renderer!.update(tree()); await pause(); });
      assert.equal(old.signal.aborted, true);
      await act(async () => { pending.resolve({ accountId: "owner-a", requestId, projects: [saved(old.body!.project)] }); await pause(); });
      assert.ok(!text(root()).includes(copy.saved)); assert.equal(root().findByProps({ "data-dialog": true }).props.open, false);
    });
    await t.test("unverified users receive the unified sign-in link without a project request", async () => {
      await mount(); fixture.verified = false;
      await act(async () => { renderer!.update(tree()); });
      assert.equal(requests.length, 0);
      assert.equal(root().findAllByType("a")[0].props.href, "/auth?next=%2Fname-packages");
    });
  } finally {
    await act(async () => { renderer?.unmount(); }); await vite.close();
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
