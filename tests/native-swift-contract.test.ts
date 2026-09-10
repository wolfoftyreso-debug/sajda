import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// These deliberately inspect source only. They protect security-critical wiring
// and ordering, but are not Swift compilation, simulator, or native runtime tests.
const swift = readFileSync(path.resolve("ios/App/App/SajdaNativePlugin.swift"), "utf8");
const scene = readFileSync(path.resolve("ios/App/App/SceneDelegate.swift"), "utf8");
const infoPlist = readFileSync(path.resolve("ios/App/App/Info.plist"), "utf8");

function section(start: string, end: string): string {
  const from = swift.indexOf(start);
  assert.notEqual(from, -1, `Missing source marker: ${start}`);
  const to = swift.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `Missing source marker: ${end}`);
  return swift.slice(from, to);
}

function before(source: string, earlier: string, later: string): void {
  const first = source.indexOf(earlier);
  const second = source.indexOf(later);
  assert.notEqual(first, -1, `Missing source contract: ${earlier}`);
  assert.notEqual(second, -1, `Missing source contract: ${later}`);
  assert.ok(first < second, `${earlier} must occur before ${later}`);
}

test("source-only iOS contract: manually localized web UI declares supported languages with an English fallback", () => {
  assert.match(infoPlist, /<key>CFBundleDevelopmentRegion<\/key>\s*<string>en<\/string>/u);
  assert.equal([...infoPlist.matchAll(/<key>CFBundleLocalizations<\/key>/gu)].length, 1);
  const declaration = infoPlist.match(/<key>CFBundleLocalizations<\/key>\s*<array>([\s\S]*?)<\/array>/u);
  assert.ok(declaration, "iOS must know which languages the bundled web UI handles without .lproj translations");
  const languages = [...declaration[1].matchAll(/<string>([^<]+)<\/string>/gu)].map(match => match[1]);
  assert.deepEqual(languages, ["en", "sv", "es", "fr", "zh-Hans"]);
});

test("source-only Swift contract: the active scene installs the custom native plugin", () => {
  assert.match(scene, /rootViewController\s*=\s*SajdaViewController\(\)/u);
  assert.match(swift, /class SajdaViewController:\s*CAPBridgeViewController/u);
  assert.match(swift, /override func capacitorDidLoad\(\)\s*\{\s*bridge\?\.registerPluginInstance\(SajdaNativePlugin\(\)\)/u);
});

test("source-only Swift contract: all bridge entry points first hop to the main queue", () => {
  const entries = [...swift.matchAll(/@objc public func (\w+)\(_ call: CAPPluginCall\)/gu)].map(match => match[1]);
  assert.deepEqual(entries.sort(), ["cancel", "request", "session", "signIn", "signOut"]);
  for (const name of entries) {
    assert.match(swift, new RegExp(`@objc public func ${name}\\(_ call: CAPPluginCall\\)\\s*\\{\\s*DispatchQueue\\.main\\.async\\s*\\{`, "u"));
  }
  assert.doesNotMatch(swift, /\bNSLock\b/u);
  for (const [start, end] of [
    ["private func storedToken()", "private func storeToken("],
    ["private func storeToken(", "private func clearToken("],
    ["private func clearToken(", "private func randomSecret()"],
    ["private func perform(", "private func current("],
    ["private func current(", "private func isoDate("],
  ]) assert.match(section(start, end), /dispatchPrecondition\(condition:\s*\.onQueue\(\.main\)\)/u);
});

test("source-only Swift contract: streaming response collector caps bytes before append and invalidates every finish", () => {
  const collector = section("private final class SajdaResponseCollector", "@objc(SajdaNativePlugin)");
  assert.match(collector, /URLSessionDataDelegate/u);
  assert.match(collector, /maximumBytes\s*=\s*4_000_000/u);
  assert.match(collector, /URLSession\(configuration:\s*config,\s*delegate:\s*self,\s*delegateQueue:\s*\.main\)/u);
  assert.match(collector, /response\.expectedContentLength\s*<=\s*Int64\(Self\.maximumBytes\)/u);
  const receive = section("didReceive data: Data)", "didCompleteWithError error:");
  before(receive, "guard data.count <= Self.maximumBytes - buffer.count else", "buffer.append(data)");
  assert.match(receive, /guard data\.count[^}]+finish\(\.failure\(URLError\(\.dataLengthExceedsMaximum\)\)\);\s*return/u);
  const finish = section("private func finish(_ result:", "func cancel()");
  before(finish, "guard let callback = completion else", "completion = nil");
  before(finish, "completion = nil", "invalidateAndCancel()");
  before(finish, "invalidateAndCancel()", "callback(result)");
  assert.match(finish, /buffer\.removeAll\(keepingCapacity:\s*false\)/u);
  assert.equal([...collector.matchAll(/\.dataTask\(/gu)].length, 1);
  assert.match(collector, /task\s*=\s*session\.dataTask\(with:\s*request\);/u);
  assert.doesNotMatch(collector, /dataTask\(with:[^\n]*completionHandler/u);
  assert.match(collector, /func cancel\(\)\s*\{\s*finish\(\.failure\(URLError\(\.cancelled\)\)\)/u);
  const redirect = section("willPerformHTTPRedirection response:", "@objc(SajdaNativePlugin)");
  assert.match(redirect, /completionHandler\(nil\)/u);
  assert.doesNotMatch(redirect, /completionHandler\(request\)/u);
});

test("source-only Swift contract: token deletion compares the captured token before deleting", () => {
  const deletion = section("private func clearToken(ifMatching expected: String)", "private func randomSecret()");
  before(deletion, "guard try storedToken() == expected else { return }", "SecItemDelete(");
  before(deletion, "SecItemDelete(", "authGeneration &+= 1");
  assert.equal([...swift.matchAll(/SecItemDelete\(/gu)].length, 1);
  assert.equal([...swift.matchAll(/self\.clearToken\(ifMatching: token\)/gu)].length, 2);
  assert.doesNotMatch(swift, /clearToken\(\)/u);
  const current = section("private func current(", "private func isoDate(");
  before(current, "guard generation == authGeneration else", "return try storedToken() == token");
});

test("source-only Swift contract: logout fences browser and exchange callbacks before cancelling them", () => {
  const logout = section("@objc public func signOut(", "private func finishSignIn(");
  before(logout, "self.authGeneration &+= 1", "self.authentication?.cancel()");
  before(logout, "self.authGeneration &+= 1", "self.requests[id]?.cancel()");
  before(logout, "self.pendingSignIn = nil", "self.authentication?.cancel()");
  assert.match(logout, /if let id = self\.exchangeRequestID\s*\{\s*self\.requests\[id\]\?\.cancel\(\)/u);
  assert.match(logout, /pending\?\.reject\("Sign-in was cancelled by sign-out\."\)/u);
  before(logout, "guard try self.current(generation, token: token)", "try self.clearToken(ifMatching: token)");
  assert.match(logout, /status == 200 \|\| status == 401/u);
});

test("source-only Swift contract: sign-in remains pending through its generation-guarded token exchange", () => {
  const signIn = section("@objc public func signIn(", "public func presentationAnchor(");
  before(signIn, "guard self.pendingSignIn == nil, !self.signOutInProgress", "self.pendingSignIn = call");
  before(signIn, "self.pendingSignIn = call", "ASWebAuthenticationSession(");
  const browser = section("let session = ASWebAuthenticationSession(", "session.presentationContextProvider = self");
  assert.match(browser, /callback, error in\s*DispatchQueue\.main\.async\s*\{/u);
  assert.match(browser, /generation == self\.authGeneration, self\.pendingSignIn != nil,\s*self\.exchangeRequestID == nil/u);
  assert.doesNotMatch(browser, /(?:pendingSignIn|authentication)\s*=\s*nil/u);
  const exchange = section("self.exchangeRequestID = requestID", "session.presentationContextProvider = self");
  before(exchange, "generation == self.authGeneration", "try self.storeToken(token)");
  before(exchange, "self.pendingSignIn != nil", "try self.storeToken(token)");
  before(exchange, "self.exchangeRequestID == requestID, !self.signOutInProgress", "try self.storeToken(token)");
  before(exchange, "expiry > Date()", "try self.storeToken(token)");
  before(exchange, "try self.storeToken(token)", "self.finishSignIn(generation)");
  const finish = section("private func finishSignIn(", "@objc public func signIn(");
  before(finish, "guard generation == authGeneration, let call = pendingSignIn", "pendingSignIn = nil");
});

test("source-only Swift contract: session identity is whitelisted and validated before crossing the bridge", () => {
  const sanitizer = section("private func sanitizedSession(", "@objc public func request(");
  assert.match(sanitizer, /CFGetTypeID\(verified\) == CFBooleanGetTypeID\(\), verified\.boolValue/u);
  assert.match(sanitizer, /CFGetTypeID\(expiresAt\) != CFBooleanGetTypeID\(\)/u);
  assert.match(sanitizer, /expiresAt\.doubleValue\.isFinite/u);
  assert.match(sanitizer, /expiresAt\.doubleValue\.rounded\(\.towardZero\) == expiresAt\.doubleValue/u);
  assert.match(sanitizer, /expiresAt\.doubleValue > Date\(\)\.timeIntervalSince1970/u);
  assert.match(sanitizer, /var identity:\s*\[String:\s*Any\]\s*=\s*\["id": id, "email": email, "email_verified": true, "created_at": createdAt\]/u);
  assert.match(sanitizer, /return \["user": identity, "expires_at": expiresAt\]/u);
  assert.doesNotMatch(sanitizer, /return (?:session|user)\b/u);
  const reader = section("@objc public func session(", "@objc public func signOut(");
  assert.match(reader, /call\.resolve\(\["session": try self\.sanitizedSession\(value\["session"\]\)\]\)/u);
  assert.doesNotMatch(reader, /call\.resolve\(\["session": (?:value|session)(?:\[|\])/u);
  before(reader, "try self.current(generation, token: token)", "try self.clearToken(ifMatching: token)");
  before(reader, "try self.current(generation, token: token)", "try self.sanitizedSession(");
});

test("source-only Swift contract: private requests capture a token and fence results before resolving", () => {
  const request = section("@objc public func request(", "@objc public func cancel(");
  before(request, "let generation = self.authGeneration", "self.perform(");
  assert.match(request, /components\.path == "\/api\/native\/account"/u);
  assert.match(request, /guard self\.pendingSignIn == nil, !self\.signOutInProgress/u);
  assert.match(request, /bearer = token/u);
  assert.match(request, /body: call\.getString\("body"\), bearer: bearer/u);
  before(request, "try self.current(generation, token: token)", 'call.resolve(["status": status');
});
