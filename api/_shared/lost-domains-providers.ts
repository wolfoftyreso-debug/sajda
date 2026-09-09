import { getNeonSql } from "./neon.js";

const registryHosts = new Set(["rdap.verisign.com", "rdap.publicinterestregistry.org", "pubapi.registry.google",
  "rdap.identitydigital.services", "rdap.centralnic.com", "rdap.nic.biz"]);
function providerKey(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || !registryHosts.has(url.hostname) || url.port || url.username || url.password) {
    throw new Error("Unknown registry provider");
  }
  // Different TLD endpoints at the same host share a single throttle.
  return url.origin;
}
export async function permitLostRegistry(endpoint: string): Promise<boolean> {
  const rows = await getNeonSql().query(`
    INSERT INTO sajda.lost_domain_provider_backoff (provider, blocked_until)
    VALUES ($1, statement_timestamp() + interval '1 second')
    ON CONFLICT (provider) DO UPDATE
      SET blocked_until = statement_timestamp() + interval '1 second', updated_at = statement_timestamp()
      WHERE sajda.lost_domain_provider_backoff.blocked_until <= statement_timestamp()
    RETURNING provider
  `, [providerKey(endpoint)], { fetchOptions: { signal: AbortSignal.timeout(2_000) } });
  return rows.length === 1;
}
export async function deferLostRegistry(endpoint: string, retryAt: number): Promise<void> {
  if (!Number.isFinite(retryAt) || retryAt < 0 || retryAt > 8.64e15) throw new Error("Invalid registry backoff");
  await getNeonSql().query(`
    INSERT INTO sajda.lost_domain_provider_backoff (provider, blocked_until)
    VALUES ($1, GREATEST($2::timestamptz, statement_timestamp() + interval '30 seconds'))
    ON CONFLICT (provider) DO UPDATE
      SET blocked_until = GREATEST(sajda.lost_domain_provider_backoff.blocked_until, EXCLUDED.blocked_until),
          updated_at = statement_timestamp()
  `, [providerKey(endpoint), new Date(retryAt).toISOString()], { fetchOptions: { signal: AbortSignal.timeout(2_000) } });
}

export async function lostRegistryRetryAt(endpoint: string): Promise<string | null> {
  const rows = await getNeonSql().query(`
    SELECT blocked_until FROM sajda.lost_domain_provider_backoff
    WHERE provider = $1 AND blocked_until > statement_timestamp()
  `, [providerKey(endpoint)], { fetchOptions: { signal: AbortSignal.timeout(2_000) } });
  if (!rows.length) return null;
  const value = new Date(String(rows[0].blocked_until));
  if (!Number.isFinite(value.getTime())) throw new Error("Invalid registry cooldown");
  return value.toISOString();
}

const ARCHIVE_PROVIDER = "https://index.commoncrawl.org";
function archiveSignal(parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(2_000);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

/** Fixed-provider gate shared across cold workers. No caller-selected endpoint. */
export async function permitLostArchive(signal?: AbortSignal): Promise<boolean> {
  const rows = await getNeonSql().query(`
    INSERT INTO sajda.lost_domain_provider_backoff (provider, blocked_until)
    VALUES ($1, statement_timestamp() + interval '1 second')
    ON CONFLICT (provider) DO UPDATE
      SET blocked_until = statement_timestamp() + interval '1 second', updated_at = statement_timestamp()
      WHERE sajda.lost_domain_provider_backoff.blocked_until <= statement_timestamp()
    RETURNING provider
  `, [ARCHIVE_PROVIDER], { fetchOptions: { signal: archiveSignal(signal) } });
  return rows.length === 1;
}

/** Common Crawl asks for a 24-hour pause when blocked. A later gate cannot shorten it. */
export async function deferLostArchive(retryAt: number, signal?: AbortSignal): Promise<void> {
  if (!Number.isFinite(retryAt) || retryAt < 0 || retryAt > 8.64e15) throw new Error("Invalid archive backoff");
  await getNeonSql().query(`
    INSERT INTO sajda.lost_domain_provider_backoff (provider, blocked_until)
    VALUES ($1, GREATEST($2::timestamptz, statement_timestamp() + interval '24 hours'))
    ON CONFLICT (provider) DO UPDATE
      SET blocked_until = GREATEST(sajda.lost_domain_provider_backoff.blocked_until, EXCLUDED.blocked_until),
          updated_at = statement_timestamp()
  `, [ARCHIVE_PROVIDER, new Date(retryAt).toISOString()], { fetchOptions: { signal: archiveSignal(signal) } });
}

const REGISTRAR_PROVIDER = "https://api.porkbun.com/api/json/v3/domain/checkDomain";
/** The account-level limit is shared by all workers/environments using this database. */
export async function permitLostRegistrar(signal?: AbortSignal): Promise<boolean> {
  const rows = await getNeonSql().query(`
    INSERT INTO sajda.lost_domain_provider_backoff (provider, blocked_until)
    VALUES ($1, statement_timestamp() + interval '10 seconds')
    ON CONFLICT (provider) DO UPDATE
      SET blocked_until = statement_timestamp() + interval '10 seconds', updated_at = statement_timestamp()
      WHERE sajda.lost_domain_provider_backoff.blocked_until <= statement_timestamp()
    RETURNING provider
  `, [REGISTRAR_PROVIDER], { fetchOptions: { signal: archiveSignal(signal) } });
  return rows.length === 1;
}

export async function deferLostRegistrar(retryAt: number, signal?: AbortSignal): Promise<void> {
  if (!Number.isFinite(retryAt) || retryAt < 0 || retryAt > 8.64e15) throw new Error("Invalid registrar backoff");
  await getNeonSql().query(`
    INSERT INTO sajda.lost_domain_provider_backoff (provider, blocked_until)
    VALUES ($1, GREATEST($2::timestamptz, statement_timestamp() + interval '10 seconds'))
    ON CONFLICT (provider) DO UPDATE
      SET blocked_until = GREATEST(sajda.lost_domain_provider_backoff.blocked_until, EXCLUDED.blocked_until),
          updated_at = statement_timestamp()
  `, [REGISTRAR_PROVIDER, new Date(retryAt).toISOString()], { fetchOptions: { signal: archiveSignal(signal) } });
}
