"use strict";

const { requestStructuredJson } = require("./ai-client");
const { normalizeAiResult } = require("./ai-result");

const SYSTEM_PROMPT = [
  "你是巡检助手，只能返回 JSON。",
  "支持 intent：create_ticket、update_field、correct_entity、summarize、filter、prioritize、search_sop、explain、confirm、cancel、unknown。",
  "从输入中提取 device、issue、owner、deadline、priority、status。",
  "当用户纠正已有字段时使用 correct_entity，并只在 entities 中返回更正后的字段；例如“负责人不是李伟，是李娜”返回 entities.owner=李娜。",
  "不要编造 SOP；search_sop 只返回检索条件，不返回虚构处置步骤。",
  "JSON 必须包含 intent、summary、entities、view、needs_confirmation、missing_fields。",
].join("\n");

function buildConversationMessages({ history = [], text }) {
  if (!Array.isArray(history)) throw new Error("AI history 必须是数组");
  if (typeof text !== "string" || !text.trim()) throw new Error("AI 输入文本不能为空");
  const context = history
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .slice(-8)
    .map(({ role, text: messageText }) => ({ role, content: String(messageText) }));
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...context,
    { role: "user", content: text.trim() },
  ];
}

async function analyzeConversation({ history, text, requestJson = requestStructuredJson }) {
  const messages = buildConversationMessages({ history, text });
  const raw = await requestJson({ messages });
  return normalizeAiResult(raw, "ai");
}

module.exports = { SYSTEM_PROMPT, analyzeConversation, buildConversationMessages };
