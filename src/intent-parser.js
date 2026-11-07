"use strict";

const INTENTS = Object.freeze({
  EXTRACT_ACTION_ITEMS: "extract_action_items",
  FILTER_FIELDS: "filter_fields",
  PRIORITIZE: "prioritize",
  CORRECT_ENTITY: "correct_entity",
  RESOLVE_REFERENCE: "resolve_reference",
  CONFIRMATION: "confirmation",
  UNKNOWN: "unknown",
});

const FIELD_LABELS = Object.freeze({
  设备: "device",
  现象: "issue",
  问题: "issue",
  负责人: "owner",
  截止时间: "deadline",
  优先级: "priority",
  状态: "status",
});

function parseIntent(input) {
  const text = String(input || "").trim();
  if (!text) return { intent: INTENTS.UNKNOWN, text, slots: {} };

  if (/^(?:提取|识别|整理)(?:会议)?行动项/.test(text)) {
    return { intent: INTENTS.EXTRACT_ACTION_ITEMS, text, slots: {} };
  }

  const filterMatch = text.match(/^只保留(.+?)(?:的任务|字段)?$/);
  if (filterMatch) {
    const fields = filterMatch[1].split(/[和、,，]/).map((field) => field.trim()).filter(Boolean);
    return { intent: INTENTS.FILTER_FIELDS, text, slots: { fields } };
  }

  if (/(?:置顶|高亮|优先)/.test(text)) {
    const reference = text.match(/第([一二三四五六七八九十\d]+)个/);
    return {
      intent: INTENTS.PRIORITIZE,
      text,
      slots: { reference: reference ? reference[1] : null, highlight: text.includes("高亮") },
    };
  }

  const labeledCorrectionMatch = text.match(
    /^(设备|现象|问题|负责人|截止时间|优先级|状态)不是(.+?)(?:是|应为|改为)(.+)$/,
  );
  if (labeledCorrectionMatch) {
    return {
      intent: INTENTS.CORRECT_ENTITY,
      text,
      slots: {
        field: FIELD_LABELS[labeledCorrectionMatch[1]],
        from: labeledCorrectionMatch[2].replace(/[，,、。；;]\s*$/, "").trim(),
        to: labeledCorrectionMatch[3].replace(/[，,、。；;]\s*$/, "").trim(),
      },
    };
  }

  const correctionMatch = text.match(/^不是(.+?)(?:是|，应为)(.+)$/);
  if (correctionMatch) {
    return {
      intent: INTENTS.CORRECT_ENTITY,
      text,
      slots: { from: correctionMatch[1].trim(), to: correctionMatch[2].trim() },
    };
  }

  const referenceMatch = text.match(/^第([一二三四五六七八九十\d]+)个(?:行动项)?/);
  if (referenceMatch) {
    return { intent: INTENTS.RESOLVE_REFERENCE, text, slots: { ordinal: referenceMatch[1] } };
  }

  if (/^(?:确认|执行|好的|取消|撤销)/.test(text)) {
    return {
      intent: INTENTS.CONFIRMATION,
      text,
      slots: { decision: /^(?:取消|撤销)/.test(text) ? "cancel" : "confirm" },
    };
  }

  return { intent: INTENTS.UNKNOWN, text, slots: {} };
}

module.exports = { INTENTS, parseIntent };
