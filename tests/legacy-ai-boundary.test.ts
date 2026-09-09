import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("legacy loopback server never bypasses the Vercel AI Gateway allowance", async () => {
  const source = await readFile(new URL("../infra/local-server/full-app-server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /OPENAI_|OpenAi|api\.openai\.com|AI_GATEWAY_API_KEY/u);
  assert.match(source, /briefAnalysis = localBriefAnalysis\(brief, locale\)/u);
  assert.match(source, /use npm run serve:qa/u);

  // Execute the actual legacy response functions without starting its server.
  const parsed = ts.createSourceFile("legacy.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = ["localBriefAnalysis", "handleLocalDeepReview"].map(name => {
    const declaration = parsed.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    assert.ok(declaration, `Missing ${name}`);
    return declaration.getText(parsed);
  }).join("\n");
  const top10 = [{ rank: 1, domain: "kaffeverk.com", score: 70 }];
  let sends = 0;
  let externalCalls = 0;
  const context = {
    extractLocalBriefThemes: () => ["kaffe"],
    joinLocalBriefThemes: (themes: string[]) => themes.join(", "),
    isLoopbackRequest: () => true,
    takeLocalDeepReviewQuota: () => true,
    readJson: async () => ({ candidates: [{ domain: "kaffeverk.com" }], theme: "kaffe" }),
    parseLocalDeepReviewCandidates: (value: unknown) => value,
    rankLocalDeepReview: () => top10,
    sendJson: (_response: unknown, status: number, body: { analysisSource: string; top10: unknown }) => {
      sends += 1;
      assert.equal(status, 200);
      assert.equal(body.analysisSource, "local");
      assert.equal(body.top10, top10);
    },
    fetch: () => { externalCalls += 1; throw new Error("External AI is forbidden in the legacy server"); },
  };
  const legacy = runInNewContext(`${functions}\n({ localBriefAnalysis, handleLocalDeepReview })`, context) as {
    localBriefAnalysis: (brief: string, locale: string) => { mode: string };
    handleLocalDeepReview: (request: object, response: object) => Promise<void>;
  };
  for (const locale of ["sv", "en", "es", "fr", "zh"]) {
    assert.equal(legacy.localBriefAnalysis("kaffe", locale).mode, "local");
  }
  await legacy.handleLocalDeepReview({}, {});
  assert.equal(sends, 1);
  assert.equal(externalCalls, 0);
});
