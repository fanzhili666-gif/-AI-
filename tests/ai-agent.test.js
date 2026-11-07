"use strict";

const assert = require("node:assert/strict");
const {
  SYSTEM_PROMPT,
  analyzeConversation,
  buildConversationMessages,
} = require("../src/ai-agent");

const messages = buildConversationMessages({
  history: [
    { role: "user", text: "三号泵压力偏高" },
    { role: "assistant", text: "已记录三号泵异常" },
  ],
  text: "截止时间改成明天上午",
});
assert.equal(messages[0].role, "system");
assert.match(SYSTEM_PROMPT, /语音对话助手/);
assert.match(SYSTEM_PROMPT, /intent=unknown/);
assert.equal(messages[1].content, "三号泵压力偏高");
assert.equal(messages[3].content, "截止时间改成明天上午");

const result = awaitResult();

async function awaitResult() {
  const analyzed = await analyzeConversation({
    history: [{ role: "user", text: "三号泵压力偏高" }],
    text: "安排李娜今天复查",
    requestJson: async ({ messages: requestMessages }) => {
      assert.equal(requestMessages.at(-1).content, "安排李娜今天复查");
      return {
        intent: "create_ticket",
        summary: "三号泵压力异常，安排李娜今天复查",
        entities: { device: "三号泵", issue: "压力偏高", owner: "李娜", deadline: "今天" },
        needs_confirmation: true,
        missing_fields: [],
      };
    },
  });
  assert.equal(analyzed.processor, "ai");
  assert.equal(analyzed.entities.owner, "李娜");
  console.log("ai-agent: 3 cases passed");
}

result.catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
