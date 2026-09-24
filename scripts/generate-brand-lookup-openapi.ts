import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod/v4";
import { brandLookupRequestJsonSchema } from "../api/_shared/brand-lookup-contract.js";
import { brandLookupResultSchema } from "../shared/brand-lookup.js";

export function generateBrandLookupOpenApiSchemas() {
  return { request: brandLookupRequestJsonSchema(), response: z.toJSONSchema(brandLookupResultSchema) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== "--write") throw new Error("Use --write to regenerate the checked-in OpenAPI schema.");
  await writeFile(new URL("../api/_shared/brand-lookup-openapi.json", import.meta.url),
    JSON.stringify(generateBrandLookupOpenApiSchemas(), null, 2) + "\n", "utf8");
  console.log("Brand-lookup OpenAPI schemas regenerated from runtime validators.");
}
