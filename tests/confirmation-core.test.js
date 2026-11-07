"use strict";

const assert = require("node:assert/strict");
const {
  proposeChange,
  confirmChange,
  cancelChange,
} = require("../src/confirmation-core");

const session = { sessionId: "session-1", version: 3, pendingChange: null };
const proposal = proposeChange({
  session,
  changeId: "change-1",
  command: { type: "CorrectEntity", patch: { owner: "李娜" } },
  diff: { owner: { from: "李伟", to: "李娜" } },
  message: "负责人：李伟 → 李娜，请确认",
});
assert.equal(proposal.status, "pending_confirmation");
assert.equal(session.pendingChange.baseVersion, 3);

const duplicate = proposeChange({
  session,
  changeId: "change-2",
  command: { type: "UpdateActionItem" },
  diff: {},
});
assert.equal(duplicate.status, "rejected");
assert.equal(duplicate.reason, "pending_change_exists");

const applied = confirmChange({
  session,
  changeId: "change-1",
  apply: (pending) => ({
    status: "applied",
    state: "完成",
    message: pending.message,
  }),
});
assert.equal(applied.status, "applied");
assert.equal(session.version, 4);
assert.equal(session.pendingChange, null);

const repeated = confirmChange({ session, changeId: "change-1", apply: () => ({}) });
assert.equal(repeated.reason, "no_pending_change");

proposeChange({
  session,
  changeId: "change-3",
  command: { type: "UpdateActionItem" },
  diff: { deadline: { from: "今天", to: "明天" } },
});
session.version += 1;
const obsolete = confirmChange({ session, changeId: "change-3", apply: () => ({}) });
assert.equal(obsolete.status, "obsolete");
assert.equal(session.pendingChange, null);

proposeChange({
  session,
  changeId: "change-4",
  command: { type: "CorrectEntity" },
  diff: { owner: { from: "李伟", to: "李娜" } },
});
const cancelled = cancelChange({ session, changeId: "change-4" });
assert.equal(cancelled.status, "applied");
assert.equal(cancelled.state, "待命");
assert.equal(session.pendingChange, null);

console.log("confirmation-core: 6 cases passed");
