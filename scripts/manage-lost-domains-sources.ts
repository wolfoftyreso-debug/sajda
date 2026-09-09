import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { applySourceManifest, probeSourceManifest, sourceManifestHash, validateSourceManifest, SourceCatalogError } from "../api/_shared/lost-domains-source-catalog.js";
import { discoverIndexedSources, listSourceIndexCollections } from "../api/_shared/lost-domains-source-index.js";

const usage = `Source operator tool (no automatic grants, global switches or schedules).
  plan --manifest <reviewed.json>                     Local validation only.
  probe --manifest <reviewed.json> --network          Up to24 sequential live source/robots checks; no target investigation.
  register --manifest <reviewed.json> --apply --database-host <exact-host> --shared-catalog
                                                    Insert disabled sources; never overwrite existing records.
  enable --manifest <reviewed.json> --network --apply --database-host <exact-host> --shared-catalog
                                                    Fresh source/robots probe and enable only matching registered IDs.
  collections --network                             Up to5 current Common Crawl collection IDs.
  index --host <exact-host> --prefix </public/path/> --collection <CC-MAIN-YYYY-NN> --network
                                                    Up to10 historical source-page hints, no page/archive downloads.
Database commands require DATABASE_URL_UNPOOLED and exact hostname confirmation.
The source catalog is shared by all environments using that database. Review approval is the operator's responsibility.`;

export function sourceOperatorArguments(argv: string[]) {
  const [action = "help", ...rest] = argv;
  const values = new Map<string, string | boolean>();
  const flags = new Set(["--network", "--apply", "--shared-catalog"]);
  const options = new Set(["--manifest", "--database-host", "--host", "--prefix", "--collection"]);
  for (let index = 0; index < rest.length; index++) {
    const key = rest[index];
    if (values.has(key) || !flags.has(key) && !options.has(key)) throw new SourceCatalogError("invalid_arguments");
    if (flags.has(key)) values.set(key, true);
    else { const value = rest[++index]; if (!value || value.startsWith("--")) throw new SourceCatalogError("invalid_arguments"); values.set(key, value); }
  }
  const permitted: Record<string, string[]> = { help: [], plan: ["--manifest"], probe: ["--manifest", "--network"],
    register: ["--manifest", "--apply", "--database-host", "--shared-catalog"],
    enable: ["--manifest", "--apply", "--database-host", "--shared-catalog", "--network"],
    collections: ["--network"], index: ["--host", "--prefix", "--collection", "--network"] };
  const expected = permitted[action];
  if (!expected || [...values.keys()].some(key => !expected.includes(key)) || action !== "help" && expected.some(key => !values.has(key))) throw new SourceCatalogError("invalid_arguments");
  return { action, values };
}
export function sourceOperatorDatabase(env: NodeJS.ProcessEnv, expectedHost: string): string {
  let url: URL;
  try { url = new URL(env.DATABASE_URL_UNPOOLED ?? ""); } catch { throw new SourceCatalogError("database_not_configured"); }
  if (!expectedHost || url.hostname !== expectedHost || !["postgres:", "postgresql:"].includes(url.protocol)
    || !url.hostname.endsWith(".neon.tech") || url.hostname.includes("-pooler.") || !url.username || !url.password
    || url.pathname.length < 2 || url.hash || url.port && url.port !== "5432") throw new SourceCatalogError("database_target_mismatch");
  url.searchParams.set("sslmode", "verify-full"); url.searchParams.delete("options");
  return url.toString();
}
export async function runSourceOperator(argv: string[], env = process.env): Promise<unknown> {
  const { action, values } = sourceOperatorArguments(argv);
  if (action === "help") return { usage };
  if (action === "collections") return { collections: await listSourceIndexCollections(), sourcesRegistered: 0 };
  if (action === "index") return discoverIndexedSources({ host: String(values.get("--host")), pathPrefix: String(values.get("--prefix")), collection: String(values.get("--collection")) });
  const path = resolve(String(values.get("--manifest")));
  if ((await stat(path)).size > 131_072) throw new SourceCatalogError("manifest_too_large");
  const manifest = validateSourceManifest(JSON.parse(await readFile(path, "utf8")));
  if (action === "plan") return { action, manifestHash: sourceManifestHash(manifest), sources: manifest.sources.map(({ id, host, url }) => ({ id, host, url })), databaseWrites: false, networkCalls: 0 };
  if (action === "probe") return { action, probes: await probeSourceManifest(manifest), databaseWrites: false };
  const pool = new Pool({ connectionString: sourceOperatorDatabase(env, String(values.get("--database-host"))), max: 1,
    connectionTimeoutMillis: 3_000, query_timeout: 5_000, idleTimeoutMillis: 5_000, allowExitOnIdle: true });
  pool.on("error", () => console.error(JSON.stringify({ event: "source_catalog_database_error" })));
  try { return await applySourceManifest(manifest, action as "register" | "enable", pool); }
  finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runSourceOperator(process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(JSON.stringify({ state: "stopped", code: error instanceof SourceCatalogError ? error.code : "source_operation_unavailable",
      note: "No grants, billing or schedules are changed. Inspect the command, policy review and confirmed database target before retrying." }));
    process.exitCode = 1;
  });
}
