import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const approvedDomain = "mail.sajda.com";
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const knownStatuses = new Set(["not_started", "pending", "verified", "failed", "temporary_failure"]);

/** Read-only provider preflight. Never sends mail, changes DNS or returns API
 * keys, provider bodies, recipient addresses or authentication links. A passing
 * result is configuration evidence, never an inbox-delivery or reset-flow test.
 */
export async function checkEmailReadiness({ environment = process.env, expectedDomain = approvedDomain,
  fetchImpl = fetch, wait = milliseconds => new Promise(done => setTimeout(done, milliseconds)) } = {}) {
  const result = { event: "email_provider_readiness", expectedDomain: approvedDomain,
    readiness: "blocked", delivery: "not_tested", issues: [], providerReads: 0, emailsSent: 0,
    providerDomainStatus: "unknown", sending: "unknown", openTracking: "unknown", clickTracking: "unknown" };
  const block = issue => { result.issues.push(issue); return result; };
  if (typeof expectedDomain !== "string" || !domainPattern.test(expectedDomain) || expectedDomain.length > 253) {
    return block("expected_sender_domain_invalid");
  }
  result.expectedDomain = expectedDomain;
  const apiKey = typeof environment?.RESEND_API_KEY === "string" ? environment.RESEND_API_KEY.trim() : "";
  if (!/^re_[A-Za-z0-9_-]{8,256}$/u.test(apiKey)) return block("email_key_unavailable");
  const from = typeof environment?.SAJDA_EMAIL_FROM === "string" ? environment.SAJDA_EMAIL_FROM.trim() : "";
  const address = /^Sajda <([^<>]+)>$/u.exec(from)?.[1] ?? from;
  const mailbox = /^([A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64})@([a-z0-9.-]+)$/iu.exec(address);
  if (!mailbox || from.length > 350 || mailbox[1].startsWith(".") || mailbox[1].endsWith(".")
    || mailbox[1].includes("..") || !domainPattern.test(mailbox[2].toLowerCase())) return block("email_sender_invalid");
  if (mailbox[2].toLowerCase() !== expectedDomain) return block("email_sender_domain_mismatch");

  async function providerGet(path) {
    // Default Resend accounts can enforce two requests per second. This is a
    // bounded operator check, not a high-frequency monitor or retry storm.
    if (result.providerReads > 0) await wait(600);
    result.providerReads += 1;
    try {
      const signal = AbortSignal.timeout(10_000);
      const response = await fetchImpl(`https://api.resend.com${path}`, {
        method: "GET", headers: { Authorization: `Bearer ${apiKey}` }, redirect: "error", signal,
      });
      if (!response.ok) {
        block([401, 403].includes(response.status) ? "provider_read_permission_denied"
          : response.status === 429 ? "provider_read_rate_limited" : "provider_read_failed");
        return null;
      }
      // Provider body is intentionally kept in this process and discarded.
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks = []; let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 131_072) { await reader.cancel(); throw new Error(); }
        chunks.push(value);
      }
      signal.throwIfAborted();
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        block("provider_response_invalid"); return null;
      }
      return body;
    } catch { block("provider_read_failed"); return null; }
  }

  let domain; let cursor; let complete = false;
  const cursors = new Set();
  for (let page = 0; page < 5; page += 1) {
    const body = await providerGet(`/domains?limit=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`);
    if (body === null) return result;
    if (body?.object !== "list" || !Array.isArray(body.data) || body.data.length > 100
      || typeof body.has_more !== "boolean" || body.data.some(item => !item || !uuidPattern.test(item.id ?? "")
        || typeof item.name !== "string" || !domainPattern.test(item.name.toLowerCase()))) return block("provider_response_invalid");
    const matches = body.data.filter(item => item.name.toLowerCase() === expectedDomain);
    if (matches.length > 1 || domain && matches.length) return block("sender_domain_ambiguous");
    if (matches.length) domain = matches[0];
    if (!body.has_more) { complete = true; break; }
    cursor = body.data.at(-1)?.id;
    if (!cursor || cursors.has(cursor)) return block("provider_pagination_invalid");
    cursors.add(cursor);
  }
  if (!complete) return block("provider_domain_list_incomplete");
  if (!domain) return block("sender_domain_not_registered");
  const detail = await providerGet(`/domains/${encodeURIComponent(domain.id)}`);
  if (detail === null) return result;
  if (detail?.id !== domain.id || typeof detail?.name !== "string" || detail.name.toLowerCase() !== expectedDomain
    || !knownStatuses.has(detail.status)) return block("provider_response_invalid");
  result.providerDomainStatus = detail.status;
  result.sending = ["enabled", "disabled"].includes(detail.capabilities?.sending) ? detail.capabilities.sending : "unknown";
  result.openTracking = typeof detail.open_tracking === "boolean" ? detail.open_tracking : "unknown";
  result.clickTracking = typeof detail.click_tracking === "boolean" ? detail.click_tracking : "unknown";
  if (detail.status !== "verified") block("sender_domain_not_verified");
  if (result.sending !== "enabled") block("sender_domain_sending_not_enabled");
  // Tracking rewrites can alter confidential one-use account links. Explicitly
  // false is required; missing settings are not proof of disabled tracking.
  if (result.openTracking !== false || result.clickTracking !== false) block("account_email_tracking_not_disabled");
  if (!result.issues.length) result.readiness = "provider_configuration_verified";
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error();
    const result = await checkEmailReadiness();
    console.log(JSON.stringify(result));
    if (result.readiness !== "provider_configuration_verified") process.exitCode = 1;
  } catch {
    // Raw errors may contain paths, credentials, provider bodies or user input.
    console.error("Email provider preflight failed: unexpected_failure");
    process.exitCode = 1;
  }
}
