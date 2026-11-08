"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createConversationStore } = require("../src/conversation-store");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "conversation-store-"));
const filePath = path.join(directory, "conversations.json");

try {
  const store = createConversationStore(filePath, {
    maxConversations: 2,
    maxMessagesPerConversation: 3,
  });
  assert.deepEqual(store.listConversations(), []);

  store.appendMessages("conversation-1", [
    { id: "message-1", role: "user", text: "你好" },
    {
      id: "message-2",
      role: "assistant",
      text: "你好，有什么可以帮你？",
      status: "complete",
    },
  ]);
  store.updateMessage("conversation-1", "message-2", {
    text: "你好，我可以帮你。",
    status: "complete",
  });
  store.appendMessage("conversation-1", {
    id: "message-3",
    role: "user",
    text: "再见",
  });
  store.appendMessage("conversation-1", {
    id: "message-4",
    role: "assistant",
    text: "再见！",
  });

  const firstConversation = store.getConversation("conversation-1");
  assert.equal(firstConversation.messages.length, 3);
  assert.equal(firstConversation.messages[0].id, "message-2");
  assert.equal(firstConversation.messages[0].text, "你好，我可以帮你。");
  assert.deepEqual(store.listConversationSummaries().map((entry) => ({
    id: entry.id,
    firstUserMessage: entry.firstUserMessage,
  })), [{ id: "conversation-1", firstUserMessage: "再见" }]);

  const reloadedStore = createConversationStore(filePath, {
    maxConversations: 2,
    maxMessagesPerConversation: 3,
  });
  assert.equal(reloadedStore.getConversation("conversation-1").messages.at(-1).text, "再见！");
  reloadedStore.appendMessage("conversation-2", {
    id: "message-5",
    role: "user",
    text: "会话二",
  });
  reloadedStore.appendMessage("conversation-3", {
    id: "message-6",
    role: "user",
    text: "会话三",
  });
  assert.deepEqual(
    reloadedStore.listConversations().map((conversation) => conversation.id),
    ["conversation-3", "conversation-2"],
  );
  assert.equal(reloadedStore.getConversation("conversation-1"), null);

  assert.throws(
    () => reloadedStore.appendMessage("conversation-3", {
      id: "message-6",
      role: "user",
      text: "重复消息",
    }),
    /ID 重复/,
  );
  assert.throws(
    () => reloadedStore.appendMessages("conversation-3", [
      { id: "message-7", role: "user", text: "不能部分写入" },
      { id: "message-6", role: "user", text: "重复" },
    ]),
    /ID 重复/,
  );
  assert.equal(
    reloadedStore.getConversation("conversation-3").messages.length,
    1,
  );
  assert.throws(
    () => createConversationStore("relative.json"),
    /绝对路径/,
  );
  console.log("conversation-store: persistence, update, and retention checks passed");
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
