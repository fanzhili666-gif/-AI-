"use strict";

const assert = require("node:assert/strict");
const { projectEntity } = require("../src/view-projection");

assert.deepEqual(
  projectEntity({ device: "三号泵", owner: "李娜", deadline: "今天" }, ["owner", "deadline"]),
  ["负责人：李娜", "截止时间：今天"],
);
assert.deepEqual(projectEntity({ issue: "压力偏高" }, ["owner"]), []);
console.log("view-projection: 2 cases passed");
