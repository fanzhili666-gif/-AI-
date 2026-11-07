"use strict";

const INTENTS = Object.freeze([
  "create_ticket",
  "update_field",
  "summarize",
  "filter",
  "prioritize",
  "search_sop",
  "explain",
  "confirm",
  "cancel",
  "unknown",
]);

const FIELDS = Object.freeze(["device", "issue", "owner", "deadline", "priority", "status"]);
const PROCESSORS = Object.freeze(["ai", "rule"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateAiResult(value) {
  if (!isPlainObject(value)) throw new Error("AI 结果必须是 JSON 对象");
  if (!INTENTS.includes(value.intent)) throw new Error(`AI 返回未知 intent：${value.intent}`);
  if (value.summary !== undefined && typeof value.summary !== "string") {
    throw new Error("AI summary 必须是字符串");
  }
  if (value.entities !== undefined) {
    if (!isPlainObject(value.entities)) throw new Error("AI entities 必须是对象");
    for (const key of Object.keys(value.entities)) {
      if (!FIELDS.includes(key)) throw new Error(`AI entities 包含非法字段：${key}`);
      if (value.entities[key] !== null && typeof value.entities[key] !== "string") {
        throw new Error(`AI 字段 ${key} 必须是字符串或 null`);
      }
    }
  }
  if (value.view !== undefined) {
    if (!isPlainObject(value.view)) throw new Error("AI view 必须是对象");
    if (value.view.projection !== undefined) {
      if (!Array.isArray(value.view.projection) ||
          value.view.projection.some((field) => !FIELDS.includes(field))) {
        throw new Error("AI view.projection 包含非法字段");
      }
    }
    if (value.view.highlight !== undefined && typeof value.view.highlight !== "boolean") {
      throw new Error("AI view.highlight 必须是布尔值");
    }
    if (value.view.sort !== undefined && typeof value.view.sort !== "string") {
      throw new Error("AI view.sort 必须是字符串");
    }
  }
  if (value.needs_confirmation !== undefined && typeof value.needs_confirmation !== "boolean") {
    throw new Error("AI needs_confirmation 必须是布尔值");
  }
  if (value.missing_fields !== undefined) {
    if (!Array.isArray(value.missing_fields) ||
        value.missing_fields.some((field) => !FIELDS.includes(field))) {
      throw new Error("AI missing_fields 包含非法字段");
    }
  }
  return value;
}

function normalizeAiResult(value, processor = "ai") {
  validateAiResult(value);
  if (!PROCESSORS.includes(processor)) throw new Error(`未知处理器：${processor}`);
  return {
    intent: value.intent,
    summary: value.summary || "",
    entities: value.entities || {},
    filter: value.filter || null,
    retrieval: value.retrieval || null,
    view: {
      projection: value.view?.projection || FIELDS,
      sort: value.view?.sort || "default",
      highlight: value.view?.highlight || false,
    },
    needs_confirmation: value.needs_confirmation || false,
    missing_fields: value.missing_fields || [],
    processor,
  };
}

module.exports = { FIELDS, INTENTS, normalizeAiResult, validateAiResult };
