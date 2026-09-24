import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const BUSINESS_NAMES_RESULT_INSTRUCTIONS = "For business_names_recommend, prominently show result_summary.headline and explanation BEFORE the recommendations, including requested versus returned counts, why any candidates were excluded and the next steps. Preserve the distinction between taken and unknown, stale or incomplete checks. Never call a partial result a complete top ten, hide the shortfall, pad the list or invent checks. Use the supplied next-step labels; do not promise that retrying will produce the missing names.";

/** Human-readable product context comes first; the exact machine envelope is
 * retained as the last text block as well as structuredContent by the caller. */
export function mcpResultContent(envelope: Record<string, unknown>, explainSearchResult = false): CallToolResult["content"] {
  const content: CallToolResult["content"] = [];
  const data = envelope.ok === true && envelope.data && typeof envelope.data === "object"
    ? envelope.data as Record<string, unknown> : null;
  const summary = explainSearchResult && data?.result_summary && typeof data.result_summary === "object"
    ? data.result_summary as Record<string, unknown> : null;
  if (summary && typeof summary.headline === "string" && typeof summary.explanation === "string") {
    const nextSteps = Array.isArray(summary.next_steps) ? summary.next_steps.flatMap(step =>
      step && typeof step === "object" && typeof step.label === "string" ? [`• ${step.label}`] : []) : [];
    content.push({ type: "text", text: [summary.headline, summary.explanation, ...nextSteps].filter(Boolean).join("\n\n") });
  }
  content.push({ type: "text", text: JSON.stringify(envelope) });
  return content;
}
