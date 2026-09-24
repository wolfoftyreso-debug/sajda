export type ConnectorHost = "chatgpt" | "claude" | "grok" | "perplexity" | "cursor" | "replit" | "lovable"
  | "codex" | "vscode" | "windsurf" | "cline" | "zed" | "gemini-cli";
export type ConnectorCategory = "assistant" | "builder" | "editor";
export type ConnectorInstallMethod = "review-link" | "settings" | "configuration";
export type ConnectorConfigKind = "none" | "mcpServers" | "vscode" | "codex" | "gemini" | "zed" | "windsurf" | "cline";
export interface ConnectorHostEntry {
  readonly id: ConnectorHost;
  readonly name: string;
  readonly category: ConnectorCategory;
  readonly documentation: string;
  readonly logo: string;
  readonly installMethod: ConnectorInstallMethod;
  readonly configKind: ConnectorConfigKind;
  readonly steps: readonly [string, string, string];
  readonly limitation: string;
  readonly reviewedAt: string;
}
export const CONNECTOR_REVIEWED_AT: "2026-09-24";
export const CONNECTOR_HOSTS: readonly ConnectorHostEntry[];
