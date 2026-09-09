import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { request as httpsRequest, RequestOptions } from "node:https";
import { createSafeFetcher, createPinnedRequester, isPublicAddress, safeHttpsUrl, LostDomainsFetchError,
  type PinnedRequest, type PublicAddress } from "../api/_shared/lost-domains-fetch";

const publicIp: PublicAddress = { address: "93.184.216.34", family: 4 };
const failure = (code: string) => (error: unknown) => error instanceof LostDomainsFetchError && error.code === code;
const ok = (url = "https://example.com/", body = "ok") => ({ url, status: 200, headers: { "content-type": "text/plain" }, body });

test("public IP classifier rejects special IPv4/IPv6 and accepts ordinary public addresses", () => {
  for (const address of ["0.0.0.0", "10.0.0.1", "100.64.0.1", "100.127.255.254", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.1", "192.88.99.1", "192.168.1.1", "198.18.0.1",
    "198.19.255.255", "198.51.100.2", "203.0.113.7", "224.0.0.1", "255.255.255.255", "::", "::1", "fc00::1",
    "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "64:ff9b::0808:0808", "2001::1", "2001:db8::1",
    "2001:20::1", "2002:0808:0808::1", "3ffe::1", "3fff:1::1", "fe80::1%eth0", "garbage"]) assert.equal(isPublicAddress(address), false, address);
  for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.1.1", "172.32.1.1", "2606:4700:4700::1111", "2001:4860:4860::8888"]) assert.equal(isPublicAddress(address), true, address);
});

test("URL validation rejects alternate schemes, credentials, ports, literals and local names", () => {
  for (const url of ["http://example.com/", "https://a:b@example.com/", "https://example.com:8443/", "https://127.0.0.1/",
    "https://2130706433/", "https://0x7f000001/", "https://[::1]/", "https://localhost/", "https://x.internal/",
    "https://x.local/", "https://example.com./", "https://-x.com/", "https://example.com\\@127.0.0.1/",
    "https://example.com/\n", "ftp://example.com/", "file:///tmp/file", "https://example.com/" + "x".repeat(2048)]) assert.throws(() => safeHttpsUrl(url), failure("invalid_url"), url);
  assert.equal(safeHttpsUrl("https://example.com:443/a#fragment").href, "https://example.com/a");
});

test("all DNS answers are screened and transport receives the pinned public answer", async () => {
  let sent = 0;
  for (const answers of [[], [publicIp, { address: "127.0.0.1", family: 4 }], [{ address: "169.254.169.254", family: 4 }],
    [{ address: "8.8.8.8", family: 6 }]] as PublicAddress[][]) {
    const fetch = createSafeFetcher({ lookup: async () => answers, transport: async () => { sent++; return ok(); } });
    await assert.rejects(fetch("https://example.com/"), failure("blocked_address"));
  }
  assert.equal(sent, 0);
  let lookups = 0;
  const fetch = createSafeFetcher({ lookup: async () => { lookups++; return [publicIp]; }, transport: async input => {
    assert.deepEqual(input.address, publicIp); sent++; return ok(input.url.href);
  } });
  assert.equal((await fetch("https://example.com/")).status, 200); assert.equal(lookups, 1); assert.equal(sent, 1);
});

test("every redirect is revalidated; private destinations, loops, and downgrade fail closed", async () => {
  for (const location of ["http://example.com/", "https://127.0.0.1/", "https://a:b@example.com/", "https://example.com:444/"]) {
    let sends = 0;
    const fetch = createSafeFetcher({ lookup: async () => [publicIp], transport: async () => {
      sends++; return { ...ok(), status: 302, headers: { location } };
    } });
    await assert.rejects(fetch("https://example.com/")); assert.equal(sends, 1);
  }
  const visited: string[] = [];
  const fetch = createSafeFetcher({ lookup: async hostname => hostname === "other.com" ? [{ address: "10.0.0.2", family: 4 }] : [publicIp],
    transport: async input => { visited.push(input.url.hostname); return { ...ok(), status: 302, headers: { location: "https://other.com/" } }; } });
  await assert.rejects(fetch("https://example.com/"), failure("blocked_address")); assert.deepEqual(visited, ["example.com"]);
  const loop = createSafeFetcher({ lookup: async () => [publicIp], transport: async () => ({ ...ok(), status: 301, headers: { location: "/" } }) });
  await assert.rejects(loop("https://example.com/"), failure("redirect_limit"));
});

test("approved host and per-hop robot guards run before destination requests", async () => {
  const guarded: string[] = [], sent: string[] = [];
  const fetch = createSafeFetcher({ lookup: async () => [publicIp], transport: async input => {
    sent.push(input.url.href); return input.url.pathname === "/" ? { ...ok(), status: 302, headers: { location: "/allowed" } } : ok(input.url.href);
  } });
  await fetch("https://example.com/", { allowedHosts: ["example.com"], beforeRequest: async url => { guarded.push(url.href); } });
  assert.deepEqual(guarded, ["https://example.com/", "https://example.com/allowed"]); assert.deepEqual(sent, guarded);
  await assert.rejects(fetch("https://example.com/", { allowedHosts: ["other.com"] }), failure("invalid_url"));
});

test("DNS, body and redirects share bounded deadlines and external abort", async () => {
  const never = new Promise<PublicAddress[]>(() => {});
  const blockedDns = createSafeFetcher({ lookup: () => never, transport: async () => { throw new Error("Should not connect"); } });
  const controller = new AbortController();
  const pending = blockedDns("https://example.com/", { signal: controller.signal }); controller.abort();
  await assert.rejects(pending, failure("aborted"));
  await assert.rejects(blockedDns("https://example.com/", { deadline: Date.now() - 1 }), failure("timeout"));
  let clock = 1000;
  const timed = createSafeFetcher({ now: () => clock, lookup: async () => [publicIp], transport: async () => {
    clock += 100; return { ...ok(), status: 302, headers: { location: "/next" } };
  } });
  // Loop/destination budgets do not permit an unbounded chain.
  await assert.rejects(timed("https://example.com/", { deadline: 1100, maxRedirects: 0 }), failure("redirect_limit"));
});

test("pinned HTTPS transport verifies TLS/SNI, disables cookies/compression and bounds streamed bytes", async () => {
  async function run(body: string, maxBytes: number, headers: Record<string, string> = {}) {
    let captured: RequestOptions | undefined;
    const fake = ((_url: URL, options: RequestOptions, callback: (response: unknown) => void) => {
      captured = options;
      const request = Object.assign(new EventEmitter(), {
        destroy() { this.emit("close"); return this; },
        end() {
          queueMicrotask(() => {
            const response = Object.assign(new PassThrough(), { statusCode: 200, complete: true, headers });
            callback(response); response.end(Buffer.from(body));
          });
          return this;
        },
      });
      return request;
    }) as unknown as typeof httpsRequest;
    const promise = createPinnedRequester(fake)({ url: new URL("https://example.com/a"), address: publicIp, maxBytes,
      signal: new AbortController().signal, accept: "text/plain" });
    return { promise, options: captured! };
  }
  const result = await run("ok", 3);
  assert.equal((await result.promise).body, "ok");
  assert.equal(result.options.agent, false); assert.equal(result.options.rejectUnauthorized, true);
  assert.equal(result.options.servername, "example.com"); assert.equal(result.options.family, 4);
  assert.equal((result.options.headers as Record<string, string>)["Accept-Encoding"], "identity");
  assert.equal(Object.keys(result.options.headers!).some(key => /cookie|authorization|referer/iu.test(key)), false);
  const pinned = await new Promise((resolve, reject) => result.options.lookup!("rebind.example.com", {}, (error, address, family) => error ? reject(error) : resolve({ address, family })));
  assert.deepEqual(pinned, publicIp);
  await assert.rejects((await run("oversize", 3)).promise, failure("response_too_large"));
  await assert.rejects((await run("ok", 3, { "content-length": "100" })).promise, failure("response_too_large"));
  await assert.rejects((await run("ok", 3, { "content-encoding": "gzip" })).promise, failure("unsupported_encoding"));
});

test("decoded limit and safe errors are enforced even with test transport", async () => {
  const large = createSafeFetcher({ lookup: async () => [publicIp], transport: async () => ok(undefined, "😀😀") });
  await assert.rejects(large("https://example.com/", { maxBytes: 4 }), failure("response_too_large"));
  const broken = createSafeFetcher({ lookup: async () => [publicIp], transport: async () => { throw new Error("secret password https://internal/"); } });
  await assert.rejects(broken("https://example.com/"), error => failure("network_unavailable")(error) && !String(error).includes("secret"));
});
