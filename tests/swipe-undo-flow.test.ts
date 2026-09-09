import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { saveSwipeWishlistResult, updateSwipeWishlistEntry, type SwipeWishlistEntry } from "../src/lib/swipeWishlist";
import type { AnonymousSearchResult } from "../src/lib/localTestSearch";

const origin = "https://sajda.example.test";
const requestId = "req_0123456789abcdef";
const storageKey = "sajda.swipe.wishlist.v1";
const card = (domain: string): AnonymousSearchResult => ({ domain, tld: domain.split(".")[1],
  status: "available", checkMethod: "rdap", source: "registry-test-fixture", authoritative: true,
  registrarPrice: 0, estimatedValue: 0, confidenceScore: 0, rationale: "Test registry result." });
const initialCards = [card("alpha.dev"), card("bravo.dev"), card("charlie.dev")];
const grant = () => Response.json({ ok: true, capability: "swipe_undo", accountId: "account-a", requestId });
const pause = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function label(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : label(child)).join("");
}

// This mounts the real Swipe component with real React hooks, its real undo
// model, wishlist transformations and HTTP client. Only environment providers,
// presentational DOM wrappers and network responses are mocked. No application
// flag or server-side authorization bypass is added by this test harness.
test("mounted Swipe Undo executes one-step, account and wishlist contracts", async t => {
  const originals = new Map(["window", "document", "HTMLElement", "__SWIPE_UNDO_TEST__", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalFetch = globalThis.fetch;
  const memory = new Map<string, string>();
  const fixture = { owner: "account-a" as string | null, canPrefetch: false, reservations: 0,
    requestAccess: () => { fixture.reservations++; return { complete() {}, release() {} }; } };
  const setGlobal = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { configurable: true, value });
  setGlobal("__SWIPE_UNDO_TEST__", fixture);
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setGlobal("window", { location: { origin, hostname: "sajda.example.test" }, setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
    localStorage: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) } });
  setGlobal("document", { documentElement: { classList: { add() {}, remove() {} } } });
  setGlobal("HTMLElement", class {});
  const mocks = new Map([
    ["/src/contexts/AuthContext.tsx", "export const useAuth = () => ({ user: globalThis.__SWIPE_UNDO_TEST__.owner ? { id: globalThis.__SWIPE_UNDO_TEST__.owner } : null });"],
    ["/src/contexts/ScanContext.tsx", "export const useScan = () => ({ anonymousSearchAccessReady: true, anonymousSearchCanStart: globalThis.__SWIPE_UNDO_TEST__.canPrefetch, requestAnonymousSearchAccess: globalThis.__SWIPE_UNDO_TEST__.requestAccess });"],
    ["/src/i18n/LanguageProvider.tsx", "export const useLanguage = () => ({ language: 'en' }); export const translate = (_language, key) => key;"],
    ["/src/components/ui/button.tsx", "import { createElement as h, forwardRef } from 'react'; export const Button = forwardRef(({children, ...props}, ref) => h('button', {...props, ref}, children));"],
    ["/src/components/ui/dialog.tsx", "import { createElement as h } from 'react'; export const Dialog = ({open,children}) => open ? h('section', {role:'dialog'}, children) : null; export const DialogContent = ({children,...props}) => h('div',props,children); export const DialogDescription = ({children}) => h('p',null,children); export const DialogFooter = ({children}) => h('footer',null,children); export const DialogHeader = ({children}) => h('header',null,children); export const DialogTitle = ({children}) => h('h2',null,children);"],
    ["/src/components/SwipeWishlistPanel.tsx", "import { createElement as h } from 'react'; export const SwipeWishlistPanel = props => h('wishlist-test-panel', props);"],
    ["/src/components/DomainLogoConcept.tsx", "export default function DomainLogoConcept() { return null; }"],
  ]);
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: "automatic" },
    define: { "import.meta.env.VITE_PUBLIC_SEARCH_MODE": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"', "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"' },
    plugins: [{ name: "swipe-component-test-boundaries", enforce: "pre", load(id) {
      const normalized = id.replaceAll("\\", "/");
      for (const [suffix, code] of mocks) if (normalized.endsWith(suffix)) return code;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  let deckReplies: AnonymousSearchResult[][] = [];
  let capabilityReply: () => Promise<Response> | Response = grant;
  let refreshReply: (() => Promise<Response> | Response) | undefined;
  let deckFailure = false;
  let posts = 0, searches = 0;
  const signals: AbortSignal[] = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), origin);
    assert.equal(url.origin, origin, "No external request is allowed in this fixture");
    if (url.pathname === "/api/auth/get-session") return Response.json(fixture.owner ? {
      user: { id: fixture.owner, name: "QA", email: "qa@example.test", emailVerified: true,
        createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" },
      session: { id: "session-a", userId: fixture.owner, createdAt: "2026-09-01T10:00:00Z",
        updatedAt: "2026-09-01T10:00:00Z", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    } : null);
    if (url.pathname === "/api/account/capabilities") {
      assert.equal(init.method, "POST");
      assert.equal(new Headers(init.headers).get("x-sajda-account"), "account-a");
      assert.deepEqual(JSON.parse(String(init.body)), { capability: "swipe_undo" });
      posts++;
      if (init.signal) signals.push(init.signal);
      return capabilityReply();
    }
    assert.equal(url.pathname, "/api/domain-search");
    const body = JSON.parse(String(init.body));
    if (body.domains && refreshReply) return refreshReply();
    searches++;
    if (deckFailure) return Response.json({ error: "Registry temporarily unavailable" }, { status: 503 });
    return Response.json({ results: deckReplies.shift() ?? initialCards });
  };
  try {
    const { default: Swipe } = await vite.ssrLoadModule("/src/pages/Swipe.tsx");
    const tree = () => h(MemoryRouter, { initialEntries: ["/swipe"] }, h(Swipe));
    const buttons = () => renderer!.root.findAllByType("button");
    const button = (name: string) => {
      const found = buttons().find(item => item.props["aria-label"] === name || label(item) === name || label(item) === `${name}Premium`);
      assert.ok(found, `Button ${name} exists`); return found;
    };
    const click = async (name: string) => { await act(async () => { button(name).props.onClick(); await pause(); }); };
    const undoButton = () => buttons().find(item => item.props["aria-describedby"] === "swipe-undo-hint")!;
    const until = async (predicate: () => boolean) => {
      for (let tries = 0; tries < 200 && !predicate(); tries++) await act(async () => { await pause(5); });
      assert.ok(predicate(), "The expected mounted state settles");
    };
    const undo = async (waitForResolution = true) => {
      const previousPosts = posts;
      const alreadyPending = label(undoButton()).includes("Checking access");
      await act(async () => { undoButton().props.onClick(); await pause(); });
      if (alreadyPending && !waitForResolution) return;
      if (waitForResolution) await until(() => !label(undoButton()).includes("Checking access"));
      else await until(() => posts > previousPosts || !label(undoButton()).includes("Checking access"));
    };
    const wishlist = () => renderer!.root.findByType("wishlist-test-panel");
    const saved = (): SwipeWishlistEntry[] => wishlist().props.items;
    const currentDomain = () => renderer!.root.findAllByType("div").find(item => item.props.role === "group")?.props["aria-label"]?.split(",")[0];
    const decide = async (direction: "Keep" | "Skip") => {
      await click(`${direction} ${currentDomain()}`);
      assert.equal(undoButton().props.disabled, true, "Undo is disabled during the exit animation");
      await act(async () => { await pause(180); });
    };
    const mount = async (options: { saved?: SwipeWishlistEntry[]; owner?: string | null; cards?: AnonymousSearchResult[]; prefetch?: boolean } = {}) => {
      if (renderer) await act(async () => { renderer!.unmount(); });
      memory.clear(); memory.set(storageKey, JSON.stringify(options.saved ?? []));
      fixture.owner = options.owner === undefined ? "account-a" : options.owner;
      fixture.canPrefetch = options.prefetch ?? false; fixture.reservations = 0;
      capabilityReply = grant; refreshReply = undefined; deckFailure = false;
      posts = 0; searches = 0; signals.length = 0;
      deckReplies = [options.cards ?? initialCards, [card("queued.dev")]];
      await act(async () => { renderer = create(tree(), { unstable_isConcurrent: true }); });
      await click("Start swiping");
      assert.equal(currentDomain(), (options.cards ?? initialCards)[0].domain);
    };

    await t.test("successful keep undo restores the real card and removes only its save, exactly once", async () => {
      await mount(); await decide("Keep");
      assert.equal(currentDomain(), "bravo.dev"); assert.equal(saved()[0].domain, "alpha.dev");
      await undo();
      assert.equal(currentDomain(), "alpha.dev"); assert.deepEqual(saved(), []); assert.equal(posts, 1);
      assert.equal(undoButton().props.disabled, true);
      await undo(); assert.equal(posts, 1, "Consumed undo cannot call the server twice");
      await decide("Skip"); await undo();
      assert.equal(currentDomain(), "alpha.dev"); assert.equal(posts, 2, "A new decision receives a fresh grant");
    });

    await t.test("only the latest decision is undone, including the final card", async () => {
      await mount({ cards: initialCards.slice(0, 2) });
      await decide("Keep"); await decide("Skip");
      assert.equal(currentDomain(), undefined); assert.equal(undoButton().props.disabled, false);
      await undo();
      assert.equal(currentDomain(), "bravo.dev"); assert.equal(saved()[0].domain, "alpha.dev");
      assert.equal(undoButton().props.disabled, true); await undo(); assert.equal(posts, 1);
    });

    await t.test("undo restores pre-existing saved metadata instead of removing the entry", async () => {
      const before = updateSwipeWishlistEntry(saveSwipeWishlistResult([], { ...initialCards[0], status: "taken" }, "2026-09-01T10:00:00Z"),
        "alpha.dev", { category: "brand", tags: ["client", "original"] });
      await mount({ saved: before }); await decide("Keep"); await undo();
      assert.deepEqual(saved(), before); assert.equal(currentDomain(), "alpha.dev");
    });

    await t.test("a later manual wishlist edit survives while access is being checked", async () => {
      await mount(); await decide("Keep");
      const waiting = deferred<Response>(); capabilityReply = () => waiting.promise;
      await undo(false); assert.equal(posts, 1);
      await act(async () => { wishlist().props.onUpdate("alpha.dev", { tags: ["manual"], category: "watch" }); });
      await act(async () => { waiting.resolve(grant()); await pause(); });
      assert.equal(currentDomain(), "alpha.dev"); assert.deepEqual(saved()[0].tags, ["manual"]);
      assert.equal(saved()[0].category, "watch");
    });

    await t.test("a manual wishlist edit batched with the grant cannot be overwritten by a stale snapshot", async () => {
      await mount(); await decide("Keep");
      const waiting = deferred<Response>(); capabilityReply = () => waiting.promise;
      await undo(false);
      await act(async () => {
        wishlist().props.onUpdate("alpha.dev", { tags: ["same-batch"], category: "watch" });
        waiting.resolve(grant()); await pause();
      });
      assert.equal(currentDomain(), "alpha.dev");
      assert.deepEqual(saved()[0]?.tags, ["same-batch"]);
    });

    await t.test("a registry refresh batched with the grant preserves its newer results and unrelated entries", async () => {
      const other = card("other.dev");
      await mount({ saved: saveSwipeWishlistResult([], other, "2026-09-01T10:00:00Z") }); await decide("Keep");
      const waiting = deferred<Response>(), refresh = deferred<Response>();
      capabilityReply = () => waiting.promise; refreshReply = () => refresh.promise;
      await undo(false);
      await act(async () => { void wishlist().props.onRefresh(["alpha.dev", "other.dev"]); await pause(); });
      await act(async () => {
        refresh.resolve(Response.json({ results: [initialCards[0], other].map(result => ({ ...result, status: "taken" })) }));
        waiting.resolve(grant()); await pause();
      });
      assert.equal(currentDomain(), "alpha.dev");
      assert.equal(saved().find(entry => entry.domain === "alpha.dev")?.result.status, "taken");
      assert.equal(saved().find(entry => entry.domain === "other.dev")?.result.status, "taken");
    });

    await t.test("no account or a denied grant leaves the deck, wishlist and undo token unchanged", async () => {
      await mount({ owner: null }); await decide("Keep"); await undo();
      assert.equal(posts, 0); assert.equal(currentDomain(), "bravo.dev"); assert.equal(saved().length, 1);
      assert.ok(renderer!.root.findAllByProps({ role: "dialog" }).length);
      await mount(); await decide("Keep");
      capabilityReply = () => Response.json({ code: "premium_required", error: "Premium required", requestId }, { status: 403 });
      await undo();
      assert.equal(posts, 1); assert.equal(currentDomain(), "bravo.dev"); assert.equal(saved().length, 1);
      assert.equal(undoButton().props.disabled, false, "An unsuccessful grant must not consume undo");
    });

    await t.test("pending authorization blocks decisions, repeated undo and replacement decks", async () => {
      await mount(); await decide("Keep");
      const waiting = deferred<Response>(); capabilityReply = () => waiting.promise;
      await undo(false); await undo(false); await click("Skip bravo.dev"); await click("Shuffle a new deck"); await click("Deck settings");
      assert.equal(posts, 1); assert.equal(searches, 1); assert.equal(currentDomain(), "bravo.dev");
      assert.equal(renderer!.root.findAllByProps({ role: "dialog" }).length, 0);
      await act(async () => { waiting.resolve(grant()); await pause(); });
      assert.equal(currentDomain(), "alpha.dev");
    });

    await t.test("an account change aborts a late response and clears the previous undo", async () => {
      await mount(); await decide("Keep");
      const waiting = deferred<Response>(); capabilityReply = () => waiting.promise;
      await undo(false); fixture.owner = "account-b";
      await act(async () => { renderer!.update(tree()); });
      assert.equal(signals[0].aborted, true);
      await act(async () => { waiting.resolve(grant()); await pause(); });
      assert.equal(currentDomain(), "bravo.dev"); assert.equal(saved().length, 1); assert.equal(undoButton().props.disabled, true);
    });

    await t.test("a prefetched deck waits at the last card and is consumed only by explicit replacement", async () => {
      await mount({ cards: [initialCards[0]], prefetch: true });
      assert.equal(searches, 2); fixture.canPrefetch = false; await decide("Skip");
      assert.equal(currentDomain(), undefined); assert.equal(undoButton().props.disabled, false);
      await click("Shuffle a new deck");
      assert.equal(currentDomain(), "queued.dev"); assert.equal(undoButton().props.disabled, true);
      assert.equal(searches, 2, "An already checked queued deck must not consume another registry request");
    });

    await t.test("a failed replacement preserves the previous deck and undo", async () => {
      await mount(); await decide("Skip"); deckFailure = true;
      await click("Shuffle a new deck"); assert.equal(currentDomain(), "bravo.dev");
      assert.equal(undoButton().props.disabled, false);
      await undo(); assert.equal(currentDomain(), "alpha.dev");
    });
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
