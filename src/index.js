"use strict";

const { applicationDataDirectory } = require("./application-data");
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
    response: "输入会议安排，应用会自动提取行动项",
  };
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
      return `${index + 1}. ${marker}${item.action}\n` +
        `负责人：${item.owner}  截止：${item.deadline}  状态：${item.status}\n` +
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
  const handleText = (text) => {
    const normalized = text.trim();
    if (!normalized) return;
    viewModel.source = "real";
    viewModel.isInjected = false;
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(JSON.stringify({
      event: "input.received",
      request_id: requestId,
      source: "text",
      text: normalized,
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
      updateItems(items, items.length ? `已自动提取 ${items.length} 条行动项` : "未识别到行动项", items.length ? "完成" : "异常");
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
    } else if (event.type === "state") {
      updateResponse(`语音状态：${event.state}`, "处理中");
    } else if (event.type === "end") {
      updateResponse(
        event.status === "completed"
          ? `语音已接收（${retained.voiceFrames} 帧，未进行语音识别）`
          : `语音结束：${event.reason}`,
        event.status === "completed" ? "完成" : "异常",
      );
      retained.voiceSession = undefined;
      retained.voiceFrames = 0;
    }
  }
}

App.createApp((lifecycle) => {
  if (lifecycle === AppLifecycle.ON_CREATE) start();
  if (lifecycle === AppLifecycle.ON_DESTROY) {
    if (retained.inputTimer) clearInterval(retained.inputTimer);
    if (retained.voiceSession) retained.voiceSession.cancel();
    retained.inputTimer = undefined;
    retained.voiceSession = undefined;
    retained.board = undefined;
    retained.root = undefined;
    retained.window = undefined;
    retained.dataDirectory = undefined;
  }
});
