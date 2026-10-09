import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise production callbacks with synthetic refs. Real focus movement is
// verified separately in the credential-free loopback browser harness.
const source = ts.createSourceFile("Swipe.tsx", await readFile(new URL("../src/pages/Swipe.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let closeFocus, openSettings;
function visit(node) {
  if (ts.isJsxAttribute(node) && node.name.getText(source) === "onCloseAutoFocus"
    && ts.isJsxExpression(node.initializer) && node.initializer.expression?.getText(source).includes("settingsTriggerRef")) closeFocus = node.initializer.expression;
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "openSettings") openSettings = node.initializer;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(closeFocus && openSettings, "Settings must retain an explicit opener and close-focus handler");
function callback(node, context) {
  return new vm.Script(ts.transpileModule(`(${node.getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext(context);
}
const button = (connected = true) => ({ isConnected: connected, focused: 0, focus() { this.focused++; } });

test("closing Swipe settings restores the actual opener, rather than another control", () => {
  const opener = button(), header = button(), settingsTriggerRef = { current: opener };
  let prevented = 0;
  callback(closeFocus, { settingsTriggerRef, settingsButtonRef: { current: header } })({ preventDefault() { prevented++; } });
  assert.equal(opener.focused, 1); assert.equal(header.focused, 0); assert.equal(prevented, 1); assert.equal(settingsTriggerRef.current, null);
});
test("an unmounted opener or initial automatic dialog falls back to the connected header trigger", () => {
  for (const opener of [button(false), null]) {
    const header = button(), settingsTriggerRef = { current: opener };
    callback(closeFocus, { settingsTriggerRef, settingsButtonRef: { current: header } })({ preventDefault() {} });
    assert.equal(header.focused, 1); assert.equal(opener?.focused ?? 0, 0); assert.equal(settingsTriggerRef.current, null);
  }
});
test("route teardown does not focus disconnected controls", () => {
  const opener = button(false), header = button(false), settingsTriggerRef = { current: opener };
  callback(closeFocus, { settingsTriggerRef, settingsButtonRef: { current: header } })({ preventDefault() {} });
  assert.equal(opener.focused, 0); assert.equal(header.focused, 0); assert.equal(settingsTriggerRef.current, null);
});
test("opening settings captures its button without weakening an active-operation guard", () => {
  const opener = button(), state = { opened: false, draft: null }, settingsTriggerRef = { current: null };
  const context = { settingsTriggerRef, undoControllerRef: { current: null }, decisionTimerRef: { current: null }, selectedTlds: ["com", "app"],
    setDraftTlds(value) { state.draft = value; }, setIsSettingsOpen(value) { state.opened = value; } };
  callback(openSettings, context)({ currentTarget: opener });
  assert.equal(settingsTriggerRef.current, opener); assert.equal(state.opened, true); assert.deepEqual(state.draft, ["com", "app"]);
  for (const busy of ["undoControllerRef", "decisionTimerRef"]) {
    settingsTriggerRef.current = null; state.opened = false; context[busy].current = {};
    callback(openSettings, context)({ currentTarget: opener });
    assert.equal(settingsTriggerRef.current, null); assert.equal(state.opened, false); context[busy].current = null;
  }
});
