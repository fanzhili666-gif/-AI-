"use strict";

const COMMAND_TYPES = Object.freeze({
  create_ticket: "CreateActionItem",
  update_field: "UpdateActionItem",
  correct_entity: "CorrectEntity",
  filter: "FilterActionItems",
  prioritize: "PrioritizeActionItem",
  summarize: "SummarizeSession",
  search_sop: "SearchSop",
  explain: "ExplainSession",
  confirm: "ConfirmPendingChange",
  cancel: "CancelPendingChange",
});

const VALID_COMMAND_TYPES = new Set(Object.values(COMMAND_TYPES));

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} 必须是非空字符串`);
  }
}

function adaptAiResult({ result, sessionId, requestId, baseVersion = 0 }) {
  if (!result || typeof result !== "object") throw new Error("领域适配需要有效的 AI 结果");
  assertNonEmptyString(sessionId, "sessionId");
  assertNonEmptyString(requestId, "requestId");
  if (!Number.isInteger(baseVersion) || baseVersion < 0) {
    throw new Error("baseVersion 必须是非负整数");
  }

  const type = COMMAND_TYPES[result.intent];
  if (!type) {
    return {
      type: "Noop",
      sessionId,
      requestId,
      baseVersion,
      summary: result.summary || "",
      reason: "unknown_intent",
    };
  }

  const entities = Object.fromEntries(
    Object.entries(result.entities || {}).filter(([, value]) => value !== null),
  );
  const command = {
    type,
    sessionId,
    requestId,
    baseVersion,
    patch: ["CreateActionItem", "UpdateActionItem", "CorrectEntity"].includes(type)
      ? entities
      : {},
    target: { type: "current", reference: null },
    filter: result.filter || null,
    retrieval: result.retrieval || null,
    projection: result.view?.projection || [],
    highlight: Boolean(result.view?.highlight),
    summary: result.summary || "",
    needsConfirmation: Boolean(result.needs_confirmation),
    missingFields: result.missing_fields || [],
    processor: result.processor,
  };
  return Object.freeze(command);
}

function createDomainResult({
  status,
  state,
  message = "",
  items = [],
  pendingChange = null,
  version = 0,
  reason = null,
}) {
  const statuses = ["applied", "pending_confirmation", "ambiguous", "rejected", "obsolete"];
  if (!statuses.includes(status)) throw new Error(`未知领域结果状态：${status}`);
  if (!Array.isArray(items)) throw new Error("领域结果 items 必须是数组");
  if (!Number.isInteger(version) || version < 0) throw new Error("领域结果 version 必须是非负整数");
  return Object.freeze({
    status,
    state: state || null,
    message,
    items: [...items],
    pendingChange,
    version,
    reason,
  });
}

function isDomainCommand(value) {
  return Boolean(value && typeof value === "object" &&
    typeof value.type === "string" &&
    (value.type === "Noop" || VALID_COMMAND_TYPES.has(value.type)) &&
    typeof value.sessionId === "string" &&
    typeof value.requestId === "string" &&
    Number.isInteger(value.baseVersion));
}

module.exports = {
  COMMAND_TYPES,
  adaptAiResult,
  createDomainResult,
  isDomainCommand,
};
