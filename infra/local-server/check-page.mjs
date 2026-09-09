import { readFile } from "node:fs/promises";

const sourceUrl = new URL("./server.mjs", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const scriptStart = source.indexOf("<script>");
const scriptEnd = source.indexOf("</script>", scriptStart);

if (scriptStart < 0 || scriptEnd < 0) {
  throw new Error("Could not locate the local-search page script.");
}

// Compile without executing the page script. This catches browser-only syntax
// errors that `node --check server.mjs` cannot see inside the HTML template.
new Function(source.slice(scriptStart + "<script>".length, scriptEnd));
console.log("Local search page script: OK");
