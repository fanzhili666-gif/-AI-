"use strict";

const assert = require("node:assert/strict");
const { adaptAiResult } = require("../src/domain-adapter");
const {
  createDomainSession,
  dispatchDomainCommand,
} = require("../src/domain-orchestrator");

const session = createDomainSession("session-1");
const command = adaptAiResult({
  result: {
    intent: "update_field",
    summary: "更新截止时间",
    entities: { deadline: "明天上午" },
  },
  sessionId: "session-1",
  requestId: "request-1",
  baseVersion: session.version,
});
const applied = dispatchDomainCommand({
  command,
  session,
  apply: (received) => ({
    status: "applied",
    state: "完成",
    message: received.summary,
  }),
});
assert.equal(applied.status, "applied");
assert.equal(applied.version, 1);
assert.equal(session.version, 1);

const stale = dispatchDomainCommand({
  command,
  session,
  apply: () => {
    throw new Error("过期命令不应执行");
  },
});
assert.equal(stale.status, "obsolete");
assert.equal(stale.reason, "base_version_mismatch");
assert.equal(stale.version, 1);

const currentCommand = adaptAiResult({
  result: { intent: "summarize", summary: "当前摘要" },
  sessionId: "session-1",
  requestId: "request-2",
  baseVersion: session.version,
});
const pending = dispatchDomainCommand({
  command: currentCommand,
  session,
  apply: () => ({
    status: "pending_confirmation",
    state: "待确认",
    message: "请确认",
  }),
});
assert.equal(pending.version, 2);
assert.equal(session.version, 2);

assert.throws(
  () => dispatchDomainCommand({
    command: currentCommand,
    session: { sessionId: "other", version: 2 },
    apply: () => ({}),
  }),
  /sessionId 不匹配/,
);

console.log("domain-orchestrator: 4 cases passed");
