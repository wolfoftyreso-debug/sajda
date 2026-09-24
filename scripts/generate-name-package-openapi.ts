import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod/v4";
import { namePackageSearchSchema } from "../api/_shared/name-package-contract.js";
import { namePackageIntelligenceSchema } from "../shared/name-package-intelligence.js";

/** Static JSON lets ordinary Node OpenAPI/build consumers share the live
 * runtime contract without needing a TypeScript loader in production. */
export function generateNamePackageOpenApiSchemas() {
  const request = z.toJSONSchema(namePackageSearchSchema, { io: "input" });
  // Zod's custom duplicate checks need their JSON Schema representation too.
  for (const key of ["tlds", "platforms", "providers", "markets"]) {
    if (request.properties?.[key]) request.properties[key].uniqueItems = true;
  }
  return { request, response: z.toJSONSchema(namePackageIntelligenceSchema) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== "--write") throw new Error("Use --write to regenerate the checked-in OpenAPI schema.");
  await writeFile(new URL("../api/_shared/name-package-openapi.json", import.meta.url),
    JSON.stringify(generateNamePackageOpenApiSchemas(), null, 2) + "\n", "utf8");
  console.log("Name-package OpenAPI schemas regenerated from runtime validators.");
}
