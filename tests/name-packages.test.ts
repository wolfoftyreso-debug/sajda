import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPackageObservations, buildNamePackages, isPackageHandleFormatValid, NAME_PACKAGE_EVIDENCE_MAX_AGE_MS,
  NAME_PACKAGE_REQUIRED_TLD_LIMIT, NAME_PACKAGE_METHODOLOGY_VERSION,
  packageSocialUrl, SOCIAL_PLATFORMS, socialObservationSchema,
  type PackageDomainInput, type PackageOptions, type SocialObservation, type SocialPlatform,
} from "../shared/name-packages.js";

const observedAt = "2026-09-13T12:00:00.000Z";
const now = Date.parse(observedAt);
function domain(name = "nordform.com", extra: Partial<PackageDomainInput> = {}): PackageDomainInput {
  return { domain: name, status: "available", availabilityVerified: true, checkMethod: "rdap", ...extra };
}
function options(extra: Partial<PackageOptions> = {}): PackageOptions {
  return { platforms: [...SOCIAL_PLATFORMS], observedAt, now, ...extra };
}
function observation(extra: Partial<SocialObservation> = {}): SocialObservation {
  return { platform: "github", handle: "nordform", status: "not_found", checkedAt: observedAt,
    sourceUrl: "https://api.github.com/users/nordform", ...extra };
}

test("packages group actual registrable labels across compound and simple suffixes", () => {
  const packages = buildNamePackages([domain("nordform.co.uk"), domain("nordform.com"), domain("NORDform.COM"), domain("other.se")], options());
  const result = packages.find(pkg => pkg.label === "nordform")!;
  assert.equal(packages.length, 2);
  assert.deepEqual(result.domains.map(item => item.domain), ["nordform.co.uk", "nordform.com"]);
  assert.equal(result.displayName, "nordform");
  assert.equal(result.socials.length, 6);
  assert.ok(!result.domains.some(item => item.domain === "nordform.se"), "Never add an extension that was neither returned nor explicitly required");
  assert.deepEqual(result.company, { status: "not_checked" });
  assert.deepEqual(result.trademark, { status: "not_checked" });
});

test("missing requested extensions are explicit unchecked candidates, not full domain evidence", () => {
  const [actualOnly] = buildNamePackages([domain()], options());
  const [required] = buildNamePackages([domain()], options({ requiredTlds: ["com", "se"] }));
  assert.deepEqual(required.domains.map(item => item.domain), ["nordform.com", "nordform.se"]);
  assert.deepEqual(required.domains[1], { domain: "nordform.se", status: "unknown", availabilityVerified: false,
    checkMethod: "none", checkedAt: null, evidenceStatus: "unverified", requestedAlternative: true });
  assert.equal(required.domains[0].requestedAlternative, undefined);
  assert.equal(required.scoreParts.domains.score, 15);
  assert.equal(required.packageScore, actualOnly.packageScore - 15);
  assert.equal(required.fitScore, actualOnly.fitScore);
  assert.equal(required.evidenceCoverage, 10);
  assert.ok(required.missingChecks.includes("domain_availability"));
  assert.ok(required.reasonCodes.includes("domain_check_required"));
  assert.ok(required.nextActions.some(action => action.kind === "refresh_domains"));
  const checked = applyPackageObservations(required, [observation()], now);
  assert.deepEqual(checked.domains[1], required.domains[1]);
  assert.equal(checked.scoreParts.domains.score, 15);
  assert.equal(checked.evidenceCoverage, 20);
  assert.ok(checked.missingChecks.includes("domain_availability"));
  assert.deepEqual(applyPackageObservations(checked, [], now + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1).domains[1], required.domains[1]);
});

test("required suffixes normalize and deduplicate without overwriting actual conflicts or scores", () => {
  const rows = [domain("nordform.com", { namingScore: 70 }), domain("nordform.se", { status: "taken", namingScore: 50 })];
  const requiredTlds = [" .COM ", "se", ".co.uk", "COM", " co.uk "];
  const copy = [...requiredTlds];
  const [result] = buildNamePackages(rows, options({ requiredTlds }));
  assert.deepEqual(requiredTlds, copy);
  assert.deepEqual(result.domains.map(item => item.domain), ["nordform.co.uk", "nordform.com", "nordform.se"]);
  assert.equal(result.domains.find(item => item.domain === "nordform.se")?.status, "taken");
  assert.equal(result.domains.find(item => item.domain === "nordform.se")?.namingScore, 50);
  assert.equal(result.domains.find(item => item.domain === "nordform.co.uk")?.namingScore, undefined);
  assert.equal(result.scoreParts.domains.score, 10);
  assert.equal(result.evidenceCoverage, Math.round(200 / 11));
  assert.deepEqual(result, buildNamePackages([...rows].reverse(), options({ requiredTlds: [...requiredTlds].reverse() }))[0]);
  const [complete] = buildNamePackages([domain(), domain("nordform.se")], options({ requiredTlds: ["se", "com"] }));
  assert.equal(complete.scoreParts.domains.score, 30);
  assert.equal(complete.missingChecks.includes("domain_availability"), false);
  assert.ok(complete.domains.every(item => item.requestedAlternative === undefined));
});

test("invalid, private or over-limit suffix lists fail closed without reducing the denominator silently", () => {
  const invalid = ["", ".", "..com", "com.", "com/path", "https://com", "example.com", "github.io", "blogspot.com", "uk.com",
    "com?x=1", "com#x", "com:443", "com@evil.com", "co..uk", "com\\evil", "localhost", "invalid", "127.0.0.1",
    "c o m", "-com", "com-", "<script>", "ｃｏｍ", "рф", "a".repeat(254)];
  for (const suffix of invalid) assert.deepEqual(buildNamePackages([domain()], options({ requiredTlds: ["com", suffix] })), [], suffix);
  for (const value of [null, "com", {}, ["com", 7], ["com", null], ["com", undefined]]) {
    assert.deepEqual(buildNamePackages([domain()], options({ requiredTlds: value as unknown as string[] })), []);
  }
  assert.deepEqual(buildNamePackages([domain()], options({ requiredTlds: Array(NAME_PACKAGE_REQUIRED_TLD_LIMIT + 1).fill("com") })), []);
  assert.deepEqual(buildNamePackages([domain()], options({ requiredTlds: Array(NAME_PACKAGE_REQUIRED_TLD_LIMIT).fill("com") })), buildNamePackages([domain()], options()));
  assert.deepEqual(buildNamePackages([domain()], options({ requiredTlds: [] })), buildNamePackages([domain()], options()));
  assert.deepEqual(buildNamePackages([], options({ requiredTlds: ["com", "se"] })), [], "Requirements cannot create name candidates without input");
});

test("required alternatives preserve DNS label identity including IDNs and compound suffixes", () => {
  const [idn] = buildNamePackages([domain("café.se")], options({ requiredTlds: ["com", "se", "xn--p1ai"] }));
  assert.equal(idn.label, "xn--caf-dma");
  assert.deepEqual(idn.domains.map(item => item.domain), ["xn--caf-dma.com", "xn--caf-dma.se", "xn--caf-dma.xn--p1ai"]);
  assert.equal(idn.scoreParts.domains.score, 10);
  assert.ok(idn.socials.every(item => item.handle === null));
  const [compound] = buildNamePackages([domain("nordform.co.uk")], options({ requiredTlds: ["co.uk", "com"] }));
  assert.deepEqual(compound.domains.map(item => item.domain), ["nordform.co.uk", "nordform.com"]);
  assert.equal(compound.domains[1].requestedAlternative, true);
  assert.equal(compound.scoreParts.domains.score, 15);
});

test("invalid or nonregistrable inputs cannot become profile paths or package labels", () => {
  const invalid = ["https://nordform.com", "nordform.com/path", "nordform.com?x=1", "nordform.com#x", "nordform.com:443",
    "nordform.com@evil.com", "nordform.com\\evil", "<script>.com", "javascript:alert.com", "nordform%2f.com", "nordform com",
    "nordform.com\n", " nordform.com", "nordform.com.", "foo.github.io", "sub.nordform.com", "example.invalid", "127.0.0.1",
    "localhost", "co.uk", "-bad.com", "bad-.com", "bad..com", `${"a".repeat(64)}.com`, "ｅｘａｍｐｌｅ.com"];
  assert.deepEqual(buildNamePackages(invalid.map(name => domain(name)), options()), []);
});

test("IDN DNS identity stays explicit and never silently becomes an ASCII handle", () => {
  const [result] = buildNamePackages([domain("café.se"), domain("xn--caf-dma.se")], options());
  assert.equal(result.label, "xn--caf-dma");
  assert.equal(result.domains.length, 1);
  assert.equal(result.fitScore, 0);
  assert.ok(result.reasonCodes.includes("idn_needs_review"));
  for (const social of result.socials) {
    assert.equal(social.handle, null); assert.equal(social.formatValid, false);
    assert.equal(social.sourceUrl, null); assert.deepEqual(social.alternatives, []);
  }
});

test("DNS, unverified, unknown and invalid methods never claim availability", () => {
  for (const extra of [
    { checkMethod: "dns" }, { checkMethod: "none" }, { checkMethod: "error" }, { checkMethod: "custom" },
    { availabilityVerified: false }, { status: "unknown" as const }, { status: "checking" as const },
  ]) {
    const [result] = buildNamePackages([domain("nordform.com", extra)], options());
    assert.equal(result.domains[0].status, "unknown");
    assert.equal(result.domains[0].availabilityVerified, false);
    assert.equal(result.scoreParts.domains.score, 0);
    assert.equal(result.evidenceCoverage, 0);
    assert.ok(result.missingChecks.includes("domain_availability"));
  }
  for (const method of ["rdap", "das", "whois"]) assert.equal(buildNamePackages([domain("nordform.com", { checkMethod: method })], options())[0].domains[0].status, "available");
});

test("restored results without timestamp, invalid timestamps, stale and future evidence are unknown", () => {
  for (const date of [null, "not-a-date", "2026-09-13", "2026-09-13T12:01:00.000Z", "2026-09-13T11:29:59.999Z"]) {
    const [result] = buildNamePackages([domain()], options({ observedAt: date }));
    assert.equal(result.domains[0].status, "unknown", String(date));
    assert.equal(result.evidenceCoverage, 0);
  }
  const [edge] = buildNamePackages([domain()], options({ now: now + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS }));
  assert.equal(edge.domains[0].status, "available");
  const expired = applyPackageObservations(edge, [], now + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1);
  assert.equal(expired.domains[0].status, "unknown");
  assert.equal(expired.domains[0].evidenceStatus, "stale");
  assert.ok(applyPackageObservations(expired, [], now + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 2).reasonCodes.includes("domain_evidence_expired"));
});

test("row observation times override fresh or missing response receipts and retain their source", () => {
  assert.equal(NAME_PACKAGE_METHODOLOGY_VERSION, "name-package-1.0.0");
  const checkedAt = "2026-09-13T11:29:59.999Z";
  const [stale] = buildNamePackages([domain("nordform.com", { checkedAt, source: "verisign-rdap" })], options());
  assert.equal(stale.domains[0].status, "unknown");
  assert.equal(stale.domains[0].evidenceStatus, "stale");
  assert.equal(stale.domains[0].checkedAt, checkedAt);
  assert.equal(stale.domains[0].source, "verisign-rdap");
  assert.equal(stale.scoreParts.domains.score, 0);
  assert.equal(stale.evidenceCoverage, 0);
  const [current] = buildNamePackages([domain("nordform.com", { checkedAt: observedAt })], options({ observedAt: null }));
  assert.equal(current.domains[0].status, "available", "A real observation does not need a receipt fallback");
  assert.equal(current.domains[0].checkedAt, observedAt);
});

test("explicit null, malformed and future row timestamps never inherit fresh receipt evidence", () => {
  for (const checkedAt of [null, "not-a-date", "2026-09-13", "2026-02-30T12:00:00.000Z", "2026-09-13T12:00:00.001Z"]) {
    const [result] = buildNamePackages([domain("nordform.com", { checkedAt })], options());
    assert.equal(result.domains[0].status, "unknown", String(checkedAt));
    assert.equal(result.domains[0].availabilityVerified, false);
    assert.equal(result.scoreParts.domains.score, 0);
    assert.equal(result.evidenceCoverage, 0);
    const updated = applyPackageObservations(result, [observation()], now);
    assert.equal(updated.domains[0].status, "unknown");
    assert.equal(updated.domains[0].checkedAt, result.domains[0].checkedAt);
  }
  const [legacy] = buildNamePackages([domain()], options());
  assert.equal(legacy.domains[0].checkedAt, observedAt, "Only omitted row timestamps retain compatibility fallback");
});

test("mixed row ages expire independently and social updates cannot mint new registry timestamps", () => {
  const older = "2026-09-13T11:40:00.000Z";
  const [result] = buildNamePackages([
    domain("nordform.com", { checkedAt: older, source: "verisign-rdap" }),
    domain("nordform.se", { checkedAt: observedAt, source: "iis-das" }),
    domain("nordform.net", { checkedAt: null }),
  ], options({ requiredTlds: ["com", "se", "net", "org"] }));
  assert.equal(result.scoreParts.domains.score, 15);
  const aged = applyPackageObservations(result, [observation()], now + 11 * 60_000);
  assert.deepEqual(aged.domains.map(item => [item.domain, item.status, item.checkedAt]), [
    ["nordform.com", "unknown", older], ["nordform.net", "unknown", null],
    ["nordform.org", "unknown", null], ["nordform.se", "available", observedAt],
  ]);
  assert.equal(aged.scoreParts.domains.score, 8);
  assert.equal(aged.domains[0].source, "verisign-rdap");
  const expired = applyPackageObservations({ ...aged, observedAt: new Date(now + 31 * 60_000).toISOString() }, [], now + 31 * 60_000);
  assert.ok(expired.domains.every(item => item.status === "unknown"));
  assert.deepEqual(expired.domains.map(item => item.checkedAt), [older, null, null, observedAt]);
  assert.equal(expired.scoreParts.domains.score, 0);
  assert.equal(expired.evidenceCoverage, 0);
  assert.equal(applyPackageObservations(expired, [], now).domains[0].status, "unknown", "Age changes cannot resurrect retired evidence");
});

test("duplicate conflicts favor unknown then taken and do not multiply coverage", () => {
  const rows = [domain("nordform.com", { namingScore: 100 }), domain("nordform.com", { status: "taken", namingScore: 40 })];
  const a = buildNamePackages(rows, options())[0];
  const b = buildNamePackages([...rows].reverse(), options())[0];
  assert.deepEqual(a, b);
  assert.equal(a.domains.length, 1);
  assert.equal(a.domains[0].status, "taken");
  assert.equal(a.domains[0].namingScore, 40);
  assert.equal(a.scoreParts.domains.score, 0);
  const unknown = buildNamePackages([...rows, domain("nordform.com", { availabilityVerified: false })], options())[0];
  assert.equal(unknown.domains[0].status, "unknown");
  assert.equal(unknown.evidenceCoverage, 0);
});

test("syntactic social candidates preserve identity and variants carry no availability claim", () => {
  const [result] = buildNamePackages([domain()], options());
  for (const social of result.socials) {
    assert.equal(social.handle, "nordform");
    assert.equal(social.status, "unknown");
    assert.equal(social.checkedAt, null);
    assert.equal(social.formatValid, true);
    for (const variant of social.alternatives) {
      assert.ok(["getnordform", "trynordform", "nordformhq"].includes(variant.handle));
      assert.equal(variant.sourceUrl, packageSocialUrl(social.platform, variant.handle));
      assert.equal("status" in variant, false);
    }
  }
  const [hyphen] = buildNamePackages([domain("nord-form.com")], options());
  assert.equal(hyphen.socials.find(social => social.platform === "github")?.handle, "nord-form");
  assert.equal(hyphen.socials.find(social => social.platform === "instagram")?.handle, null);
  assert.equal(hyphen.socials.find(social => social.platform === "instagram")?.alternatives.length, 0);
});

test("platform rules are conservative and links cannot be turned into arbitrary URLs", () => {
  const invalid = ["../evil", "@nordform", "nordform?x=1", "nordform#x", "nordform/", "cafè", "xn--caf-dma", "nord form", "NORDform"];
  for (const platform of SOCIAL_PLATFORMS) for (const handle of invalid) {
    assert.equal(isPackageHandleFormatValid(platform, handle), false);
    assert.equal(packageSocialUrl(platform, handle), null);
  }
  assert.equal(isPackageHandleFormatValid("github", "a--b"), false);
  assert.equal(isPackageHandleFormatValid("github", "a-b"), true);
  assert.equal(isPackageHandleFormatValid("github", "a".repeat(39)), true);
  assert.equal(isPackageHandleFormatValid("github", "a".repeat(40)), false);
  assert.equal(isPackageHandleFormatValid("x", "a".repeat(16)), false);
  assert.equal(isPackageHandleFormatValid("youtube", "ab"), false);
  assert.equal(isPackageHandleFormatValid("linkedin", "12a"), false);
});

test("identical handle compatibility with chosen channels affects fit but not availability evidence", () => {
  const [github] = buildNamePackages([domain("nord-form.com")], options({ platforms: ["github"] }));
  const [instagram] = buildNamePackages([domain("nord-form.com")], options({ platforms: ["instagram"] }));
  const [both] = buildNamePackages([domain("nord-form.com")], options({ platforms: ["github", "instagram"] }));
  assert.ok(github.fitScore > both.fitScore && both.fitScore > instagram.fitScore);
  assert.equal(github.fitScore - instagram.fitScore, 35);
  assert.equal(github.evidenceCoverage, instagram.evidenceCoverage);
  assert.equal(github.scoreParts.socials.score, 0);
  assert.equal(instagram.scoreParts.socials.score, 0);
  assert.ok(instagram.reasonCodes.includes("social_format_mismatch"));
  const [shortLimit] = buildNamePackages([domain("northfieldstudio.com")], options({ platforms: ["x"] }));
  const [longLimit] = buildNamePackages([domain("northfieldstudio.com")], options({ platforms: ["instagram"] }));
  assert.ok(shortLimit.fitScore < longLimit.fitScore, "Selected channel syntax is a real package fit dimension");
  assert.equal(shortLimit.evidenceCoverage, longLimit.evidenceCoverage);
});

test("social schema is strict, bounded and source/handle/platform bound", () => {
  assert.equal(socialObservationSchema.safeParse(observation()).success, true);
  assert.equal(socialObservationSchema.safeParse(observation({ sourceUrl: "https://github.com/nordform" })).success, true);
  const invalid = [
    { ...observation(), status: "available" }, { ...observation(), ownerId: "victim" },
    { ...observation(), checkedAt: null }, { ...observation(), checkedAt: "2026-09-13" },
    { ...observation(), sourceUrl: "javascript:alert(1)" }, { ...observation(), sourceUrl: "https://evil.com/nordform" },
    { ...observation(), sourceUrl: "https://api.github.com/users/other" },
    { ...observation(), sourceUrl: "https://api.github.com/users/nordform?token=x" },
    { ...observation(), sourceUrl: "https://api.github.com@evil.com/users/nordform" },
    { ...observation(), handle: "getnordform" }, { ...observation(), handle: "a--b" },
    { ...observation(), platform: "x" },
  ];
  for (const item of invalid) assert.equal(socialObservationSchema.safeParse(item).success, false, JSON.stringify(item));
});

test("404 proves only lookup completion: no score bonus or social registration clearance", () => {
  const [result] = buildNamePackages([domain()], options());
  const lookedUp = applyPackageObservations(result, [observation()], now);
  assert.equal(lookedUp.packageScore, result.packageScore);
  assert.equal(lookedUp.scoreParts.socials.score, 0);
  assert.ok(lookedUp.evidenceCoverage > result.evidenceCoverage);
  assert.equal(lookedUp.socials.find(social => social.platform === "github")?.status, "not_found");
  assert.ok(lookedUp.reasonCodes.includes("social_no_profile_not_availability"));
  assert.ok(lookedUp.missingChecks.includes("social:github"));
  assert.equal(lookedUp.nextActions.find(action => action.platform === "github")?.url, "https://github.com/nordform");
});

test("found profiles lower package readiness while preserving independent fit", () => {
  const [result] = buildNamePackages([domain()], options({ platforms: ["github"] }));
  const found = applyPackageObservations(result, [observation({ status: "profile_found" })], now);
  assert.equal(found.packageScore, result.packageScore - 20);
  assert.equal(found.riskPenalty, 20);
  assert.equal(found.fitScore, result.fitScore);
  assert.ok(found.reasonCodes.includes("social_profile_found"));
});

test("coverage denominator includes all actual domains, chosen platforms and two legal checks", () => {
  const [result] = buildNamePackages([domain(), domain("nordform.se", { status: "unknown" })], options({ platforms: ["github", "x", "github"] }));
  assert.equal(result.socials.length, 2);
  assert.equal(result.evidenceCoverage, Math.round(100 / 6));
  assert.equal(result.scoreParts.domains.score, 15);
  const checked = applyPackageObservations(result, [observation()], now);
  assert.equal(checked.evidenceCoverage, Math.round(200 / 6));
  assert.ok(checked.missingChecks.includes("company_register"));
  assert.ok(checked.missingChecks.includes("trademark_register"));
  assert.equal(buildNamePackages([domain()], options({ platforms: [] }))[0].evidenceCoverage, 33);
});

test("max current readiness is70 even if every social lookup returns not_found", () => {
  const [result] = buildNamePackages([domain()], options());
  const allChecks = SOCIAL_PLATFORMS.map(platform => observation({ platform, sourceUrl: packageSocialUrl(platform, "nordform")! }));
  const checked = applyPackageObservations(result, allChecks, now);
  assert.equal(checked.packageScore, 70);
  assert.equal(checked.evidenceCoverage, Math.round(700 / 9));
  assert.equal(checked.scoreParts.company.score, 0);
  assert.equal(checked.scoreParts.trademark.score, 0);
  assert.ok(checked.evidenceCoverage < 100);
  assert.ok(checked.reasonCodes.includes("not_a_valuation"));
});

test("observations expire, ignore future data, bind exact identity, and preserve newest current result", () => {
  const [result] = buildNamePackages([domain()], options());
  for (const item of [
    observation({ checkedAt: "2026-09-13T12:00:00.001Z" }),
    observation({ checkedAt: "2026-09-13T11:29:59.999Z" }),
    observation({ handle: "getnordform", sourceUrl: "https://api.github.com/users/getnordform" }),
    observation({ sourceUrl: "https://evil.com/nordform" }),
  ]) assert.equal(applyPackageObservations(result, [item], now).socials.find(social => social.platform === "github")?.status, "unknown");
  const found = observation({ status: "profile_found" });
  const older = observation({ checkedAt: "2026-09-13T11:59:59.999Z" });
  const checked = applyPackageObservations(result, [older, found, observation()], now);
  assert.equal(checked.socials.find(social => social.platform === "github")?.status, "profile_found");
  assert.equal(applyPackageObservations(checked, [older], now).socials.find(social => social.platform === "github")?.status, "profile_found");
  const temporaryFailure = applyPackageObservations(checked, [observation({ status: "unknown", checkedAt: "2026-09-13T12:00:01.000Z" })], now + 1000);
  assert.equal(temporaryFailure.socials.find(social => social.platform === "github")?.status, "profile_found", "A failure cannot erase still-current known profile evidence");
  const expired = applyPackageObservations(checked, [], now + NAME_PACKAGE_EVIDENCE_MAX_AGE_MS + 1);
  assert.equal(expired.socials.find(social => social.platform === "github")?.status, "unknown");
  assert.equal(expired.evidenceCoverage, 0);
});

test("result bounds, score bounds and deterministic ranking hold for larger inputs", () => {
  const candidates = Array.from({ length: 50 }, (_, index) => domain(`name${index}.com`, { namingScore: index % 3 === 0 ? NaN : index * 100 }));
  for (const limit of [undefined, 999, Infinity, NaN]) assert.equal(buildNamePackages(candidates, options({ limit })).length, 10);
  assert.equal(buildNamePackages(candidates, options({ limit: -1 })).length, 0);
  assert.equal(buildNamePackages(candidates, options({ limit: 2.9 })).length, 2);
  const packages = buildNamePackages(candidates, options());
  assert.deepEqual(packages, buildNamePackages([...candidates].reverse(), options()));
  for (const pkg of packages) {
    assert.ok(pkg.packageScore >= 0 && pkg.packageScore <= 70);
    assert.ok(pkg.fitScore >= 0 && pkg.fitScore <= 100);
    assert.ok(pkg.evidenceCoverage >= 0 && pkg.evidenceCoverage < 100);
    assert.ok(Object.values(pkg.scoreParts).every(part => part.score >= 0 && part.score <= part.max));
  }
  assert.deepEqual(buildNamePackages([], options()), []);
});

test("impossible platform values cannot create links", () => {
  assert.equal(packageSocialUrl("constructor" as SocialPlatform, "nordform"), null);
  assert.equal(isPackageHandleFormatValid("__proto__" as SocialPlatform, "nordform"), false);
});
