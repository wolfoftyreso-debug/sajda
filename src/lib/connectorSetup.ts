export { CONNECTOR_HOSTS, type ConnectorHost } from "../../shared/connector-catalogue.mjs";
export { connectorInstallUrl, connectorConfig } from "../../shared/connector-install.mjs";

export function publicMcpUrl(origin: string): string | null {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    // Native must use its configured HTTPS service, never capacitor://localhost.
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.includes(":") ||
      /^\d+(?:\.\d+){3}$/u.test(host) || !host.includes(".")) return null;
    return new URL("/api/mcp/public", url).href;
  } catch { return null; }
}

export function cursorMcpConfig(endpoint: string): string {
  return JSON.stringify({ mcpServers: { sajda: { url: endpoint } } }, null, 2);
}
