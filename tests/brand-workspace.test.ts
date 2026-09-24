import test from "node:test";
import assert from "node:assert/strict";
import { brandPackageLabel, brandPackageSeed, mergeBrandDomainChecks } from "../src/lib/brandWorkspace";
import type { PackageDomainInput } from "../shared/name-packages";
import { brandWorkspaceCopy } from "../src/i18n/brandWorkspaceCopy";
test("brand package handoff only accepts canonical labels or complete root domains", () => {
  for (const input of [" NordForm ", "nordform.com", "nordform.co.uk"]) assert.equal(brandPackageLabel(input), "nordform");
  for (const input of [null, {}, "<script>", "a founder name", "https://example.com", "sub.example.com", "name.com/x", "xn--not-verified", "-bad", "a".repeat(64)]) assert.equal(brandPackageLabel(input), null);
  assert.equal(brandPackageSeed({brandPackageSeed:"nordform.com",score:99}), "nordform");
  assert.equal(brandPackageSeed({nameProject:{title:"Private name"}}), null);
});
test("per-package exact checks retain other candidates and reject unsolicited domains", () => {
  const row = (domain:string,status:PackageDomainInput["status"]):PackageDomainInput => ({domain,status,availabilityVerified:true,checkMethod:"rdap"});
  const before=[row("nordform.com","available"),row("alviona.com","available")];
  const result=mergeBrandDomainChecks(before,[row("nordform.com","taken"),row("nordform.ai","unknown"),row("injected.com","available")],["nordform.com","nordform.ai"]);
  assert.deepEqual(result.map(r=>[r.domain,r.status]),[["nordform.com","taken"],["alviona.com","available"],["nordform.ai","unknown"]]);
  assert.equal(before[0].status,"available");
});
test("every supported language explains Brand Index and the missing-evidence ceiling", () => {
  for (const copy of Object.values(brandWorkspaceCopy)) {
    assert.deepEqual(Object.keys(copy).sort(),Object.keys(brandWorkspaceCopy.en).sort());
    assert.equal(copy.index,"Sajda Brand Index");
    assert.match(copy.ceiling,/70\/100/);
    assert.ok(Object.values(copy).every(value=>value.trim().length>0));
  }
});
