/** Opt-in, bounded REAL preview check. Input is a private JSON line on stdin.
 * Credentials/cookies are never printed or persisted. readOnly:true checks
 * retained access/report/billing without starting work or spending crawl quota.
 * readOnly:false is the explicit, bounded one-run control-fixture mode.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { PILOT_EMAIL } from "./create-plus-pilot.mjs";

const input = await new Promise((resolve) => {
  const lines = createInterface({ input: process.stdin });
  lines.once("line", (line) => {
    lines.close();
    resolve(line);
  });
});
let stage = "validate",
  sessionOpen = false,
  request;
try {
  const config = JSON.parse(input);
  assert.equal(
    typeof config.readOnly,
    "boolean",
    "Choose readOnly:true or explicitly enable the control fixture with readOnly:false",
  );
  const readOnly = config.readOnly;
  const expectedSources = config.expectedSources ?? (readOnly ? 2 : 1);
  assert.ok(
    Number.isInteger(expectedSources) &&
      expectedSources >= 1 &&
      expectedSources <= 100,
  );
  const origin = new URL(config.origin).origin;
  assert.match(origin, /^https:\/\/sajda-[a-z0-9]+-hypbit\.vercel\.app$/u);
  assert.equal(config.email, PILOT_EMAIL);
  assert.ok(
    typeof config.password === "string" && config.password.length >= 20,
  );
  assert.ok(
    typeof config.share === "string" &&
      /^[A-Za-z0-9_-]{20,100}$/u.test(config.share),
  );
  const cookies = new Map();
  request = async (path, body, accountId) => {
    let url = new URL(path, origin);
    for (let redirects = 0; redirects <= 4; redirects++) {
      assert.equal(url.origin, origin);
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(35_000),
        headers: {
          origin,
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
          ...(cookies.size
            ? {
                cookie: [...cookies]
                  .map(([name, value]) => `${name}=${value}`)
                  .join("; "),
              }
            : {}),
          ...(accountId ? { "x-sajda-account": accountId } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";"),
          split = pair.indexOf("=");
        cookies.set(pair.slice(0, split), pair.slice(split + 1));
      }
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.has("location")
      ) {
        assert.ok(!body, "Unexpected redirect during a private mutation");
        url = new URL(response.headers.get("location"), url);
        continue;
      }
      const text = await response.text();
      const data =
        response.headers.get("content-type")?.includes("application/json") &&
        text
          ? JSON.parse(text)
          : null;
      return {
        status: response.status,
        data,
        cache: response.headers.get("cache-control"),
      };
    }
    throw new Error("Redirect limit");
  };
  stage = "preview-access";
  assert.equal(
    (await request("/plus?_vercel_share=" + config.share)).status,
    200,
  );
  stage = "anonymous-denied";
  assert.equal((await request("/api/account/lost-domains")).status, 401);
  assert.equal((await request("/api/account/billing")).status, 401);
  const signIn = async () => {
    const response = await request("/api/auth/sign-in/email", {
      email: config.email,
      password: config.password,
    });
    assert.equal(response.status, 200, `Sign-in returned ${response.status}`);
    sessionOpen = true;
    assert.equal(response.data.user.id, config.id);
    assert.equal(response.data.user.emailVerified, true);
    assert.equal("token" in response.data, false);
  };
  stage = "sign-in";
  await signIn();
  stage = "real-session";
  const session = await request("/api/auth/get-session");
  assert.equal(session.data.user.id, config.id);
  stage = "plus-entitlement";
  const initial = await request(
    "/api/account/lost-domains",
    undefined,
    config.id,
  );
  assert.equal(initial.status, 200);
  assert.equal(initial.data.access, true);
  assert.equal(initial.data.enabled, true);
  assert.equal(initial.data.sourcesAvailable, expectedSources);
  assert.match(initial.cache, /no-store/u);
  stage = "foreign-account-denied";
  const foreignId = `qa-foreign-${randomUUID()}`;
  assert.equal(
    (await request("/api/account/lost-domains", undefined, foreignId)).status,
    409,
  );
  assert.equal(
    (await request("/api/account/billing", undefined, foreignId)).status,
    409,
  );
  stage = "billing-disabled";
  const billing = await request("/api/account/billing", undefined, config.id);
  assert.equal(billing.status, 200);
  assert.equal(billing.data.accountId, config.id);
  assert.equal(billing.data.ready, false);
  assert.equal(billing.data.canCheckout, false);
  assert.match(billing.cache, /no-store/u);
  let current = initial;
  if (!readOnly) {
    stage = "start";
    current = await request(
      "/api/account/lost-domains",
      { action: "start", requestKey: randomUUID() },
      config.id,
    );
    assert.equal(current.status, 200);
    const activeId = current.data.activeRun.id;
    for (let step = 0; step < 5 && current.data.activeRun; step++) {
      stage = "advance-" + (step + 1);
      current = await request(
        "/api/account/lost-domains",
        { action: "advance", runId: activeId },
        config.id,
      );
      assert.equal(current.status, 200, `Advance returned ${current.status}`);
    }
    stage = "report";
    assert.equal(current.data.activeRun, null, "Bounded pilot did not settle");
    assert.equal(current.data.latestRun.id, activeId);
    assert.ok(["succeeded", "partial"].includes(current.data.latestRun.status));
    assert.equal(current.data.candidates.length, 1);
    assert.equal(current.data.candidates[0].domain, "iana.org");
    assert.equal(current.data.candidates[0].registryStatus, "registered");
    assert.equal(current.data.candidates[0].confirmedRegistrable, false);
  }
  const priorReport = {
    run: current.data.latestRun,
    candidates: current.data.candidates,
    activeRun: current.data.activeRun,
    latestAttempt: current.data.latestAttempt,
  };
  stage = "logout";
  assert.equal((await request("/api/auth/sign-out", {})).status, 200);
  sessionOpen = false;
  assert.equal(
    (await request("/api/account/lost-domains", undefined, config.id)).status,
    401,
  );
  assert.equal(
    (await request("/api/account/billing", undefined, config.id)).status,
    401,
  );
  stage = "returning-login";
  await signIn();
  const returning = await request(
    "/api/account/lost-domains",
    undefined,
    config.id,
  );
  assert.equal(returning.status, 200);
  assert.equal(returning.data.access, true);
  assert.equal(returning.data.sourcesAvailable, expectedSources);
  assert.deepEqual(
    {
      run: returning.data.latestRun,
      candidates: returning.data.candidates,
      activeRun: returning.data.activeRun,
      latestAttempt: returning.data.latestAttempt,
    },
    priorReport,
  );
  stage = "returning-billing";
  const returningBilling = await request(
    "/api/account/billing",
    undefined,
    config.id,
  );
  assert.equal(returningBilling.status, 200);
  assert.equal(returningBilling.data.ready, false);
  assert.equal(returningBilling.data.canCheckout, false);
  console.log(
    JSON.stringify({
      status: "PASS",
      origin,
      realSignIn: true,
      realSession: true,
      mode: readOnly ? "read-only" : "control-fixture",
      plusAccess: true,
      engineEnabled: true,
      sourcesAvailable: expectedSources,
      runStatus: current.data.latestRun?.status ?? null,
      candidateCount: current.data.candidates.length,
      confirmedFinds: current.data.candidates.filter(
        (candidate) => candidate.confirmedRegistrable === true,
      ).length,
      logoutDeniesAccess: true,
      foreignAccountDenied: true,
      reportSurvivesRelogin: true,
      billingConfigured: false,
      checkoutEnabled: false,
      crawlRunsStarted: readOnly ? 0 : 1,
      crawlWorkAdvanced: !readOnly,
      scheduledCrawl: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "FAIL",
      stage,
      reason:
        error?.name === "AssertionError"
          ? error.message.split("\n")[0]
          : "Controlled request or configuration failure",
    }),
  );
  process.exitCode = 1;
} finally {
  if (sessionOpen && request)
    await request("/api/auth/sign-out", {}).catch(() => {});
}
