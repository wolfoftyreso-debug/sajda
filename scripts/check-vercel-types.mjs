import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const files = (await readdir(resolve(projectRoot, "api"), { recursive: true }))
  .filter(name => name.endsWith(".ts")).map(name => resolve(projectRoot, "api", name));
const result = spawnSync(process.execPath, [resolve(projectRoot, "node_modules/typescript/bin/tsc"),
  "--noEmit", "--target", "ES2022", "--lib", "ES2023,DOM", "--module", "NodeNext",
  "--moduleResolution", "NodeNext", "--skipLibCheck", "--types", "node", ...files],
{ cwd: projectRoot, stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
