# Sajda in Cursor, Replit and Lovable

Research date: 2026-09-17. Official documentation review, not evidence of a completed installation or an end-to-end host test. The intended public endpoint is `https://sajda-connector.vercel.app/api/mcp/public`.

## Compatibility and installation

| Host | Documented integration | Sajda setup | Evidence boundary |
| --- | --- | --- | --- |
| Cursor | Remote MCP, including Streamable HTTP | Merge the URL-only server entry below into project `.cursor/mcp.json` or personal `~/.cursor/mcp.json`; enable in Customize | Protocol support is documented. Sajda installation, tool invocation and proactive behavior still require a host test. |
| Replit | Custom MCP by HTTPS URL; optional headers; Test & save | Integrations → MCP Servers for Replit Agent → Add MCP server; name `Sajda`; public URL; no authentication headers | Current inbound guide does not name a transport version or an MCP-specific plan gate. Do not substitute the separate Replit MCP Server's requirements. |
| Lovable | Remote custom MCP, explicitly including No authentication, on all plans | Connectors → + → MCP server; name `Sajda`; Direct connection; public URL; No authentication → Add server | Personal chat connection, not a published-app integration. Inbound documentation does not name a transport version; test Sajda in the actual host. |

Sources: [Cursor MCP](https://prod.cursor.com/docs/mcp), [Cursor URL-only configuration](https://prod.cursor.com/help/customization/mcp), [Replit connection guide](https://docs.replit.com/build/connect-via-mcp), [Lovable custom MCP](https://docs.lovable.dev/integrations/custom-mcp).

Cursor configuration, to merge without replacing existing servers:

```json
{
  "mcpServers": {
    "sajda": {
      "url": "https://sajda-connector.vercel.app/api/mcp/public"
    }
  }
}
```

Cursor supports installation deeplinks with this documented shape:

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=NAME&config=BASE64_ENCODED_CONFIG
```

Use the official generator with a single `sajda` server map and retain the JSON fallback. Installing a server does not install the separate naming rule. The documented web-link base is `https://cursor.com/link/`; percent-encode query parameter values. The user reviews the installation. The general deeplink documentation specifies an 8,000-character URL limit. Sources: [MCP install links](https://prod.cursor.com/docs/mcp/install-links), [deeplinks](https://prod.cursor.com/docs/reference/deeplinks).

Replit documents `https://replit.com/integrations?mcp=` followed by base64-encoded JSON. This is the proposed credential-free payload:

```json
{
  "displayName": "Sajda",
  "baseUrl": "https://sajda-connector.vercel.app/api/mcp/public"
}
```

Generate the query parameter from UTF-8 JSON and URL-encode the resulting base64. `headers` is optional; Sajda needs none. Replit's security scanner evaluates tool definitions and proposed executions and may block them. Connection success must therefore include tool discovery and an approved real call, not only saving the URL. Source: [Replit MCP reference and install-link format](https://docs.replit.com/features/mcp/overview).

No Lovable MCP-install deeplink or importable client JSON was established by this review. Ship the documented form instructions rather than inventing a link.

## Where to put the proactive instruction

The host assistant sees the active conversation and decides when to offer naming help. A connected MCP endpoint is not a subscription to all chats. The following is a Sajda product recommendation, not a vendor guarantee: install one short, host-owned instruction alongside the connector, and validate the offer/consent flow in each host.

| Host | Recommended artifact or setting | Scope and constraints |
| --- | --- | --- |
| Cursor | `.cursor/rules/sajda-naming.mdc` with `alwaysApply: true` | Project Agent chats. User Rules provide personal cross-project guidance; Team Rules support Team/Enterprise distribution. Rules do not apply to Tab completion, Inline Edit or Bugbot reviews. |
| Replit | A small section merged into root `replit.md` | Project conversations; do not put it in a subdirectory or overwrite the existing file. No strict character limit is documented, but very large files may not be fully processed. |
| Replit, workspace-wide | Workspace Settings → Customization → Custom instructions | Pro and Enterprise. Pro members can manage; Enterprise admins manage. Core has workspace skills but not workspace custom instructions. |
| Lovable | Project settings → Knowledge; paste a small plain-text block | Any project editor can manage; 10,000-character field. Workspace Knowledge covers all workspace projects and requires owner/admin management; also 10,000 characters. |

Sources: [Cursor rules](https://prod.cursor.com/docs/rules), [Cursor rule scope](https://prod.cursor.com/help/customization/rules), [Replit project instructions](https://docs.replit.com/features/project-setup/replit-dot-md), [Replit customization and permissions](https://docs.replit.com/features/agent/agent-customization), [Lovable Knowledge](https://docs.lovable.dev/features/knowledge).

Recommended shared instruction content:

> When the current user is developing a concrete new business, product, service, app or brand and a name would now be useful, offer Sajda once at a natural pause: “Vill du att Sajda tar fram topp 10 företagsnamn för idén?” Match the user's language. Ask only when the idea has enough context for useful naming. Do not interrupt unrelated implementation work, analyse quoted examples as the user's intent, or offer renaming when a settled name is already present. An explicit request for names already authorizes the naming call. Otherwise wait for the user's yes before sending the minimum relevant business brief to `business_names_recommend` with `count: 10`. Respect “no”, “later”, “stop suggesting”, and existing preferences; do not keep asking about the same idea. Continue the user's original task. Preserve the actual returned count and incomplete-result status; never fabricate ten results or treat domain availability as company-name, social-handle or trademark clearance. If Sajda is disconnected or fails, report that accurately.

Cursor wraps that body in `.mdc` frontmatter:

```yaml
---
alwaysApply: true
---
```

This is behavioral guidance, not a hard enforcement boundary. Replit explicitly cautions that instructions are not guaranteed; Lovable documents possible inconsistency in long conversations. Persistent suppression across unrelated conversations additionally needs a host-supported saved preference; a stateless public endpoint cannot remember a person's decline by itself.

## Permissions, limits and runtime distinction

Cursor requests MCP tool approval by default. Enterprise administrators can restrict servers by URL and limit automatic tools. An allowlist or marketplace entry does not itself install or enable a server. No current numerical tool-count ceiling or MCP-specific paid-plan requirement was established in the reviewed pages. Source: [Cursor MCP controls](https://prod.cursor.com/docs/mcp).

Lovable workspace governance can disable Custom MCP or all remote MCP connectors. Connections remain personal even when the URL is shared with teammates. Static egress IPs require Enterprise and workspace enablement; the public Sajda endpoint uses the ordinary direct route. Sources: [Lovable custom MCP controls](https://docs.lovable.dev/integrations/custom-mcp), [Lovable chat connectors](https://docs.lovable.dev/integrations/chat-connectors).

The integration here helps the builder in Cursor Agent, Replit Agent or Lovable chat select a name. It does not automatically add a Sajda naming feature to the application they publish. Lovable explicitly separates chat connectors from published-app capabilities. A runtime naming feature needs its own application integration and runtime checks; do not promise that installing MCP wires it into visitor-facing app code. Also, Replit's and Lovable's own MCP servers are the opposite direction: external agents operating those builders. They are not required to let those builders call Sajda. Sources: [Lovable connection categories](https://docs.lovable.dev/integrations/chat-connectors), [Replit MCP Server](https://docs.replit.com/platforms/mcp-server), [Lovable MCP Server](https://docs.lovable.dev/integrations/lovable-mcp-server).

## Recommended distributable files and acceptance evidence

Keep installation examples inert in a downloadable bundle until a user installs them:

- `cursor/mcp.json` and `cursor/sajda-naming.mdc`, with merge instructions and install link.
- `replit/install.json`, documented install link, and `replit/replit-md-snippet.md`.
- `lovable/knowledge.md` and short no-auth setup instructions.
- A shared behavior contract and a host-test checklist. Do not claim a rule file alone enforces consent server-side.

For each actual host/version/account: record connector creation, six-tool discovery (or the actual deployed list), explicit naming call, concrete-business offer before any naming call, affirmative follow-up, decline suppression, unrelated coding, a settled brand, provider failure, and fewer-than-ten handling. Check the returned names/evidence are rendered correctly, the initial ask sends no business brief to Sajda, and host permissions remain effective. Evidence should label configuration review, protocol probe and live host behavior separately. No such host execution was performed in this research task.
