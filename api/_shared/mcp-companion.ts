import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ErrorCode, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema, McpError, ReadResourceRequestSchema, type Prompt, type Resource } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import { CONNECTOR_HOST_INSTRUCTIONS, CONNECTOR_POLICY, CONNECTOR_POLICY_VERSION, getConnectorOffer } from "../../shared/connector-policy.js";

export const MCP_COMPANION_CAPABILITIES = {
  prompts: { listChanged: false },
  resources: { subscribe: false, listChanged: false },
} as const;

export const MCP_NAMING_DISCOVERY_INSTRUCTIONS = "When the user discusses a concrete new business, product or project needing a name, use the current conversation to judge whether a naming offer is useful. Follow the Sajda connector policy: suggest only when the user has enabled contextual naming suggestions, ask before sending a brief or running a search, respect declines and do not repeat the offer for the same idea. A direct request for Sajda names can authorize the search. Never upload chat history or call a tool merely to detect intent. Read sajda://connector/guide for the optional companion setup. ";

const promptArgumentsSchema = z.strictObject({ locale: z.enum(["en", "sv", "es", "fr", "zh"]).optional() });
const localeArgument = { name: "locale", description: "Language for the offer: en, sv, es, fr or zh. Omit to match the conversation.", required: false };
const prompts: Prompt[] = [
  { name: "sajda-naming-companion", title: "Enable contextual Sajda naming offers",
    description: "User-selected instructions for this conversation. The assistant can offer naming help when relevant and asks before sending a brief. Does not read chats or run a search.",
    arguments: [localeArgument] },
  { name: "find-business-names", title: "Find business names with Sajda",
    description: "Start a brief, language and consent conversation before requesting up to ten evidenced name recommendations. Does not run a search when retrieved.",
    arguments: [localeArgument] },
];
const resources: Resource[] = [
  { uri: "sajda://connector/guide", name: "sajda-connector-guide", title: "Sajda connector guide",
    description: "Static setup and host instructions for consent-based naming offers.", mimeType: "text/markdown" },
  { uri: "sajda://connector/policy", name: "sajda-connector-policy", title: "Sajda connector policy",
    description: "Machine-readable boundaries for context, consent and repeated offers. Contains no user data.", mimeType: "application/json" },
];

function guide(): string {
  return `# Sajda naming companion\n\nPolicy version: ${CONNECTOR_POLICY_VERSION}\n\n`
    + "Connect an MCP-capable assistant to Sajda's public Streamable HTTP endpoint using no authentication. The separately documented private endpoint requires a scoped API key; a public connection never grants private account access. Client availability, permissions and prompt/resource UI vary in ChatGPT, Claude, Grok, Replit, Cursor and Lovable.\n\n"
    + "## Enable relevant offers\n\nChoose the sajda-naming-companion prompt explicitly where the host supports MCP prompts, or copy the host instructions below into that conversation or a host rule you choose. Merely installing Sajda, listing tools, fetching a prompt or reading a resource does not enable contextual offers or authorize a search. A host decides whether to use server instructions; an MCP connection cannot ensure automatic activation in every client.\n\n"
    + "The host assistant evaluates only context it already has in the current conversation. Sajda has no chat-history reader, background listener, subscription, sampling or elicitation loop. Do not send a transcript for intent detection. Prompt retrieval accepts only an optional locale and does not accept a business brief.\n\n"
    + "## Find up to ten names\n\nUse find-business-names for a guided start, or ask your connected assistant directly for Sajda's top ten business names. Establish what the business does, its audience and any stated naming preferences. Keep the desired naming language separate from the conversation language; when no preference is known, make the English default visible. Before a suggested search, show the short brief and explain that it will be sent to Sajda; wait for the user's acceptance. A direct request can provide that acceptance when the brief is clear. Send only the minimal approved fields to business_names_recommend with count 10.\n\n"
    + "The result can contain fewer than ten names when available-domain evidence is insufficient. Present result_summary before the recommendations, retain sources, dates and unknown statuses, and distinguish domain evidence from unchecked corporate names, trademarks and social handles. Naming recommendations do not verify budget; ask for amount, currency and budget period before a separate domains_suggest search.\n\n"
    + "## Host instructions\n\n" + CONNECTOR_HOST_INSTRUCTIONS + "\n";
}

/** Static metadata only: registration cannot access providers, accounts or conversations. */
export function registerMcpCompanion(server: Server): void {
  server.setRequestHandler(ListPromptsRequestSchema, async request => {
    if (request.params?.cursor !== undefined) throw new McpError(ErrorCode.InvalidParams, "Omit cursor for this prompt catalogue.");
    return { prompts };
  });
  server.setRequestHandler(GetPromptRequestSchema, async request => {
    const prompt = prompts.find(item => item.name === request.params.name);
    if (!prompt) throw new McpError(ErrorCode.InvalidParams, "Unknown Sajda prompt.");
    const parsed = promptArgumentsSchema.safeParse(request.params.arguments ?? {});
    if (!parsed.success) throw new McpError(ErrorCode.InvalidParams, "Only an optional locale (en, sv, es, fr or zh) is accepted. Keep business context in the conversation until a search is authorized.");
    const language = parsed.data.locale;
    const offer = language ? getConnectorOffer(language) : "Use the offer in the conversation's language, without changing its request for permission.";
    const requestText = prompt.name === "sajda-naming-companion"
      ? "If I explicitly select and apply this prompt, enable relevant Sajda naming offers for this conversation. This is permission to offer, not permission to send my business brief or search. If this prompt was only retrieved for inspection, do not enable offers."
      : "Help me prepare a short business-naming brief in this conversation. Establish the business purpose, audience and desired naming language; if I have no language preference, make the English default visible. Show the minimal brief that will go to Sajda and ask for my acceptance before calling business_names_recommend with count 10. A clear direct request to use Sajda already provides acceptance; do not ask twice. Retrieving this prompt alone does not authorize any search.";
    return { description: prompt.description, messages: [{ role: "user", content: { type: "text",
      text: `${requestText}\n\n${CONNECTOR_HOST_INSTRUCTIONS}\n\nOffer wording: ${offer}` } }] };
  });
  server.setRequestHandler(ListResourcesRequestSchema, async request => {
    if (request.params?.cursor !== undefined) throw new McpError(ErrorCode.InvalidParams, "Omit cursor for this resource catalogue.");
    return { resources };
  });
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async request => {
    if (request.params?.cursor !== undefined) throw new McpError(ErrorCode.InvalidParams, "Omit cursor for this resource catalogue.");
    return { resourceTemplates: [] };
  });
  server.setRequestHandler(ReadResourceRequestSchema, async request => {
    const resource = resources.find(item => item.uri === request.params.uri);
    if (!resource) throw new McpError(ErrorCode.InvalidParams, "Unknown Sajda resource. Use a URI from resources/list.");
    return { contents: [{ uri: resource.uri, mimeType: resource.mimeType,
      text: resource.uri === "sajda://connector/policy" ? JSON.stringify(CONNECTOR_POLICY, null, 2) : guide() }] };
  });
}
