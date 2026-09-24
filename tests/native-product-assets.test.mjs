import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CONNECTOR_HOSTS } from "../shared/connector-catalogue.mjs";
import { copyNativeProductAssets } from "../scripts/build-native.mjs";

test("native bundles every catalogue logo and its licence without website/SEO assets", () => {
  const source = fileURLToPath(new URL("../public-clean", import.meta.url));
  const destination = mkdtempSync(join(tmpdir(), "sajda-native-assets-"));
  try {
    const copied = copyNativeProductAssets(source, destination);
    assert.equal(CONNECTOR_HOSTS.length, 13);
    assert.equal(copied.length, CONNECTOR_HOSTS.length + 4);
    for (const file of copied) {
      assert.deepEqual(readFileSync(join(destination, file)), readFileSync(join(source, file)), file);
    }
    for (const host of CONNECTOR_HOSTS) {
      assert.match(readFileSync(join(destination, host.logo.slice(1)), "utf8"), /<svg\b/u, host.id);
    }
    assert.ok(readFileSync(join(destination, "connectors/LICENSE.txt"), "utf8").length > 100);
    assert.deepEqual(readdirSync(destination).sort(), ["connectors", "sajda-logo.svg", "sajda-mark.svg", "sajda-pwa.svg"]);
    // Repeat builds keep the same reviewed inventory, without fetching images.
    assert.deepEqual(copyNativeProductAssets(source, destination), copied);
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
});
