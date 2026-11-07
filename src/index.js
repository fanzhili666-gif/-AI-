"use strict";

const { applicationDataDirectory } = require("./application-data");
const { App, AppLifecycle, Window, WindowProperty } = require("@irisview/osx/os");
const {
  getVoiceInputAvailability,
  requestVoiceInput,
  takeTextInput,
} = require("@irisview/osx/os/input");
const { Board, Color, Font, FusionRoot, Switch, Text, TextAlign } = require("@irisview/osx/fusionui");

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
    title: "行动项",
    action: "准备接收会议指令",
    owner: "—",
    deadline: "—",
    source: "demo",
    isInjected: false,
    highlighted: false,
    response: "输入“安排张薇今天完成测试报告”开始演示",
  };
  const stateColors = {
    待命: Color.fromRGB8(120, 220, 150),
    处理中: Color.fromRGB8(100, 190, 255),
    待确认: Color.fromRGB8(255, 210, 80),
    完成: Color.fromRGB8(80, 255, 140),
    异常: Color.fromRGB8(255, 100, 100),
  };
  const render = () => {
    const emphasis = viewModel.highlighted ? "【置顶 · 高亮】" : "";
    displayText.setText(
      `${viewModel.state}  ${emphasis}\n\n` +
      `${viewModel.title}\n` +
      `任务：${viewModel.action}\n` +
      `负责人：${viewModel.owner}    截止：${viewModel.deadline}\n` +
      `来源：${viewModel.source}  is_injected=${viewModel.isInjected}\n\n` +
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
  const handleText = (text) => {
    const normalized = text.trim();
    if (!normalized) return;
    viewModel.source = "real";
    viewModel.isInjected = false;
    if (normalized === "待命") {
      viewModel.state = "待命";
      viewModel.response = "等待下一条输入";
      viewModel.highlighted = false;
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
      viewModel.action = normalized;
      viewModel.owner = normalized.includes("张薇") ? "张薇" : "待提取";
      viewModel.deadline = normalized.includes("今天") ? "今天" : "待提取";
      viewModel.highlighted = false;
      viewModel.response = "正在解析输入";
      render();
      setTimeout(() => {
        if (viewModel.state === "处理中" && viewModel.action === normalized) {
          viewModel.state = "完成";
          viewModel.response = "内容已更新";
          render();
        }
      }, 700);
      return;
    }
    render();
  };
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
    retained.toggle = undefined;
    retained.board = undefined;
    retained.root = undefined;
    retained.window = undefined;
    retained.dataDirectory = undefined;
  }
});
