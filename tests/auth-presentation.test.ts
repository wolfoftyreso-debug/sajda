import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { createServer } from "vite";
import { AUTH_FIXTURE_KEY, authFixtureBoundary } from "./fixtures/auth-boundaries";
import { authPresentationCopy } from "../src/i18n/authPresentationCopy";

function label(node: ReactTestInstance): string { return node.children.map(child => typeof child === "string" ? child : label(child)).join(""); }

test("auth presentation preserves validation, return destinations and recovery boundaries", async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, AUTH_FIXTURE_KEY);
  const originalFetch = globalThis.fetch;
  type Call = { method: string; email?: string; passwordLength?: number; nextPath?: string; token?: string };
  const fixture = { calls: [] as Call[], toasts: [] as unknown[], user: null as null | { id: string }, configured: true, loading: false, delay: 0, errorCode: null as string | null, language: "en" };
  Object.defineProperty(globalThis, AUTH_FIXTURE_KEY, { configurable: true, value: fixture });
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("Auth presentation tests cannot use real services"); };
  const vite = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    resolve: { alias: { "@": path.resolve("src") } }, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" },
    plugins: [{ name: "auth-presentation-test-boundaries", enforce: "pre", load(id) {
      const boundary = authFixtureBoundary(id); if (boundary) return boundary;
      const file = id.replaceAll("\\", "/");
      if (file.endsWith("/src/i18n/LanguageProvider.tsx")) return `export const useLanguage=()=>({language:globalThis.${AUTH_FIXTURE_KEY}.language,selectedLanguage:globalThis.${AUTH_FIXTURE_KEY}.language,setLanguage(){},t:key=>key});`;
    } }],
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    const Page = (await vite.ssrLoadModule("/src/pages/Auth.tsx")).default;
    function LocationProbe() { const location = useLocation(); return h("output", { "data-location-probe": true }, JSON.stringify({ pathname: location.pathname, search: location.search, hash: location.hash })); }
    const root = () => renderer!.root;
    const field = (id: string) => root().findAllByType("input").find(node => node.props.id === id)!;
    const currentLocation = () => JSON.parse(root().findByType("output").children.join(""));
    const mount = async (route = "/auth?next=%2Fdevelopers%23access") => {
      if (renderer) await act(async () => renderer!.unmount());
      fixture.calls = []; fixture.toasts = []; fixture.errorCode = null; fixture.user = null;
      await act(async () => { renderer = create(h(MemoryRouter, { initialEntries: [route] }, h(Page), h(LocationProbe))); });
    };
    const change = async (id: string, value: string) => { await act(async () => field(id).props.onChange({ target: { value } })); };
    const submit = async () => { await act(async () => root().findByType("form").props.onSubmit({ preventDefault() {} })); };
    const button = (text: string) => { const node = root().findAllByType("button").find(node => label(node).includes(text)); assert.ok(node, text); return node; };
    const click = async (text: string) => { await act(async () => button(text).props.onClick()); };
    const credentials = async (password = "local-fixture-password") => { await change("email", "fixture@example.invalid"); await change("password", password); };

    await t.test("invalid fields never call a service and clear their own accessible errors", async () => {
      await mount(); await submit();
      assert.equal(fixture.calls.length, 0);
      for (const id of ["email", "password"]) {
        assert.equal(field(id).props["aria-invalid"], true);
        assert.equal(field(id).props["aria-describedby"], `${id}-error`);
      }
      await credentials();
      assert.equal(field("email").props["aria-invalid"], false);
      assert.equal(field("password").props["aria-invalid"], false);
    });
    await t.test("short existing passwords can sign in and failures expose only approved messages", async () => {
      await mount(); await credentials("x"); fixture.errorCode = "INVALID_EMAIL_OR_PASSWORD"; await submit();
      assert.deepEqual(fixture.calls, [{ method: "signIn", email: "fixture@example.invalid", passwordLength: 1 }]);
      assert.match(label(root().findByProps({ role: "alert" })), /Invalid email or password/);
      assert.doesNotMatch(label(root()), /PRIVATE_PROVIDER_DETAIL/);
      assert.equal(currentLocation().pathname, "/auth");
      fixture.errorCode = null; await submit();
      assert.deepEqual(currentLocation(), { pathname: "/developers", search: "", hash: "#access" });
    });
    await t.test("screen switches and signup keep the original relative destination", async () => {
      await mount(); await click("Sign up");
      assert.equal(new URLSearchParams(currentLocation().search).get("mode"), "signup");
      assert.equal(new URLSearchParams(currentLocation().search).get("next"), "/developers#access");
      await credentials("short"); await submit(); assert.equal(fixture.calls.length, 0);
      await change("password", "local-fixture-password"); await submit();
      assert.deepEqual(fixture.calls[0], { method: "signUp", email: "fixture@example.invalid", passwordLength: 22, nextPath: "/developers#access" });
      assert.equal(new URLSearchParams(currentLocation().search).get("mode"), null);
      assert.equal(new URLSearchParams(currentLocation().search).get("next"), "/developers#access");
    });
    await t.test("password visibility uses a labelled native button and resets on mode changes", async () => {
      await mount(); await credentials();
      const toggle = () => root().findAllByType("button").find(node => node.props["data-auth-password-toggle"] === "password")!;
      assert.equal(toggle().props.type, "button");
      assert.equal(toggle().props["aria-controls"], "password");
      assert.equal(toggle().props["aria-pressed"], false);
      assert.equal(toggle().props["aria-label"], authPresentationCopy.en.showPassword);
      await act(async () => toggle().props.onClick());
      assert.equal(field("password").props.type, "text");
      assert.equal(toggle().props["aria-pressed"], true);
      assert.equal(toggle().props["aria-label"], authPresentationCopy.en.hidePassword);
      assert.equal(fixture.calls.length, 0, "Visibility controls must not submit credentials");
      await click("Sign up");
      assert.equal(field("password").props.type, "password");
      assert.equal(toggle().props["aria-pressed"], false);
    });
    await t.test("reset request keeps the destination and uses non-enumerating success copy", async () => {
      await mount(); await click("Forgot password?");
      assert.equal(new URLSearchParams(currentLocation().search).get("mode"), "reset");
      await change("email", "fixture@example.invalid"); await submit();
      assert.deepEqual(fixture.calls, [{ method: "requestPasswordReset", email: "fixture@example.invalid", nextPath: "/developers#access" }]);
      assert.match(label(root()), /If that email belongs to a Sajda account/);
    });
    await t.test("one-use recovery token is removed from navigation and required for update", async () => {
      await mount("/auth?mode=update-password&token=local-recovery-token&next=%2Fdevelopers%23access");
      assert.equal(new URLSearchParams(currentLocation().search).has("token"), false);
      await change("password", "local-fixture-password"); await change("confirm-password", "mismatch-password"); await submit();
      assert.equal(fixture.calls.length, 0); assert.equal(field("confirm-password").props["aria-invalid"], true);
      await change("confirm-password", "local-fixture-password"); await submit();
      assert.deepEqual(fixture.calls, [{ method: "updatePassword", passwordLength: 22, token: "local-recovery-token" }]);
      await mount("/auth?mode=update-password&next=%2Fdevelopers%23access");
      assert.equal(root().findAllByType("form").length, 0);
      assert.match(label(root()), /invalid or expired/);
      assert.equal(fixture.calls.length, 0);
    });
    await t.test("foreign next destinations never survive successful sign-in", async () => {
      for (const next of ["https://example.invalid/", "//example.invalid/", "/\\example.invalid/"]) {
        await mount(`/auth?next=${encodeURIComponent(next)}`); await credentials(); await submit();
        assert.deepEqual(currentLocation(), { pathname: "/", search: "", hash: "" });
      }
    });
    await t.test("all five languages present a single heading and labelled auth fields", async () => {
      for (const language of ["en", "sv", "es", "fr", "zh"] as const) {
        fixture.language = language; await mount();
        assert.equal(root().findAllByType("h1").length, 1);
        assert.equal(root().findByType("h1").props.id, "auth-heading");
        assert.equal(root().findAllByType("img").find(node => node.props.alt === "Sajda")?.props.src, "/sajda-logo.svg");
        const c = authPresentationCopy[language];
        for (const [href, text] of [["/legal#terms", c.terms], ["/legal#privacy", c.privacy]]) {
          assert.equal(label(root().findAllByType("a").find(node => node.props.href === href)!), text);
        }
        assert.equal(field("email").props.autoFocus, undefined);
        for (const id of ["email", "password"]) assert.ok(root().findAllByType("label").some(node => node.props.htmlFor === id && label(node).length));
        assert.equal(field("email").props.autoComplete, "email");
        assert.equal(field("password").props.autoComplete, "current-password");
      }
    });
    assert.equal(networkCalls, 0);
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    await vite.close(); globalThis.fetch = originalFetch;
    if (original) Object.defineProperty(globalThis, AUTH_FIXTURE_KEY, original); else Reflect.deleteProperty(globalThis, AUTH_FIXTURE_KEY);
  }
});
