import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { act, create } from "react-test-renderer";
import RouteScrollRestoration from "../src/components/RouteScrollRestoration.tsx";

test("edit-search navigation targets the compact form and transfers keyboard focus", () => {
  // Browser geometry is verified separately at 390px. This source contract
  // prevents the old full-deck target from returning on a future layout edit.
  const source = readFileSync(new URL("../src/pages/Index.tsx", import.meta.url), "utf8");
  assert.match(source, /const searchControlsRef = useRef<HTMLFormElement>/u);
  assert.match(source, /<form ref=\{searchControlsRef\}/u);
  assert.doesNotMatch(source, /<div ref=\{searchControlsRef\}/u);
  const handler = source.slice(source.indexOf("const handleEditSearch ="), source.indexOf("const handleStartSearch ="));
  assert.match(handler, /requestAnimationFrame/u);
  assert.match(handler, /scrollToElement\(searchControlsRef.current\)/u);
  assert.match(handler, /getElementById\("domain-theme"\)\?\.focus\(\{ preventScroll: true \}\)/u);
});

// Mount the production component and real router. Browser geometry itself is
// covered separately by the deployed browser pass; these stubs expose only
// document scrolling, history ownership and asynchronous lifecycle behavior.
async function harness(initialEntry = "/", originalRestoration = "auto") {
  const descriptors = new Map(["window", "document", "MutationObserver"].map(name =>
    [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const frames = new Map();
  const timers = new Map();
  const listeners = new Map();
  const targets = new Map();
  const namedTargets = new Map();
  const observers = [];
  const scrollCalls = [];
  let nextId = 0;
  let navigate;
  let location;
  let renderer;
  const document = {
    body: {},
    getElementById: id => targets.get(id) ?? null,
    getElementsByName: name => namedTargets.has(name) ? [namedTargets.get(name)] : [],
  };
  const window = {
    history: { scrollRestoration: originalRestoration },
    scrollX: 40,
    scrollY: 900,
    scrollTo: options => {
      scrollCalls.push(options);
      window.scrollX = options.left;
      window.scrollY = options.top;
    },
    requestAnimationFrame: callback => { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (callback, delay) => { timers.set(++nextId, { callback, delay }); return nextId; },
    clearTimeout: id => timers.delete(id),
    addEventListener: (name, callback) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener: (name, callback) => listeners.get(name)?.delete(callback),
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
    observe(target, options) {
      assert.equal(target, document.body);
      assert.deepEqual(options, { childList: true, subtree: true });
      this.connected = true;
    }
    disconnect() { this.connected = false; }
  }
  for (const [name, value] of Object.entries({ window, document, MutationObserver })) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  function RouterProbe() {
    navigate = useNavigate();
    location = useLocation();
    return null;
  }
  const tree = revision => h(MemoryRouter, { initialEntries: [initialEntry] },
    h(RouterProbe), h(RouteScrollRestoration, { revision }));
  const restoreGlobals = () => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  };
  try {
    await act(async () => { renderer = create(tree(0)); });
  } catch (error) {
    restoreGlobals();
    throw error;
  }
  return {
    window, frames, timers, listeners, targets, namedTargets, observers, scrollCalls,
    get location() { return location; },
    flushFrames() {
      const pending = [...frames];
      frames.clear();
      for (const [, callback] of pending) callback(0);
    },
    mutate() { for (const observer of observers) if (observer.connected) observer.callback([]); },
    pageShow(persisted) {
      for (const callback of listeners.get("pageshow") ?? []) callback({ persisted });
    },
    target(id, position = 400, named = false) {
      const calls = [];
      const target = { scrollIntoView: options => { calls.push(options); window.scrollY = position; } };
      (named ? namedTargets : targets).set(id, target);
      return calls;
    },
    navigate: async (to, options) => { await act(async () => navigate(to, options)); },
    rerender: async () => { await act(async () => renderer.update(tree(1))); },
    unmount: async () => {
      if (renderer) await act(async () => { renderer.unmount(); renderer = undefined; });
    },
    async cleanup() { try { await this.unmount(); } finally { restoreGlobals(); } },
  };
}

test("route scroll restoration owns page starts without fighting ordinary reading", async t => {
  await t.test("initial page starts at the top and corrects one late browser restoration", async () => {
    const browser = await harness();
    try {
      assert.equal(browser.window.history.scrollRestoration, "manual");
      assert.equal(browser.window.scrollX, 0);
      assert.equal(browser.window.scrollY, 0);
      assert.deepEqual(browser.scrollCalls[0], { top: 0, left: 0, behavior: "instant" });
      browser.window.scrollY = 650;
      browser.flushFrames();
      assert.equal(browser.window.scrollY, 0);
      assert.equal(browser.frames.size, 0, "No perpetual animation loop may pin the reader to the top");
      assert.equal(browser.timers.size, 0, "Ordinary page starts do not schedule delayed scroll jumps");
    } finally { await browser.cleanup(); }
  });

  await t.test("page, query, same-URL new-entry and back navigation all start at the top", async () => {
    const browser = await harness();
    try {
      browser.flushFrames();
      for (const destination of ["/plus", "/auth?mode=reset", "/auth?mode=signin", "/auth?mode=signin", -1]) {
        const previousKey = browser.location.key;
        browser.window.scrollY = 750;
        await browser.navigate(destination);
        assert.notEqual(browser.location.key, previousKey, "A fresh or traversed entry must be observed");
        assert.equal(browser.window.scrollY, 0, `Navigation ${destination} inherited the previous page offset`);
        browser.flushFrames();
        assert.equal(browser.window.scrollY, 0);
      }
    } finally { await browser.cleanup(); }
  });

  await t.test("normal rerenders and non-restored pageshow do not reset a reader's scroll", async () => {
    const browser = await harness("/plus");
    try {
      browser.flushFrames();
      browser.window.scrollY = 600;
      const previousCalls = browser.scrollCalls.length;
      await browser.rerender();
      browser.pageShow(false);
      assert.equal(browser.window.scrollY, 600);
      assert.equal(browser.scrollCalls.length, previousCalls);
      assert.equal(browser.frames.size, 0);
      browser.pageShow(true);
      assert.equal(browser.window.scrollY, 0, "BFCache restoration must start at the top");
      browser.flushFrames();
      assert.equal(browser.window.scrollY, 0);
    } finally { await browser.cleanup(); }
  });

  await t.test("explicit encoded and named section links retain instant target navigation", async () => {
    const browser = await harness("/legal#privacy%20policy");
    try {
      const targetCalls = browser.target("privacy policy", 820);
      browser.flushFrames();
      assert.equal(browser.window.scrollY, 820);
      assert.ok(targetCalls.length > 0);
      assert.deepEqual(targetCalls.at(-1), { block: "start", inline: "nearest", behavior: "instant" });
      assert.equal(browser.timers.size, 0);
      const namedCalls = browser.target("legacy-section", 420, true);
      await browser.navigate("/legal#legacy-section");
      browser.flushFrames();
      assert.equal(browser.window.scrollY, 420);
      assert.ok(namedCalls.length > 0);
    } finally { await browser.cleanup(); }
  });

  await t.test("a lazy section is found once, then its observer and timeout are removed", async () => {
    const browser = await harness("/developers#public-console");
    try {
      browser.flushFrames();
      assert.ok(browser.observers.some(observer => observer.connected));
      assert.equal(browser.timers.size, 1);
      assert.ok([...browser.timers.values()].every(timer => timer.delay <= 2_000));
      const targetCalls = browser.target("public-console", 1200);
      browser.mutate();
      assert.equal(browser.window.scrollY, 1200);
      assert.equal(targetCalls.length, 1);
      assert.ok(browser.observers.every(observer => !observer.connected));
      assert.equal(browser.timers.size, 0);
      browser.window.scrollY = 1500;
      browser.mutate();
      assert.equal(browser.window.scrollY, 1500, "Later content mutations must not drag the reader back");
    } finally { await browser.cleanup(); }
  });

  await t.test("navigation cancels stale hash callbacks and missing targets have a bounded wait", async () => {
    const browser = await harness("/legal#missing");
    try {
      await browser.navigate("/plus");
      const staleTargetCalls = browser.target("missing", 1900);
      browser.flushFrames();
      browser.mutate();
      assert.equal(browser.window.scrollY, 0);
      assert.equal(staleTargetCalls.length, 0);
      assert.equal(browser.timers.size, 0);
      await browser.navigate("/developers#not-yet-rendered");
      browser.flushFrames();
      assert.ok(browser.observers.some(observer => observer.connected));
      for (const [id, timer] of [...browser.timers]) {
        browser.timers.delete(id);
        timer.callback();
      }
      assert.ok(browser.observers.every(observer => !observer.connected));
      assert.equal(browser.timers.size, 0);
      await browser.navigate("/legal#another-missing");
      browser.flushFrames();
      await browser.navigate("/pricing");
      assert.ok(browser.observers.every(observer => !observer.connected));
      assert.equal(browser.timers.size, 0);
    } finally { await browser.cleanup(); }
  });

  await t.test("unmount cancels callbacks, removes pageshow handling and restores history ownership", async () => {
    for (const originalRestoration of ["auto", "manual"]) {
      const browser = await harness("/plus#late-section", originalRestoration);
      try {
        browser.flushFrames();
        await browser.unmount();
        assert.equal(browser.window.history.scrollRestoration, originalRestoration);
        assert.equal(browser.frames.size, 0);
        assert.equal(browser.timers.size, 0);
        assert.ok(browser.observers.every(observer => !observer.connected));
        assert.equal(browser.listeners.get("pageshow")?.size ?? 0, 0);
        browser.window.scrollY = 710;
        browser.pageShow(true);
        browser.flushFrames();
        browser.mutate();
        assert.equal(browser.window.scrollY, 710);
      } finally { await browser.cleanup(); }
    }
  });
});
