import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createSwipeUndo, canUndoSwipe, consumeSwipeUndo } from "../src/lib/swipeUndo.ts";
import { saveSwipeWishlistResult, updateSwipeWishlistEntry, removeSwipeWishlistEntry } from "../src/lib/swipeWishlist.ts";

// Exercise the real component callbacks without duplicating their control flow.
// Rendering, layout and focus movement still require the separate browser pass.
const text = await readFile(new URL("../src/pages/Swipe.tsx", import.meta.url), "utf8");
const source = ts.createSourceFile("Swipe.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const swipe = source.statements.flatMap(statement => ts.isVariableStatement(statement)
  ? [...statement.declarationList.declarations] : []).find(node => node.name.getText(source) === "Swipe");
assert.ok(swipe && ts.isArrowFunction(swipe.initializer) && ts.isBlock(swipe.initializer.body));
const statements = swipe.initializer.body.statements;
const callbacks = new Map(statements.flatMap(statement => ts.isVariableStatement(statement)
  ? [...statement.declarationList.declarations] : []).filter(node => node.initializer && (ts.isArrowFunction(node.initializer)
  || ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source) === "useCallback"))
  .map(node => [node.name.getText(source), ts.isArrowFunction(node.initializer) ? node.initializer : node.initializer.arguments[0]]));
const effects = statements.filter(ts.isExpressionStatement).map(statement => statement.expression)
  .filter(node => ts.isCallExpression(node) && ["useEffect", "useLayoutEffect"].includes(node.expression.getText(source)));
const ownerEffect = effects.find(node => node.expression.getText(source) === "useLayoutEffect"
  && node.arguments[0].getText(source).includes("ownerRef.current === owner"));
const unmountEffect = effects.find(node => node.expression.getText(source) === "useEffect"
  && node.arguments[0].getText(source).includes("pendingAccessRef.current.clear()"));
assert.ok(ownerEffect && unmountEffect, "Account-switch and unmount guards must remain wired");
const wishlistHandlers = new Map();
function findWishlist(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "SwipeWishlistPanel") {
    for (const attribute of node.attributes.properties) {
      if (ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer)) {
        wishlistHandlers.set(attribute.name.getText(source), attribute.initializer.expression);
      }
    }
  }
  ts.forEachChild(node, findWishlist);
}
findWishlist(source);

function evaluate(node, context) {
  assert.ok(node, "Expected production callback was not found");
  const output = ts.transpileModule(`(${node.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return new vm.Script(output).runInContext(context);
}

class SwipePremiumError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const card = domain => ({ domain, tld: domain.split(".").at(-1), status: "available", checkMethod: "rdap",
  authoritative: true, registrarPrice: 0, estimatedValue: 0, confidenceScore: 0, rationale: "Fixture" });

function harness() {
  const deck = [card("klarhem.dev"), card("kustverk.app")];
  const state = { deck, deckIndex: 0, saved: [], lastUndo: null, exitDirection: null, isLoading: false,
    isUndoPending: false, isPremiumDialogOpen: false, undoFeedback: null, isSettingsOpen: false };
  const timers = new Map();
  const requests = [];
  let timerId = 0;
  const ref = current => ({ current });
  const context = vm.createContext({ AbortController, SwipePremiumError, createSwipeUndo, canUndoSwipe, consumeSwipeUndo,
    saveSwipeWishlistResult, updateSwipeWishlistEntry, removeSwipeWishlistEntry,
    anonymousMode: true, anonymousSearchAccessReady: true, anonymousSearchCanStart: true,
    selectedTlds: ["dev"], copy: { kept: "Saved {value}", skipped: "Skipped {value}" },
    premiumCopy: { restored: "Restored", failure: "Unverified. Nothing changed.", verify: "Verify email" },
    withValue: (value, replacement) => value.replace("{value}", replacement),
    deckGenerationRef: ref(7), lastUndoRef: ref(null), undoControllerRef: ref(null), savedRef: ref(state.saved),
    positionRef: ref(0), ownerRef: ref("account-a"), requestIdRef: ref(0), requestModeRef: ref(null),
    decisionTimerRef: ref(null), deckControllerRef: ref(null), savedControllerRef: ref(null),
    pendingAccessRef: ref(new Set()), dragRef: ref(null),
    window: { setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
      clearTimeout: id => timers.delete(id) },
    authorizeSwipeUndo: scope => new Promise((resolve, reject) => requests.push({ scope, resolve, reject })),
  });
  for (const field of ["Deck", "DeckIndex", "Saved", "LastUndo", "UndoFeedback", "ExitDirection", "DragOffset",
    "Notice", "IsDragging", "IsUndoPending", "IsPremiumDialogOpen", "IsSettingsOpen", "DraftTlds"]) {
    const key = field[0].toLowerCase() + field.slice(1);
    context[`set${field}`] = value => { state[key] = typeof value === "function" ? value(state[key]) : value; };
  }
  context.commitSaved = evaluate(callbacks.get("commitSaved"), context);
  const render = () => {
    Object.assign(context, { deck: state.deck, current: state.deck[state.deckIndex], deckIndex: state.deckIndex,
      exitDirection: state.exitDirection, isLoading: state.isLoading });
  };
  render();
  const invoke = (name, ...args) => evaluate(callbacks.get(name), context)(...args);
  const finishDecision = () => {
    for (const [id, callback] of timers) { timers.delete(id); callback(); }
    render();
  };
  const decide = (direction = "keep") => { invoke("makeDecision", direction); finishDecision(); };
  const switchOwner = owner => {
    context.user = owner ? { id: owner } : null;
    evaluate(ownerEffect.arguments[0], context)();
  };
  const unmount = () => evaluate(unmountEffect.arguments[0], context)()();
  const wishlistAction = (name, ...args) => evaluate(wishlistHandlers.get(name), context)(...args);
  return { state, context, requests, timers, invoke, render, finishDecision, decide, switchOwner, unmount, wishlistAction };
}

test("Swipe UI serializes same-render decisions and Undo; a server receipt consumes exactly one step", async () => {
  const h = harness();
  h.invoke("makeDecision", "keep");
  const token = h.context.lastUndoRef.current;
  h.invoke("makeDecision", "skip");
  assert.equal(h.timers.size, 1);
  assert.equal(h.context.lastUndoRef.current, token);
  await h.invoke("undoLastDecision");
  assert.equal(h.requests.length, 0, "Undo must wait for the exit animation");
  h.finishDecision();
  const pending = h.invoke("undoLastDecision");
  await h.invoke("undoLastDecision");
  h.invoke("makeDecision", "skip");
  h.invoke("openSettings");
  await h.invoke("loadDeck", ["app"], "replace");
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].scope.accountId, "account-a");
  assert.equal(h.state.deckIndex, 1);
  assert.equal(h.context.lastUndoRef.current, token);
  assert.equal(h.state.isSettingsOpen, false);
  assert.equal(h.state.saved.length, 1);
  h.requests[0].resolve({ accountId: "account-a", requestId: "req_fixture" });
  await pending;
  assert.equal(h.state.deckIndex, 0);
  assert.equal(h.state.saved.length, 0);
  assert.equal(h.context.lastUndoRef.current, null);
  assert.equal(h.state.lastUndo, null);
  assert.equal(h.state.isUndoPending, false);
  await h.invoke("undoLastDecision");
  assert.equal(h.requests.length, 1, "A consumed token must not authorize an earlier decision");
});

test("Swipe UI denial and dependency failure preserve the card, wishlist and retry token", async t => {
  for (const code of ["premium_required", "unauthenticated", "email_verification_required", "unavailable", "invalid_response", "account_changed"]) {
    await t.test(code, async () => {
      const h = harness(); h.decide();
      const token = h.context.lastUndoRef.current, saved = h.state.saved;
      const pending = h.invoke("undoLastDecision");
      h.requests[0].reject(new SwipePremiumError(code));
      await pending;
      assert.equal(h.state.deckIndex, 1);
      assert.equal(h.state.saved, saved);
      assert.equal(h.context.lastUndoRef.current, token);
      assert.equal(h.state.isUndoPending, false);
      assert.equal(h.context.undoControllerRef.current, null);
      assert.equal(h.state.isPremiumDialogOpen, ["premium_required", "unauthenticated"].includes(code));
      if (code === "email_verification_required") assert.equal(h.state.undoFeedback, "Verify email");
      else if (!["premium_required", "unauthenticated"].includes(code)) assert.equal(h.state.undoFeedback, "Unverified. Nothing changed.");
    });
  }
});

test("anonymous Undo opens the explanation without sending an authorization request or consuming the token", async () => {
  const h = harness(); h.context.ownerRef.current = null; h.decide("skip");
  const token = h.context.lastUndoRef.current;
  await h.invoke("undoLastDecision");
  assert.equal(h.requests.length, 0);
  assert.equal(h.state.isPremiumDialogOpen, true);
  assert.equal(h.state.deckIndex, 1);
  assert.equal(h.context.lastUndoRef.current, token);
});

test("account change aborts authorization and clears account-bound Undo even when a transport resolves late", async () => {
  const h = harness(); h.decide();
  const saved = h.state.saved;
  const pending = h.invoke("undoLastDecision");
  h.switchOwner("account-b");
  assert.equal(h.requests[0].scope.signal.aborted, true);
  assert.equal(h.state.lastUndo, null);
  assert.equal(h.state.isUndoPending, false);
  h.requests[0].resolve({ accountId: "account-a" });
  await pending;
  assert.equal(h.state.deckIndex, 1);
  assert.equal(h.state.saved, saved);
  assert.equal(h.context.lastUndoRef.current, null);
  assert.equal(h.state.isPremiumDialogOpen, false);
});

test("unmount aborts the request and decision timer; late receipts cannot alter the deck or wishlist", async () => {
  const h = harness(); h.decide();
  const saved = h.state.saved;
  const pending = h.invoke("undoLastDecision");
  h.unmount();
  assert.equal(h.requests[0].scope.signal.aborted, true);
  h.requests[0].resolve({ accountId: "account-a" });
  await pending;
  assert.equal(h.state.deckIndex, 1);
  assert.equal(h.state.saved, saved);
  const duringAnimation = harness();
  duringAnimation.invoke("makeDecision", "skip");
  duringAnimation.unmount();
  assert.equal(duringAnimation.timers.size, 0);
});

test("stale owner, receipt, deck, position or decision cannot receive a pending Undo result", async t => {
  const cases = {
    owner: h => { h.context.ownerRef.current = "account-b"; },
    generation: h => { h.context.deckGenerationRef.current++; },
    position: h => { h.context.positionRef.current++; },
    decision: h => { h.context.lastUndoRef.current = { ...h.context.lastUndoRef.current }; },
    request: h => { h.context.undoControllerRef.current = new AbortController(); },
    receipt: () => {},
  };
  for (const [name, mutate] of Object.entries(cases)) await t.test(name, async () => {
    const h = harness(); h.decide();
    const saved = h.state.saved;
    const pending = h.invoke("undoLastDecision");
    mutate(h);
    h.requests[0].resolve({ accountId: name === "receipt" ? "account-b" : "account-a" });
    await pending;
    assert.equal(h.state.deckIndex, 1);
    assert.equal(h.state.saved, saved);
  });
});

test("a committed replacement clears Undo, while later wishlist edits survive authorized Undo", async () => {
  const replacement = harness(); replacement.decide();
  replacement.invoke("commitNewDeck", [card("annan.dev")]);
  assert.equal(replacement.context.lastUndoRef.current, null);
  assert.equal(replacement.state.lastUndo, null);
  assert.equal(replacement.context.deckGenerationRef.current, 8);
  assert.equal(replacement.state.deckIndex, 0);
  const h = harness(); h.decide();
  const pending = h.invoke("undoLastDecision");
  const edited = [{ ...h.state.saved[0], tags: ["Do not discard"] }];
  h.invoke("commitSaved", edited);
  h.requests[0].resolve({ accountId: "account-a" });
  await pending;
  assert.equal(h.state.deckIndex, 0);
  assert.equal(h.state.saved, edited);
});

test("same-batch wishlist callbacks survive Undo before React commits state or runs layout effects", async t => {
  for (const action of ["onUpdate", "onRemove", "onClear"]) await t.test(action, async () => {
    const h = harness(); h.decide();
    const beforeRender = h.state.saved;
    const pending = h.invoke("undoLastDecision");
    const batchedUpdates = [];
    h.context.setSaved = update => batchedUpdates.push(update);
    if (action === "onUpdate") {
      h.wishlistAction(action, "klarhem.dev", { tags: ["Keep this edit"] });
      h.wishlistAction(action, "klarhem.dev", { category: "brand" });
    } else h.wishlistAction(action, "klarhem.dev");
    assert.equal(h.state.saved, beforeRender, "React has not committed the queued wishlist update");
    assert.notEqual(h.context.savedRef.current, beforeRender, "The real commitSaved must synchronously publish every edit");
    h.requests[0].resolve({ accountId: "account-a" });
    await pending;
    for (const update of batchedUpdates) h.state.saved = typeof update === "function" ? update(h.state.saved) : update;
    assert.equal(h.state.deckIndex, 0);
    assert.equal(h.context.lastUndoRef.current, null);
    if (action === "onUpdate") {
      assert.equal(h.state.saved.length, 1);
      assert.deepEqual(h.state.saved[0].tags, ["Keep this edit"]);
      assert.equal(h.state.saved[0].category, "brand", "Sequential same-batch edits must both survive");
    } else assert.equal(h.state.saved.length, 0, "A removed domain must not be reinstated by Undo");
  });
});

test("premium denial dialog explicitly restores the Undo button focus", () => {
  assert.match(text, /ref=\{undoButtonRef\}/u);
  const premiumDialog = text.slice(text.indexOf("<Dialog open={isPremiumDialogOpen}"), text.indexOf("<Dialog open={isSettingsOpen}"));
  assert.match(premiumDialog, /onCloseAutoFocus=\{/u);
  assert.match(premiumDialog, /event\.preventDefault\(\)/u);
  assert.match(premiumDialog, /undoButtonRef\.current\?\.focus\(\)/u);
});
