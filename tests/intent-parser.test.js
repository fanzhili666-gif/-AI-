"use strict";

const assert = require("node:assert/strict");
const { INTENTS, parseIntent } = require("../src/intent-parser");

const cases = [
  ["提取行动项", INTENTS.EXTRACT_ACTION_ITEMS, {}],
  ["只保留负责人和截止时间", INTENTS.FILTER_FIELDS, { fields: ["负责人", "截止时间"] }],
  ["待确认置顶并高亮", INTENTS.PRIORITIZE, { reference: null, highlight: true }],
  ["不是张伟是张薇", INTENTS.CORRECT_ENTITY, { from: "张伟", to: "张薇" }],
  ["第二个行动项置顶", INTENTS.PRIORITIZE, { reference: "二", highlight: false }],
  ["第二个行动项", INTENTS.RESOLVE_REFERENCE, { ordinal: "二" }],
  ["确认执行", INTENTS.CONFIRMATION, { decision: "confirm" }],
];

for (const [input, intent, slots] of cases) {
  const result = parseIntent(input);
  assert.equal(result.intent, intent, input);
  assert.deepEqual(result.slots, slots, input);
}

assert.equal(parseIntent("无法识别的输入").intent, INTENTS.UNKNOWN);
console.log(`intent-parser: ${cases.length + 1} cases passed`);
