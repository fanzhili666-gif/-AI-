"use strict";

const assert = require("node:assert/strict");
const { adaptAiResult } = require("../src/domain-adapter");
const { resolveTarget } = require("../src/ambiguity-resolver");
const { mergeContext } = require("../src/context-merge");
const { proposeChange, confirmChange, cancelChange } = require("../src/confirmation-core");
const { createDomainSession, dispatchDomainCommand } = require("../src/domain-orchestrator");

const session = createDomainSession("session-e2e");
const context = { entities: {}, metadata: {} };
const items = [];

const createCommand = adaptAiResult({
  result: {
    intent: "create_ticket",
    summary: "三号泵压力异常",
    entities: { device: "三号泵", issue: "压力偏高", owner: "李伟", deadline: "今天" },
  },
  sessionId: session.sessionId,
  requestId: "request-create-1",
  baseVersion: session.version,
});
const createResult = dispatchDomainCommand({
  command: createCommand,
  session,
  apply: () => ({ status: "applied", state: "完成", message: "已创建" }),
});
assert.equal(createResult.status, "applied");
assert.equal(session.version, 1);
let merged = mergeContext({
  context,
  patch: createCommand.patch,
  source: "ai",
  updatedAt: "2026-11-07T16:00:00+08:00",
});
items.push({ id: "item-1", ...merged.context.entities });
assert.equal(items[0].owner, "李伟");

const updateCommand = adaptAiResult({
  result: {
    intent: "correct_entity",
    summary: "负责人改为李娜",
    entities: { owner: "李娜" },
    needs_confirmation: true,
  },
  sessionId: session.sessionId,
  requestId: "request-update-1",
  baseVersion: session.version,
});
assert.equal(resolveTarget({ items, target: updateCommand.target }).reason, "only_item");
const proposal = proposeChange({
  session,
  changeId: "change-e2e-1",
  command: updateCommand,
  diff: { owner: { from: "李伟", to: "李娜" } },
});
assert.equal(proposal.status, "pending_confirmation");
assert.equal(session.version, 1);
const confirmed = confirmChange({
  session,
  changeId: "change-e2e-1",
  apply: () => {
    merged = mergeContext({
      context: merged.context,
      patch: updateCommand.patch,
      source: "user-confirmation",
      updatedAt: "2026-11-07T16:01:00+08:00",
    });
    items[0] = { ...items[0], ...merged.context.entities };
    return { status: "applied", state: "完成", message: "已确认" };
  },
});
assert.equal(confirmed.status, "applied");
assert.equal(items[0].owner, "李娜");
assert.equal(session.version, 2);

items.push({ id: "item-2", owner: "王强", action: "提交报告" });
const ambiguous = resolveTarget({
  items,
  target: { type: "current", reference: null },
});
assert.equal(ambiguous.status, "ambiguous");
assert.equal(ambiguous.candidates.length, 2);
assert.equal(session.version, 2);

const cancelledProposal = proposeChange({
  session,
  changeId: "change-e2e-2",
  command: updateCommand,
  diff: { owner: { from: "李娜", to: "王强" } },
});
assert.equal(cancelledProposal.status, "pending_confirmation");
const cancelled = cancelChange({ session, changeId: "change-e2e-2" });
assert.equal(cancelled.status, "applied");
assert.equal(items[0].owner, "李娜");
assert.equal(session.version, 3);

const stale = dispatchDomainCommand({
  command: {
    ...createCommand,
    baseVersion: 2,
    requestId: "request-stale",
  },
  session,
  apply: () => {
    throw new Error("旧命令不应执行");
  },
});
assert.equal(stale.status, "obsolete");
assert.equal(stale.reason, "base_version_mismatch");

console.log("e2e-domain-flow: 7 cases passed");
