"use strict";

const assert = require("node:assert/strict");
const { ordinalToIndex, resolveTarget } = require("../src/ambiguity-resolver");

const items = [
  { id: "a1", owner: "李娜", action: "复查三号泵" },
  { id: "a2", owner: "李娜", action: "提交报告" },
];

assert.equal(ordinalToIndex("二"), 1);
assert.equal(resolveTarget({ items, target: { id: "a1" } }).reason, "explicit_id");
assert.equal(resolveTarget({ items, target: { ordinal: "二" } }).item.id, "a2");
assert.equal(
  resolveTarget({ items, target: { field: "action", value: "复查三号泵" } }).item.id,
  "a1",
);

const ambiguous = resolveTarget({ items });
assert.equal(ambiguous.status, "ambiguous");
assert.deepEqual(ambiguous.candidates.map((candidate) => candidate.id), ["a1", "a2"]);

assert.equal(
  resolveTarget({ items: [items[0]] }).reason,
  "only_item",
);
assert.equal(resolveTarget({ items, target: { id: "missing" } }).status, "rejected");
assert.equal(resolveTarget({ items: [] }).reason, "no_items");

console.log("ambiguity-resolver: 7 cases passed");
