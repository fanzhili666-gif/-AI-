"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDailyAgent, findCommand } = require("../src/daily-agent");

assert.deepEqual(findCommand("记录 带伞"), { type: "note_add", text: "带伞" });
assert.deepEqual(findCommand("添加待办买牛奶"), { type: "todo_add", text: "买牛奶" });
assert.deepEqual(findCommand("提醒我明天八点开会"), {
  type: "reminder_add",
  text: "明天八点开会",
});

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "daily-agent-"));
const filePath = path.join(directory, "data.json");
const agent = createDailyAgent({
  filePath,
  requestJson: async (request) => {
    assert.equal(request.enableSearch, true);
    assert.deepEqual(request.searchOptions, { enable_search_extension: true });
    assert.equal(request.timeoutMs, 45000);
    return { response: "这是 AI 回复", intent: "chat" };
  },
});

(async () => {
  assert.equal((await agent.handle({ text: "记录 带伞" })).intent, "note_add");
  assert.match((await agent.handle({ text: "查看备忘" })).response, /带伞/);
  assert.equal((await agent.handle({ text: "你好，介绍一下自己" })).response, "这是 AI 回复");
  assert.ok(fs.existsSync(filePath));
  console.log("daily-agent: 6 cases passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
