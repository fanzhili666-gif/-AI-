"use strict";

const assert = require("node:assert/strict");
const { normalizeAiResult, validateAiResult } = require("../src/ai-result");

const result = normalizeAiResult({
  intent: "create_ticket",
  summary: "三号泵压力异常",
  entities: { device: "三号泵", issue: "压力偏高", owner: null },
  view: { projection: ["device", "issue"], highlight: true },
  needs_confirmation: true,
  missing_fields: ["owner"],
});
assert.equal(result.processor, "ai");
assert.deepEqual(result.view.projection, ["device", "issue"]);
assert.equal(result.needs_confirmation, true);

assert.throws(
  () => validateAiResult({ intent: "delete_everything" }),
  /未知 intent/,
);
assert.throws(
  () => validateAiResult({ intent: "summarize", entities: { token: "secret" } }),
  /非法字段/,
);
assert.throws(
  () => validateAiResult({ intent: "filter", view: { projection: ["token"] } }),
  /非法字段/,
);
assert.throws(
  () => validateAiResult({ intent: "create_ticket", needs_confirmation: "yes" }),
  /必须是布尔值/,
);
assert.throws(
  () => normalizeAiResult({ intent: "unknown" }, "mock"),
  /未知处理器/,
);

console.log("ai-result: 6 cases passed");
