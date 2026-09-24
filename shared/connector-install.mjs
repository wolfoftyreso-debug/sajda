import { CONNECTOR_HOSTS } from './connector-catalogue.mjs';

function hostById(id) {
  const host = CONNECTOR_HOSTS.find(item => item.id === id);
  if (!host) throw new Error('Unknown connector host');
  return host;
}
function checkedEndpoint(endpoint) {
  const url = new URL(endpoint);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
    || hostname.includes(':') || /^\d+(?:\.\d+){3}$/u.test(hostname) || !hostname.includes('.')
    || url.pathname !== '/api/mcp/public') throw new Error('Use a public HTTPS MCP endpoint');
  return url.href;
}

/** Links only open host review/settings or official instructions, never install automatically. */
export function connectorInstallUrl(id, endpoint) {
  const host = hostById(id);
  if (!endpoint) return null;
  const url = checkedEndpoint(endpoint);
  if (id === 'chatgpt') return 'https://chatgpt.com/plugins';
  if (id === 'grok') return 'https://grok.com/connectors';
  if (id === 'lovable') return 'https://lovable.dev/dashboard?connectors=';
  if (id === 'claude') return 'https://claude.ai/customize/connectors?' + new URLSearchParams({
    modal: 'add-custom-connector', connectorName: 'Sajda', connectorUrl: url,
  });
  if (id === 'cursor') return 'https://cursor.com/link/mcp/install?' + new URLSearchParams({
    name: 'sajda', config: btoa(JSON.stringify({ url })),
  });
  if (id === 'replit') return 'https://replit.com/integrations?' + new URLSearchParams({
    mcp: btoa(JSON.stringify({ displayName: 'Sajda', baseUrl: url })),
  });
  return host.documentation;
}

/** Credential-free, host-specific public configuration. Never overwrite existing servers. */
export function connectorConfig(id, endpoint) {
  const host = hostById(id);
  if (!endpoint || host.configKind === 'none') return null;
  const url = checkedEndpoint(endpoint);
  if (host.configKind === 'codex') return `[mcp_servers.sajda]\nurl = ${JSON.stringify(url)}\n`;
  const config = host.configKind === 'vscode' ? { servers: { sajda: { type: 'http', url } } }
    : host.configKind === 'gemini' ? { mcpServers: { sajda: { httpUrl: url } } }
    : host.configKind === 'zed' ? { context_servers: { sajda: { url } } }
    : host.configKind === 'windsurf' ? { mcpServers: { sajda: { serverUrl: url } } }
    : host.configKind === 'cline' ? { mcpServers: { sajda: { type: 'streamableHttp', url, disabled: false, autoApprove: [] } } }
    : { mcpServers: { sajda: { url } } };
  return JSON.stringify(config, null, 2);
}
