/** Shared, deterministic rules used by the deployed and local search engines. */
export function asciiNameToken(value) {
  return value.toLowerCase()
    .replace(/æ/g, "ae").replace(/œ/g, "oe").replace(/ø/g, "o")
    .replace(/ß/g, "ss").replace(/ð/g, "d").replace(/þ/g, "th").replace(/ł/g, "l")
    .normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]/g, "");
}

/** Literal compounds must preserve spelling: eco + orbit is ecoorbit, not ecorbit. */
export function joinNameWords(left, right) {
  // Avoid tautologies such as guideguiden, planplanen, and repeated words.
  if (left && right && (left === right
    || (Math.min(left.length, right.length) >= 3 && Math.abs(left.length - right.length) <= 3
      && (left.startsWith(right) || right.startsWith(left))))) return "";
  return `${left || ""}${right || ""}`;
}

/** A spelling heuristic, not a probability, trademark clearance, or monetary value. */
export function nameQualitySignals(label) {
  if (!/^[a-z][a-z0-9-]{1,61}[a-z0-9]$/.test(label)) {
    return { score: 0, length: 0, pronunciation: 0, spelling: 0 };
  }
  const length = label.length <= 5 ? 35 : label.length <= 8 ? 32 : label.length <= 12 ? 25 : label.length <= 16 ? 16 : 8;
  const vowelRatio = (label.match(/[aeiouy]/g) ?? []).length / label.length;
  const runs = (label.match(/[^aeiouy\d-]+/g) ?? []).map((run) => run.length);
  const longestRun = Math.max(0, ...runs);
  const pronunciation = Math.max(0,
    (vowelRatio >= 0.25 && vowelRatio <= 0.6 ? 35 : vowelRatio >= 0.18 && vowelRatio <= 0.7 ? 22 : 8)
      - (longestRun >= 5 ? 20 : longestRun === 4 ? 8 : 0));
  const spelling = Math.max(0, 30 - (/\d/.test(label) ? 10 : 0) - (/-/.test(label) ? 8 : 0)
    - (/(.)\1\1/.test(label) ? 18 : 0) - (/[aeiouy]{4}/.test(label) ? 12 : 0));
  return { score: length + pronunciation + spelling, length, pronunciation, spelling };
}

/**
 * RFC 7480 §5.3 permits an empty 404 body. A nonempty body must be a coherent
 * RDAP error, never an HTML proxy error. A positive response must name the
 * exact requested object (RFC 9083 §5.3). Callers supply only audited HTTPS
 * registry responses and must not follow arbitrary redirects.
 * `available` means registry-not-found, not guaranteed registrability at checkout.
 */
export function interpretRdapResponse(status, contentType, text, domain) {
  if (!/^application\/(?:rdap\+json|json)(?:\s*;|$)/i.test(contentType ?? "")) return "unknown";
  if (status === 404 && text.trim() === "") return "available";
  let value;
  try { value = JSON.parse(text); } catch { return "unknown"; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "unknown";
  // CentralNic's authoritative .xyz error response explicitly identifies an
  // error object. It is still negative evidence, unlike a contradictory
  // domain object or a response that names an existing domain.
  if (status === 404 && value.errorCode === 404
    && (value.objectClassName === undefined || value.objectClassName === "error")
    && !value.ldhName) return "available";
  if (status === 200 && value.objectClassName === "domain" && !value.errorCode
    && typeof value.ldhName === "string" && value.ldhName.toLowerCase() === domain.toLowerCase()) return "taken";
  return "unknown";
}

/** RFC 7480 §5.5: stop querying a registry after 429 and honor Retry-After. */
export function registryRetryAt(retryAfter, now = Date.now()) {
  if (typeof retryAfter === "string" && /^\d+$/.test(retryAfter.trim())) {
    return now + Math.min(Number(retryAfter) * 1_000, 24 * 60 * 60_000);
  }
  const date = typeof retryAfter === "string" ? Date.parse(retryAfter) : NaN;
  if (Number.isFinite(date) && date > now) return Math.min(date, now + 24 * 60 * 60_000);
  return now + 60_000;
}

/** Bound decoded response bytes, including streamed/chunked responses. */
export async function readRegistryResponse(response, maximumBytes = 262_144) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel();
    throw new Error("Registry response exceeds limit");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new Error("Registry response exceeds limit");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
