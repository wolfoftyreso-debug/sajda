# Connector catalogue and logo sources

Reviewed 24 September 2026. `shared/connector-catalogue.mjs` is the shared host
inventory for the React application, the static connector hub and the setup kit.
Each entry contains its official setup documentation, three setup steps, a
configuration format and a host-specific limitation. Review dates establish a
documentation check, not marketplace approval or an end-to-end installation test.

## Brand assets

The 13 logos in `public-clean/connectors` are exact downloaded SVG assets, with
no invented lettering, generated lookalikes or runtime image service. Their
byte-level SHA-256 hashes and immutable download URLs are recorded in
[connector-logo-provenance.json](connector-logo-provenance.json).

- Twelve marks come from the maintained [Lobe Icons collection](https://github.com/lobehub/lobe-icons/tree/5c1ecb4fb06b92519a39102482d4e8273f000422/packages/static-svg/icons), released under its MIT license.
- Zed comes from [Simple Icons](https://github.com/simple-icons/simple-icons/blob/b86d5c9a0bdd4f3f5c30898a63654dd32f39fd76/icons/zedindustries.svg), released under CC0-1.0. Its source metadata identifies [Zed's own published mark](https://github.com/zed-industries/zed/blob/ccc939124fa2f366b3029926447fd0a0c46a85c7/assets/icons/logo_96.svg).
- ChatGPT uses the OpenAI knot mark. Codex uses the separate Codex mark. VS Code Copilot uses GitHub Copilot's mark. Gemini CLI uses the Gemini star.
- Keep the shipped `connectors/LICENSE.txt` beside the logo files in each static distribution. Brand marks remain the property of their owners; the catalogue does not imply an endorsement.

The assets contain only standalone SVG geometry and internal paint references.
They contain no text-based stand-ins, image hotlinks, scripts or event handlers.
Render on a light surface: unmodified monochrome icons use black/currentColor
when loaded as images. Paths in the catalogue are same-origin URLs, so loading
the installation page does not contact the icon libraries or host services.

## Setup distinctions checked

| Host | Official remote connection format |
| --- | --- |
| [Perplexity](https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors) | Account settings → Connectors → Custom connector → Remote; Streamable HTTP; Authentication None for Sajda's public endpoint |
| [Codex](https://developers.openai.com/codex/mcp) | TOML `[mcp_servers.sajda]` and `url` in local client configuration |
| [VS Code Copilot](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) | `servers.sajda` with `type: "http"` and `url` in `.vscode/mcp.json` |
| [Windsurf / Cascade](https://docs.windsurf.com/windsurf/cascade/mcp) | `mcpServers.sajda.serverUrl` in the config file opened from Cascade's MCP controls |
| [Cline](https://docs.cline.bot/mcp/mcp-overview) | `mcpServers.sajda` with explicit `type: "streamableHttp"` and `url`; no automatic approval |
| [Zed](https://zed.dev/docs/ai/mcp) | `context_servers.sajda.url` in Zed settings |
| [Gemini CLI](https://geminicli.com/docs/tools/mcp-server/) | `mcpServers.sajda.httpUrl` in `.gemini/settings.json`; `url` would select SSE |

Perplexity's [13 March 2026 changelog](https://www.perplexity.ai/en-GB/changelog/what-we-shipped---march-13-2026)
states custom remote connectors are available to Pro, Max and Enterprise
subscribers. Enterprise policy can restrict member-created connectors.

Windsurf's documentation currently redirects to Devin Desktop and labels this
configuration as the legacy Cascade path. The newer Devin Local agent uses
different config files; this catalogue does not claim its setup is identical.

The existing ChatGPT, Claude, Grok, Cursor, Replit and Lovable paths were also
checked against their official documentation, linked in each catalogue entry.
Lovable custom MCP connections are available to chat and are not installed into
the user's published app. Gemini CLI support does not imply Gemini consumer-chat
support. Account access and host administration policies remain host-controlled.
