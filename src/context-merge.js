"use strict";

const FIELDS = Object.freeze(["device", "issue", "owner", "deadline", "priority", "status"]);

function assertContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw new Error("上下文必须是对象");
  }
  if (!context.entities || typeof context.entities !== "object" || Array.isArray(context.entities)) {
    throw new Error("上下文 entities 必须是对象");
  }
}

function mergeContext({
  context,
  patch,
  source = "unknown",
  updatedAt = new Date().toISOString(),
  clearFields = [],
}) {
  assertContext(context);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("上下文 patch 必须是对象");
  }
  if (typeof source !== "string" || !source.trim()) {
    throw new Error("上下文 source 必须是非空字符串");
  }
  if (typeof updatedAt !== "string" || !updatedAt.trim()) {
    throw new Error("上下文 updatedAt 必须是非空字符串");
  }
  if (!Array.isArray(clearFields) || clearFields.some((field) => !FIELDS.includes(field))) {
    throw new Error("上下文 clearFields 包含非法字段");
  }

  const nextEntities = { ...context.entities };
  const nextMetadata = { ...(context.metadata || {}) };
  const changes = [];
  for (const [field, value] of Object.entries(patch)) {
    if (!FIELDS.includes(field)) throw new Error(`上下文 patch 包含非法字段：${field}`);
    if (value === null || value === undefined) continue;
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`上下文字段 ${field} 必须是非空字符串`);
    }
    const previousValue = nextEntities[field] ?? null;
    if (previousValue === value) continue;
    nextEntities[field] = value;
    nextMetadata[field] = { source, previousValue, updatedAt };
    changes.push({ field, previousValue, value, source, updatedAt });
  }

  for (const field of clearFields) {
    const previousValue = nextEntities[field] ?? null;
    if (previousValue === null) continue;
    delete nextEntities[field];
    nextMetadata[field] = { source, previousValue, value: null, updatedAt };
    changes.push({ field, previousValue, value: null, source, updatedAt });
  }

  return {
    context: {
      ...context,
      entities: nextEntities,
      metadata: nextMetadata,
    },
    changes,
  };
}

module.exports = { FIELDS, mergeContext };
