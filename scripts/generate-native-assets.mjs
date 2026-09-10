import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

// Deterministic raster exports of Sajda's existing vector identity.
// These replace only the generated Capacitor starter assets.
const root = fileURLToPath(new URL("..", import.meta.url));
const assets = resolve(root, "ios/App/App/Assets.xcassets");
const icon = readFileSync(resolve(root, "public-clean/sajda-pwa.svg"), "utf8");
writeFileSync(resolve(assets, "AppIcon.appiconset/AppIcon-512@2x.png"),
  new Resvg(icon, { fitTo: { mode: "width", value: 1024 } }).render().asPng());
const mark = icon.replace('<svg ', '<svg x="1110" y="1110" ');
const splash = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="#F7F9FC"/>${mark}</svg>`).render().asPng();
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  writeFileSync(resolve(assets, "Splash.imageset", name), splash);
}
console.log("Generated Sajda iOS icon and launch assets from the existing app identity.");
