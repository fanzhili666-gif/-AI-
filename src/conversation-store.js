"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MAX_CONVERSATIONS = 50;
const DEFAULT_MAX_MESSAGES_PER_CONVERSATION = 200;
const VALID_ROLES = new Set(["user", "assistant"]);

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} 必须是非空字符串`);
  }
}

function createConversationStore(
  filePath,
  {
    maxConversations = DEFAULT_MAX_CONVERSATIONS,
    maxMessagesPerConversation = DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
  } = {},
) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new Error("对话存储路径必须是绝对路径");
  }
  for (const [name, value] of Object.entries({
    maxConversations,
    maxMessagesPerConversation,
  })) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} 必须是正整数`);
    }
  }

  let cachedData;
  const load = () => {
    if (cachedData) return cachedData;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        cachedData = { version: 1, conversations: [] };
        return cachedData;
      }
      throw new Error(`读取对话记录失败：${error.message}`);
    }
    if (!data || data.version !== 1 || !Array.isArray(data.conversations)) {
      throw new Error("对话记录格式无效");
    }
    for (const conversation of data.conversations) {
      if (!conversation || typeof conversation.id !== "string" ||
          typeof conversation.createdAt !== "string" ||
          typeof conversation.updatedAt !== "string" ||
          !Array.isArray(conversation.messages)) {
        throw new Error("对话记录包含无效会话");
      }
      for (const message of conversation.messages) {
        if (!message || typeof message.id !== "string" ||
            !VALID_ROLES.has(message.role) || typeof message.text !== "string" ||
            typeof message.createdAt !== "string") {
          throw new Error("对话记录包含无效消息");
        }
      }
    }
    cachedData = data;
    return data;
  };
  const save = (data) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.tmp`;
      fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      fs.renameSync(temporaryPath, filePath);
      cachedData = data;
    } catch (error) {
      cachedData = undefined;
      throw error;
    }
  };

  const sortAndLimit = (data) => {
    data.conversations.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.createdAt.localeCompare(left.createdAt),
    );
    data.conversations = data.conversations.slice(0, maxConversations);
  };
  const nextTimestamp = (data) => {
    const newest = Math.max(
      0,
      ...data.conversations.map((conversation) => Date.parse(conversation.updatedAt) || 0),
    );
    return new Date(Math.max(Date.now(), newest + 1)).toISOString();
  };

  return {
    appendMessage(conversationId, message) {
      this.appendMessages(conversationId, [message]);
    },

    appendMessages(conversationId, messages) {
      assertNonEmptyString(conversationId, "conversationId");
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("对话消息必须是非空数组");
      }
      const messageIds = new Set();
      for (const message of messages) {
        if (!message || typeof message !== "object" || Array.isArray(message)) {
          throw new Error("对话消息必须是对象");
        }
        assertNonEmptyString(message.id, "message.id");
        if (!VALID_ROLES.has(message.role)) throw new Error("对话消息 role 无效");
        if (typeof message.text !== "string") throw new Error("对话消息 text 必须是字符串");
        if (messageIds.has(message.id)) throw new Error(`对话消息 ID 重复：${message.id}`);
        messageIds.add(message.id);
      }

      const data = load();
      const now = nextTimestamp(data);
      const conversation = data.conversations.find((entry) => entry.id === conversationId);
      if (conversation && messages.some((message) =>
        conversation.messages.some((entry) => entry.id === message.id))) {
        const duplicate = messages.find((message) =>
          conversation.messages.some((entry) => entry.id === message.id));
        throw new Error(`对话消息 ID 重复：${duplicate.id}`);
      }
      let targetConversation = conversation;
      if (!targetConversation) {
        targetConversation = {
          id: conversationId,
          createdAt: messages[0].createdAt || now,
          updatedAt: now,
          messages: [],
        };
        data.conversations.push(targetConversation);
      }
      targetConversation.messages.push(...messages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.text,
          createdAt: message.createdAt || now,
          ...(typeof message.source === "string" ? { source: message.source } : {}),
          ...(typeof message.status === "string" ? { status: message.status } : {}),
      })));
      targetConversation.messages = targetConversation.messages.slice(-maxMessagesPerConversation);
      targetConversation.updatedAt = now;
      sortAndLimit(data);
      save(data);
    },

    updateMessage(conversationId, messageId, patch) {
      assertNonEmptyString(conversationId, "conversationId");
      assertNonEmptyString(messageId, "messageId");
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new Error("对话消息更新必须是对象");
      }
      if (patch.text !== undefined && typeof patch.text !== "string") {
        throw new Error("对话消息 text 必须是字符串");
      }
      if (patch.status !== undefined && typeof patch.status !== "string") {
        throw new Error("对话消息 status 必须是字符串");
      }

      const data = load();
      const conversation = data.conversations.find((entry) => entry.id === conversationId);
      const message = conversation?.messages.find((entry) => entry.id === messageId);
      if (!message) throw new Error(`找不到对话消息：${messageId}`);
      if (patch.text !== undefined) message.text = patch.text;
      if (patch.status !== undefined) message.status = patch.status;
      conversation.updatedAt = nextTimestamp(data);
      sortAndLimit(data);
      save(data);
    },

    getConversation(conversationId) {
      assertNonEmptyString(conversationId, "conversationId");
      const conversation = load().conversations.find((entry) => entry.id === conversationId);
      return conversation
        ? { ...conversation, messages: conversation.messages.map((message) => ({ ...message })) }
        : null;
    },

    listConversations() {
      return load().conversations
        .filter((conversation) => conversation.messages.length > 0)
        .map((conversation) => ({
          ...conversation,
          messages: conversation.messages.map((message) => ({ ...message })),
        }));
    },

    listConversationSummaries() {
      return load().conversations
        .filter((conversation) => conversation.messages.length > 0)
        .map((conversation) => ({
          id: conversation.id,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          firstUserMessage: conversation.messages.find((message) => message.role === "user")?.text || "",
        }));
    },
  };
}

module.exports = {
  DEFAULT_MAX_CONVERSATIONS,
  DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
  createConversationStore,
};
