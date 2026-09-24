import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

/** Actual WebKit DOM evidence, not an app process or simulator boot signal. */
export function isNativeUIReady(snapshot) {
  return snapshot?.ready === true && snapshot.navigation === 5
    && snapshot.heading === true && snapshot.input === true
    && snapshot.rootChildren > 0 && snapshot.documentState === "complete"
    && Array.isArray(snapshot.errors) && snapshot.errors.length === 0
    && snapshot.evaluationFailed !== true;
}

export async function waitForNativeUI(source, destination, { timeoutMs = 65_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let snapshot = { ready: false, reason: "No WebKit readiness observation received" };
  do {
    try { snapshot = JSON.parse(await readFile(source, "utf8")); }
    catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
    if (isNativeUIReady(snapshot)) {
      await writeFile(destination, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.log(JSON.stringify({ event: "native_search_ui_ready", ...snapshot }));
      return;
    }
    if (Date.now() < deadline) await delay(intervalMs);
  } while (Date.now() < deadline);
  await writeFile(destination, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.error(JSON.stringify({ event: "native_search_ui_not_ready", ...snapshot }));
  throw new Error("Native search UI did not render before its readiness deadline.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination) throw new Error("Provide source and output paths for native readiness evidence.");
  await waitForNativeUI(source, destination);
}
