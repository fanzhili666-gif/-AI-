"use strict";

const assert = require("node:assert/strict");
const {
  parseRuleActionItems,
  parseDeadlineUpdate,
} = require("../src/rule-action-parser");

const items = parseRuleActionItems("三号泵压力偏高\n安排李娜今天复查");
assert.equal(items.length, 1);
assert.equal(items[0].device, "三号泵");
assert.equal(items[0].issue, "三号泵压力偏高");
assert.equal(items[0].action, "复查");
assert.equal(items[0].owner, "李娜");
assert.equal(items[0].deadline, "今天");

assert.equal(parseDeadlineUpdate("截止时间改成明天上午"), "明天上午");
assert.equal(parseDeadlineUpdate("没有截止时间"), null);
const combinedText = "三号泵压力偏高\n安排李娜今天复查\n截止时间改成明天上午";
const combinedItems = parseRuleActionItems(combinedText);
assert.equal(combinedItems[0].owner, "李娜");
assert.equal(parseDeadlineUpdate(combinedText), "明天上午");

console.log("rule-action-parser: 2 cases passed");
