import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod/v4";
import { brandIndexRequestJsonSchema } from "../api/_shared/brand-index.js";
import { brandIndexResultSchema } from "../shared/brand-presence-index.js";

/** Static production schema, generated only from the shared runtime contract. */
export function generateBrandIndexOpenApiSchemas() {
  return { request: brandIndexRequestJsonSchema(), response: z.toJSONSchema(brandIndexResultSchema) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== "--write") throw new Error("Use --write to regenerate the checked-in OpenAPI schema.");
  await writeFile(new URL("../api/_shared/brand-index-openapi.json", import.meta.url),
    JSON.stringify(generateBrandIndexOpenApiSchemas(), null, 2) + "\n", "utf8");
  console.log("Brand-index OpenAPI schemas regenerated from runtime validators.");
}
