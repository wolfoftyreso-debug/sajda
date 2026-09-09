import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createVercelBuildEnvironment } from "./build-vercel.mjs";

const [packageJson, vercelConfig, neonBoundary, vercelBuild, legacyBrowserBoundary, browserAccount, browserClient] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  readFile(new URL("../api/_shared/neon.ts", import.meta.url), "utf8"),
  readFile(new URL("./build-vercel.mjs", import.meta.url), "utf8"),
  readFile(new URL("../src/integrations/supabase/client.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/integrations/neon/auth.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/integrations/neon/managed-client.ts", import.meta.url), "utf8"),
]);

assert.match(packageJson, /"@neondatabase\/serverless"/u, "Neon runtime driver must be installed");
assert.match(neonBoundary, /process\.env\.DATABASE_URL/u, "Neon URL must be read only by server code");
assert.doesNotMatch(neonBoundary, /VITE_DATABASE_URL/u, "A database URL must never be browser-exposed");
assert.doesNotMatch(vercelConfig, /supabase\.co/u, "Vercel CSP must not retain a legacy Supabase browser origin");
assert.match(vercelBuild, /legacyBrowserCompatEnv/u, "Vercel builds must keep legacy browser persistence inert during the Neon migration");
assert.doesNotMatch(vercelBuild, /suppliedSupabase/u, "Vercel builds must not opt back into a legacy Supabase browser connection");
assert.match(vercelBuild, /VITE_SUPABASE_URL:\s*""/u, "Vercel builds must blank stale legacy browser variables");
assert.doesNotMatch(legacyBrowserBoundary, /@supabase\/supabase-js/u, "The public browser boundary must not import the Supabase SDK");
assert.doesNotMatch(legacyBrowserBoundary, /import\.meta\.env\.VITE_SUPABASE/u, "The public browser boundary must not read legacy provider variables");

const dependencies = JSON.parse(packageJson).dependencies;
assert.ok(dependencies["better-auth"], "The same-origin account auth library must be installed");
assert.equal(dependencies["@neondatabase/auth"], undefined, "The external Neon Auth SDK must be removed");
assert.match(browserClient, /from\s+"better-auth\/client"/u, "Use the same-origin Better Auth client");
assert.match(browserClient, /baseURL:\s*window\.location\.origin/u, "Auth requests must use this site's origin");
assert.match(browserClient, /credentials:\s*"same-origin"/u, "Only this site's cookies may authenticate browser requests");
assert.match(browserAccount, /VITE_ACCOUNT_AUTH_ENABLED/u, "The server-backed auth feature uses the derived public build flag");
assert.match(browserAccount, /"X-Sajda-Account"/u, "Account mutations must carry the initiating owner for server race protection");
assert.doesNotMatch(browserAccount + browserClient, /@neondatabase\/auth|VITE_NEON_AUTH_URL|NEON_AUTH_BASE_URL|jwtClient|\.token\s*\(|Authorization:/u, "Account transport must not use external auth or JWTs");
const csp = JSON.parse(vercelConfig).headers.find(entry => entry.source === "/(.*)")?.headers.find(header => header.key === "Content-Security-Policy")?.value;
assert.ok(csp?.includes("connect-src 'self';"), "The browser only connects to Sajda's Vercel origin");
assert.doesNotMatch(csp, /neon\.tech/iu, "Postgres is a server dependency, not a browser origin");
const unconfigured = createVercelBuildEnvironment({ VITE_ACCOUNT_AUTH_ENABLED: "true", VITE_NEON_AUTH_URL: "https://old-auth.example.neon.tech" });
assert.equal(unconfigured.VITE_ACCOUNT_AUTH_ENABLED, "false", "A stale public flag cannot enable missing server auth");
assert.equal(unconfigured.VITE_NEON_AUTH_URL, "", "Stale external auth configuration must be blanked");

console.log("Vercel/Neon boundary policy: OK (same-origin auth and server-only database)");
