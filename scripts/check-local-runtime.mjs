/** Credential-free HTTP verification of built assets and the actual handlers.
 * This is not database, provider-delivery, browser, or deployed verification. */
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const runtimeKeys = new Set([
  "PATH", "PATHEXT", "COMSPEC", "SYSTEMROOT", "WINDIR", "HOME", "USERPROFILE",
  "APPDATA", "LOCALAPPDATA", "TMP", "TEMP", "LANG", "LC_ALL", "TZ", "CI",
]);

/** An allowlist deliberately excludes local account/provider credentials,
 * Node preload hooks, proxy settings and inherited deployment feature flags. */
export function isolatedRuntimeEnvironment(environment, port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid QA port");
  return {
    ...Object.fromEntries(Object.entries(environment).filter(([key]) => runtimeKeys.has(key.toUpperCase()))),
    VERCEL_ENV: "preview",
    SAJDA_QA_PORT: String(port),
    SAJDA_TEST_ORIGIN: `http://127.0.0.1:${port}`,
    BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
  };
}

async function freeLoopbackPort() {
  const listener = createServer();
  await new Promise((resolveReady, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolveReady);
  });
  const address = listener.address();
  await new Promise((resolveClosed, reject) => listener.close(error => error ? reject(error) : resolveClosed()));
  if (!address || typeof address === "string") throw new Error("Could not allocate a QA port");
  return address.port;
}

async function verifyLocalRuntime() {
  await access(resolve(projectRoot, "dist-vercel/index.html"));
  const environment = isolatedRuntimeEnvironment(process.env, await freeLoopbackPort());
  const server = spawn(process.execPath, ["--import", "tsx", "scripts/serve-vercel-local.ts"], {
    cwd: projectRoot, env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let startupError;
  let serverOutput = "";
  server.once("error", error => { startupError = error; });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", chunk => { serverOutput = (serverOutput + chunk.toString()).slice(-6000); });
  }
  try {
    const deadline = Date.now() + 30_000;
    while (true) {
      if (startupError) throw startupError;
      if (server.exitCode !== null) throw new Error(`QA server exited before readiness (${server.exitCode}): ${serverOutput}`);
      try {
        const response = await fetch(`${environment.SAJDA_TEST_ORIGIN}/`, { signal: AbortSignal.timeout(1000) });
        await response.arrayBuffer();
        if (response.status === 200) break;
      } catch { /* Startup is bounded below; no provider or account request is made. */ }
      if (Date.now() >= deadline) throw new Error(`QA server did not become ready: ${serverOutput}`);
      await new Promise(resolveTick => setTimeout(resolveTick, 100));
    }
    await new Promise((resolveDone, reject) => {
      const smoke = spawn(process.execPath, ["scripts/check-runtime.mjs"], {
        cwd: projectRoot, env: environment, stdio: "inherit", windowsHide: true,
      });
      const timer = setTimeout(() => { smoke.kill(); reject(new Error("Local HTTP smoke timed out")); }, 120_000);
      smoke.once("error", error => { clearTimeout(timer); reject(error); });
      smoke.once("exit", code => {
        clearTimeout(timer);
        if (code === 0) resolveDone();
        else reject(new Error(`Local HTTP smoke failed (${code ?? "signal"})`));
      });
    });
  } finally {
    if (server.exitCode === null) {
      const closed = new Promise(resolveClosed => server.once("exit", resolveClosed));
      if (server.kill()) await closed;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyLocalRuntime();
}
