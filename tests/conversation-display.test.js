"use strict";

const assert = require("node:assert/strict");
const {
  estimateWrappedLines,
  formatConversationText,
} = require("../src/conversation-display");

const userText = "请介绍一下这些花";
const assistantText = `${"玫瑰在春天开放，颜色鲜艳。".repeat(16)}🌹\n需要充足阳光。`;
const formatted = formatConversationText([
  { role: "user", text: userText },
  { role: "assistant", text: assistantText },
]);

assert.equal(formatted, `你：${userText}\n\nAI：${assistantText}`);
assert.ok(estimateWrappedLines(formatted) > 5);
assert.match(formatConversationText([]), /欢迎使用智丽AI助手/);
assert.throws(() => formatConversationText(null), /必须是数组/);

console.log("conversation-display: user input and complete assistant responses are retained");
