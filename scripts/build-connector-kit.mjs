import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createConnectorZip } from "./connector-archive.mjs";
import { CONNECTOR_HOSTS, CONNECTOR_REVIEWED_AT } from "../shared/connector-catalogue.mjs";

export const CONNECTOR_KIT_FILES = [
  ".codex-plugin/plugin.json", ".mcp.json", "plugin.json", "mcp.json", "README.md",
  "skills/sajda-naming/SKILL.md", "skills/sajda-naming/agents/openai.yaml",
  "configs/cursor/mcp.json", "configs/cursor/sajda-naming.mdc", "configs/replit/install.json",
  "configs/replit/replit.md", "configs/lovable/project-instructions.md",
];
const POLICY_TEMPLATES = new Set(["configs/cursor/sajda-naming.mdc", "configs/replit/replit.md", "configs/lovable/project-instructions.md"]);

export async function buildConnectorKit(root, staticDirectory) {
  const source = resolve(root, "integrations/sajda-connector");
  const scan = async (directory, prefix = "") => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async item => {
    if (item.isSymbolicLink()) throw new Error("Symlinks are not permitted in connector distribution");
    const name = prefix + item.name;
    return item.isDirectory() ? scan(resolve(directory, item.name), name + "/") : [name];
  }))).flat();
  const actual = await scan(source);
  if (actual.some(file => !CONNECTOR_KIT_FILES.includes(file)) || actual.length !== CONNECTOR_KIT_FILES.length) throw new Error("Connector package contains missing or unreviewed source files");
  const compiled = await build({ entryPoints: [resolve(root, "shared/connector-policy.ts")], bundle: true, platform: "node", format: "esm", write: false });
  const policyModule = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64"));
  const { CONNECTOR_HOST_INSTRUCTIONS, CONNECTOR_POLICY, CONNECTOR_POLICY_VERSION } = policyModule;
  const entries = [];
  for (const name of CONNECTOR_KIT_FILES) {
    let data = await readFile(resolve(source, name), "utf8");
    if (POLICY_TEMPLATES.has(name)) {
      if (data.split("<!-- SAJDA_HOST_POLICY -->").length !== 2) throw new Error(`Missing canonical policy marker: ${name}`);
      data = data.replace("<!-- SAJDA_HOST_POLICY -->", CONNECTOR_HOST_INSTRUCTIONS);
    }
    if (/\[TODO:|<!-- SAJDA_HOST_POLICY -->/u.test(data)) throw new Error(`Unfinished connector file: ${name}`);
    entries.push({ name, data });
  }
  entries.push({ name: "HOST-INSTRUCTIONS.md", data: CONNECTOR_HOST_INSTRUCTIONS + "\n" },
    { name: "policy.json", data: JSON.stringify(CONNECTOR_POLICY, null, 2) + "\n" });
  const zip = createConnectorZip(entries), checksum = createHash("sha256").update(zip).digest("hex");
  await mkdir(resolve(staticDirectory, "downloads"), { recursive: true });
  await writeFile(resolve(staticDirectory, "downloads/sajda-connector.zip"), zip);
  await writeFile(resolve(staticDirectory, "downloads/sajda-connector.sha256"), `${checksum}  sajda-connector.zip\n`);
  await writeFile(resolve(staticDirectory, "host-instructions.txt"), CONNECTOR_HOST_INSTRUCTIONS + "\n");
  await writeFile(resolve(staticDirectory, "policy.json"), JSON.stringify(CONNECTOR_POLICY, null, 2));
  const manifest = {
    schema_version: "sajda.connector-distribution.v1", name: "Sajda", policy_version: CONNECTOR_POLICY_VERSION,
    transport: "streamable_http", endpoint: CONNECTOR_POLICY.endpoint, authentication: "none",
    setup_url: "https://sajda-connector.vercel.app/#setup", kit_url: "https://sajda-connector.vercel.app/downloads/sajda-connector.zip",
    kit_sha256: checksum, public_tools: ["business_names_recommend", "domains_suggest", "domains_check", "name_packages_search", "brand_index_assess", "brand_lookup"],
    prompts: ["sajda-naming-companion", "find-business-names"], resources: ["sajda://connector/guide", "sajda://connector/policy"],
    host_install_paths_documented: CONNECTOR_HOSTS.map(host => host.name),
    host_documentation_reviewed_at: CONNECTOR_REVIEWED_AT,
    account_access: { anonymous_private_access: false, public_endpoint_supports_accounts: false, oauth_available: false,
      instructions_url: "https://sajda-connector.vercel.app/#account", authentication: "separate_scoped_api_key" },
    host_install_e2e_verified: [], directory_approval: "not_claimed", background_chat_access: false,
  };
  await writeFile(resolve(staticDirectory, "connector.json"), JSON.stringify(manifest, null, 2));
  await writeFile(resolve(staticDirectory, "llms.txt"), `# Sajda naming intelligence\n\nPublic read-only MCP: ${CONNECTOR_POLICY.endpoint}\nTransport: Streamable HTTP. Authentication: none.\n\n- [Setup](https://sajda-connector.vercel.app/#setup)\n- [Capabilities](https://sajda-connector.vercel.app/connector.json)\n- [Opt-in host instructions](https://sajda-connector.vercel.app/host-instructions.txt)\n- [Policy](https://sajda-connector.vercel.app/policy.json)\n\nNo background access to chats. Ask before sending a business brief. Always disclose requested/returned counts, shortfall reasons and unverified evidence. No purchases or legal clearance.\n`);
  return { files: entries.map(entry => entry.name), bytes: zip.length, sha256: checksum };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  console.log(JSON.stringify(await buildConnectorKit(root, resolve(root, "tmp/connector-kit"))));
}
