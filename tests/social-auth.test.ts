import assert from "node:assert/strict";
import test from "node:test";
import authProviders from "../api/auth-providers";
import { socialAuthConfigurationIssues, socialAuthProviders, socialAuthProviderStatus } from "../api/_shared/social-auth";
import { verifiedSocialAuthorizationUrl } from "../src/integrations/neon/social-auth";

const configured = () => ({
  GOOGLE_CLIENT_ID: "google-client", GOOGLE_CLIENT_SECRET: "google-secret",
  TWITTER_CLIENT_ID: "twitter-client", TWITTER_CLIENT_SECRET: "twitter-secret",
  GITHUB_CLIENT_ID: "github-client", GITHUB_CLIENT_SECRET: "github-secret",
  APPLE_CLIENT_ID: "apple-client", APPLE_CLIENT_SECRET: "apple.secret.jwt",
});

test("social providers fail closed on absent or partial server credentials", () => {
  assert.deepEqual(socialAuthProviderStatus({}), [
    { id: "google", enabled: false }, { id: "twitter", enabled: false },
    { id: "github", enabled: false }, { id: "apple", enabled: false },
  ]);
  assert.deepEqual(Object.keys(socialAuthProviders({})), []);
  assert.deepEqual(socialAuthConfigurationIssues({ GOOGLE_CLIENT_ID: "only-an-id" }), ["google_oauth_credential_pair_incomplete"]);
  assert.deepEqual(socialAuthProviderStatus(configured()).map(item => item.enabled), [true, true, true, true]);
  const providers = socialAuthProviders(configured());
  assert.deepEqual(Object.keys(providers), ["google", "twitter", "github", "apple"]);
  assert.equal(providers.twitter.disableDefaultScope, true);
  assert.deepEqual(providers.twitter.scope, ["users.read", "users.email"]);
  assert.equal(providers.google.disableIdTokenSignIn, true);
  assert.equal(providers.apple.disableIdTokenSignIn, true);
});

test("provider discovery exposes status but never OAuth credentials", () => {
  const previous = Object.fromEntries(Object.keys(configured()).map(key => [key, process.env[key]]));
  Object.assign(process.env, configured());
  const response = {
    code: 0, body: undefined as unknown, headers: new Map<string, string>(),
    setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), value); },
    status(code: number) { this.code = code; return this; }, json(value: unknown) { this.body = value; },
  };
  try {
    authProviders({ method: "GET" }, response);
    assert.equal(response.code, 200);
    assert.deepEqual((response.body as { providers: unknown }).providers, socialAuthProviderStatus(configured()));
    assert.doesNotMatch(JSON.stringify(response.body), /client|secret|APPLE_CLIENT/u);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
    authProviders({ method: "POST" }, response);
    assert.equal(response.code, 405);
    assert.equal(response.headers.get("allow"), "GET");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("browser redirect accepts only each provider's exact HTTPS authorization host", () => {
  assert.match(verifiedSocialAuthorizationUrl("google", "https://accounts.google.com/o/oauth2/v2/auth?client_id=x") ?? "", /^https:\/\/accounts\.google\.com/u);
  assert.match(verifiedSocialAuthorizationUrl("twitter", "https://x.com/i/oauth2/authorize?client_id=x") ?? "", /^https:\/\/x\.com/u);
  assert.match(verifiedSocialAuthorizationUrl("github", "https://github.com/login/oauth/authorize?client_id=x") ?? "", /^https:\/\/github\.com/u);
  assert.match(verifiedSocialAuthorizationUrl("apple", "https://appleid.apple.com/auth/authorize?client_id=x") ?? "", /^https:\/\/appleid\.apple\.com/u);
  for (const value of ["javascript:alert(1)", "https://accounts.google.com.attacker.invalid/auth", "http://accounts.google.com/auth", "https://user:pass@github.com/auth", "not a url"]) {
    assert.equal(verifiedSocialAuthorizationUrl("google", value), null);
  }
});
