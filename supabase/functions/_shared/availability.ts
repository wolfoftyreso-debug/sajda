/**
 * Conservatively map an authoritative RDAP HTTP response to an availability
 * state. A DNS response is intentionally not part of this decision: a domain
 * can be registered without an active DNS delegation.
 */
export type AuthoritativeAvailability = "available" | "taken" | "unknown";

export function availabilityFromRdapStatus(status: number): AuthoritativeAvailability {
  // RFC 9082 domain lookup: an absent domain is a 404. This is the only
  // affirmative availability result in the engine.
  if (status === 404) return "available";
  if (status >= 200 && status < 300) return "taken";
  return "unknown";
}
