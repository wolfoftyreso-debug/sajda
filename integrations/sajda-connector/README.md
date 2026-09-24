# Sajda connector kit

Connect a supported assistant to Sajda and optionally enable relevant naming offers. The assistant can ask about names for an unnamed business or app, wait for agreement, and request up to ten evidenced recommendations.

Public MCP URL (Streamable HTTP, no Sajda account or authentication header):

```text
https://sajda-connector.vercel.app/api/mcp/public
```

The host controls tool availability and invocation. Sajda has no background chat access. The connection and the naming companion are separate: enable the companion only if you want contextual offers. Consent to each suggested search is still required.

## Install in a host

The [setup directory](https://sajda-connector.vercel.app/#setup) documents **13 clients** with local brand logos, official references and host-specific configuration: ChatGPT, Claude, Grok, Perplexity, Cursor, Replit, Lovable, Codex, VS Code Copilot, Windsurf Cascade, Cline, Zed and Gemini CLI. These are setup paths, not claims of marketplace approval or completed installation tests. Plan and workspace restrictions apply; Perplexity custom remote connectors require an eligible paid plan.

For Codex, VS Code, Windsurf, Cline, Zed and Gemini CLI, use the configuration shown in that client's directory card. Their configuration schemas differ. Merge the Sajda entry into existing settings; do not replace other servers. Naming offers are optional and require a host-supported instructions surface and consent before sending a brief.

| Host | Connect Sajda | Enable optional naming offers |
| --- | --- | --- |
| ChatGPT | Enable Developer mode under Settings > Security and login where available. In ChatGPT Plugins, add a connection with the public URL and No Authentication, then select it in the conversation. | Apply `HOST-INSTRUCTIONS.md` as instructions for that conversation or use a supported skill/plugin installation surface. A downloaded ZIP alone does not register an MCP connection. |
| Claude | Customize > Connectors > Add custom connector; enter Sajda and the public URL, then enable it for the conversation. Free accounts currently allow one custom connector. | Apply `HOST-INSTRUCTIONS.md` to the chosen conversation or a host-supported instructions setting. If MCP prompts are exposed, explicitly apply `sajda-naming-companion`. |
| Grok | At grok.com/connectors choose New Connector > Custom and enter the public URL. Business/Enterprise may need an admin to provision it first. | Apply `HOST-INSTRUCTIONS.md` in the chosen conversation or an available custom-instructions setting. Do not assume the connection automatically installs instructions. |
| Cursor | Merge `configs/cursor/mcp.json` into project `.cursor/mcp.json`, preserving existing servers. Enable the connection in Cursor. | Copy the built kit's `configs/cursor/sajda-naming.mdc` to `.cursor/rules/sajda-naming.mdc`. Its scope is Agent chats in that project. |
| Replit | Integrations > MCP Servers for Replit Agent > Add MCP server; enter Sajda, the public HTTPS URL, no headers; Test & save. | Merge the built kit's `configs/replit/replit.md` section into the existing project-root `replit.md`. |
| Lovable | Connectors > + > MCP server; choose Direct connection, enter Sajda and the public URL, select No authentication, then add it. | Paste the built kit's `configs/lovable/project-instructions.md` into Project settings > Knowledge. This affects builder chat, not the published app runtime. |

Official setup references: [ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt), [Claude](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities), [Grok](https://docs.x.ai/grok/connectors), [Cursor](https://prod.cursor.com/docs/mcp), [Replit](https://docs.replit.com/build/connect-via-mcp), [Lovable](https://docs.lovable.dev/integrations/custom-mcp). Account availability and workspace controls can affect these routes.

## Package formats

Root `plugin.json` and `mcp.json` use the portable Agent Plugins format. `.codex-plugin/plugin.json` and `.mcp.json` provide compatible OpenAI packaging. `skills/sajda-naming/SKILL.md` carries focused naming guidance. Use a host's documented plugin workflow when it supports this format; these files are not a universal ZIP upload mechanism for every client.

No marketplace is installed by this source package. No registered app identifier is embedded. Public listing in OpenAI or Claude directories requires a separate submission and review. [OpenAI packaging](https://developers.openai.com/plugins/build/plugins), [OpenAI submission](https://developers.openai.com/plugins/deploy/submission), [Claude submission](https://claude.com/docs/connectors/building/submission).

The release builder generates `HOST-INSTRUCTIONS.md` and `policy.json` from `shared/connector-policy.ts`, and expands the `SAJDA_HOST_POLICY` marker in host instruction templates from the same source. Install the built kit's expanded files. The source templates are build inputs, not complete host instructions. This keeps the delivered policy consistent across hosts.

## Check the installed experience

After connecting, inspect the discovered tools and run these cases in the real host:

- Discuss an unnamed business: one relevant offer, no business brief sent before agreement.
- Accept the current offer: a minimal approved brief goes to `business_names_recommend` with `count: 10`.
- Decline: no repeated offer for that project until naming is explicitly reopened.
- Debug code or discuss an already named project: no unsolicited renaming offer.
- Request English names while chatting in Swedish: naming language and response language stay distinct.
- Receive fewer than ten names or a failure: show the actual count, explanation, evidence and next action; do not fabricate results.

## Verification status

Status at 2026-09-24: source package and documented configuration routes prepared. Packaging validation and automated checks do not prove installation or behavior inside a third-party host. No third-party account installation, end-to-end host scenario, marketplace publication or directory approval is claimed by this kit. Record those outcomes separately for each host and version.

## Private account access

The public connector does not access your account. Authenticated account REST and MCP capabilities use a **separate account backend**, an expiring API key and explicitly selected permissions. Create the key in Sajda's developer settings and store it only in the client's secure authentication configuration, never in a chat or shared project file. Start with read permissions. Saving, deleting and changing monitoring state require the corresponding write permissions; Trading also requires an active entitlement. This is not universal account OAuth, and a deployment-protected preview is not accessible to arbitrary external clients.

The public connection grants no private account access and cannot purchase or register a domain. Naming, social and company signals are not legal trademark clearance. For exact domain-price budgets, use `domains_suggest` with the user's stated amount, currency and budget period.
