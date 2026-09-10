/** Run the opt-in integration probe through the authenticated Vercel CLI.
 * Protection remains enabled. No bypass secret is printed or bundled.
 * Requires SAJDA_QA_VERCEL_CLI_FILE and the same approved-preview/QA env
 * variables as test-developer-live.mjs. Credentials travel on stdin only.
 */
import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

const cli = process.env.SAJDA_QA_VERCEL_CLI_FILE;
const origin = process.env.SAJDA_QA_ORIGIN;
if (process.env.SAJDA_DEVELOPER_LIVE_TEST !== "true"
  || process.env.SAJDA_QA_ALLOW_REMOTE_DEV !== "true"
  || process.env.SAJDA_QA_APPROVED_DEV_ORIGIN !== origin
  || !/^https:\/\/sajda-[a-z0-9-]+-hypbit\.vercel\.app$/.test(origin ?? "")
  || !cli || !isAbsolute(cli)) {
  throw new Error("Explicit approved Vercel preview QA configuration is required.");
}

const quote = value => JSON.stringify(String(value));
globalThis.fetch = async (input, init = {}) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== origin || !url.pathname.startsWith("/api/") || url.username || url.password) {
    throw new Error("Preview QA request target refused.");
  }
  request.signal.throwIfAborted();
  const config = ["silent", "show-error", "include", "max-time = 30", `request = ${quote(request.method)}`];
  request.headers.forEach((value, name) => config.push(`header = ${quote(`${name}: ${value}`)}`));
  if (request.body !== null) config.push(`data = ${quote(await request.text())}`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "curl", `${url.pathname}${url.search}`,
      "--deployment", origin, "--scope", "hypbit", "--", "--config", "-"],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const chunks = [];
    let size = 0;
    const stop = () => { child.kill(); reject(new DOMException("Preview QA request cancelled", "AbortError")); };
    request.signal.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", chunk => {
      size += chunk.length;
      if (size > 4_194_304) stop(); else chunks.push(chunk);
    });
    // Never echo provider output: headers/bodies may contain QA credentials.
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.once("error", () => { request.signal.removeEventListener("abort", stop); reject(new Error("Preview QA transport could not start.")); });
    child.once("close", code => {
      request.signal.removeEventListener("abort", stop);
      if (code !== 0) { reject(new Error("Preview QA transport failed.")); return; }
      try {
        let raw = Buffer.concat(chunks).toString("utf8"), status, headers;
        do {
          const end = raw.indexOf("\r\n\r\n");
          if (end < 0) throw new Error();
          const lines = raw.slice(0, end).split("\r\n");
          status = Number(/^HTTP\/\S+ (\d{3})/.exec(lines.shift())?.[1]);
          if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error();
          headers = new Headers();
          for (const line of lines) {
            const colon = line.indexOf(":");
            if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
          }
          raw = raw.slice(end + 4);
        } while (raw.startsWith("HTTP/"));
        if (status < 200 || status >= 300 && status < 400) throw new Error();
        resolve(new Response([204, 205, 304].includes(status) || request.method === "HEAD" ? null : raw, { status, headers }));
      } catch { reject(new Error("Preview QA response was not a direct API response.")); }
    });
    child.stdin.end(`${config.join("\n")}\n`);
  });
};

await import(process.env.SAJDA_QA_SAVED_MUTATIONS === "true"
  ? "./test-developer-saved-live.mjs" : "./test-developer-live.mjs");
