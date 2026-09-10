import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import type { SwipeWishlistEntry } from "../src/lib/swipeWishlist";
import { swipeAccountSnapshot } from "../src/lib/swipeAccountSnapshot";

const origin = "https://sajda.example.test";
const item: SwipeWishlistEntry = {
  domain: "short.dev", savedAt: "2026-09-10T10:00:00Z", lastCheckedAt: "2026-09-10T10:00:00Z",
  category: "watch", tags: ["private local tag"],
  result: { domain: "short.dev", tld: "dev", status: "available", checkMethod: "rdap", source: "Test fixture",
    authoritative: true, registrarPrice: 18.75, estimatedValue: 32, confidenceScore: 63, rationale: "Existing test result." },
};
const label = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : label(child)).join("");
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test("Swipe snapshots preserve only actual account fields and never invent missing data", () => {
  const before = JSON.stringify(item);
  assert.deepEqual(swipeAccountSnapshot(item), { domain: "short.dev", registrarPrice: 18.75, estimatedValue: 32,
    confidenceScore: 63, rationale: "Existing test result." });
  assert.equal(JSON.stringify(item), before);
  for (const result of [
    { ...item.result, domain: "different.dev" }, { ...item.result, registrarPrice: Number.NaN },
    { ...item.result, registrarPrice: Infinity }, { ...item.result, estimatedValue: -1 },
    { ...item.result, confidenceScore: 101 }, { ...item.result, rationale: "x".repeat(4001) },
  ]) assert.throws(() => swipeAccountSnapshot({ ...item, result }), error => (error as { code?: string }).code === "invalid_snapshot");
  assert.equal(swipeAccountSnapshot({ ...item, result: { ...item.result, registrarPrice: 0 } }).registrarPrice, 0,
    "An existing zero remains zero; no price or availability is invented");
});

test("mounted Swipe account save uses the actual owner-scoped service and safe confirmation", async t => {
  const originals = new Map(["window", "IS_REACT_ACT_ENVIRONMENT"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalFetch = globalThis.fetch;
  let expireRequest = false;
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { origin, hostname: "sajda.example.test" },
    setTimeout: (callback: () => void, duration: number) => setTimeout(callback, expireRequest && duration === 20_000 ? 1 : duration), clearTimeout,
    localStorage: { getItem: () => null, setItem: () => { throw new Error("Account save must not edit the device list"); } },
  } });
  const vite = await createServer({ configFile: false, appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    define: { "import.meta.env.VITE_ACCOUNT_AUTH_ENABLED": '"true"', "import.meta.env.VITE_LOCAL_TEST_MODE": '"false"' },
    plugins: [{ name: "swipe-account-ui-boundaries", enforce: "pre", load(id) {
      const name = id.replaceAll("\\", "/");
      if (name.endsWith("/src/hooks/useReferenceFx.ts")) return "export const useReferenceFx = () => null;";
      if (name.endsWith("/src/components/ui/dialog.tsx")) return "import { createElement as h } from 'react'; export const Dialog = ({children}) => h('section',null,children); export const DialogContent = ({children,...props}) => h('div',props,children); export const DialogDescription = ({children}) => h('p',null,children); export const DialogHeader = ({children}) => h('header',null,children); export const DialogTitle = ({children}) => h('h2',null,children); export const DialogTrigger = ({children}) => children;";
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  let cookieOwner: string | null = "account-a";
  let requestSession: (() => Promise<Response>) | undefined;
  let postReply: () => Response | Promise<Response> = () => Response.json({ ok: true, item: { id: "42", domain: "short.dev" } });
  const writes: { owner: string | null; payload: unknown; signal?: AbortSignal | null }[] = [];
  let reads = 0;
  const session = () => Response.json(cookieOwner ? {
    user: { id: cookieOwner, email: "qa@example.test", emailVerified: true, name: "QA", createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z" },
    session: { id: "fixture-session", userId: cookieOwner, createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z", expiresAt: new Date(Date.now() + 60_000).toISOString() },
  } : null);
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), origin);
    assert.equal(url.origin, origin, "No external registry, pricing, Trading or payment service is called");
    if (url.pathname === "/api/auth/get-session") { reads++; return requestSession ? requestSession() : session(); }
    assert.equal(url.pathname, "/api/account/saved-domains");
    assert.ok(["POST", "DELETE"].includes(String(options.method)));
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.redirect, "error");
    writes.push({ owner: new Headers(options.headers).get("x-sajda-account"), payload: JSON.parse(String(options.body)), signal: options.signal });
    return postReply();
  };
  try {
    const { default: Action } = await vite.ssrLoadModule("/src/components/SwipeAccountSave.tsx");
    const { SwipeWishlistPanel: Panel } = await vite.ssrLoadModule("/src/components/SwipeWishlistPanel.tsx");
    const { addToWatchlist, removeFromWatchlist } = await vite.ssrLoadModule("/src/lib/watchlistService.ts");
    let props = { item, language: "en", accountId: "account-a" as string | null, emailVerified: true, authLoading: false };
    const tree = () => h(MemoryRouter, null, h(Action, props));
    const root = () => renderer!.root;
    const button = () => root().findByType("button");
    const until = async (ready: () => boolean) => {
      for (let attempt = 0; attempt < 500 && !ready(); attempt++) await act(async () => { await pause(); });
      assert.ok(ready(), "The intended asynchronous action state settles");
    };
    const click = async (settle = true) => {
      await act(async () => { button().props.onClick(); await pause(); });
      if (settle) await until(() => !button().props.disabled || !label(button()).includes("…"));
    };
    const reset = async (changes = {}) => {
      if (renderer) await act(async () => renderer!.unmount());
      writes.length = 0; reads = 0; cookieOwner = "account-a"; requestSession = undefined; expireRequest = false;
      postReply = () => Response.json({ ok: true, item: { id: "42", domain: "short.dev" } });
      props = { item, language: "en", accountId: "account-a", emailVerified: true, authLoading: false, ...changes };
      await act(async () => { renderer = create(tree()); });
    };
    const update = async (changes: Partial<typeof props>) => { props = { ...props, ...changes }; await act(async () => renderer!.update(tree())); };

    await t.test("opening a local pick does not upload; the explicit action copies the exact snapshot after owner check", async () => {
      await reset();
      assert.equal(writes.length, 0); assert.equal(reads, 0);
      assert.equal(label(button()), "Save to my account");
      assert.match(label(root()), /does not start monitoring or buy a domain/u);
      const before = JSON.stringify(item);
      await click();
      assert.equal(reads, 1); assert.equal(writes.length, 1);
      assert.equal(writes[0].owner, "account-a");
      assert.deepEqual(writes[0].payload, swipeAccountSnapshot(item));
      assert.equal(JSON.stringify(item), before);
      assert.equal(label(button()), "Saved to your account"); assert.equal(button().props.disabled, true);
      assert.equal(root().findByType("a").props.href, "/watchlist");
      assert.equal(label(root().findByProps({ role: "status" })), "Saved to your account");
      await click(); assert.equal(writes.length, 1, "Even a programmatic repeated confirmed click does not re-save");
    });

    await t.test("same-batch double click and same-owner rerender retain one in-flight save", async () => {
      await reset(); const delayed = deferred<Response>(); postReply = () => delayed.promise;
      await act(async () => { const start = button().props.onClick; start(); start(); await pause(); });
      await until(() => writes.length === 1);
      assert.equal(writes.length, 1); assert.equal(button().props.disabled, true);
      assert.equal(label(button()), "Saving to your account…");
      await update({ language: "sv" }); assert.equal(writes[0].signal?.aborted, false);
      await act(async () => { delayed.resolve(Response.json({ ok: true, item: { id: "42", domain: "short.dev" } })); await pause(); });
      assert.equal(label(button()), "Sparat på ditt konto"); assert.equal(writes.length, 1);
    });

    await t.test("network failure has no false success; explicit retry is safe and leaves local tags untouched", async () => {
      await reset(); postReply = () => { throw new Error("Sensitive provider detail must not render"); };
      await click(); assert.equal(label(button()), "Retry saving");
      assert.match(label(root().findByProps({ role: "alert" })), /could not be confirmed/u);
      assert.doesNotMatch(label(root()), /Sensitive/u);
      assert.equal(root().findByType("a").props.href, "/watchlist");
      postReply = () => Response.json({ ok: true, item: { id: "42", domain: "short.dev" } });
      await click(); assert.equal(label(button()), "Saved to your account");
      assert.deepEqual(writes[0].payload, writes[1].payload, "Owner+domain upsert receives the identical snapshot on retry");
      assert.deepEqual(item.tags, ["private local tag"]);
    });

    await t.test("wrong cookie owner cannot send a POST and receives account recovery, not a silent transfer", async () => {
      await reset(); cookieOwner = "account-b";
      await click(); assert.equal(writes.length, 0);
      assert.match(label(root().findByProps({ role: "alert" })), /session changed or expired/u);
      assert.equal(root().findByType("a").props.href, "/auth?next=%2Fswipe");
    });

    await t.test("the actual account-client timeout yields uncertain-save feedback and allows an explicit retry", async () => {
      await reset(); expireRequest = true;
      postReply = () => new Promise((_resolve, reject) => {
        const signal = writes.at(-1)!.signal!;
        signal.addEventListener("abort", () => reject(new DOMException("Request timeout", "AbortError")), { once: true });
      });
      await click();
      assert.equal(writes[0].signal?.aborted, true);
      assert.equal(label(button()), "Retry saving");
      assert.match(label(root().findByProps({ role: "alert" })), /could not be confirmed/u);
      expireRequest = false;
      postReply = () => Response.json({ ok: true, item: { id: "42", domain: "short.dev" } });
      await click(); assert.equal(writes.length, 2); assert.equal(label(button()), "Saved to your account");
    });

    await t.test("owner A to B to A aborts old work, discards late success, and requires another explicit click", async () => {
      await reset(); const delayed = deferred<Response>(); postReply = () => delayed.promise;
      const staleClick = button().props.onClick;
      await click(false); await until(() => writes.length === 1); assert.equal(writes.length, 1);
      cookieOwner = "account-b"; await update({ accountId: "account-b" });
      assert.equal(writes[0].signal?.aborted, true);
      await act(async () => { staleClick(); await pause(); });
      assert.equal(writes.length, 1, "An old event handler cannot submit after its owner lifetime ended");
      assert.equal(label(button()), "Save to my account"); assert.equal(root().findAllByType("a").length, 0);
      cookieOwner = "account-a"; await update({ accountId: "account-a" });
      await act(async () => { delayed.resolve(Response.json({ ok: true, item: { id: "42", domain: "short.dev" } })); await pause(); });
      assert.equal(label(button()), "Save to my account"); assert.equal(writes.length, 1);
      postReply = () => Response.json({ ok: true, item: { id: "42", domain: "short.dev" } });
      await click(); assert.equal(writes.length, 2); assert.equal(label(button()), "Saved to your account");
    });

    await t.test("unmount while the account check is pending cancels before any write", async () => {
      await reset(); const delayed = deferred<Response>(); requestSession = () => delayed.promise;
      await click(false); await until(() => reads === 1); assert.equal(writes.length, 0);
      await act(async () => renderer!.unmount());
      await act(async () => { delayed.resolve(session()); await pause(); });
      assert.equal(writes.length, 0);
    });

    await t.test("logout, loading and lost verification never expose another account's confirmation", async () => {
      for (const changes of [{ accountId: null }, { authLoading: true }, { emailVerified: false }]) {
        await reset(); await click(); assert.equal(label(button()), "Saved to your account");
        await update(changes);
        assert.doesNotMatch(label(root()), /Saved to your account/u);
        assert.equal(root().findAllByType("button").length, 0);
        await update({ accountId: "account-a", authLoading: false, emailVerified: true });
        assert.equal(label(button()), "Save to my account"); assert.equal(writes.length, 1);
      }
    });

    await t.test("unauthenticated, loading and unverified states offer the right next action without requests", async () => {
      await reset({ accountId: null }); assert.equal(root().findByType("a").props.href, "/auth?next=%2Fswipe");
      await reset({ authLoading: true }); assert.match(label(root().findByProps({ role: "status" })), /Checking/u);
      await reset({ emailVerified: false }); assert.equal(root().findByType("a").props.href, "/account");
      assert.match(label(root()), /Verify your email/u); assert.equal(writes.length, 0); assert.equal(reads, 0);
    });

    await t.test("all five languages provide distinct accessible actions and wrapping 44px touch targets", async () => {
      for (const [language, expected] of [["en", "Save to my account"], ["sv", "Spara på mitt konto"], ["es", "Guardar en mi cuenta"], ["fr", "Enregistrer dans mon compte"], ["zh", "保存到我的账户"]]) {
        await reset({ language });
        assert.equal(label(button()), expected); assert.equal(button().props["aria-label"], `${expected}: short.dev`);
        assert.match(button().props.className, /min-h-11/u); assert.match(button().props.className, /whitespace-normal/u);
        assert.equal(button().props.type, "button");
        await click(); assert.equal(button().props.disabled, true);
        assert.equal(root().findByType("a").props.href, "/watchlist");
        assert.match(root().findByType("a").props.className, /min-h-11/u);
        assert.ok(label(root().findByProps({ role: "status" })).length > 0);
      }
    });

    await t.test("old invalid snapshots fail locally without filling absent metrics or posting", async () => {
      await reset({ item: { ...item, result: { ...item.result, registrarPrice: Number.NaN } } });
      await click(); assert.equal(writes.length, 0); assert.equal(reads, 0);
      assert.match(label(root().findByProps({ role: "alert" })), /Refresh its check/u);
    });

    await t.test("server errors for rate limits, verification and expiration remain recoverable", async () => {
      for (const [status, code, message, href] of [[429, "rate_limited", /Wait a minute/u, "/watchlist"], [403, "email_verification_required", /Verify your email/u, "/account"], [401, "unauthorized", /session changed/u, "/auth?next=%2Fswipe"]] as const) {
        await reset(); postReply = () => Response.json({ code, error: "backend fixture" }, { status });
        await click(); assert.match(label(root().findByProps({ role: "alert" })), message);
        assert.equal(button().props.disabled, false); assert.equal(root().findByType("a").props.href, href);
      }
    });

    await t.test("HTTP 200 without the concrete matching saved-record ack is not success", async () => {
      for (const payload of [{}, { ok: true }, { ok: true, item: { id: "42", domain: "other.dev" } }, { ok: true, item: { id: 42, domain: "short.dev" } }, { ok: true, item: { id: "0", domain: "short.dev" } }]) {
        await reset(); postReply = () => Response.json(payload); await click();
        assert.equal(label(button()), "Retry saving");
        assert.match(label(root().findByProps({ role: "alert" })), /could not be confirmed/u);
      }
      await reset(); postReply = () => Response.json({ ok: true, item: { id: "43", domain: "xn--bcher-kva.se" } });
      await addToWatchlist({ ...swipeAccountSnapshot(item), domain: "Bücher.se" }, { accountId: "account-a" });
      assert.equal(writes.length, 1, "Existing IDN input support is preserved in confirmation normalization");
    });

    await t.test("account deletion service also requires explicit acknowledgment and honors cancellation", async () => {
      await reset(); postReply = () => Response.json({});
      await assert.rejects(removeFromWatchlist("short.dev", { accountId: "account-a" }), (error: { code?: string }) => error.code === "remove_not_confirmed");
      postReply = () => Response.json({ ok: true });
      await removeFromWatchlist("short.dev", { accountId: "account-a" });
      assert.deepEqual(writes[1].payload, { domain: "short.dev" });
      const controller = new AbortController(); controller.abort();
      await assert.rejects(removeFromWatchlist("short.dev", { accountId: "account-a", signal: controller.signal }), { name: "AbortError" });
      assert.equal(writes.length, 2);
    });

    await t.test("actual wishlist panel labels the device list and exposes one explicit account action per item", async () => {
      await reset(); await act(async () => renderer!.unmount()); writes.length = 0; reads = 0;
      const second = { ...item, domain: "other.dev", result: { ...item.result, domain: "other.dev" } };
      const mutations: unknown[] = [];
      await act(async () => { renderer = create(h(MemoryRouter, null, h(Panel, { items: [item, second], language: "sv", accountId: "account-a", emailVerified: true,
        onRefresh: () => mutations.push("refresh"), onUpdate: () => mutations.push("update"), onRemove: () => mutations.push("remove"), onClear: () => mutations.push("clear") }))); });
      assert.match(label(root().findByType("h2")), /Namn på den här enheten/u);
      const actions = root().findAllByType("button").filter(node => String(node.props["aria-label"]).startsWith("Spara på mitt konto:"));
      assert.equal(actions.length, 2); assert.equal(writes.length, 0); assert.equal(reads, 0);
      await act(async () => { actions[0].props.onClick(); await pause(); });
      assert.equal(writes.length, 1); assert.deepEqual(writes[0].payload, swipeAccountSnapshot(item));
      assert.deepEqual(mutations, [], "Account copying never mutates or refreshes the device list");
      assert.equal(root().findAllByType("h3").length, 2);
      assert.ok(root().findAllByType("h3").every(node => String(node.props.className).includes("break-all")));
    });
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
