"use strict";

const CONVERSATION_FONT_SIZE = 18;
const CONVERSATION_TEXT_WIDTH = 615;
const CONVERSATION_LINE_CAPACITY = 32;

function formatConversationText(messages) {
  if (!Array.isArray(messages)) throw new Error("messages 必须是数组");
  if (!messages.length) {
    return "欢迎使用智丽AI助手\n\n直接说话或提交文字开始对话。\n\n例如：\n· 帮我记下今天要买的东西\n· 明天早上八点提醒我开会";
  }
  return messages.map((message) =>
    `${message.role === "user" ? "你" : "AI"}：${String(message.text ?? "")}`,
  ).join("\n\n");
}

function estimateWrappedLines(text) {
  let lines = 1;
  let lineWidth = 0;
  for (const character of text) {
    if (character === "\n") {
      lines += 1;
      lineWidth = 0;
      continue;
    }
    const codePoint = character.codePointAt(0);
    const width = codePoint >= 0x2e80 || codePoint > 0xffff ? 1 : 0.55;
    lineWidth += width;
    if (lineWidth > CONVERSATION_LINE_CAPACITY) {
      lines += 1;
      lineWidth = width;
    }
  }
  return lines;
}

module.exports = {
  CONVERSATION_FONT_SIZE,
  CONVERSATION_LINE_CAPACITY,
  CONVERSATION_TEXT_WIDTH,
  estimateWrappedLines,
  formatConversationText,
};
