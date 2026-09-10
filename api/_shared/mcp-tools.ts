import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode,
  type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import { AccountAccessError } from "./account-error.js";
import { assertApiKeyScopes, type ApiKeyPrincipal, type ApiKeyScope } from "./developer-api-keys.js";
import { NAMES_API_PROVIDERS, NAMES_API_TLDS } from "./names-contract.js";
import { normalizeSavedDomain } from "./saved-domain-input.js";

export const SAJDA_MCP_VERSION = "1.0.0";

export interface McpProductResult {
  status: number;
  data: Record<string, unknown>;
  retryAfterSeconds?: number;
}

export type McpOperation = "domains_check" | "domains_search" | "account_membership"
  | "saved_domains_list" | "saved_domains_save" | "saved_domains_remove"
  | "trading_status" | "trading_report" | "trading_start" | "trading_advance" | "trading_stop" | "trading_refresh_quote";

export type McpProductExecutor = (operation: McpOperation, args: Record<string, unknown>,
  principal: ApiKeyPrincipal) => Promise<McpProductResult>;

const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu);
const domain = z.string().min(3).max(253).refine(value => normalizeSavedDomain(value) !== null, "Enter a domain, not a URL.");
const exactDomain = z.string().trim().toLowerCase().max(253)
  .regex(/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.(com|net|org|app|dev|ai|xyz|info|biz|se|nu)$/u);
const locale = z.enum(["en", "sv", "es", "fr", "zh"]).optional();
const providers = z.array(z.enum(NAMES_API_PROVIDERS)).min(1).max(NAMES_API_PROVIDERS.length)
  .refine(values => new Set(values).size === values.length, "Use unique provider IDs.").optional();
const noInput = z.object({}).strict();
const resultSchema = z.object({
  ok: z.boolean(),
  status: z.number().int().min(100).max(599),
  requestId: z.string(),
  data: z.record(z.string(), z.unknown()).optional().describe("The existing Sajda product response, with account ownership and evidence intact."),
  error: z.object({ code: z.string(), message: z.string(), retryAfterSeconds: z.number().optional() }).optional(),
}).strict();

type ToolDefinition = {
  name: McpOperation;
  title: string;
  description: string;
  scope: ApiKeyScope;
  schema: z.ZodObject;
  readOnly: boolean;
  idempotent: boolean;
  openWorld: boolean;
  destructive?: boolean;
};

const definitions: ToolDefinition[] = [
  { name: "domains_check", title: "Check exact domains", scope: "domains:search",
    description: "Check 1–10 exact domains through Sajda's registry and registrar search. Preserves available/taken/unknown, evidence timestamps and quoted currency. Uses the shared search quota. Never purchases a domain.",
    schema: z.object({ domains: z.array(exactDomain).min(1).max(10)
      .refine(values => new Set(values).size === values.length, "Use unique domains."), locale, providers }).strict(),
    readOnly: true, idempotent: true, openWorld: true },
  { name: "domains_search", title: "Search domain names", scope: "domains:search",
    description: "Generate and check names using Sajda's non-AI search engine. This tool does not send input to third-party AI or accept advanced briefs/AI consent. Registry and registrar checks use external services. Availability may be unknown; standard suffix prices are distinct from exact domain offers. Uses the shared search quota.",
    schema: z.object({ query: z.string().trim().min(1).max(100),
      tlds: z.array(z.enum(NAMES_API_TLDS)).min(1).max(NAMES_API_TLDS.length)
        .refine(values => new Set(values).size === values.length, "Use unique TLDs."),
      count: z.number().int().min(1).max(10).optional(), locale, providers,
      creativeMode: z.enum(["light", "medium", "heavy", "deep"]).optional() }).strict(),
    readOnly: true, idempotent: false, openWorld: true },
  { name: "account_membership", title: "Read account membership", scope: "account:read",
    description: "Read the authenticated account's current server-verified plan, capabilities and expiry. Does not change membership or billing.",
    schema: noInput, readOnly: true, idempotent: true, openWorld: false },
  { name: "saved_domains_list", title: "List saved domains", scope: "saved:read",
    description: "Read up to 100 domains saved by the authenticated account. Pass nextCursor from the previous result as cursor for the next page.",
    schema: z.object({ cursor: z.string().regex(/^[1-9][0-9]{0,18}$/u).optional() }).strict(),
    readOnly: true, idempotent: true, openWorld: false },
  { name: "saved_domains_save", title: "Save a domain", scope: "saved:write",
    description: "Save a domain and optional research notes to the authenticated account's shared saved list. Repeating the same domain updates its snapshot without duplicates. Prices and valuations here are user notes, not a live quote.",
    schema: z.object({ domain, registrarPrice: z.number().finite().min(0).max(1e12).optional(),
      estimatedValue: z.number().finite().min(0).max(1e12).optional(), confidenceScore: z.number().finite().min(0).max(100).optional(),
      rationale: z.string().max(4000).optional() }).strict(),
    readOnly: false, idempotent: true, openWorld: false },
  { name: "saved_domains_remove", title: "Remove a saved domain", scope: "saved:write",
    description: "Remove one domain from the authenticated account's saved list. Repeating a completed removal succeeds. Does not delete a registration or cancel registrar services.",
    schema: z.object({ domain }).strict(), readOnly: false, idempotent: true, openWorld: false, destructive: true },
  { name: "trading_status", title: "Read Trading status", scope: "trading:read",
    description: "Read current Trading access, engine availability and run status. Never starts, advances or refreshes research. Does not include candidate details.",
    schema: noInput, readOnly: true, idempotent: true, openWorld: false },
  { name: "trading_report", title: "Read Trading report", scope: "trading:read",
    description: "Read a page of the authenticated account's existing Trading report, including dated evidence and safety diagnostics. This is a snapshot; it does not start research or refresh prices. Offsets may change after a report update.",
    schema: z.object({ offset: z.number().int().min(0).max(10000).optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
    readOnly: true, idempotent: true, openWorld: false },
  { name: "trading_start", title: "Start Trading research", scope: "trading:run",
    description: "Explicitly start a new Trading research run for this account. Requires active Trading membership and consumes its shared research budget. Supply a fresh UUID requestKey per intended run and reuse the SAME key after timeout or retry. Read status to observe progress; use trading_advance only when explicitly continuing work.",
    schema: z.object({ requestKey: uuid.describe("Client-generated UUID. Reuse for retries of this exact start request.") }).strict(),
    readOnly: false, idempotent: true, openWorld: true },
  { name: "trading_advance", title: "Advance Trading research", scope: "trading:run",
    description: "Explicitly perform the next bounded work batch for an existing run. Requires Trading access and may call research providers. Each call may advance more work; this is not an idempotent status poll. Never starts a new run.",
    schema: z.object({ runId: uuid }).strict(), readOnly: false, idempotent: false, openWorld: true },
  { name: "trading_stop", title: "Stop Trading research", scope: "trading:run",
    description: "Stop one existing research run owned by this account, retaining the previous completed report. Available when new research is paused. Repeating a stop is safe.",
    schema: z.object({ runId: uuid }).strict(), readOnly: false, idempotent: true, openWorld: false, destructive: true },
  { name: "trading_refresh_quote", title: "Refresh a Trading quote", scope: "trading:quote",
    description: "Explicitly request a fresh registrar price observation for one server-approved candidate in this account's report. Requires Trading membership, connected provider and remaining quote budget. Supply a fresh UUID requestKey and reuse it for retries of the same run/domain. This cannot reserve, register or purchase a domain.",
    schema: z.object({ runId: uuid, domain: domain.refine(value => normalizeSavedDomain(value) === value, "Use the canonical domain from the report."),
      requestKey: uuid.describe("Client-generated UUID bound to this run and candidate. Reuse after timeout.") }).strict(),
    readOnly: false, idempotent: true, openWorld: true },
];

/** REST and MCP accept exactly the same bounded product input contracts. */
export function parseProductOperationInput(operation: McpOperation, args: unknown): Record<string, unknown> {
  const definition = definitions.find(tool => tool.name === operation);
  const input = definition?.schema.safeParse(args);
  if (!input?.success) throw new AccountAccessError("invalid_request", 400, "Use valid fields for this Sajda operation.");
  return input.data;
}

export function productOperationScope(operation: McpOperation): ApiKeyScope {
  const definition = definitions.find(tool => tool.name === operation);
  if (!definition) throw new AccountAccessError("invalid_request", 400, "Choose a supported Sajda operation.");
  return definition.scope;
}

function productToolResult(result: McpProductResult, requestId: string): CallToolResult {
  const productRequestId = typeof result.data.requestId === "string" ? result.data.requestId : requestId;
  const ok = result.status >= 200 && result.status < 300;
  const structuredContent = ok ? { ok, status: result.status, requestId: productRequestId, data: result.data }
    : { ok, status: result.status, requestId: productRequestId, error: {
      code: typeof result.data.code === "string" ? result.data.code : "product_unavailable",
      message: typeof result.data.error === "string" ? result.data.error : "Sajda could not complete this operation.",
      ...(result.retryAfterSeconds !== undefined ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
    } };
  return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent, ...(!ok ? { isError: true } : {}) };
}

/** A fresh SDK server is created for every authenticated HTTP request. */
export function createSajdaMcpServer(principal: ApiKeyPrincipal, execute: McpProductExecutor, requestId: string): Server {
  const server = new Server({ name: "sajda", title: "Sajda", version: SAJDA_MCP_VERSION }, {
    capabilities: { tools: { listChanged: false } },
    instructions: "Sajda shares the same account and durable state as its website and API. Each tool requires its stated API-key scope. Start and quote tools require an explicit intended action and a caller-generated idempotency UUID. Tool discovery, status and report reads never start work. Evidence dates, unknown availability, currency and membership checks remain authoritative. No tool purchases domains or changes billing.",
  });
  server.setRequestHandler(ListToolsRequestSchema, async request => {
    if (request.params?.cursor !== undefined) throw new McpError(ErrorCode.InvalidParams, "This tool catalogue fits in one page; omit cursor.");
    return { tools: definitions.map(definition => ({
      name: definition.name,
      title: definition.title, description: `${definition.description} Required scope: ${definition.scope}.`,
      inputSchema: z.toJSONSchema(definition.schema, { io: "input" }) as Tool["inputSchema"],
      outputSchema: z.toJSONSchema(resultSchema) as Tool["outputSchema"],
      annotations: { readOnlyHint: definition.readOnly, idempotentHint: definition.idempotent,
        openWorldHint: definition.openWorld, destructiveHint: definition.destructive ?? false },
      _meta: { "sajda/requiredScopes": [definition.scope] },
    })) };
  });
  server.setRequestHandler(CallToolRequestSchema, async request => {
    // This server advertises ordinary calls only. Reject unsupported task
    // augmentation before a mutation, not after checking its result shape.
    if (request.params.task) throw new McpError(ErrorCode.InvalidParams, "Task-augmented tool calls are not supported. Use an ordinary tool call.");
    const definition = definitions.find(tool => tool.name === request.params.name);
    if (!definition) throw new McpError(ErrorCode.InvalidParams, "Unknown Sajda tool.");
    const input = definition.schema.safeParse(request.params.arguments ?? {});
    if (!input.success) throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for ${definition.name}. Check the published input schema.`);
    try {
      assertApiKeyScopes(principal, [definition.scope]);
      return productToolResult(await execute(definition.name, input.data, principal), requestId);
    } catch (error) {
      const safe = error instanceof AccountAccessError ? error
        : new AccountAccessError("service_unavailable", 503, "Sajda is temporarily unavailable. Retry with the same request identifier for a mutation.");
      return productToolResult({ status: safe.status, data: { code: safe.code, error: safe.message } }, requestId);
    }
  });
  return server;
}
