"use strict";

const { createDomainResult } = require("./domain-adapter");

function assertSession(session) {
  if (!session || typeof session !== "object" || typeof session.sessionId !== "string") {
    throw new Error("确认会话无效");
  }
  if (!Number.isInteger(session.version) || session.version < 0) {
    throw new Error("确认会话 version 必须是非负整数");
  }
}

function proposeChange({ session, changeId, command, diff, message = "请确认此次变更" }) {
  assertSession(session);
  if (typeof changeId !== "string" || !changeId.trim()) throw new Error("changeId 必须是非空字符串");
  if (!command || typeof command !== "object") throw new Error("变更提案 command 无效");
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) throw new Error("变更提案 diff 无效");
  if (session.pendingChange) {
    return createDomainResult({
      status: "rejected",
      message: "已有待确认变更，请先确认或取消",
      version: session.version,
      reason: "pending_change_exists",
    });
  }
  session.pendingChange = {
    id: changeId,
    baseVersion: session.version,
    command,
    diff,
    message,
    status: "pending",
  };
  return createDomainResult({
    status: "pending_confirmation",
    state: "待确认",
    message,
    pendingChange: session.pendingChange,
    version: session.version,
  });
}

function confirmChange({ session, changeId, apply }) {
  assertSession(session);
  if (typeof apply !== "function") throw new Error("确认执行必须提供 apply 函数");
  if (!session.pendingChange) {
    return createDomainResult({
      status: "rejected",
      message: "当前没有待确认变更",
      version: session.version,
      reason: "no_pending_change",
    });
  }
  const pending = session.pendingChange;
  if (pending.id !== changeId) {
    return createDomainResult({
      status: "rejected",
      message: "待确认变更不匹配",
      version: session.version,
      reason: "change_id_mismatch",
    });
  }
  if (pending.baseVersion !== session.version) {
    session.pendingChange = null;
    return createDomainResult({
      status: "obsolete",
      message: "待确认变更基于旧版本，已作废",
      version: session.version,
      reason: "pending_change_obsolete",
    });
  }
  const outcome = apply(pending);
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) {
    throw new Error("确认 apply 必须返回结果对象");
  }
  session.pendingChange = null;
  session.version += 1;
  return createDomainResult({
    ...outcome,
    status: outcome.status || "applied",
    version: session.version,
  });
}

function cancelChange({ session, changeId }) {
  assertSession(session);
  if (!session.pendingChange) {
    return createDomainResult({
      status: "rejected",
      message: "当前没有待确认变更",
      version: session.version,
      reason: "no_pending_change",
    });
  }
  if (session.pendingChange.id !== changeId) {
    return createDomainResult({
      status: "rejected",
      message: "待确认变更不匹配",
      version: session.version,
      reason: "change_id_mismatch",
    });
  }
  session.pendingChange = null;
  session.version += 1;
  return createDomainResult({
    status: "applied",
    state: "待命",
    message: "已取消此次变更",
    version: session.version,
  });
}

module.exports = { proposeChange, confirmChange, cancelChange };
