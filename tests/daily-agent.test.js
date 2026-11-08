"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createDailyAgent,
  findCommand,
  requiresWebSearch,
} = require("../src/daily-agent");

assert.deepEqual(findCommand("记录 带伞"), { type: "note_add", text: "带伞" });
assert.deepEqual(findCommand("查看备忘"), { type: "note_list" });
assert.deepEqual(findCommand("删除所有备忘"), { type: "note_clear" });
assert.deepEqual(findCommand("添加待办买牛奶"), { type: "todo_add", text: "买牛奶" });
assert.deepEqual(findCommand("查看待办"), { type: "todo_list" });
assert.deepEqual(findCommand("提醒我明天八点开会"), {
  type: "reminder_add",
  text: "明天八点开会",
});
assert.deepEqual(findCommand("查看提醒"), { type: "reminder_list" });
assert.deepEqual(findCommand("安排日程周一下午开会"), {
  type: "schedule_add",
  text: "周一下午开会",
});
assert.deepEqual(findCommand("查看日程"), { type: "schedule_list" });
assert.equal(requiresWebSearch("北京明天天气怎么样"), true);
assert.equal(requiresWebSearch("给我介绍一下你自己"), false);

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "daily-agent-"));
const filePath = path.join(directory, "data.json");
const searchOptions = [];
const agent = createDailyAgent({
  filePath,
  requestJson: async (request) => {
    assert.equal(request.enableSearch, true);
    searchOptions.push(request.searchOptions);
    assert.equal(request.timeoutMs, 45000);
    return { response: "这是 AI 回复", intent: "chat" };
  },
});

(async () => {
  assert.equal((await agent.handle({ text: "记录 带伞" })).intent, "note_add");
  assert.match((await agent.handle({ text: "查看备忘" })).response, /带伞/);
  assert.equal((await agent.handle({ text: "删除所有备忘" })).response, "已清空备忘。");
  assert.equal((await agent.handle({ text: "查看备忘" })).response, "备忘为空。");
  await agent.handle({ text: "添加待办 买牛奶" });
  assert.match((await agent.handle({ text: "查看待办" })).response, /买牛奶/);
  await agent.handle({ text: "提醒我明天八点开会" });
  assert.match((await agent.handle({ text: "查看提醒" })).response, /明天八点开会/);
  await agent.handle({ text: "安排日程周一下午开会" });
  assert.match((await agent.handle({ text: "查看日程" })).response, /周一下午开会/);
  assert.equal((await agent.handle({
    history: [{ role: "user", text: "你好" }],
    text: "介绍一下你自己",
  })).response, "这是 AI 回复");
  assert.deepEqual(searchOptions[0], { enable_search_extension: true });
  assert.equal((await agent.handle({ text: "北京明天天气怎么样？" })).response, "这是 AI 回复");
  assert.deepEqual(searchOptions[1], {
    enable_search_extension: true,
    forced_search: true,
  });
  assert.ok(fs.existsSync(filePath));
  const persistedAgent = createDailyAgent({ filePath });
  assert.match((await persistedAgent.handle({ text: "查看待办" })).response, /买牛奶/);
  console.log("daily-agent: command, persistence and AI routing checks passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
