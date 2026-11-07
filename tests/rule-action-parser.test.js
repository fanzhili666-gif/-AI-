"use strict";

const assert = require("node:assert/strict");
const {
  parseRuleActionItems,
  parseDeadlineUpdate,
  isSummaryRequest,
} = require("../src/rule-action-parser");

const items = parseRuleActionItems("三号泵压力偏高\n安排李娜今天复查");
assert.equal(items.length, 1);
assert.equal(items[0].device, "三号泵");
assert.equal(items[0].issue, "三号泵压力偏高");
assert.equal(items[0].action, "复查");
assert.equal(items[0].owner, "李娜");
assert.equal(items[0].deadline, "今天");

assert.equal(parseDeadlineUpdate("截止时间改成明天上午"), "明天上午");
assert.equal(parseRuleActionItems("3号泵压力偏高，安排李娜明天复查，最晚不超过后天下午")[0].deadline, "后天下午");
assert.equal(parseDeadlineUpdate("没有截止时间"), null);
const combinedText = "三号泵压力偏高\n安排李娜今天复查\n截止时间改成明天上午";
const combinedItems = parseRuleActionItems(combinedText);
assert.equal(combinedItems[0].owner, "李娜");
assert.equal(parseDeadlineUpdate(combinedText), "明天上午");
assert.equal(isSummaryRequest("总结一下当前工单"), true);
assert.equal(isSummaryRequest("三号泵压力偏高"), false);
const voiceItem = parseRuleActionItems(
  "3号泵的压力有些大，安排李娜明天去复查一下，最晚时间不超过后天下午。负责人交给王强，顺便再总结一下当前的工单。",
);
assert.equal(voiceItem.length, 1);
assert.equal(voiceItem[0].device, "3号泵");
assert.equal(voiceItem[0].owner, "王强");
assert.equal(voiceItem[0].deadline, "后天下午");
assert.equal(voiceItem[0].action, "复查");

console.log("rule-action-parser: 3 cases passed");
