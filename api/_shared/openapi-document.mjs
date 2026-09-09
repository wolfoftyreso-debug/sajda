/**
 * The public OpenAPI document is shared by the Vercel function and the local
 * full-app server. It is intentionally static and contains no deployment
 * configuration, API keys, tenant data, or provider credentials. Keep this
 * utility in _shared so Vercel does not expose it as a function entrypoint.
 */

const providerIds = [
  "loopia", "cloudflare", "godaddy", "namecheap", "porkbun", "dynadot", "route53", "onecom",
  "ionos", "ovhcloud", "squarespace", "hostinger", "gandi", "hover", "spaceship", "namecom",
  "namesilo", "alibabacloud", "internetbs", "wix",
];

const tlds = ["com", "net", "org", "app", "dev", "ai", "xyz", "info", "biz", "se", "nu"];

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Sajda Developer API",
    version: "1.0.0",
    description: [
      "A small public surface for bounded, registry-checked domain search and source-attributed domain-market context.",
      "Availability is confirmed only when a configured registry source returns authoritative evidence. A result marked unknown is not an availability claim.",
      "POST /api/v1/public/domains and GET public endpoints require no API key. POST /api/v1/domains is a protected server-to-server integration route.",
      "The self-service API-key control plane is being migrated to Neon-backed Vercel APIs. Until that release passes verification, POST /api/v1/domains is a protected compatibility route rather than a public self-service promise. Billing, marketplace transfers, and registrar credentials are not part of this API.",
    ].join(" "),
  },
  servers: [{ url: "/", description: "Same origin as the deployed Sajda application." }],
  tags: [
    { name: "Public domains", description: "Anonymous, CORS-enabled and rate-bounded domain search." },
    { name: "Integration domains", description: "Server-to-server domain search using a user-managed Sajda API key." },
    { name: "Developer keys", description: "Reserved for the Neon-backed, same-origin control plane; not enabled for new accounts yet." },
    { name: "Facts", description: "Read-only, source-attributed historical market context." },
  ],
  paths: {
    "/api/v1/public/domains": {
      post: {
        tags: ["Public domains"],
        summary: "Search domains without an API key",
        operationId: "searchPublicDomainsV1",
        security: [],
        description: "The stable public developer contract. It accepts a small, strict request body and shares the anonymous registry budget with Sajda's consumer search. It is suitable for prototypes and modest public integrations, not a paid or durable-quota service.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DomainsRequest" },
              examples: {
                exactChecks: {
                  summary: "Exact, audited domains",
                  value: {
                    domains: ["sajda.dev", "sajda.ai"],
                    tlds: ["dev", "ai"],
                    count: 2,
                    providers: ["loopia", "cloudflare"],
                  },
                },
                creativeSearch: {
                  summary: "A small domain search",
                  value: {
                    query: "calm scheduling for small clinics",
                    tlds: ["com", "dev"],
                    count: 10,
                    locale: "en",
                    creativeMode: "medium",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Search completed. Results may be available, taken, or unknown.",
            headers: {
              "X-Sajda-Public-Api-Version": { $ref: "#/components/headers/PublicApiVersion" },
              "X-Request-Id": { $ref: "#/components/headers/RequestId" },
              "X-RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
              "X-RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
              "X-RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
            },
            content: { "application/json": { schema: { $ref: "#/components/schemas/DomainsSearchResponse" } } },
          },
          "400": { $ref: "#/components/responses/PublicBadRequest" },
          "413": { $ref: "#/components/responses/PublicPayloadTooLarge" },
          "405": { $ref: "#/components/responses/PublicMethodNotAllowed" },
          "415": { $ref: "#/components/responses/PublicUnsupportedMediaType" },
          "429": { $ref: "#/components/responses/PublicRateLimited" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
      options: {
        tags: ["Public domains"],
        summary: "CORS preflight",
        operationId: "preflightPublicDomainsV1",
        security: [],
        responses: {
          "204": { description: "CORS preflight accepted for Content-Type: application/json." },
        },
      },
    },
    "/api/domain-search": {
      post: {
        tags: ["Public domains"],
        summary: "Anonymous consumer domain search route",
        operationId: "searchAnonymousProductDomains",
        security: [],
        description: "The public product route used by Sajda's own search UI. It is CORS-enabled and returns the same evidence model, but its richer UI request shape is not the stable developer contract. New integrations should use /api/v1/public/domains.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AnonymousProductSearchRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Search completed. Results may be available, taken, or unknown.",
            headers: {
              "X-Sajda-Public-Api-Version": { $ref: "#/components/headers/PublicApiVersion" },
              "X-Request-Id": { $ref: "#/components/headers/RequestId" },
              "X-RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
              "X-RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
              "X-RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
            },
            content: { "application/json": { schema: { $ref: "#/components/schemas/DomainsSearchResponse" } } },
          },
          "400": { $ref: "#/components/responses/PublicBadRequest" },
          "413": { $ref: "#/components/responses/PublicPayloadTooLarge" },
          "405": { $ref: "#/components/responses/PublicMethodNotAllowed" },
          "415": { $ref: "#/components/responses/PublicUnsupportedMediaType" },
          "429": { $ref: "#/components/responses/PublicRateLimited" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
      options: {
        tags: ["Public domains"],
        summary: "CORS preflight",
        operationId: "preflightAnonymousProductDomains",
        security: [],
        responses: {
          "204": { description: "CORS preflight accepted for Content-Type: application/json." },
        },
      },
    },
    "/api/openapi": {
      get: {
        tags: ["Public domains"],
        summary: "Read this OpenAPI document",
        operationId: "getOpenApiDocument",
        security: [],
        responses: {
          "200": {
            description: "The public OpenAPI 3.1 document.",
            headers: {
              "X-Sajda-Public-Api-Version": { $ref: "#/components/headers/PublicApiVersion" },
              "X-Request-Id": { $ref: "#/components/headers/RequestId" },
            },
            content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
          },
          "405": { $ref: "#/components/responses/PublicMethodNotAllowed" },
        },
      },
      options: {
        tags: ["Public domains"],
        summary: "CORS preflight",
        operationId: "preflightOpenApiDocument",
        security: [],
        responses: {
          "204": { description: "CORS preflight accepted." },
        },
      },
    },
    "/api/v1/domains": {
      post: {
        tags: ["Integration domains"],
        summary: "Search domains with registry verification",
        operationId: "searchDomainsV1",
        security: [{ SajdaApiKey: [] }],
        parameters: [
          {
            in: "header",
            name: "Authorization",
            required: true,
            schema: { type: "string", example: "Bearer YOUR_SERVER_SIDE_API_KEY" },
            description: "Use from a trusted server only. Do not place an API key in browser code or a public client.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DomainsRequest" },
              examples: {
                creativeSearch: {
                  summary: "A bounded domain search",
                  value: {
                    query: "quiet planning tools for teams",
                    tlds: ["com", "dev", "ai"],
                    count: 10,
                    locale: "en",
                    providers: ["loopia", "cloudflare", "spaceship"],
                    creativeMode: "medium",
                  },
                },
                exactChecks: {
                  summary: "Exact, supported domains",
                  value: {
                    domains: ["sajda.dev", "sajda.ai"],
                    tlds: ["dev", "ai"],
                    count: 2,
                    providers: ["loopia"],
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Search completed. Results may be available, taken, or unknown.",
            headers: {
              "X-Sajda-Api-Version": { schema: { type: "string", example: "v1" } },
              "X-Request-Id": { $ref: "#/components/headers/RequestId" },
              "X-RateLimit-Limit": { schema: { type: "integer", example: 4 } },
              "X-RateLimit-Remaining": { schema: { type: "integer", example: 3 } },
              "X-RateLimit-Reset": { schema: { type: "integer", description: "Unix seconds" } },
            },
            content: { "application/json": { schema: { $ref: "#/components/schemas/DomainsSearchResponse" } } },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "413": { $ref: "#/components/responses/PayloadTooLarge" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "405": { $ref: "#/components/responses/MethodNotAllowed" },
          "415": { $ref: "#/components/responses/UnsupportedMediaType" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/api/developer/api-keys": {
      get: {
        tags: ["Developer keys"],
        summary: "List your API key metadata",
        operationId: "listDeveloperApiKeys",
        security: [{ SajdaSession: [] }],
        description: "Returns only the authenticated user's safe key metadata. Raw API keys and stored hashes are never returned.",
        responses: {
          "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/DeveloperApiKeyListResponse" } } } },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "503": { $ref: "#/components/responses/ServerError" },
        },
      },
      post: {
        tags: ["Developer keys"],
        summary: "Create an API key",
        operationId: "createDeveloperApiKey",
        security: [{ SajdaSession: [] }],
        description: "Creates a 256-bit opaque key for the authenticated user. The complete `apiKey` value is returned exactly once in the 201 response; copy it to a trusted server and never place it in browser code or local storage.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DeveloperApiKeyCreateRequest" } } },
        },
        responses: {
          "201": { content: { "application/json": { schema: { $ref: "#/components/schemas/DeveloperApiKeyCreationResponse" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "409": { $ref: "#/components/responses/Conflict" },
          "413": { $ref: "#/components/responses/PayloadTooLarge" },
          "415": { $ref: "#/components/responses/UnsupportedMediaType" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "503": { $ref: "#/components/responses/ServerError" },
        },
      },
      delete: {
        tags: ["Developer keys"],
        summary: "Revoke an API key",
        operationId: "revokeDeveloperApiKey",
        security: [{ SajdaSession: [] }],
        description: "Immediately revokes one active key owned by the authenticated user. This cannot be undone; create a replacement key if needed.",
        parameters: [{
          in: "query",
          name: "id",
          required: true,
          schema: { type: "string", format: "uuid" },
        }],
        responses: {
          "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/DeveloperApiKeySingleResponse" } } } },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "503": { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/api/fact-signals": {
      get: {
        tags: ["Facts"],
        summary: "Read attributed domain-market context",
        operationId: "getFactSignals",
        description: "Returns only curated historical sale records and, when explicitly enabled server-side, a fixed NameBio aggregate TLD snapshot. It never returns current listings, appraisals, availability, or individual sales from paid data sources.",
        parameters: [
          {
            in: "query",
            name: "tld",
            required: false,
            schema: { type: "string", enum: tlds, default: "com" },
            description: "Optional extension for the fixed aggregate connector. It does not select a remote URL.",
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 10, default: 6 },
          },
        ],
        responses: {
          "200": {
            description: "Attributable historical facts and source status.",
            headers: {
              "X-Sajda-Public-Api-Version": { $ref: "#/components/headers/PublicApiVersion" },
              "X-Request-Id": { $ref: "#/components/headers/RequestId" },
            },
            content: { "application/json": { schema: { $ref: "#/components/schemas/FactSignalFeed" } } },
          },
          "400": { $ref: "#/components/responses/FactSignalBadRequest" },
          "405": { $ref: "#/components/responses/FactSignalMethodNotAllowed" },
        },
      },
      options: {
        tags: ["Facts"],
        summary: "CORS preflight",
        operationId: "preflightFactSignals",
        security: [],
        responses: {
          "204": { description: "CORS preflight accepted." },
        },
      },
    },
  },
  components: {
    headers: {
      PublicApiVersion: {
        description: "Calendar revision for the anonymous public API surface.",
        schema: { type: "string", example: "2026-08-25" },
      },
      RequestId: {
        description: "Server-generated correlation ID. Include it when reporting a request problem; callers cannot choose it.",
        schema: { type: "string", example: "req_U0f1eab2Cde3FgHi" },
      },
      RateLimitLimit: { schema: { type: "integer", example: 6 } },
      RateLimitRemaining: { schema: { type: "integer", example: 5 } },
      RateLimitReset: { schema: { type: "integer", description: "Unix seconds" } },
    },
    securitySchemes: {
      SajdaApiKey: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Sajda API key",
        description: "User-managed opaque server key. Sajda stores only its SHA-256 digest and safe display metadata; create it in the signed-in developer control plane and keep it out of browser code.",
      },
      SajdaSession: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Sajda user session",
        description: "Same-origin Sajda user session. Use only for the browser developer dashboard; never substitute it for an integration API key.",
      },
    },
    schemas: {
      DeveloperApiKeyMetadata: {
        type: "object",
        required: ["id", "name", "keyPrefix", "lastFour", "environment", "scopes", "createdAt", "lastUsedAt", "expiresAt", "revokedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string", maxLength: 80, example: "Production service" },
          keyPrefix: { type: "string", example: "sj_live_AbCdEfGhIjKlMnOp_" },
          lastFour: { type: "string", example: "Q8x_" },
          environment: { type: "string", enum: ["test", "live"] },
          scopes: { type: "array", items: { type: "string", enum: ["names:search"] } },
          createdAt: { type: "string", format: "date-time" },
          lastUsedAt: { type: ["string", "null"], format: "date-time" },
          expiresAt: { type: ["string", "null"], format: "date-time" },
          revokedAt: { type: ["string", "null"], format: "date-time" },
        },
        additionalProperties: false,
      },
      DeveloperApiKeyCreateRequest: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string", minLength: 1, maxLength: 80, example: "Production service" } },
      },
      DeveloperApiKeyListResponse: {
        type: "object",
        required: ["keys", "requestId"],
        properties: {
          keys: { type: "array", items: { $ref: "#/components/schemas/DeveloperApiKeyMetadata" } },
          requestId: { type: "string" },
        },
        additionalProperties: false,
      },
      DeveloperApiKeySingleResponse: {
        type: "object",
        required: ["key", "requestId"],
        properties: {
          key: { $ref: "#/components/schemas/DeveloperApiKeyMetadata" },
          requestId: { type: "string" },
        },
        additionalProperties: false,
      },
      DeveloperApiKeyCreationResponse: {
        type: "object",
        required: ["key", "apiKey", "requestId"],
        properties: {
          key: { $ref: "#/components/schemas/DeveloperApiKeyMetadata" },
          apiKey: { type: "string", pattern: "^sj_(?:test|live)_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$", writeOnly: true },
          requestId: { type: "string" },
        },
        additionalProperties: false,
      },
      DomainsRequest: {
        type: "object",
        additionalProperties: false,
        required: ["tlds"],
        properties: {
          query: { type: "string", maxLength: 100, description: "Optional domain direction. An empty query asks for broader domain directions." },
          domains: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            uniqueItems: true,
            description: "Optional exact checks. Every value must be a fully-qualified domain using one of the selected supported TLDs.",
            items: { type: "string", pattern: "^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.(?:com|net|org|app|dev|ai|xyz|info|biz|se|nu)$" },
          },
          tlds: {
            type: "array",
            minItems: 1,
            maxItems: 11,
            uniqueItems: true,
            items: { type: "string", enum: tlds },
          },
          count: { type: "integer", minimum: 1, maximum: 10, default: 10 },
          locale: { type: "string", enum: ["en", "sv", "es", "fr", "zh"], default: "en" },
          providers: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            uniqueItems: true,
            default: ["loopia"],
            items: { type: "string", enum: providerIds },
          },
          creativeMode: { type: "string", enum: ["light", "medium", "heavy", "deep"] },
        },
      },
      AnonymousProductSearchRequest: {
        type: "object",
        additionalProperties: true,
        required: ["tlds"],
        description: "Compatibility shape for Sajda's public consumer search. Only the documented v1 public endpoint offers a strict integration contract.",
        properties: {
          theme: { type: "string", maxLength: 100 },
          domains: { type: "array", minItems: 1, maxItems: 12, uniqueItems: true, items: { type: "string" } },
          tlds: { type: "array", minItems: 1, maxItems: 11, uniqueItems: true, items: { type: "string", enum: tlds } },
          count: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          locale: { type: "string", enum: ["en", "sv", "es", "fr", "zh"], default: "en" },
          providers: { type: "array", minItems: 1, maxItems: 20, uniqueItems: true, items: { type: "string", enum: providerIds } },
          creativeMode: { type: "string", enum: ["light", "medium", "heavy", "deep"] },
          advanced: { type: "boolean", default: false },
          brief: { type: "string", maxLength: 6000 },
          criteria: { type: "object", additionalProperties: true },
          swipe: { type: "boolean", default: false },
          minLength: { type: "integer", minimum: 3, maximum: 9 },
          maxLength: { type: "integer", minimum: 3, maximum: 9 },
        },
      },
      DomainsSearchResponse: {
        type: "object",
        required: ["engine", "locale", "checkedAt", "requested", "checked", "available", "unknown", "results"],
        properties: {
          engine: { type: "string", example: "vercel-public-registry-search" },
          locale: { type: "string", enum: ["en", "sv", "es", "fr", "zh"] },
          checkedAt: { type: "string", format: "date-time" },
          requested: { type: "integer" },
          checked: { type: "integer" },
          available: { type: "integer" },
          unknown: { type: "integer" },
          results: { type: "array", items: { $ref: "#/components/schemas/DomainResult" } },
        },
        additionalProperties: true,
      },
      DomainResult: {
        type: "object",
        required: ["domain", "tld", "status", "checkMethod", "source", "authoritative"],
        properties: {
          domain: { type: "string", example: "sajda.dev" },
          tld: { type: "string", example: "dev" },
          status: { type: "string", enum: ["available", "taken", "unknown"] },
          checkMethod: { type: "string", enum: ["rdap", "das", "none"] },
          source: { type: "string" },
          authoritative: { type: "boolean" },
          error: { type: "string" },
          registrarOffer: { type: "object", additionalProperties: true },
          registrarOffers: { type: "array", items: { type: "object", additionalProperties: true } },
        },
        additionalProperties: true,
      },
      FactSignalFeed: {
        type: "object",
        required: ["schemaVersion", "generatedAt", "requestedTld", "policy", "sources", "facts"],
        properties: {
          schemaVersion: { type: "string", example: "2026-08-24" },
          generatedAt: { type: "string", format: "date-time" },
          requestedTld: { type: "string", example: ".com" },
          policy: {
            type: "object",
            required: ["individualSales", "dynamicIndividualSales", "dynamicAggregate", "purpose"],
            properties: {
              individualSales: { type: "string", example: "curated primary-source records only" },
              dynamicIndividualSales: { type: "string", example: "not enabled" },
              dynamicAggregate: { type: "string", example: "fixed approved API only" },
              purpose: { type: "string" },
            },
          },
          sources: { type: "array", items: { $ref: "#/components/schemas/FactSignalSourceStatus" } },
          facts: { type: "array", items: { $ref: "#/components/schemas/FactSignal" } },
        },
        additionalProperties: false,
      },
      FactSignalSourceStatus: {
        type: "object",
        required: ["id", "status"],
        properties: {
          id: { type: "string", example: "namebio-tldstats" },
          status: { type: "string", enum: ["curated", "active", "disabled", "deferred", "unavailable"] },
          mode: { type: "string" },
          url: { type: "string", format: "uri" },
          detail: { type: "string" },
          cache: { type: "string", enum: ["hit", "miss"] },
          fetchedAt: { type: "string", format: "date-time" },
        },
        additionalProperties: false,
      },
      FactSignal: {
        type: "object",
        required: ["id", "type", "dataStatus", "verificationLevel", "assetScope", "sourceType", "reportedAt", "lastCheckedAt", "source", "caveat"],
        properties: {
          id: { type: "string", example: "reported-sale-voice-com-2019" },
          type: { type: "string", enum: ["reported_domain_sale", "tld_market_aggregate"] },
          dataStatus: { type: "string", enum: ["curated_primary_source", "approved_api_snapshot"] },
          domain: { type: "string", example: "voice.com" },
          amountUsd: { type: "integer", minimum: 0, example: 30000000 },
          saleDate: { type: "string", format: "date" },
          saleYear: { type: "integer", minimum: 1985 },
          reportedAt: { oneOf: [{ type: "string", format: "date" }, { type: "string", format: "date-time" }], description: "A source report or snapshot time." },
          lastCheckedAt: { oneOf: [{ type: "string", format: "date" }, { type: "string", format: "date-time" }], description: "Known source update or approved snapshot retrieval time." },
          verificationLevel: { type: "string", example: "primary_public_filing" },
          assetScope: { type: "string", example: "domain_only" },
          sourceType: { type: "string", example: "regulatory_filing" },
          source: { $ref: "#/components/schemas/FactSignalSource" },
          metrics: { type: "object", additionalProperties: { type: "number" } },
          caveat: { type: "string" },
        },
        additionalProperties: true,
      },
      FactSignalSource: {
        type: "object",
        required: ["id", "label", "url", "attribution"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          url: { type: "string", format: "uri" },
          sourceUpdatedAt: { type: "string", format: "date" },
          retrievedAt: { type: "string", format: "date-time" },
          attribution: { type: "string" },
        },
        additionalProperties: true,
      },
      Error: {
        type: "object",
        required: ["error", "code"],
        properties: {
          error: { type: "string" },
          code: { type: "string", example: "invalid_request" },
        },
        additionalProperties: false,
      },
    },
    responses: {
      BadRequest: { description: "Body is malformed or outside the v1 schema.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      PayloadTooLarge: { description: "The request body exceeds the v1 6 KiB limit.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      PublicBadRequest: { description: "Body is malformed, outside the public v1 schema, or includes an Authorization header.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      PublicPayloadTooLarge: { description: "The request body exceeds the public v1 6 KiB limit.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      PublicMethodNotAllowed: { description: "Only POST and CORS OPTIONS are supported.", headers: { Allow: { schema: { type: "string", example: "POST, OPTIONS" } } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      PublicUnsupportedMediaType: { description: "Content-Type must be application/json.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      PublicRateLimited: { description: "The best-effort, per-runtime public request budget was exceeded. This is not a paid or durable quota.", headers: { "Retry-After": { schema: { type: "integer" } }, "X-RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" }, "X-RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" }, "X-RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      FactSignalBadRequest: { description: "The TLD or limit is outside the bounded fact-signal query schema.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      FactSignalMethodNotAllowed: { description: "Only GET is supported.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      Unauthorized: { description: "The required API key or signed-in session is missing, invalid, or unavailable.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      Conflict: { description: "The requested state change conflicts with current key state or account limits.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      NotFound: { description: "The requested resource was not found for the authenticated caller.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      MethodNotAllowed: { description: "Only POST is supported.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      UnsupportedMediaType: { description: "Content-Type must be application/json.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      RateLimited: { description: "The per-key, in-memory bootstrap quota was exceeded.", headers: { "Retry-After": { schema: { type: "integer" } } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      ServerError: { description: "An unexpected server error occurred.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    },
  },
};
