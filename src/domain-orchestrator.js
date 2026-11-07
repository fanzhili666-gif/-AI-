"use strict";

const {
  createDomainResult,
  isDomainCommand,
} = require("./domain-adapter");

function createDomainSession(sessionId, version = 0) {
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("领域会话 sessionId 必须是非空字符串");
  }
  if (!Number.isInteger(version) || version < 0) {
    throw new Error("领域会话 version 必须是非负整数");
  }
  return { sessionId, version };
}

function dispatchDomainCommand({ command, session, apply }) {
  if (!isDomainCommand(command)) throw new Error("无效的领域命令");
  if (!session || session.sessionId !== command.sessionId) {
    throw new Error("领域命令 sessionId 不匹配");
  }
  if (!Number.isInteger(session.version) || session.version < 0) {
    throw new Error("领域会话 version 必须是非负整数");
  }
  if (typeof apply !== "function") throw new Error("领域命令必须提供 apply 函数");

  if (command.baseVersion !== session.version) {
    return createDomainResult({
      status: "obsolete",
      message: "该操作基于旧版本，已作废",
      version: session.version,
      reason: "base_version_mismatch",
    });
  }

  const outcome = apply(command);
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) {
    throw new Error("领域 apply 必须返回结果对象");
  }
  const nextVersion = session.version + 1;
  session.version = nextVersion;
  return createDomainResult({
    ...outcome,
    version: nextVersion,
  });
}

module.exports = {
  createDomainSession,
  dispatchDomainCommand,
};
