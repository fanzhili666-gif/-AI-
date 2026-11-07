"use strict";

const assert = require("node:assert/strict");
const {
  adaptAiResult,
  createDomainResult,
  isDomainCommand,
} = require("../src/domain-adapter");

const correction = adaptAiResult({
  result: {
    intent: "correct_entity",
    summary: "负责人已更正",
    entities: { owner: "李娜", issue: null },
    needs_confirmation: true,
    processor: "ai",
  },
  sessionId: "session-1",
  requestId: "request-1",
  baseVersion: 4,
});
assert.equal(correction.type, "CorrectEntity");
assert.deepEqual(correction.patch, { owner: "李娜" });
assert.deepEqual(correction.target, { type: "current", reference: null });
assert.equal(correction.baseVersion, 4);
assert.equal(isDomainCommand(correction), true);

const filter = adaptAiResult({
  result: {
    intent: "filter",
    filter: { owner: "李娜" },
    view: { projection: ["owner"], highlight: false },
    processor: "rule",
  },
  sessionId: "session-1",
  requestId: "request-2",
});
assert.equal(filter.type, "FilterActionItems");
assert.deepEqual(filter.filter, { owner: "李娜" });
assert.deepEqual(filter.patch, {});

const unknown = adaptAiResult({
  result: { intent: "unknown", summary: "无法识别" },
  sessionId: "session-1",
  requestId: "request-3",
});
assert.equal(unknown.type, "Noop");
assert.equal(unknown.reason, "unknown_intent");

const domainResult = createDomainResult({
  status: "pending_confirmation",
  state: "待确认",
  message: "请确认负责人变更",
  pendingChange: { id: "change-1" },
  version: 5,
});
assert.equal(domainResult.status, "pending_confirmation");
assert.deepEqual(domainResult.items, []);
assert.throws(
  () => createDomainResult({ status: "done" }),
  /未知领域结果状态/,
);

console.log("domain-adapter: 4 cases passed");
