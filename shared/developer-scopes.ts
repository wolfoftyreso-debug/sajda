/** Public permission names only. No credentials or server dependencies. */
export const DEVELOPER_API_SCOPES = [
  "domains:search", "account:read", "saved:read", "saved:write",
  "trading:read", "trading:run", "trading:quote",
  "projects:read", "projects:write", "social:check", "trading:write",
] as const;
