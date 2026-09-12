/** Dedicated public deployment. There are deliberately no private routes. */
import type { IncomingMessage, ServerResponse } from "node:http";
import publicMcp from "../../api/mcp/public.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const path = (req.url || "").split("?")[0];
  if (path !== "/api/mcp/public") {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }
  await publicMcp(req, res);
}
