import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** Use the authenticated CLI for protected previews; never export bypass tokens. */
export async function runtimeFetch(url, options = {}) {
  const cli = process.env.SAJDA_VERCEL_CLI;
  if (!cli) return fetch(url, options);
  const target = new URL(url);
  if (target.origin !== new URL(process.env.SAJDA_TEST_ORIGIN).origin) {
    throw new Error("Runtime verification must stay on the selected deployment.");
  }
  const args = [cli, "curl", `${target.pathname}${target.search}`, "--deployment", target.origin,
    "--", "--silent", "--show-error", "--include", "--max-time", "45",
    "--request", options.method || "GET"];
  for (const [name, value] of new Headers(options.headers)) args.push("--header", `${name}: ${value}`);
  if (options.body !== undefined) args.push("--data-binary", String(options.body));
  let stdout;
  try {
    ({ stdout } = await execute(process.execPath, args, { timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
      windowsHide: true, signal: options.signal }));
  } catch {
    // Do not print command/error objects: CLI authentication must stay private.
    throw new Error(`Vercel HTTP verification failed for ${target.pathname}`);
  }
  let rest = stdout;
  let status;
  let headers;
  do {
    const boundary = rest.search(/\r?\n\r?\n/u);
    if (boundary < 0) throw new Error("Missing HTTP response headers");
    const block = rest.slice(0, boundary);
    rest = rest.slice(boundary).replace(/^\r?\n\r?\n/u, "");
    const lines = block.split(/\r?\n/u);
    status = Number(lines.shift()?.match(/^HTTP\/\S+ (\d{3})/u)?.[1]);
    if (!status) throw new Error("Invalid HTTP response status");
    headers = new Headers();
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon < 1) continue;
      const name = line.slice(0, colon).toLowerCase();
      if (name === "set-cookie" || name.includes("bypass")) continue;
      headers.append(name, line.slice(colon + 1).trim());
    }
  } while (rest.startsWith("HTTP/"));
  return new Response([204, 205, 304].includes(status) ? null : rest, { status, headers });
}
