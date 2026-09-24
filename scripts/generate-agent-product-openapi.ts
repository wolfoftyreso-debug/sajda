import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { z as z4 } from "zod/v4";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { productOperationCatalogue, productOperationInputJsonSchema, SAJDA_MCP_VERSION } from "../api/_shared/mcp-tools.js";
import { PUBLIC_MCP_VERSION } from "../api/_shared/public-mcp-tools.js";
import { businessNamesResultSchema } from "../api/_shared/business-names-contract.js";
import { DEVELOPER_API_SCOPES } from "../shared/developer-scopes.js";
import { NAME_PROJECT_LIMIT, nameProjectSchema } from "../shared/name-projects.js";
import { tradingScenarioSchema } from "../shared/trading-scenarios.js";
import { socialObservationSchema } from "../shared/name-packages.js";

type JsonObject = Record<string, unknown>;
function jsonSchema(value: Parameters<typeof toJsonSchemaCompat>[0]): JsonObject {
  return toJsonSchemaCompat(value, { pipeStrategy: "input" }) as JsonObject;
}

/** Zod 3 can reuse local JSON pointers. OpenAPI embeds the schema under a
 * component, so relocate those pointers without changing the input contract. */
function component(schema: JsonObject, name: string): JsonObject {
  const relocate = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(relocate);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
      key === "$ref" && typeof child === "string" && child.startsWith("#/")
        ? `#/components/schemas/${name}/${child.slice(2)}` : relocate(child)]));
  };
  return relocate(schema) as JsonObject;
}

/** Generate offline: public runtime/build consumers import only the resulting
 * JSON, never account handlers, database modules or MCP server dependencies. */
export function generateAgentProductOpenApiSchemas() {
  const catalogue = productOperationCatalogue();
  const inputs = Object.fromEntries(catalogue.map(operation => [operation.name, productOperationInputJsonSchema(operation.name)]));
  const names = z4.toJSONSchema(businessNamesResultSchema);
  const owner = { accountId: z.string(), requestId: z.string() };
  const schemas: Record<string, JsonObject> = {
    ...Object.fromEntries(Object.entries(inputs).map(([operation, schema]) => [`AgentInput_${operation}`, schema])),
    BusinessNamesRequest: inputs.business_names_recommend,
    BusinessNamesResponse: names,
    NameProjectsSaveRequest: inputs.name_projects_save,
    NameProjectsResponse: jsonSchema(z.object({ ...owner, projects: z.array(nameProjectSchema).max(NAME_PROJECT_LIMIT) }).strict()),
    TradingScenariosSaveRequest: inputs.trading_scenarios_save,
    TradingScenariosResponse: jsonSchema(z.object({ ...owner, scenarios: z.array(tradingScenarioSchema).max(100) }).strict()),
    SocialProfilesCheckRequest: inputs.social_profiles_check,
    SocialProfilesResponse: jsonSchema(z.object({ ...owner, observations: z.array(socialObservationSchema).max(5) }).strict()),
  };
  // The observer currently calls GitHub only. Keep this limit explicit rather
  // than implying every platform in the generic observation model is queried.
  const observations = schemas.SocialProfilesResponse.properties as Record<string, { items: { properties: Record<string, unknown> } }>;
  observations.observations.items.properties.platform = { type: "string", const: "github" };
  return {
    schemaVersion: "sajda.agent-product-catalogue.v1",
    privateMcpVersion: SAJDA_MCP_VERSION,
    publicMcpVersion: PUBLIC_MCP_VERSION,
    scopes: [...DEVELOPER_API_SCOPES], catalogue, inputs,
    schemas: Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, component(schema, name)])),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== "--write") throw new Error("Use --write to regenerate the checked-in agent product contract.");
  await writeFile(new URL("../api/_shared/agent-product-openapi.json", import.meta.url),
    JSON.stringify(generateAgentProductOpenApiSchemas(), null, 2) + "\n", "utf8");
  console.log("Agent product catalogue and OpenAPI schemas regenerated from runtime validators.");
}
