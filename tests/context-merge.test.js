"use strict";

const assert = require("node:assert/strict");
const { mergeContext } = require("../src/context-merge");

const initial = {
  entities: {
    device: "三号泵",
    issue: "压力偏高",
    owner: "李伟",
  },
  metadata: {},
};

const merged = mergeContext({
  context: initial,
  patch: {
    owner: "李娜",
    deadline: "明天上午",
    issue: null,
  },
  source: "user-correction",
  updatedAt: "2026-11-07T16:00:00+08:00",
});
assert.deepEqual(merged.context.entities, {
  device: "三号泵",
  issue: "压力偏高",
  owner: "李娜",
  deadline: "明天上午",
});
assert.equal(merged.changes.length, 2);
assert.deepEqual(merged.context.metadata.owner, {
  source: "user-correction",
  previousValue: "李伟",
  updatedAt: "2026-11-07T16:00:00+08:00",
});

const cleared = mergeContext({
  context: merged.context,
  patch: {},
  clearFields: ["deadline"],
  source: "user-request",
  updatedAt: "2026-11-07T16:01:00+08:00",
});
assert.equal(cleared.context.entities.deadline, undefined);
assert.equal(cleared.changes[0].value, null);
assert.equal(cleared.context.entities.device, "三号泵");

assert.throws(
  () => mergeContext({
    context: initial,
    patch: { owner: null },
    source: "ai",
    updatedAt: "2026-11-07T16:00:00+08:00",
    clearFields: ["unknown"],
  }),
  /非法字段/,
);
assert.throws(
  () => mergeContext({
    context: initial,
    patch: { owner: "" },
    source: "ai",
  }),
  /非空字符串/,
);

console.log("context-merge: 4 cases passed");
