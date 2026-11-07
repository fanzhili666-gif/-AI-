"use strict";

const assert = require("node:assert/strict");
const { searchSop } = require("../src/sop-search");

const matches = searchSop("三号泵 压力偏高");
assert.equal(matches[0].id, "sop-pump-pressure-high");
assert.equal(matches[0].data_source, "demo");
assert.deepEqual(searchSop("不存在的设备"), []);
console.log("sop-search: 3 cases passed");
