"use strict";

const { applicationDataDirectory } = require("./application-data");
const { AsrClient } = require("./asr-client");
const { analyzeConversation } = require("./ai-agent");
const { parseIntent } = require("./intent-parser");
const { searchSop } = require("./sop-search");
const { projectEntity } = require("./view-projection");
const { App, AppLifecycle, Window, WindowProperty } = require("@irisview/osx/os");
const {
  getVoiceInputAvailability,
  requestVoiceInput,
  takeTextInput,
} = require("@irisview/osx/os/input");
const { Board, Color, Font, FusionRoot, Text, TextAlign } = require("@irisview/osx/fusionui");

const retained = {};

function start() {
  if (retained.window) return;
  retained.dataDirectory = applicationDataDirectory();
  const property = WindowProperty.create();
  property.setTitle("My First App");
  property.setSize([0.64, 0.48, 0.01]);
  retained.window = Window.create(property);
  retained.root = FusionRoot.acquireFusionRootFromWindow(retained.window);
  retained.board = Board.create();
  retained.board.setParent(retained.root.getRootWidget());
  retained.board.setIgnoreLayout(true);
  retained.board.setSize([640, 480, 0]);
  retained.board.getLocalStyle().setBackgroundColor(Color.fromRGB8(0, 0, 0));
  const displayText = Text.create();
  displayText.setParent(retained.board);
  displayText.setSize([640, 480, 0]);
  displayText.getLocalStyle().setTextFont(Font.getCachedFont("", 24, 0, 0));
  displayText.getLocalStyle().setTextAlign(TextAlign.CENTER);

  const viewModel = {
    state: "待命",
    title: "行动项 0/0",
    items: [],
    visibleItems: [],
    source: "demo",
    isInjected: false,
    highlighted: false,
    projection: ["device", "issue", "owner", "deadline", "priority", "status"],
    response: "输入会议安排，应用会自动提取行动项",
  };
  const conversation = {
    sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    history: [],
    entity: {},
  };
  const handleVoiceText = (text, final) => {
    if (!text) return;
    viewModel.response = `语音转写${final ? "完成" : "中"}：${text}`;
    viewModel.state = final ? "完成" : "处理中";
    viewModel.source = "voice-asr";
    render();
    if (final) handleText(text, "voice-asr");
  };
  retained.voiceTextHandler = handleVoiceText;
  const stateColors = {
    待命: Color.fromRGB8(120, 220, 150),
    处理中: Color.fromRGB8(100, 190, 255),
    待确认: Color.fromRGB8(255, 210, 80),
    完成: Color.fromRGB8(80, 255, 140),
    异常: Color.fromRGB8(255, 100, 100),
  };
  const renderItems = () => {
    if (!viewModel.visibleItems.length) return "暂无匹配行动项";
    return viewModel.visibleItems.map((item, index) => {
      const marker = viewModel.highlighted && index === 0 ? "【置顶 · 高亮】" : "";
      const fields = projectEntity({
        device: item.device,
        issue: item.issue || item.action,
        owner: item.owner,
        deadline: item.deadline,
        priority: item.priority,
        status: item.status,
      }, viewModel.projection);
      return `${index + 1}. ${marker}${fields.join("  ")}\n` +
        `来源：${item.data_source}  is_injected=${item.is_injected}`;
    }).join("\n\n");
  };
  const render = () => {
    displayText.setText(
      `${viewModel.state}\n\n` +
      `${viewModel.title}\n\n` +
      `${renderItems()}\n\n` +
      `${viewModel.response}`,
    );
    displayText.getLocalStyle().setTextColor(stateColors[viewModel.state]);
  };
  render();

  const updateResponse = (message, state = viewModel.state) => {
    viewModel.response = message;
    viewModel.state = state;
    render();
  };
  const updateItems = (items, response, state = "完成") => {
    viewModel.items = items;
    viewModel.visibleItems = items;
    viewModel.title = `行动项 ${items.length}/${items.length}`;
    viewModel.response = response;
    viewModel.state = state;
    viewModel.highlighted = items.some((item) => item.status === "待确认");
    render();
  };
  const applyAiResult = (result, normalized, requestId) => {
    conversation.entity = { ...conversation.entity, ...result.entities };
    viewModel.projection = result.view.projection;
    conversation.history.push({ role: "user", text: normalized, request_id: requestId });
    conversation.history.push({ role: "assistant", text: result.summary, request_id: requestId });
    if (result.intent === "filter") {
      const filter = result.filter || {};
      viewModel.visibleItems = viewModel.items.filter((item) =>
        (!filter.owner || item.owner === filter.owner) &&
        (!filter.priority || item.priority === filter.priority) &&
        (!filter.status || item.status === filter.status));
      viewModel.title = `行动项 ${viewModel.visibleItems.length}/${viewModel.items.length}`;
    } else if (result.intent === "prioritize") {
      viewModel.highlighted = Boolean(result.view.highlight);
      viewModel.visibleItems = [...viewModel.items].sort((a, b) =>
        (b.status === "待确认") - (a.status === "待确认"));
    } else if (["create_ticket", "update_field"].includes(result.intent)) {
      const entity = conversation.entity;
      const item = {
        device: entity.device || "待提取",
        issue: entity.issue || "待提取",
        action: entity.issue || result.summary || normalized,
        owner: entity.owner || "待提取",
        deadline: entity.deadline || "待提取",
        priority: entity.priority || "待提取",
        status: result.needs_confirmation ? "待确认" : "处理中",
        data_source: "real",
        is_injected: false,
      };
      updateItems([item], result.summary || "AI 已更新行动项", result.needs_confirmation ? "待确认" : "完成");
    } else if (result.intent === "search_sop") {
      const query = result.retrieval?.query || [
        result.entities.device,
        result.entities.issue,
      ].filter(Boolean).join(" ");
      const matches = searchSop(query);
      viewModel.response = matches.length
        ? `SOP 检索：${matches.map((entry) => `${entry.title}（${entry.steps.join("；")}）`).join("\n")}`
        : "未检索到相关 SOP";
      viewModel.state = "完成";
      console.log(JSON.stringify({
        event: "sop.retrieved",
        request_id: requestId,
        query,
        result_count: matches.length,
        results: matches.map((entry) => ({ id: entry.id, data_source: entry.data_source })),
        ts: new Date().toISOString(),
        data_source: matches.length ? "demo" : "real",
        is_injected: false,
      }));
      render();
    } else {
      viewModel.response = result.summary || "AI 已完成处理";
      viewModel.state = result.needs_confirmation ? "待确认" : "完成";
      render();
    }
    console.log(JSON.stringify({
      event: "ai.processed",
      request_id: requestId,
      session_id: conversation.sessionId,
      intent: result.intent,
      entities: result.entities,
      processor: result.processor,
      state: viewModel.state,
      ts: new Date().toISOString(),
      data_source: "real",
      is_injected: false,
    }));
  };
  const tryAi = (normalized, source, requestId) => {
    if (!process.env.DASHSCOPE_API_KEY) return false;
    viewModel.state = "处理中";
    viewModel.response = "AI 正在理解输入";
    render();
    analyzeConversation({ history: conversation.history, text: normalized })
      .then((result) => applyAiResult(result, normalized, requestId))
      .catch((error) => {
        console.error("IrisView AI processing failed", error);
        updateResponse(`AI 不可用，已切换规则模式：${error.message}`, "处理中");
        handleRuleText(normalized, source, requestId);
      });
    return true;
  };
  const handleRuleText = (normalized, source, requestId) => {
    conversation.history.push({ role: "user", text: normalized, request_id: requestId });
    return processRuleText(normalized, source, requestId);
  };
  const handleText = (text, source = "text") => {
    const normalized = text.trim();
    if (!normalized) return;
    viewModel.source = source;
    viewModel.isInjected = false;
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(JSON.stringify({
      event: "input.received",
      request_id: requestId,
      source,
      text: normalized,
      ts: new Date().toISOString(),
      data_source: "real",
      is_injected: false,
    }));
    if (!["待命", "待确认", "异常", "完成"].includes(normalized) &&
        !normalized.startsWith("只保留") &&
        tryAi(normalized, source, requestId)) {
      return;
    }
    processRuleText(normalized, source, requestId);
  };
  const processRuleText = (normalized, source, requestId) => {
    const parsedIntent = parseIntent(normalized);
    console.log(JSON.stringify({
      event: "intent.parsed",
      request_id: requestId,
      intent: parsedIntent.intent,
      slots: parsedIntent.slots,
      ts: new Date().toISOString(),
      data_source: "real",
      is_injected: false,
    }));
    if (normalized === "待命") {
      viewModel.state = "待命";
      viewModel.response = "等待下一条输入";
      viewModel.highlighted = false;
      viewModel.visibleItems = viewModel.items;
      viewModel.title = `行动项 ${viewModel.items.length}/${viewModel.items.length}`;
    } else if (normalized.startsWith("只保留")) {
      const owner = normalized.replace(/^只保留/, "").replace(/的任务$/, "").trim();
      const visibleItems = viewModel.items.filter((item) => item.owner === owner);
      viewModel.visibleItems = visibleItems;
      viewModel.title = `行动项 ${visibleItems.length}/${viewModel.items.length}`;
      viewModel.state = "完成";
      viewModel.highlighted = false;
      viewModel.response = `已筛选负责人：${owner}`;
      console.log(JSON.stringify({
        event: "action_items.filtered",
        request_id: requestId,
        owner,
        result_count: visibleItems.length,
        ts: new Date().toISOString(),
        data_source: "real",
        is_injected: false,
      }));
    } else if (normalized === "待确认" || normalized.includes("待确认置顶并高亮")) {
      viewModel.state = "待确认";
      viewModel.highlighted = true;
      viewModel.response = "检测到需要确认的调整，请确认后执行";
    } else if (normalized === "异常") {
      viewModel.state = "异常";
      viewModel.response = "输入处理失败，请重试";
    } else if (normalized === "完成") {
      viewModel.state = "完成";
      viewModel.response = "行动项已更新";
    } else {
      viewModel.state = "处理中";
      viewModel.highlighted = false;
      viewModel.response = "正在提取行动项";
      render();
      const items = extractActionItems(normalized);
      updateItems(
        items,
        items.length
          ? `已自动提取 ${items.length} 条行动项`
          : source === "voice-asr"
            ? `语音转写完成，未识别到行动项：${normalized}`
            : "未识别到行动项",
        "完成",
      );
      console.log(JSON.stringify({
        event: "action_items.extracted",
        request_id: requestId,
        result_count: items.length,
        ts: new Date().toISOString(),
        data_source: "real",
        is_injected: false,
      }));
      return;
    }
    console.log(JSON.stringify({
      event: "arui.updated",
      request_id: requestId,
      state: viewModel.state,
      result_count: viewModel.visibleItems.length,
      ts: new Date().toISOString(),
      data_source: "real",
      is_injected: false,
    }));
    render();
  };
  const extractActionItems = (text) => text
    .split(/[，。；;]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const match = segment.match(/^(?:安排|请)?([\u4e00-\u9fff]{2,3})(今天|明天|后天|本周)?(?:完成|准备|处理|提交|跟进|撰写|发布)(.+)$/);
      if (!match) return null;
      return {
        action: match[3].trim(),
        owner: match[1],
        deadline: match[2] || "待提取",
        status: "待确认",
        data_source: "real",
        is_injected: false,
      };
    })
    .filter(Boolean);
  setTimeout(() => startVoiceInput(updateResponse), 0);
  retained.inputTimer = setInterval(() => {
    const input = takeTextInput();
    if (input) handleText(input.text);
    readVoiceEvents(updateResponse);
  }, 50);
  console.log("IrisView application ready: example.myfirstapp");
}

function startVoiceInput(updateResponse) {
  if (retained.voiceSession) {
    updateResponse("语音采集中，请稍候", "处理中");
    return;
  }
  try {
    const availability = getVoiceInputAvailability("audio");
    if (!availability.canRequest) {
      updateResponse(`语音不可用：${availability.reason}`, "异常");
      return;
    }
    retained.voiceSession = requestVoiceInput({ mode: "audio" });
    retained.voiceFrames = 0;
    retained.asr = new AsrClient({
      onStatus: (message) => updateResponse(message, "处理中"),
      onText: retained.voiceTextHandler,
      onError: (error) => {
        updateResponse(`语音识别失败：${error.message}`, "异常");
        if (retained.voiceSession) retained.voiceSession.cancel();
        retained.voiceSession = undefined;
        retained.asr = undefined;
        scheduleVoiceRestart(updateResponse);
      },
      onFinished: () => {
        updateResponse("语音识别完成", "完成");
        scheduleVoiceRestart(updateResponse);
      },
    });
    const asrStarted = retained.asr.start();
    if (!asrStarted) {
      retained.voiceSession.cancel();
      retained.voiceSession = undefined;
      retained.asr = undefined;
      return;
    }
    updateResponse("请说话，正在接收语音", "处理中");
  } catch (error) {
    updateResponse(`语音请求失败：${error.code || error.message}`, "异常");
    console.error("IrisView voice input failed", error);
  }
}

function readVoiceEvents(updateResponse) {
  const session = retained.voiceSession;
  if (!session) return;
  let event;
  while ((event = session.takeEvent())) {
    if (event.type === "audio") {
      retained.voiceFrames += 1;
      if (retained.asr) retained.asr.pushAudio(event.data);
    } else if (event.type === "state") {
      updateResponse(`语音状态：${event.state}`, "处理中");
    } else if (event.type === "end") {
      const cancelled = event.status !== "completed" && event.reason === "user-cancelled";
      updateResponse(
        event.status === "completed"
          ? `语音已接收（${retained.voiceFrames} 帧），正在完成识别`
          : cancelled ? "语音采集已取消，可重新采集" : `语音结束：${event.reason}`,
        event.status === "completed" || cancelled ? "完成" : "异常",
      );
      if (event.status === "completed" && retained.asr) retained.asr.finish();
      if (cancelled) {
        if (retained.asr) retained.asr.close();
        retained.asr = undefined;
        scheduleVoiceRestart(updateResponse);
      }
      retained.voiceSession = undefined;
      retained.voiceFrames = 0;
    }
  }

}

function scheduleVoiceRestart(updateResponse) {
  if (!retained.inputTimer || retained.voiceRestartTimer) return;
  retained.voiceRestartTimer = setTimeout(() => {
    retained.voiceRestartTimer = undefined;
    if (retained.inputTimer && !retained.voiceSession) startVoiceInput(updateResponse);
  }, 500);
}

App.createApp((lifecycle) => {
  if (lifecycle === AppLifecycle.ON_CREATE) start();
  if (lifecycle === AppLifecycle.ON_DESTROY) {
    if (retained.inputTimer) clearInterval(retained.inputTimer);
    if (retained.voiceRestartTimer) clearTimeout(retained.voiceRestartTimer);
    if (retained.voiceSession) retained.voiceSession.cancel();
    if (retained.asr) retained.asr.close();
    retained.inputTimer = undefined;
    retained.voiceSession = undefined;
    retained.asr = undefined;
    retained.voiceTextHandler = undefined;
    retained.voiceRestartTimer = undefined;
    retained.board = undefined;
    retained.root = undefined;
    retained.window = undefined;
    retained.dataDirectory = undefined;
  }
});
