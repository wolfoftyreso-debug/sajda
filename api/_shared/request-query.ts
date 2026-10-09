export interface RequestUrlQueryLike {
  url?: string;
  query?: unknown;
}

/**
 * Reads query parameters without evaluating Vercel's legacy `request.query`
 * accessor, which currently delegates to Node's deprecated `url.parse()`.
 * Local adapters and unit tests may still provide a plain own data property.
 */
export function readRequestQuery(request: RequestUrlQueryLike): Record<string, unknown> {
  if (typeof request.url === "string" && request.url.length > 0) {
    const result: Record<string, unknown> = {};
    const params = new URL(request.url, "https://sajda.invalid").searchParams;
    for (const key of new Set(params.keys())) {
      const values = params.getAll(key);
      result[key] = values.length === 1 ? values[0] : values;
    }
    return result;
  }
  const descriptor = Object.getOwnPropertyDescriptor(request, "query");
  if (!descriptor || !("value" in descriptor) || descriptor.value == null) return {};
  if (typeof descriptor.value !== "object" || Array.isArray(descriptor.value)) {
    return { "": descriptor.value };
  }
  return { ...(descriptor.value as Record<string, unknown>) };
}

export function hasRequestQueryParameters(request: RequestUrlQueryLike): boolean {
  return Object.keys(readRequestQuery(request)).length > 0;
}
