import catalogue from "../_shared/agent-product-openapi.json" with { type: "json" };
import { createRequestId, setPublicApiHeaders } from "../_shared/public-api.js";

type Route = { method: "GET" | "POST" | "DELETE"; path: string };
const account = (resource: string, method: Route["method"] = "GET"): Route => ({ method, path: `/api/v1/account?resource=${resource}` });
const post = (path: string): Route => ({ method: "POST", path });
const routes: Record<string, Route> = {
  business_names_recommend: post("/api/v1/business-names"),
  domains_check: post("/api/v1/domains"), domains_search: post("/api/v1/domains"),
  name_packages_search: post("/api/v1/name-packages"),
  brand_lookup: post("/api/v1/public/brand-lookup"), brand_index_assess: post("/api/v1/public/brand-index"),
  account_membership: account("membership"),
  name_projects_list: account("name-projects"), name_projects_save: account("name-projects", "POST"),
  social_profiles_check: account("social-profiles", "POST"),
  trading_scenarios_list: account("trading-scenarios"), trading_scenarios_save: account("trading-scenarios", "POST"),
  saved_domains_list: account("saved-domains"), saved_domains_save: account("saved-domains", "POST"),
  saved_domains_remove: account("saved-domains", "DELETE"),
  trading_status: account("trading-status"), trading_report: account("trading"),
  trading_start: account("trading", "POST"), trading_advance: account("trading", "POST"),
  trading_stop: account("trading", "POST"), trading_refresh_quote: account("trading", "POST"),
};
const publicRoutes: Record<string, Route> = {
  business_names_recommend: post("/api/v1/public/business-names"),
  domains_check: post("/api/v1/public/domains"),
  name_packages_search: post("/api/v1/public/name-packages"),
  brand_lookup: post("/api/v1/public/brand-lookup"), brand_index_assess: post("/api/v1/public/brand-index"),
};

/** Static product discovery, never an assertion about a caller's entitlement. */
export const capabilities = {
  schema_version: "sajda.capabilities.v1",
  openapi: "/api/openapi",
  mcp: { account: "/api/mcp", public: "/api/mcp/public",
    account_version: catalogue.privateMcpVersion, public_version: catalogue.publicMcpVersion },
  name_languages: ["en", "sv", "fr", "es", "de", "it", "pt"],
  availability: "Implementation catalogue, not live provider status or a grant of account permissions.",
  capabilities: catalogue.catalogue.map(tool => ({
    ...tool, rest: routes[tool.name], public_rest: publicRoutes[tool.name] ?? null,
    public_mcp: Object.hasOwn(publicRoutes, tool.name),
    input_schema: `/api/openapi#/components/schemas/AgentInput_${tool.name}`,
    input_schema_transport: "mcp",
    rest_contract: "/api/openapi",
    conditions: tool.name.startsWith("name_projects_") ? ["verified_account", "name_projects_feature_enabled"]
      : tool.name.startsWith("trading_scenarios_") ? ["verified_account", "active_trading_entitlement"]
        : tool.name.startsWith("trading_") ? ["account_ownership", "operation_specific_trading_entitlement_and_budgets"]
          : publicRoutes[tool.name] ? ["shared_request_and_provider_limits"] : ["account_ownership", "operation_specific_limits"],
  })),
  additional_public_tools: [{ name: "domains_suggest", mcp: "/api/mcp/public", rest: null,
    description: "Budget-aware domain shortlist; returns a shortfall when exact verified price evidence is insufficient." }],
  intentional_boundaries: [
    "Billing, authentication, key administration and account deletion remain explicit account control-plane flows, not agent tools.",
    "No tool purchases, reserves or registers domains, or provides company/trademark legal clearance.",
    "Social profile checks currently support GitHub only; absence never proves registration availability.",
    "Deep Review and swipe gestures have no versioned agent operation. Disabled legacy functions are not advertised.",
  ],
};

interface Response {
  setHeader(name: string, value: string | number): void;
  status(code: number): Response;
  json(value: unknown): void;
  end(): void;
}
export default function handler(request: { method?: string }, response: Response) {
  setPublicApiHeaders(response, { requestId: createRequestId(), allowMethods: "GET, OPTIONS" });
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (request.method === "OPTIONS") { response.status(204).end(); return; }
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    response.status(405).json({ code: "method_not_allowed", error: "Use GET to discover Sajda capabilities." }); return;
  }
  response.status(200).json(capabilities);
}
