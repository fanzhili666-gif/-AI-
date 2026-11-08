"use strict";

const { applicationDataPath } = require("./application-data");
const { AsrClient } = require("./asr-client");
const {
  CONVERSATION_FONT_SIZE,
  CONVERSATION_TEXT_WIDTH,
  estimateWrappedLines,
  formatConversationText,
} = require("./conversation-display");
const {
  DEFAULT_MAX_CONVERSATIONS,
  DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
  createConversationStore,
} = require("./conversation-store");
const { createDailyAgent } = require("./daily-agent");
const { dispatchNavigationActions } = require("./navigation");
const { App, AppLifecycle, Window, WindowProperty } = require("@irisview/osx/os");
const {
  getVoiceInputAvailability,
  requestVoiceInput,
  takeNavigationAction,
  takeTextInput,
} = require("@irisview/osx/os/input");
const {
  Board,
  Color,
  Font,
  FusionRoot,
  Image,
  Part,
  Select,
  SelectCloseReason,
  ScrollView,
  State,
  Style,
  StyleSelector,
  Text,
  TextAlign,
  View,
} = require("@irisview/osx/fusionui");

const retained = {};
const IDLE_TIMEOUT_MS = 15000;
const VOICE_CONFIRMATION_TIMEOUT_MS = 35000;
const MAX_VOICE_RETRIES = 3;

function start() {
  if (retained.window) return;

  const dailyAgent = createDailyAgent({
    filePath: applicationDataPath("daily-agent.json"),
  });
  const conversationStore = createConversationStore(
    applicationDataPath("conversations.json"),
  );
  retained.conversationStore = conversationStore;
  const property = WindowProperty.create();
  property.setTitle("智丽AI助手");
  property.setSize([0.64, 0.48, 0.01]);
  retained.window = Window.create(property);
  retained.root = FusionRoot.acquireFusionRootFromWindow(retained.window);
  retained.board = Board.create();
  retained.board.setParent(retained.root.getRootWidget());
  retained.board.setIgnoreLayout(true);
  retained.board.setSize([635, 480, 0]);
  retained.board.getLocalStyle().setBackgroundColor(Color.fromRGB8(7, 10, 8));

  const headerPanel = View.create();
  headerPanel.setParent(retained.board);
  headerPanel.setIgnoreLayout(true);
  headerPanel.setPosition([0, 0, 0]);
  headerPanel.setSize([635, 80, 0]);
  headerPanel.getLocalStyle().setBackgroundColor(Color.fromRGB8(15, 23, 18));

  const footerPanel = View.create();
  footerPanel.setParent(retained.board);
  footerPanel.setIgnoreLayout(true);
  footerPanel.setPosition([0, 418, 0]);
  footerPanel.setSize([635, 62, 0]);
  footerPanel.getLocalStyle().setBackgroundColor(Color.fromRGB8(15, 23, 18));

  const titleText = Text.create();
  titleText.setParent(retained.board);
  titleText.setIgnoreLayout(true);
  titleText.setPosition([16, 7, 0]);
  titleText.setSize([603, 30, 0]);
  titleText.getLocalStyle().setTextFont(Font.getCachedFont("", 22, 0, 0));
  titleText.getLocalStyle().setTextColor(Color.fromRGB8(230, 245, 234));
  titleText.setText("智丽AI助手");

  const statusText = Text.create();
  statusText.setParent(retained.board);
  statusText.setIgnoreLayout(true);
  statusText.setPosition([16, 38, 0]);
  statusText.setSize([603, 24, 0]);
  statusText.getLocalStyle().setTextFont(Font.getCachedFont("", 16, 0, 0));

  const conversationHeadingText = Text.create();
  conversationHeadingText.setParent(retained.board);
  conversationHeadingText.setIgnoreLayout(true);
  conversationHeadingText.setPosition([16, 86, 0]);
  conversationHeadingText.setSize([603, 22, 0]);
  conversationHeadingText.getLocalStyle().setTextFont(Font.getCachedFont("", 16, 0, 0));
  conversationHeadingText.getLocalStyle().setTextColor(Color.fromRGB8(170, 190, 176));

  const conversationPane = ScrollView.create();
  conversationPane.setParent(retained.board);
  conversationPane.setIgnoreLayout(true);
  conversationPane.setPosition([0, 112, 0]);
  conversationPane.setSize([635, 302, 0]);
  conversationPane.setClickFocusable(true);
  conversationPane.setChildOverflowVisible(false);
  conversationPane.getLocalStyle().setBackgroundColor(Color.fromRGB8(7, 10, 8));
  const conversationText = Text.create();
  conversationText.setParent(conversationPane);
  conversationText.setIgnoreLayout(true);
  conversationText.setPosition([16, 8, 0]);
  conversationText.setSize([CONVERSATION_TEXT_WIDTH, 30, 0]);
  conversationText.setLongMode(Text.LongMode.LONG_WRAP);
  conversationText.getLocalStyle().setTextFont(
    Font.getCachedFont("", CONVERSATION_FONT_SIZE, 0, 0),
  );
  conversationText.getLocalStyle().setTextAlign(TextAlign.TOP_LEFT);
  conversationText.getLocalStyle().setTextColor(Color.fromRGB8(120, 255, 120));

  const noticeText = Text.create();
  noticeText.setParent(retained.board);
  noticeText.setIgnoreLayout(true);
  noticeText.setPosition([16, 420, 0]);
  noticeText.setSize([603, 14, 0]);
  noticeText.getLocalStyle().setTextFont(Font.getCachedFont("", 12, 0, 0));
  noticeText.getLocalStyle().setTextColor(Color.fromRGB8(185, 210, 190));
  noticeText.setForeground();

  const historySelect = Select.create();
  historySelect.setParent(retained.board);
  historySelect.setPosition([16, 438, 0]);
  historySelect.setSize([603, 38, 0]);
  historySelect.setForeground();
  historySelect.setClickable(true);
  historySelect.setClickFocusable(true);
  historySelect.setOptionHeight(42);
  historySelect.setMaxMenuHeight(280);
  historySelect.getLocalStyle().setTextFont(Font.getCachedFont("", 16, 0, 0));
  historySelect.getLocalStyle().setTextColor(Color.fromRGB8(225, 225, 225));
  historySelect.getLocalStyle().setBackgroundColor(Color.fromRGB8(18, 32, 23));
  historySelect.setIndicatorText("历史对话");
  historySelect.setOptions(["当前对话"]);
  const historyMenu = historySelect.getMenu();
  if (!historyMenu) throw new Error("无法创建历史对话菜单");
  historyMenu.getLocalStyle().setBackgroundColor(Color.fromRGB8(20, 34, 24));
  const normalOptionStyle = Style.create();
  normalOptionStyle.setBackgroundColor(Color.fromRGB8(24, 48, 30));
  normalOptionStyle.setTextColor(Color.fromRGB8(232, 240, 234));
  historySelect.addStyle(normalOptionStyle, StyleSelector.create(Part.ITEMS));
  const activeOptionStyle = Style.create();
  activeOptionStyle.setBackgroundColor(Color.fromRGB8(34, 104, 52));
  activeOptionStyle.setTextColor(Color.fromRGB8(255, 255, 255));
  historySelect.addStyle(
    activeOptionStyle,
    StyleSelector.create(Part.ITEMS, State.ACTIVE),
  );
  const checkedOptionStyle = Style.create();
  checkedOptionStyle.setBackgroundColor(Color.fromRGB8(28, 72, 40));
  checkedOptionStyle.setTextColor(Color.fromRGB8(245, 250, 246));
  historySelect.addStyle(
    checkedOptionStyle,
    StyleSelector.create(Part.ITEMS, State.CHECKED),
  );

  const viewModel = {
    state: "待命",
    notice: "可直接说话或提交文字，管理备忘、待办、提醒和日程",
    viewingConversationId: null,
  };
  const stateColors = {
    待命: Color.fromRGB8(120, 220, 150),
    处理中: Color.fromRGB8(100, 190, 255),
    待确认: Color.fromRGB8(255, 210, 80),
    完成: Color.fromRGB8(80, 255, 140),
    异常: Color.fromRGB8(255, 100, 100),
  };
  const conversation = {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    history: [],
    messages: [],
    latestRequestId: null,
  };
  retained.conversationId = conversation.id;

  let historyOptions = [];
  let syncingHistorySelect = false;
  let historyMenuInitialIndex = 0;
  let historyMenuActiveIndex = -1;
  let historyOpening = false;
  let historyClosing = false;
  let viewedConversation = null;
  let displayedConversationKey = null;
  let currentConversationScrollOffset = 0;
  const archivedConversationScrollOffsets = new Map();
  let conversationScrollOffset = 0;
  let maxConversationScrollOffset = 0;
  let currentConversationDirty = true;
  const getCurrentMessages = () => conversation.messages;
  const getViewedConversation = () =>
    viewModel.viewingConversationId
      ? viewedConversation
      : null;
  const renderStateLabels = () => {
    const states = ["待命", "处理中", "待确认", "完成", "异常"];
    return `状态栏：${states.map((state) =>
      state === viewModel.state ? `【● ${state}】` : `○ ${state}`,
    ).join("  ")}`;
  };
  const render = () => {
    const archivedConversation = getViewedConversation();
    const viewingArchive = Boolean(archivedConversation);
    const messages = getCurrentMessages();
    const conversationHeading = viewingArchive ? "历史对话" : "当前对话";
    statusText.setText(renderStateLabels());
    statusText.getLocalStyle().setTextColor(stateColors[viewModel.state]);
    conversationHeadingText.setText(conversationHeading);
    const conversationKey = viewingArchive
      ? `archive:${archivedConversation.id}`
      : `current:${conversation.id}`;
    const shouldRenderConversation = displayedConversationKey !== conversationKey ||
      (!viewingArchive && currentConversationDirty);
    if (shouldRenderConversation) {
      const visibleMessages = viewingArchive ? archivedConversation.messages : messages;
      const conversationContent = formatConversationText(visibleMessages);
      const lineCount = estimateWrappedLines(conversationContent);
      if (viewingArchive) {
        console.log(JSON.stringify({
          event: "history.render.started",
          conversation_id: archivedConversation.id,
          ts: new Date().toISOString(),
        }));
      }
      conversationText.setPosition([16, 8, 0]);
      conversationText.setText(conversationContent);
      conversationText.setHeightByLineCount(lineCount);
      const textHeight = Math.max(
        conversationText.getSize()[1],
        lineCount * CONVERSATION_FONT_SIZE * 1.5,
      );
      maxConversationScrollOffset = Math.max(0, textHeight - 286);
      const savedScrollOffset = viewingArchive
        ? archivedConversationScrollOffsets.get(archivedConversation.id)
        : currentConversationScrollOffset;
      const startAtBottom = (!viewingArchive && currentConversationDirty) ||
        savedScrollOffset === undefined;
      conversationScrollOffset = startAtBottom
        ? maxConversationScrollOffset
        : Math.min(savedScrollOffset, maxConversationScrollOffset);
      conversationText.setPosition([16, 8 - conversationScrollOffset, 0]);
      if (viewingArchive) {
        archivedConversationScrollOffsets.set(
          archivedConversation.id,
          conversationScrollOffset,
        );
      } else {
        currentConversationScrollOffset = conversationScrollOffset;
        currentConversationDirty = false;
      }
      displayedConversationKey = conversationKey;
      if (viewingArchive) {
        console.log(JSON.stringify({
          event: "history.render.completed",
          conversation_id: archivedConversation.id,
          ts: new Date().toISOString(),
        }));
      }
    }
    const interactionHint = historySelect.isOpen()
      ? "方向键选择历史 · 确认打开 · 返回关闭"
      : viewingArchive
        ? "左键对话 · 右键历史 · 上/下浏览 · 返回当前"
        : `${historyOptions.length}/${DEFAULT_MAX_CONVERSATIONS} 段已保存 · 左键对话 · 右键历史`;
    noticeText.setText(`${viewModel.notice} · ${interactionHint}`);
    noticeText.getLocalStyle().setTextColor(stateColors[viewModel.state]);
  };
  let historyRenderPending = false;
  let historyOpenedPending = false;
  let historySelectionClosedPending = false;
  let pendingHistorySelectionIndex;
  let pendingReturnToCurrent = false;
  const scheduleHistoryRender = () => {
    historyRenderPending = true;
  };
  historySelect.onOpened.add(() => {
    historyOpening = false;
    historyClosing = false;
    historyOpenedPending = true;
    const activeIndex = historySelect.getActiveIndex();
    historyMenuActiveIndex = activeIndex >= 0
      ? activeIndex
      : historySelect.getSelectedIndex();
    scheduleHistoryRender();
  });
  historySelect.onActiveOptionChanged.add(() => {
    const activeIndex = historySelect.getActiveIndex();
    if (activeIndex >= 0) historyMenuActiveIndex = activeIndex;
  });
  historySelect.onClosed.add((_, reason) => {
    historyOpening = false;
    historyClosing = false;
    if (reason === SelectCloseReason.SELECTION) {
      historySelectionClosedPending = true;
    }
    scheduleHistoryRender();
  });
  const formatConversationOption = (savedConversation) => {
    const summary = String(savedConversation.firstUserMessage || "空对话")
      .replace(/\s+/g, " ")
      .trim();
    const preview = summary.length > 22 ? `${summary.slice(0, 21)}…` : summary;
    const date = savedConversation.updatedAt.slice(5, 16).replace("T", " ");
    return `${date}  ${preview}`;
  };
  const refreshHistoryOptions = () => {
    historyOptions = conversationStore.listConversationSummaries();
    const selectedIndex = viewModel.viewingConversationId
      ? historyOptions.findIndex((entry) => entry.id === viewModel.viewingConversationId) + 1
      : 0;
    syncingHistorySelect = true;
    historySelect.setOptions([
      "当前对话",
      ...historyOptions.map(formatConversationOption),
    ]);
    historySelect.setSelectedIndex(selectedIndex);
    syncingHistorySelect = false;
  };
  const showCurrentConversation = (renderImmediately = true) => {
    if (!viewModel.viewingConversationId && historySelect.getSelectedIndex() === 0) {
      return false;
    }
    viewModel.viewingConversationId = null;
    viewedConversation = null;
    syncingHistorySelect = true;
    historySelect.setSelectedIndex(0);
    syncingHistorySelect = false;
    if (renderImmediately) render();
    else scheduleHistoryRender();
    return true;
  };
  const scheduleReturnToCurrent = () => {
    pendingReturnToCurrent = true;
  };
  const showHistorySelection = (selectedIndex) => {
    if (selectedIndex <= 0) {
      viewModel.viewingConversationId = null;
      viewedConversation = null;
      scheduleHistoryRender();
      return;
    }
    const selectedSummary = historyOptions[selectedIndex - 1];
    if (!selectedSummary) return;
    const selectedConversation = conversationStore.getConversation(selectedSummary.id);
    if (!selectedConversation) throw new Error(`找不到历史会话：${selectedSummary.id}`);
    console.log(JSON.stringify({
      event: "history.select",
      conversation_id: selectedConversation.id,
      ts: new Date().toISOString(),
    }));
    viewModel.viewingConversationId = selectedSummary.id;
    viewedConversation = selectedConversation;
    scheduleHistoryRender();
  };
  const scheduleHistorySelection = (selectedIndex) => {
    pendingHistorySelectionIndex = selectedIndex;
  };
  const processPendingHistoryUi = () => {
    if (historyOpenedPending) {
      historyOpenedPending = false;
      if (historySelect.isOpen()) {
        historyMenuInitialIndex = historySelect.getSelectedIndex();
      }
    }

    if (historySelectionClosedPending) {
      historySelectionClosedPending = false;
      if (pendingHistorySelectionIndex === undefined) {
        pendingHistorySelectionIndex = historyMenuActiveIndex;
      }
    }

    if (pendingReturnToCurrent && !historySelect.isOpen()) {
      pendingReturnToCurrent = false;
      showCurrentConversation(false);
    }

    if (pendingHistorySelectionIndex !== undefined && !historySelect.isOpen()) {
      const selectedIndex = pendingHistorySelectionIndex;
      pendingHistorySelectionIndex = undefined;
      showHistorySelection(selectedIndex);
    }

    if (historyRenderPending) {
      historyRenderPending = false;
      render();
    }
  };
  const updateStatus = (notice, state) => {
    viewModel.notice = notice;
    viewModel.state = retained.requestProcessing && state === "待命"
      ? "处理中"
      : state;
    render();
  };
  const scheduleIdleState = () => {
    if (retained.idleTimer) clearTimeout(retained.idleTimer);
    retained.idleTimer = setTimeout(() => {
      retained.idleTimer = undefined;
      if (retained.requestProcessing || viewModel.state === "待确认") return;
      updateStatus("可继续说话或提交文字", "待命");
    }, IDLE_TIMEOUT_MS);
  };
  const handleText = (input, source = "text") => {
    const text = String(input || "").trim();
    if (!text) return;

    if (retained.requestController) {
      retained.requestController.abort();
      retained.requestController = undefined;
    }
    if (retained.pendingMessageId) {
      conversationStore.updateMessage(conversation.id, retained.pendingMessageId, {
        text: "已由新请求取代",
        status: "superseded",
      });
      const previousMessage = conversation.messages.find((message) =>
        message.id === retained.pendingMessageId);
      if (previousMessage) {
        previousMessage.text = "已由新请求取代";
        previousMessage.status = "superseded";
      }
      retained.pendingMessageId = undefined;
    }
    showCurrentConversation();
    retained.voiceRetryCount = 0;
    if (!retained.voiceSession) scheduleVoiceRestart(updateStatus);
    if (retained.idleTimer) {
      clearTimeout(retained.idleTimer);
      retained.idleTimer = undefined;
    }

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMessageId = `user-${requestId}`;
    const responseMessageId = `assistant-${requestId}`;
    const startedAt = Date.now();
    const requestController = new AbortController();
    retained.requestController = requestController;
    conversation.latestRequestId = requestId;
    retained.requestProcessing = true;
    viewModel.state = "处理中";
    viewModel.notice = "正在处理你的请求";
    const userMessage = {
      id: userMessageId,
      role: "user",
      text,
      source,
    };
    const pendingMessage = {
      id: responseMessageId,
      role: "assistant",
      text: "正在思考…",
      status: "pending",
    };
    conversationStore.appendMessages(conversation.id, [userMessage, pendingMessage]);
    conversation.messages = conversation.messages.slice(-DEFAULT_MAX_MESSAGES_PER_CONVERSATION);
    conversation.messages.push(userMessage);
    conversation.messages.push({
      id: responseMessageId,
      role: "assistant",
      text: "正在思考…",
      status: "pending",
    });
    conversation.messages = conversation.messages.slice(-DEFAULT_MAX_MESSAGES_PER_CONVERSATION);
    currentConversationDirty = true;
    retained.pendingMessageId = responseMessageId;
    refreshHistoryOptions();
    render();
    console.log(JSON.stringify({
      event: "daily_agent.requested",
      request_id: requestId,
      source,
      input_length: text.length,
      ts: new Date().toISOString(),
    }));

    dailyAgent.handle({
      history: conversation.history,
      text,
      signal: requestController.signal,
    }).then((result) => {
      if (retained.requestController === requestController) {
        retained.requestController = undefined;
      }
      if (!retained.window || requestId !== conversation.latestRequestId) return;
      conversation.history.push({ role: "user", text, request_id: requestId });
      conversation.history.push({ role: "assistant", text: result.response, request_id: requestId });
      retained.requestProcessing = false;
      conversationStore.updateMessage(conversation.id, responseMessageId, {
        text: result.response,
        status: "complete",
      });
      const responseEntry = conversation.messages.find((message) =>
        message.id === responseMessageId);
      if (responseEntry) {
        responseEntry.text = result.response;
        responseEntry.status = "complete";
      }
      currentConversationDirty = true;
      retained.pendingMessageId = undefined;
      viewModel.state = "完成";
      viewModel.notice = result.processor === "local" ? "已在本机完成" : "AI 回复";
      refreshHistoryOptions();
      render();
      scheduleIdleState();
      console.log(JSON.stringify({
        event: result.processor === "ai" ? "daily_agent.responded" : "daily_agent.executed",
        request_id: requestId,
        intent: result.intent,
        processor: result.processor,
        elapsed_ms: Date.now() - startedAt,
        ts: new Date().toISOString(),
      }));
    }).catch((error) => {
      if (retained.requestController === requestController) {
        retained.requestController = undefined;
      }
      if (!retained.window || requestId !== conversation.latestRequestId) return;
      retained.requestProcessing = false;
      const errorText = `处理失败：${error.message}`;
      conversationStore.updateMessage(conversation.id, responseMessageId, {
        text: errorText,
        status: "error",
      });
      const responseEntry = conversation.messages.find((message) =>
        message.id === responseMessageId);
      if (responseEntry) {
        responseEntry.text = errorText;
        responseEntry.status = "error";
      }
      currentConversationDirty = true;
      retained.pendingMessageId = undefined;
      updateStatus(`日常助手暂时不可用：${error.message}`, "异常");
      refreshHistoryOptions();
      render();
      scheduleIdleState();
      console.error("IrisView daily agent failed", error);
      console.log(JSON.stringify({
        event: "daily_agent.failed",
        request_id: requestId,
        elapsed_ms: Date.now() - startedAt,
        error_name: error.name,
        ts: new Date().toISOString(),
      }));
    });
  };

  retained.voiceTextHandler = (text, final) => {
    if (!text) return;
    if (!final) {
      updateStatus("正在识别语音…", "处理中");
      return;
    }
    handleText(text, "voice-asr");
  };

  const handleNavigation = () => {
    const action = takeNavigationAction();
    if (action === null) return;
    dispatchNavigationActions([action], {
      isHistoryOpen: () => historySelect.isOpen() || historyOpening || historyClosing,
      isHistoryOpening: () => historySelect.isOpen() || historyOpening,
      getHistoryIndex: () => {
        const activeIndex = historySelect.getActiveIndex();
        return activeIndex >= 0 ? activeIndex : historySelect.getSelectedIndex();
      },
      getHistoryCount: () => historySelect.getOptionCount(),
      setHistoryIndex: (index) => {
        syncingHistorySelect = true;
        historySelect.setSelectedIndex(index);
        syncingHistorySelect = false;
      },
      getInitialHistoryIndex: () => historyMenuInitialIndex,
      activateHistory: scheduleHistorySelection,
      closeHistory: () => {
        if (historyClosing || !historySelect.isOpen()) return;
        historyClosing = true;
        historySelect.close();
      },
      isViewingArchive: () => Boolean(viewModel.viewingConversationId),
      returnToCurrent: () => {
        scheduleReturnToCurrent();
      },
      openHistory: () => {
        if (historyOpening || historySelect.isOpen()) return;
        historyOpening = true;
        try {
          historySelect.open();
        } catch (error) {
          historyOpening = false;
          throw error;
        }
      },
      scroll: (delta) => {
        conversationScrollOffset = Math.max(
          0,
          Math.min(maxConversationScrollOffset, conversationScrollOffset + delta),
        );
        conversationText.setPosition([16, 8 - conversationScrollOffset, 0]);
        if (viewModel.viewingConversationId) {
          archivedConversationScrollOffsets.set(
            viewModel.viewingConversationId,
            conversationScrollOffset,
          );
        } else {
          currentConversationScrollOffset = conversationScrollOffset;
        }
      },
    });
  };

  const startInteractiveServices = () => {
    if (!retained.window || retained.inputTimer) return;
    retained.inputTimer = setInterval(() => {
      try {
        const input = takeTextInput();
        if (input && typeof input.text === "string") handleText(input.text);
        handleNavigation();
        processPendingHistoryUi();
        readVoiceEvents(updateStatus);
        retained.lastInputError = undefined;
      } catch (error) {
        const errorMessage = error.message || String(error);
        if (retained.lastInputError !== errorMessage) {
          retained.lastInputError = errorMessage;
          console.error("IrisView input event loop failed", error);
          viewModel.notice = `输入异常：${errorMessage}`;
          viewModel.state = "异常";
        }
      }
    }, 50);
    startVoiceInput(updateStatus);
  };
  const finishSplash = () => {
    if (!retained.window) return;
    if (retained.splashTimer) clearTimeout(retained.splashTimer);
    retained.splashTimer = undefined;
    const splashImage = retained.splashImage;
    retained.splashImage = undefined;
    if (splashImage) splashImage.dispose(false);
    startInteractiveServices();
  };
  const splashImage = Image.create();
  splashImage.setParent(retained.board);
  splashImage.setIgnoreLayout(true);
  splashImage.setPosition([0, 0, 0]);
  splashImage.setSize([635, 480, 0]);
  splashImage.setForeground();
  retained.splashImage = splashImage;
  splashImage.onDataCompletion.add((errorCode, source) => {
    if (!retained.window || retained.splashImage !== splashImage) return;
    if (errorCode !== 0) {
      console.error(`IrisView splash image failed to load (${errorCode}): ${source}`);
      finishSplash();
      return;
    }
    retained.splashTimer = setTimeout(finishSplash, 1500);
  });

  refreshHistoryOptions();
  render();
  try {
    splashImage.setSource("assets/start-screen.png");
  } catch (error) {
    console.error("IrisView splash image could not be loaded", error);
    finishSplash();
  }
  console.log("IrisView application ready: example.myfirstapp");
}

function startVoiceInput(updateStatus) {
  if (retained.voiceStarting) return;
  if (retained.voiceSession) {
    updateStatus("语音采集会话尚未结束，请稍候", "待命");
    return;
  }

  retained.voiceStarting = true;
  try {
    const availability = getVoiceInputAvailability("audio");
    if (!availability.canRequest) {
      updateStatus(`语音不可用：${availability.reason}`, "异常");
      if (availability.reason === "busy") scheduleVoiceRestart(updateStatus);
      return;
    }

    retained.voiceSession = requestVoiceInput({ mode: "audio" });
    retained.voiceFrames = 0;
    retained.voiceRecoveryRequested = false;
    retained.voicePendingTimer = setTimeout(() => {
      retained.voicePendingTimer = undefined;
      if (retained.voiceSession?.state === "pending") {
        retained.voiceRecoveryRequested = true;
        updateStatus("等待语音采集确认超时，正在恢复", "异常");
        retained.voiceSession.cancel();
      }
    }, VOICE_CONFIRMATION_TIMEOUT_MS);

    retained.asr = new AsrClient({
      onStatus: (notice) => updateStatus(notice, "待命"),
      onText: retained.voiceTextHandler,
      onError: (error) => {
        updateStatus(`语音识别失败：${error.message}`, "异常");
        retained.voiceRecoveryRequested = true;
        if (retained.voiceSession) retained.voiceSession.cancel();
        if (retained.asr) retained.asr.close();
        retained.asr = undefined;
      },
      onFinished: () => {
        updateStatus("语音识别完成", "完成");
        retained.asr = undefined;
        scheduleVoiceRestart(updateStatus);
      },
    });
    if (!retained.asr.start()) {
      clearTimeout(retained.voicePendingTimer);
      retained.voicePendingTimer = undefined;
      if (retained.voiceSession) retained.voiceSession.cancel();
      if (retained.asr) retained.asr.close();
      retained.asr = undefined;
      return;
    }
    updateStatus("等待确认语音采集请求", "待命");
  } catch (error) {
    if (retained.voicePendingTimer) clearTimeout(retained.voicePendingTimer);
    retained.voicePendingTimer = undefined;
    if (retained.asr) retained.asr.close();
    retained.asr = undefined;
    if (retained.voiceSession) retained.voiceSession.cancel();
    updateStatus(`语音请求失败：${error.code || error.message}`, "异常");
    console.error("IrisView voice input failed", error);
    if (error.code === "busy") scheduleVoiceRestart(updateStatus);
  } finally {
    retained.voiceStarting = false;
  }
}

function readVoiceEvents(updateStatus) {
  const session = retained.voiceSession;
  if (!session) return;
  let event;
  let processedEvents = 0;
  while (processedEvents < 8 && (event = session.takeEvent())) {
    processedEvents += 1;
    if (event.type === "audio") {
      if (retained.voicePendingTimer) clearTimeout(retained.voicePendingTimer);
      retained.voicePendingTimer = undefined;
      retained.voiceFrames += 1;
      if (retained.asr) retained.asr.pushAudio(event.data);
    } else if (event.type === "state") {
      if (event.state === "recording") {
        if (retained.voicePendingTimer) clearTimeout(retained.voicePendingTimer);
        retained.voicePendingTimer = undefined;
        retained.voiceRetryCount = 0;
      }
      updateStatus(`语音状态：${event.state}`, "待命");
    } else if (event.type === "end") {
      if (retained.voicePendingTimer) clearTimeout(retained.voicePendingTimer);
      retained.voicePendingTimer = undefined;
      const cancelled = event.status !== "completed" && event.reason === "user-cancelled";
      const shouldRecover = retained.voiceRecoveryRequested ||
        ["timeout", "disconnected", "device-unavailable", "provider-error", "overflow"].includes(event.reason);
      console.log(JSON.stringify({
        event: "voice_input.ended",
        session_id: session.id,
        status: event.status,
        reason: event.reason,
        frames: retained.voiceFrames,
        recovery_requested: retained.voiceRecoveryRequested,
        ts: new Date().toISOString(),
      }));
      updateStatus(
        event.status === "completed"
          ? `语音已接收（${retained.voiceFrames} 帧），正在完成识别`
          : cancelled ? "语音采集已取消" : `语音结束：${event.reason}`,
        event.status === "completed" || cancelled ? "待命" : "异常",
      );
      if (event.status === "completed" && retained.asr) retained.asr.finish();
      if (event.status !== "completed") {
        if (retained.asr) retained.asr.close();
        retained.asr = undefined;
      }
      retained.voiceSession = undefined;
      retained.voiceFrames = 0;
      retained.voiceRecoveryRequested = false;
      if (shouldRecover) scheduleVoiceRestart(updateStatus);
    }
  }
}

function scheduleVoiceRestart(updateStatus, delay = 800) {
  if (!retained.inputTimer || retained.voiceRestartTimer) return;
  if ((retained.voiceRetryCount || 0) >= MAX_VOICE_RETRIES) {
    console.error("IrisView voice restart limit reached");
    return;
  }
  retained.voiceRetryCount = (retained.voiceRetryCount || 0) + 1;
  retained.voiceRestartTimer = setTimeout(() => {
    retained.voiceRestartTimer = undefined;
    if (retained.inputTimer && !retained.voiceSession) startVoiceInput(updateStatus);
  }, delay);
}

App.createApp((lifecycle) => {
  if (lifecycle === AppLifecycle.ON_CREATE) start();
  if (lifecycle === AppLifecycle.ON_DESTROY) {
    if (retained.pendingMessageId && retained.conversationStore && retained.conversationId) {
      try {
        retained.conversationStore.updateMessage(
          retained.conversationId,
          retained.pendingMessageId,
          { text: "应用关闭时回复尚未完成", status: "interrupted" },
        );
      } catch (error) {
        console.error("IrisView could not finalize pending conversation message", error);
      }
    }
    if (retained.inputTimer) clearInterval(retained.inputTimer);
    if (retained.idleTimer) clearTimeout(retained.idleTimer);
    if (retained.voicePendingTimer) clearTimeout(retained.voicePendingTimer);
    if (retained.voiceRestartTimer) clearTimeout(retained.voiceRestartTimer);
    if (retained.splashTimer) clearTimeout(retained.splashTimer);
    if (retained.voiceSession) retained.voiceSession.cancel();
    if (retained.asr) retained.asr.close();
    if (retained.requestController) retained.requestController.abort();
    retained.inputTimer = undefined;
    retained.idleTimer = undefined;
    retained.voicePendingTimer = undefined;
    retained.requestProcessing = false;
    retained.voiceStarting = false;
    retained.voiceRecoveryRequested = false;
    retained.voiceRetryCount = 0;
    retained.voiceSession = undefined;
    retained.asr = undefined;
    retained.pendingMessageId = undefined;
    retained.conversationStore = undefined;
    retained.conversationId = undefined;
    retained.voiceTextHandler = undefined;
    retained.lastInputError = undefined;
    retained.requestController = undefined;
    retained.voiceRestartTimer = undefined;
    retained.splashTimer = undefined;
    retained.splashImage = undefined;
    retained.window = undefined;
    retained.root = undefined;
    retained.board = undefined;
  }
});
