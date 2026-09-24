import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Only for a fresh, job-owned simulator with no authenticated user or searches. */
export async function collectIOSDiagnostics(simulatorId, outputDirectory, run = spawnSync) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(simulatorId)) throw new Error("Expected the job-owned simulator UUID.");
  const summary = { readiness: "unavailable" };
  const container = run("xcrun", ["simctl", "get_app_container", simulatorId, "com.hypbit.sajda", "data"],
    { encoding: "utf8", timeout: 10_000, killSignal: "SIGKILL", maxBuffer: 64_000 });
  summary.container = { status: container.status, error: container.error?.code ?? null };
  if (container.status === 0 && !container.error) {
    const directory = String(container.stdout).trim();
    if (path.isAbsolute(directory)) {
      try {
        const contents = await readFile(path.join(directory, "tmp/sajda-ui-smoke.json"), "utf8");
        if (contents.length > 64_000) throw new Error("Readiness evidence exceeds its limit.");
        await writeFile(path.join(outputDirectory, "sajda-ui-smoke.json"), JSON.stringify(JSON.parse(contents), null, 2) + "\n");
        summary.readiness = "captured";
      } catch { summary.readiness = "unavailable"; }
    }
  }
  // Restrict to this app and a short time window; never dump all simulator logs.
  const logs = run("xcrun", ["simctl", "spawn", simulatorId, "log", "show", "--style", "compact", "--last", "2m", "--predicate", 'process == "App"'],
    { encoding: "utf8", timeout: 20_000, killSignal: "SIGKILL", maxBuffer: 256_000 });
  const output = String(logs.stdout ?? "") + String(logs.stderr ?? "");
  await writeFile(path.join(outputDirectory, "sajda-iphone-smoke.log"), output.slice(-200_000));
  summary.logs = { status: logs.status, error: logs.error?.code ?? null, truncated: output.length > 200_000 };
  await writeFile(path.join(outputDirectory, "sajda-diagnostics.json"), JSON.stringify(summary, null, 2) + "\n");
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [simulatorId, outputDirectory] = process.argv.slice(2);
  if (!simulatorId || !outputDirectory) throw new Error("Provide the simulator ID and artifact output directory.");
  await collectIOSDiagnostics(simulatorId, outputDirectory);
}
