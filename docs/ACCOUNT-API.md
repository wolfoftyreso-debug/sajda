# Scoped account REST API

Users can connect an AI assistant to their own Sajda account through the authenticated [MCP endpoint](MCP.md), or use the equivalent REST operations below. Both operate on the same account data as the website. An assistant can read saved domains, naming projects, membership and existing Trading reports, and can save changes only when the user has granted the matching permission.

The anonymous connector at `/api/mcp/public` exposes six public research tools and cannot read or change an account. The authenticated `/api/mcp` 1.9.0 catalogue has 27 tools, including account-owned brand reports and separate archived registry checks. Tool discovery describes implemented capabilities; it does not grant scopes, paid membership or access to another user's data. These are source contracts, not a claim that every client or deployed host is already connected.

## Saved brand assessments

Feature flag: `SAJDA_BRAND_REPORTS_ENABLED=true`, plus migration
`0022_brand_reports.sql` and a verified account. Disabled environments return 404.

| Intended action | REST query/method | Private MCP | Permission |
| --- | --- | --- | --- |
| List up to 50 report summaries | GET ?resource=brand-reports | brand_reports_list | projects:read |
| Read latest or an immutable version | GET ?resource=brand-reports&id=UUID[&version=N] | brand_reports_get | projects:read |
| List up to 100 versions | GET ?resource=brand-reports&id=UUID&history=true | brand_reports_history | projects:read |
| Save one version | POST ?resource=brand-reports with {report:…} | brand_reports_save | projects:write |

Save fields are `id`, `requestKey`, `expectedVersion`, `title`, and strict
`assessment` from the existing BrandIndexInput contract. Creation uses version
0; every intentional save uses a new UUID request key. Retry the *identical*
request after an unknown outcome. A late replay returns the original version,
not the current latest, and never overwrites a newer edit. Different content
under the same key conflicts. Stale updates conflict; foreign IDs disclose no
other account's records. Write-only keys receive only the affected report.

Only declared scope and user reports are stored. Original `reported_at` and
`source_url` survive saves, refreshes and later reads. `savedAt` means storage
time, not verification. Freshness is recomputed on retrieval; this is not the
score as originally evaluated at save time. `verified_score` stays null.
Browser-only registry-check rows are deliberately not imported as trusted
evidence. The separate server-check operation below can archive its own source
observations. No report save or read performs checks, establishes ownership,
grants legal clearance, or starts monitoring.

REST/browser save envelopes are limited to 64 KiB; private MCP still limits the
whole protocol request to 16 KiB. Capacity errors are explicit rather than
truncating history. The native account adapter supports the same feature
through its private bridge, not browser cookies or embedded API keys.

## Archived registry observations

Both `SAJDA_BRAND_REPORTS_ENABLED=true` and `SAJDA_BRAND_CHECKS_ENABLED=true`,
migrations `0022` and `0023`, and a verified account are required. Otherwise the
product handler returns 404. This is an explicit check, not continuous monitoring.

| Intended action | REST query/method | Private MCP | Permissions |
| --- | --- | --- | --- |
| Read archived source checks | GET ?resource=brand-checks&reportId=UUID[&version=N&offset=0&limit=10] | brand_checks_history | projects:read |
| Check the latest saved report's domain scope | POST ?resource=brand-checks with {reportId,expectedVersion,requestKey} | brand_checks_start | projects:write **and** domains:search |

POST fields are strict; each intentional check has a new UUID `requestKey`.
After an uncertain outcome, retry the identical request with the same key.
Receipt replay performs no second provider call, even if the report was edited
later. A new key requires the latest saved `expectedVersion`. One pending run
per report blocks another; read history to resolve it. An abandoned pending
receipt becomes `failed/check_interrupted` after five minutes, not a fabricated
completed check. A failed or completed receipt is immutable.

History returns `{accountId,runs,total,offset,limit,hasMore,requestId}`. A start
returns `{accountId,run,requestId}`. Runs distinguish `pending`, `completed` and
`failed`; `completed` means processing finished, not that every source succeeded.
Omitted `version` returns history across **all** saved versions; supply a version
to restrict it. Pagination defaults to 10, accepts 1–20, and exposes the remaining
count rather than silently truncating. Limits are 100 runs per report and 10 new
runs per account/environment per UTC day, including pending and failed attempts.

Only the exact domains in that immutable saved version are checked (maximum
20). Reviewed fixed RDAP sources cover `.com`, `.net`, `.org`, `.app`, `.dev`,
`.ai`, `.xyz`, `.info` and `.biz`; unsupported domains remain undated `unknown`.
Failures retain only legitimate original source dates and approved source URLs.
Reads recompute freshness without changing `observed_at`, `requestedAt` or
`completedAt`, and never fetch a registry. Observations expire after 30 minutes.
An RDAP availability observation is not a registrar reservation or purchase
guarantee. Checks do not modify user declarations or the self-assessment score;
`verified_score` remains null. Ownership, social handles, company names and
trademarks are not verified. Caller-supplied evidence or source URLs are rejected.

The REST envelope is capped at 4 KiB and the underlying handler at 1 KiB; the
usual complete MCP cap is 16 KiB. Web, native adapter, scoped REST and private MCP
share the same owner/environment-scoped handler and database history.

Endpoint: `/api/v1/account`. Every request requires `Authorization: Bearer <scoped-Sajda-key>`. Account identity and environment come from the verified key. Keep keys in server or integration secrets; website cookies and legacy operator search keys are not accepted here. Responses are private and never cached.

## Connect an assistant to an account

1. Sign in to the owning Sajda account, verify its email and create a scoped key in `/developers`.
2. Begin with only the reads the assistant needs: `account:read`, `saved:read`, `projects:read` and/or `trading:read`. Add `domains:search` for naming/domain research. New keys default to **only** `domains:search`; account reads are an explicit selection and no account writes are selected by default.
3. Store the key in the client's secret settings or a server environment variable. Configure the authenticated MCP URL `https://<your-sajda-host>/api/mcp` and a bearer header on every request. Never paste the token into a conversation, prompt, shared configuration, screenshot or repository.
4. Add `saved:write`, `projects:write` or `trading:write` only when the assistant should carry out user-requested saves. Research runs and quote refreshes require separate `trading:run` and `trading:quote` scopes. A write permission does not include read permission. Review each intended mutation and use the client's confirmation controls when available.
5. Set an expiry and revoke the key from the account when the connection is no longer needed. Every request rechecks the key; expiry and revocation apply to subsequent calls.

For example, “What have I saved?” needs `saved:read`; “Save example.com to my list” also needs `saved:write`. Asking about current membership needs `account:read`. A read-only conversation cannot start research or refresh a quote.

The current integration supports clients that can securely configure a bearer header. It does not implement MCP OAuth login or automatic setup in every AI platform. Use an externally reachable HTTPS deployment; a protected preview is not automatically reachable by an external assistant. Never put a preview-protection bypass secret in client setup.

## Resources and permissions

| Request | Scope | Input |
| --- | --- | --- |
| `GET ?resource=membership` | `account:read` | No additional fields. |
| `GET ?resource=saved-domains` | `saved:read` | Optional `cursor` from the previous page's `nextCursor`. |
| `POST ?resource=saved-domains` | `saved:write` | JSON `{domain, registrarPrice?, estimatedValue?, confidenceScore?, rationale?}`. |
| `DELETE ?resource=saved-domains` | `saved:write` | JSON `{domain}`. |
| `GET ?resource=name-projects` | `projects:read` | Read naming projects and saved package configurations. |
| `POST ?resource=name-projects` | `projects:write` | JSON `{project}` with a UUID `id` and `expectedVersion`. |
| `POST ?resource=social-profiles` | `social:check` | JSON `{handles:[...]}`; at most five distinct GitHub handles. Read-only observation. |
| `GET ?resource=trading-scenarios` | `trading:read` | Read the account's scenario journal with active Trading access. |
| `POST ?resource=trading-scenarios` | `trading:write` | JSON `{scenario}` with a UUID `id` and `expectedVersion`; active Trading access required. |
| `GET ?resource=trading-status` | `trading:read` | Run status and current access, without candidate details. |
| `GET ?resource=trading` | `trading:read` | Optional integer `offset` (0–10000), `limit` (1–100, default 25). |
| `POST ?resource=trading` | `trading:run` | JSON `{action:"start", requestKey}`. |
| `POST ?resource=trading` | `trading:run` | JSON `{action:"advance", runId}` or `{action:"cancel", runId}`. |
| `POST ?resource=trading` | `trading:quote` | JSON `{action:"refresh_quote", runId, domain, requestKey}`. |

All request bodies require `Content-Type: application/json`. The outer body limits are 8 KiB for saved domains and Trading actions, 32 KiB for projects, 16 KiB for scenarios and 4 KiB for social checks; the underlying Trading action limit is 1 KiB. The complete MCP message is limited to 16 KiB. Extra fields, extra query parameters, arrays in scalar query parameters, arbitrary owner IDs, unsupported actions and malformed UUIDs are rejected. Exact domain search remains at `/api/v1/domains`; account operations are not exposed by the legacy operator key. Full field schemas are available at `/api/openapi`; `/api/v1/capabilities` is a public implementation catalogue, not the current user's membership response.

Responses preserve the product handler's body and HTTP status. A successful membership response has `{accountId, requestId, membership}`; saved-list responses have `{items, nextCursor, requestId}`. A Trading report includes dated candidates, current run metadata, `totalCandidates` and `nextOffset`; status and mutation responses include run/access metadata without repeating every candidate. Expired membership cannot read a private Trading report. Scopes never substitute for active membership.

Project/scenario reads return the owner's collection. Their save responses contain only the affected item in `projects` or `scenarios`, so write-only keys cannot read unrelated private records. Use `expectedVersion: 0` for creation and the last returned version for an update. Retry an identical request after an uncertain failure; a version conflict requires a fresh authorized read. Project shortlist references must already belong to the same account's saved domains. Naming projects also require `SAJDA_NAME_PROJECTS_ENABLED=true` in the deployment. GitHub observations do not prove profile ownership or that an absent handle can be registered.

Account permissions are independent of the user's package. The current plan and capabilities come from the server on the membership read, and restricted operations repeat their live entitlement checks. Trading reports, scenarios, new research and quote refreshes retain their operation-specific Trading membership and budget requirements; an API key cannot upgrade a Free, Basic or Premium account. Feature flags, account verification, environment isolation and product quotas apply just as on the website. Newly added scopes require database migration `0020_agent_product_scopes.sql`; existing keys are not silently expanded.

Failures have `{code, error, requestId}`. Authentication uses 401 with `WWW-Authenticate: Bearer`; missing scope or entitlement is 403; invalid input is 400; unsupported methods are 405 with `Allow`; provider/database failures are 503. Throttling uses 429 and `Retry-After` when available. Correlation IDs are echoed in `X-Request-Id`. No provider secrets, SQL error messages or credential values are returned.

Start and quote requests require a UUID `requestKey`. Reuse it for retries of the same intended action, including after a timeout. Quote keys are bound to one run and domain. Saves upsert by owner/domain, and removing a missing saved domain succeeds. Each explicit `advance` can perform another work batch; it is not an idempotent status check. Reading membership, lists, status and reports never starts or advances Trading work.

All account integrations share the 120 requests/minute account key limit, and the existing product-specific limits remain active. The database, research engine, membership, saved-domain and quote handlers are the same ones used by the website and [MCP](MCP.md). There are no payment, purchase, automatic buying or billing modification actions.

Authentication, account deletion, key administration, billing and app-session management remain explicit account control-panel actions. This API does not expose a full account administration agent or change a user's subscription.

Example using a configured server secret:

```ts
const response = await fetch(`${process.env.SAJDA_BASE_URL}/api/v1/account?resource=membership`, {
  headers: { Authorization: `Bearer ${process.env.SAJDA_API_KEY}` },
});
const account = await response.json();
if (!response.ok) throw new Error(account.code);
```

Use HTTPS on a configured Sajda deployment. If sending an Origin header, it must match the request's configured host origin. No cross-origin CORS policy is enabled.
