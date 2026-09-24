/**
 * One reviewed host catalogue for the application, static connector hub and kit.
 * These entries document a host's custom remote-MCP path, not marketplace
 * approval or a completed installation in the user's account.
 * Logo source revisions and licenses: docs/connector-assets.md.
 */
export const CONNECTOR_REVIEWED_AT = "2026-09-24";

export const CONNECTOR_HOSTS = [
  {
    id: "chatgpt", name: "ChatGPT", category: "assistant",
    documentation: "https://developers.openai.com/plugins/deploy/connect-chatgpt",
    logo: "/connectors/chatgpt.svg", installMethod: "settings", configKind: "none",
    steps: [
      "Enable Developer mode in Settings → Security and login, if your account permits it.",
      "Open Plugins, choose the plus button and add Sajda with the public MCP URL.",
      "Review the discovered tools, then select Sajda from the tools menu in a new conversation.",
    ],
    limitation: "Developer mode depends on account and workspace policy. This is a custom connection, not a public plugin listing.",
  },
  {
    id: "claude", name: "Claude", category: "assistant",
    documentation: "https://claude.com/docs/connectors/building/directory-vs-custom",
    logo: "/connectors/claude.svg", installMethod: "review-link", configKind: "none",
    steps: [
      "Open the prefilled custom-connector form in Claude.",
      "Review the Sajda name and public MCP URL, then confirm the connection.",
      "Enable Sajda for your conversation and ask it to help with names or domains.",
    ],
    limitation: "The link prefills a form and requires your confirmation. Sajda is a custom connector, not a directory-listed connector.",
  },
  {
    id: "grok", name: "Grok", category: "assistant",
    documentation: "https://docs.x.ai/grok/connectors",
    logo: "/connectors/grok.svg", installMethod: "settings", configKind: "none",
    steps: [
      "Open Grok Connectors and choose New Connector → Custom.",
      "Enter Sajda's public MCP URL and follow the connection settings; this endpoint needs no API key.",
      "Confirm that Sajda's tools appear, then ask Grok to use Sajda in a conversation.",
    ],
    limitation: "Business and Enterprise organizations require an administrator to provision their connectors.",
  },
  {
    id: "perplexity", name: "Perplexity", category: "assistant",
    documentation: "https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors",
    logo: "/connectors/perplexity.svg", installMethod: "settings", configKind: "none",
    steps: [
      "Open Account settings → Connectors → Custom connector and select Remote.",
      "Name it Sajda, paste the public MCP URL, choose Streamable HTTP and set Authentication to None.",
      "Review the acknowledgement, add the connector and enable its card before asking Perplexity to use Sajda.",
    ],
    limitation: "Custom remote connectors require a supported Perplexity plan. Enterprise administrators can restrict who may add them.",
  },
  {
    id: "cursor", name: "Cursor", category: "editor",
    documentation: "https://cursor.com/docs/mcp",
    logo: "/connectors/cursor.svg", installMethod: "review-link", configKind: "mcpServers",
    steps: [
      "Open the installation link and review Sajda in Cursor, or open your project's .cursor/mcp.json.",
      "Add the supplied mcpServers entry without replacing any existing servers.",
      "Check that Sajda is enabled in MCP settings, then ask Cursor's agent to use it.",
    ],
    limitation: "The host confirms installation and tool access. Project naming rules are optional and are configured separately.",
  },
  {
    id: "replit", name: "Replit", category: "builder",
    documentation: "https://docs.replit.com/build/connect-via-mcp",
    logo: "/connectors/replit.svg", installMethod: "review-link", configKind: "none",
    steps: [
      "Open the integration link or choose Add MCP server in Replit's MCP Servers settings.",
      "Review the Sajda name and public MCP URL, then choose Test & save.",
      "Confirm the server is connected and ask Replit Agent to use Sajda for your project.",
    ],
    limitation: "The connection provides tools to Replit Agent. Optional project instructions belong in the projects you choose.",
  },
  {
    id: "lovable", name: "Lovable", category: "builder",
    documentation: "https://docs.lovable.dev/integrations/custom-mcp",
    logo: "/connectors/lovable.svg", installMethod: "settings", configKind: "none",
    steps: [
      "Open Connectors, select the plus button and choose MCP server.",
      "Name it Sajda, use the public MCP URL with a direct connection and select no authentication.",
      "Connect Sajda to your chat and ask for business names or domain checks.",
    ],
    limitation: "Custom MCP servers provide context to Lovable chat; they do not become part of your published app. Workspace admins can disable them.",
  },
  {
    id: "codex", name: "Codex", category: "editor",
    documentation: "https://developers.openai.com/codex/mcp",
    logo: "/connectors/codex.svg", installMethod: "configuration", configKind: "codex",
    steps: [
      "Open Codex MCP settings and add a Streamable HTTP server, or edit ~/.codex/config.toml.",
      "Add the supplied mcp_servers.sajda table with the public MCP URL; preserve your existing configuration.",
      "Restart the client if prompted and check /mcp or codex mcp list before asking Codex to use Sajda.",
    ],
    limitation: "This configuration applies to local Codex clients. Hosted ChatGPT web uses its own plugin connection flow.",
  },
  {
    id: "vscode", name: "VS Code Copilot", category: "editor",
    documentation: "https://code.visualstudio.com/docs/agent-customization/mcp-servers",
    logo: "/connectors/vscode.svg", installMethod: "configuration", configKind: "vscode",
    steps: [
      "Run MCP: Add Server in the Command Palette, or open .vscode/mcp.json in your workspace.",
      "Add Sajda as an HTTP server using the supplied servers configuration and review the trust prompt.",
      "Open Copilot Chat in Agent mode, enable Sajda in the tools picker and ask it to use Sajda.",
    ],
    limitation: "Requires Copilot agent tools and permission to use MCP servers. The VS Code configuration uses servers, not mcpServers.",
  },
  {
    id: "windsurf", name: "Windsurf", category: "editor",
    documentation: "https://docs.windsurf.com/windsurf/cascade/mcp",
    logo: "/connectors/windsurf.svg", installMethod: "configuration", configKind: "windsurf",
    steps: [
      "In Cascade's Actions menu, open MCP config file to find the configuration used by your installed version.",
      "Merge the supplied mcpServers.sajda entry using serverUrl, then save the configuration.",
      "Enable Sajda in Cascade's MCP section and ask Cascade to use its tools.",
    ],
    limitation: "These instructions cover the Cascade agent. Current documentation redirects to Devin Desktop; its newer Devin Local agent uses a different configuration.",
  },
  {
    id: "cline", name: "Cline", category: "editor",
    documentation: "https://docs.cline.bot/mcp/mcp-overview",
    logo: "/connectors/cline.svg", installMethod: "configuration", configKind: "cline",
    steps: [
      "Open Cline's MCP Servers panel and select Remote Servers, or open Configure MCP Servers.",
      "Add Sajda with the public MCP URL and select Streamable HTTP. In JSON, explicitly use type: streamableHttp.",
      "Save, check that Sajda's tools appear and approve the tool calls you want Cline to make.",
    ],
    limitation: "Cline defaults to legacy SSE if type is omitted. The supplied configuration keeps automatic tool approval disabled.",
  },
  {
    id: "zed", name: "Zed", category: "editor",
    documentation: "https://zed.dev/docs/ai/mcp",
    logo: "/connectors/zed.svg", installMethod: "configuration", configKind: "zed",
    steps: [
      "Open Settings → AI → MCP Servers, choose Add Server, then Add Remote Server.",
      "Name the server Sajda and enter the public MCP URL, or merge the supplied context_servers entry into settings.",
      "Check that the server is active and enable its tools in the agent profile you use.",
    ],
    limitation: "These settings apply directly to Zed Agent. External agents and terminal agents can have separate configuration and tool permissions.",
  },
  {
    id: "gemini-cli", name: "Gemini CLI", category: "editor",
    documentation: "https://geminicli.com/docs/tools/mcp-server/",
    logo: "/connectors/gemini-cli.svg", installMethod: "configuration", configKind: "gemini",
    steps: [
      "Open ~/.gemini/settings.json or your project's .gemini/settings.json.",
      "Merge the supplied mcpServers.sajda entry using httpUrl for Streamable HTTP; keep existing servers.",
      "Restart Gemini CLI or run /mcp reload, check /mcp list and ask Gemini CLI to use Sajda.",
    ],
    limitation: "This setup is for Gemini CLI, not the consumer Gemini chat app. Its url field selects SSE; Streamable HTTP requires httpUrl.",
  },
].map(host => Object.freeze({ ...host, reviewedAt: CONNECTOR_REVIEWED_AT, steps: Object.freeze(host.steps) }));

Object.freeze(CONNECTOR_HOSTS);
