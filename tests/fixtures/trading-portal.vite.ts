import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";

const fixtureRoot = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const transportPath = normalizePath(fileURLToPath(new URL("../../src/lib/tradingScenarios.ts", import.meta.url)));
const authContextPath = normalizePath(fileURLToPath(new URL("../../src/contexts/AuthContext.tsx", import.meta.url)));
const schemaPath = "/@fs/" + normalizePath(fileURLToPath(new URL("../../shared/trading-scenarios.ts", import.meta.url)));

// This replacement exists only in this loopback-only, serve-only visual test config.
// The real component and all its business calculations remain unchanged.
function simulatedScenarioTransport(): Plugin {
  return {
    name: "local-trading-portal-fixture-only",
    enforce: "pre",
    configResolved(config) {
      if (config.command !== "serve" || config.isProduction || config.server.host !== "127.0.0.1" || config.server.port !== 8188) {
        throw new Error("Trading portal fixture is restricted to development at 127.0.0.1:8188.");
      }
    },
    configureServer(server) {
      // Only this fixture's second client route has an HTML fallback. Reloading
      // it never loads the product entrypoint or a real account provider.
      server.middlewares.use((request, _response, next) => {
        if (request.url?.split("?")[0] === "/fixture-away") request.url = request.url.replace("/fixture-away", "/trading-portal-preview.html");
        next();
      });
    },
    load(id) {
      const file = normalizePath(id.split("?")[0]);
      if (file === authContextPath) return `
        const fixtureAuth = { user: { id: 'local-trading-fixture' }, loading: false };
        export const useAuth = () => fixtureAuth;
      `;
      if (file !== transportPath) return null;
      return `
        import { z } from 'zod';
        import { tradingScenarioInputSchema, tradingScenarioSchema } from ${JSON.stringify(schemaPath)};
        const fixtureAccountId = 'local-trading-fixture';
        const store = new Map();
        const responseSchema = z.object({
          accountId: z.literal(fixtureAccountId),
          requestId: z.string().regex(/^req_[A-Za-z0-9_-]{16}$/u),
          scenarios: z.array(tradingScenarioSchema).max(100),
        }).strict();
        export class TradingScenariosError extends Error {
          constructor(code, requestId) { super(code); this.name = 'TradingScenariosError'; this.code = code; this.requestId = requestId; }
        }
        function guard(scope) {
          if (scope.signal?.aborted) throw new DOMException('Fixture request cancelled', 'AbortError');
          if (!scope.accountId) throw new TradingScenariosError('unauthenticated');
          if (scope.accountId !== fixtureAccountId) throw new TradingScenariosError('account_changed');
        }
        async function pause(scope) {
          guard(scope);
          await new Promise(resolve => setTimeout(resolve, 200));
          guard(scope);
        }
        function snapshot(scope) {
          guard(scope);
          return responseSchema.parse({
            accountId: scope.accountId,
            requestId: 'req_0123456789abcdef',
            scenarios: [...store.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          });
        }
        export async function getTradingScenarios(scope) {
          await pause(scope);
          return snapshot(scope);
        }
        export async function saveTradingScenario(scope, input) {
          await pause(scope);
          const parsed = tradingScenarioInputSchema.safeParse(input);
          if (!parsed.success) throw new TradingScenariosError('invalid');
          const { expectedVersion, ...values } = parsed.data;
          const prior = store.get(values.id);
          if ((prior?.version ?? 0) !== expectedVersion) throw new TradingScenariosError('conflict');
          if (!prior && store.size >= 100) throw new TradingScenariosError('limit');
          const at = new Date().toISOString();
          const row = tradingScenarioSchema.parse({
            ...values, version: (prior?.version ?? 0) + 1,
            createdAt: prior?.createdAt ?? at, updatedAt: at,
          });
          guard(scope);
          store.set(row.id, row);
          return snapshot(scope);
        }
      `;
    },
  };
}

export default defineConfig(({ command }) => {
  if (command !== "serve") throw new Error("LOCAL UI FIXTURE: building or deploying simulated data is prohibited.");
  return {
    root: fixtureRoot,
    publicDir: false,
    appType: "mpa",
    envDir: false,
    plugins: [simulatedScenarioTransport(), react()],
    resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
    css: { postcss: projectRoot },
    server: {
      host: "127.0.0.1",
      port: 8188,
      strictPort: true,
      hmr: false,
      cors: false,
      fs: { strict: true, allow: [projectRoot] },
      headers: {
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      },
    },
  };
});
