"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { requestStructuredJson } = require("./ai-client");

const EMPTY_DATA = Object.freeze({
  notes: [],
  todos: [],
  reminders: [],
  schedules: [],
});

function cloneEmptyData() {
  return {
    notes: [],
    todos: [],
    reminders: [],
    schedules: [],
  };
}

function createStore(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new Error("日常智能体数据路径必须是绝对路径");
  }
  const load = () => {
    try {
      const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return { ...cloneEmptyData(), ...value };
    } catch (error) {
      if (error.code === "ENOENT") return cloneEmptyData();
      throw new Error(`读取日常智能体数据失败：${error.message}`);
    }
  };
  const save = (data) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(temporaryPath, filePath);
  };
  return { load, save };
}

function findCommand(text) {
  const value = String(text || "").trim();
  const content = value.replace(/^(请|帮我|帮忙|麻烦)\s*/, "");
  const type = content.match(/^(?:记下|记录|备忘|添加备忘)\s*(.+)$/);
  if (type) return { type: "note_add", text: type[1].trim() };
  if (/^(?:查看|列出|查询)(?:所有)?备忘/.test(content)) return { type: "note_list" };
  if (/^(?:清空|删除)(?:所有)?备忘/.test(content)) return { type: "note_clear" };
  const todo = content.match(/^(?:添加|新建|记一个)(?:待办|任务)\s*(.+)$/);
  if (todo) return { type: "todo_add", text: todo[1].trim() };
  if (/^(?:查看|列出|查询)(?:所有)?待办/.test(content)) return { type: "todo_list" };
  const reminder = content.match(/^(?:提醒我|设置提醒)\s*(.+)$/);
  if (reminder) return { type: "reminder_add", text: reminder[1].trim() };
  if (/^(?:查看|列出|查询)(?:所有)?提醒/.test(content)) return { type: "reminder_list" };
  const schedule = content.match(/^(?:安排日程|添加日程|记录日程)\s*(.+)$/);
  if (schedule) return { type: "schedule_add", text: schedule[1].trim() };
  if (/^(?:查看|列出|查询)(?:今天|当前)?日程/.test(content)) return { type: "schedule_list" };
  return null;
}

function formatList(title, values) {
  if (!values.length) return `${title}为空。`;
  return `${title}：\n${values.map((entry, index) => `${index + 1}. ${entry.text}`).join("\n")}`;
}

function createDailyAgent({ filePath, requestJson = requestStructuredJson }) {
  const store = createStore(filePath);
  const runCommand = (data, command) => {
    const now = new Date().toISOString();
    if (command.type === "note_add") {
      data.notes.push({ id: `note-${Date.now()}`, text: command.text, createdAt: now });
      return `已记录备忘：${command.text}`;
    }
    if (command.type === "note_list") return formatList("备忘", data.notes);
    if (command.type === "note_clear") {
      data.notes = [];
      return "已清空备忘。";
    }
    if (command.type === "todo_add") {
      data.todos.push({ id: `todo-${Date.now()}`, text: command.text, done: false, createdAt: now });
      return `已添加待办：${command.text}`;
    }
    if (command.type === "todo_list") return formatList("待办", data.todos.filter((entry) => !entry.done));
    if (command.type === "reminder_add") {
      data.reminders.push({ id: `reminder-${Date.now()}`, text: command.text, createdAt: now });
      return `已设置提醒：${command.text}`;
    }
    if (command.type === "reminder_list") return formatList("提醒", data.reminders);
    if (command.type === "schedule_add") {
      data.schedules.push({ id: `schedule-${Date.now()}`, text: command.text, createdAt: now });
      return `已记录日程：${command.text}`;
    }
    if (command.type === "schedule_list") return formatList("日程", data.schedules);
    throw new Error(`未知日常命令：${command.type}`);
  };
  return {
    async handle({ history = [], text }) {
      const command = findCommand(text);
      if (command) {
        const data = store.load();
        const response = runCommand(data, command);
        if (!command.type.endsWith("_list")) store.save(data);
        return { response, intent: command.type, processor: "local" };
      }
      const messages = [
        {
          role: "system",
          content: [
            "你是中文日常生活 AI 助手，支持聊天、备忘、待办、提醒、日程、天气和联网搜索问答。",
            "只返回 JSON：{response:string,intent:string}。",
            "不要编造实时天气、搜索结果或已执行的外部操作；无法联网时明确说明。",
          ].join("\n"),
        },
        ...history.slice(-8).filter((entry) => entry?.role && entry?.text)
          .map((entry) => ({ role: entry.role, content: entry.text })),
        { role: "user", content: String(text).trim() },
      ];
      const raw = await requestJson({
        messages,
        enableSearch: true,
        searchOptions: { enable_search_extension: true },
      });
      if (!raw || typeof raw.response !== "string") {
        throw new Error("日常智能体响应缺少 response");
      }
      return { response: raw.response, intent: raw.intent || "chat", processor: "ai" };
    },
  };
}

module.exports = { EMPTY_DATA, createDailyAgent, createStore, findCommand };
