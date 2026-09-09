import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function readBuildText(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return readBuildText(path);
    if (!/\.(?:js|html)$/u.test(entry.name)) return "";
    return readFile(path, "utf8");
  }));
  return parts.join("\n");
}

/** Scan emitted browser assets, never unrelated legacy fixtures or server code. */
export function assertPublicBrowserBundle(buildText) {
  const policies = [
    [/supabase\.co/iu, "The public bundle must not include a Supabase origin"],
    [/disabled\.invalid/iu, "The public bundle must not include legacy placeholder endpoints"],
    [/@supabase\/supabase-js/iu, "The public bundle must not include the Supabase browser SDK"],
    [/VITE_SUPABASE/iu, "The public bundle must not retain legacy provider configuration"],
    [/functions\/v1/iu, "The public bundle must not call legacy Edge Function routes"],
    [/user-domain-scan/iu, "The public bundle must not retain the legacy scan dispatcher"],
    [/@neondatabase\/auth|BetterAuthVanillaAdapter|neonauth/iu, "The public bundle must not include the external Neon Auth SDK"],
    [/https?:\/\/[^\s"'<>\\]*\.neon\.tech\b/iu, "The public bundle must not include an external Neon origin"],
    [/VITE_NEON_AUTH_URL|NEON_AUTH_BASE_URL/iu, "The public bundle must not retain external auth configuration"],
    [/jwtClient|getAccountAccessToken|getNeonAuthClient|\/api\/auth\/token|\.token\s*\(/u, "The public bundle must not request account JWTs"],
    [/VITE_(?:DATABASE_URL(?:_UNPOOLED)?|BETTER_AUTH_SECRET|RESEND_API_KEY|PORKBUN_(?:SECRET_)?API_KEY|CRON_SECRET)/u, "The public bundle must not read server secrets through public variables"],
    [/\b(?:pk1|sk1)_[A-Za-z0-9_-]{16,256}\b/u, "The public bundle must not contain registrar credentials"],
    [/postgres(?:ql)?:\/\//iu, "The public bundle must not contain a database connection URL"],
  ];
  for (const [pattern, message] of policies) {
    // Never include matching source text: it could contain the leaked secret.
    if (pattern.test(buildText)) throw new Error(message);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputDirectory = resolve(process.cwd(), process.argv[2] ?? "dist-vercel");
  assertPublicBrowserBundle(await readBuildText(outputDirectory));
  console.log("Vercel/Neon public-bundle policy: OK (same-origin account auth)");
}
