import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, renameSync, copyFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export function nativeApiOrigin(value) {
  if (!value) throw new Error("Set SAJDA_NATIVE_API_ORIGIN to the verified HTTPS backend origin.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || url.port || /^(localhost|127\.|10\.|192\.168\.|\[)/i.test(url.hostname)) {
    throw new Error("The native API origin must be a public HTTPS origin without a path, port, or credentials.");
  }
  return url.origin;
}
const root = fileURLToPath(new URL("..", import.meta.url));
export function buildNative(env = process.env) {
  const origin = nativeApiOrigin(env.SAJDA_NATIVE_API_ORIGIN);
  const run = spawnSync(process.execPath, [resolve(root,"node_modules/vite/bin/vite.js"),"build","--config","vite.native.config.ts"], {
    cwd:root, stdio:"inherit", env:{...env,VITE_NATIVE_API_ORIGIN:origin},
  });
  if (run.error || run.status !== 0) throw run.error ?? new Error("Native product build failed.");
  renameSync(resolve(root,"dist-native/native.html"),resolve(root,"dist-native/index.html"));
  for (const name of ["sajda-mark.svg","sajda-logo.svg","sajda-pwa.svg"]) {
    copyFileSync(resolve(root,"public-clean",name),resolve(root,"dist-native",name));
  }
  writeFileSync(resolve(root,"dist-native/sajda-native-config.json"),JSON.stringify({apiOrigin:origin}));
  const check = spawnSync(process.execPath,[resolve(root,"scripts/check-neon-build.mjs"),"dist-native"],{cwd:root,stdio:"inherit"});
  if (check.error || check.status !== 0) throw check.error ?? new Error("Native bundle contains disallowed provider or secret configuration.");
  const html=readFileSync(resolve(root,"dist-native/index.html"),"utf8");
  if (!html.includes('noindex') || /ld\+json|registerSW|rel="canonical"/i.test(html)
    || readdirSync(resolve(root,"dist-native")).some(name=>/^(robots\.txt|sitemap\.xml|sw\.js|se)$/.test(name))) {
    throw new Error("Native build must not contain website SEO or service-worker output.");
  }
  console.log("Native product bundle built; this does not compile or sign the iOS app.");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildNative();
