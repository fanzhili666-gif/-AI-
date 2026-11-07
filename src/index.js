"use strict";

const { applicationDataDirectory, applicationDataPath } = require("./application-data");
const { AsrClient } = require("./asr-client");
const { createDailyAgent } = require("./daily-agent");
const { analyzeConversation } = require("./ai-agent");
const { parseIntent } = require("./intent-parser");
const { searchSop } = require("./sop-search");
const { projectEntity } = require("./view-projection");
const { mergeContext } = require("./context-merge");
const { resolveTarget } = require("./ambiguity-resolver");
const {
  parseRuleActionItems,
  parseDeadlineUpdate,
  isSummaryRequest,
} = require("./rule-action-parser");
const {
  proposeChange,
  confirmChange,
  cancelChange,
} = require("./confirmation-core");
const { adaptAiResult } = require("./domain-adapter");
const {
  createDomainSession,
  dispatchDomainCommand,
} = require("./domain-orchestrator");
const { App, AppLifecycle, Window, WindowProperty } = require("@irisview/osx/os");
const {
  getVoiceInputAvailability,
  requestVoiceInput,
  takeTextInput,
} = require("@irisview/osx/os/input");
const {
  Board,
  Color,
  Font,
  FusionRoot,
  Text,
  TextAlign,
} = require("@irisview/osx/fusionui");

const retained = {};

function start() {
  if (retained.window) return;
  retained.dataDirectory = applicationDataDirectory();
  const dailyAgent = createDailyAgent({
    filePath: applicationDataPath("daily-agent.json"),
  });
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
    title: "AI 日常助手",
    items: [],
    visibleItems: [],
    source: "demo",
    isInjected: false,
    highlighted: false,
    projection: ["device", "issue", "owner", "reviewer", "deadline", "priority", "status"],
    aruiVersion: 0,
    response: "请说话或输入文字，我可以聊天、记录备忘、管理待办和安排日程",
  };
  const conversation = {
    sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    history: [],
    entity: {},
    context: { entities: {}, metadata: {} },
    changes: [],
    transcript: [],
  };
  conversation.domainSession = createDomainSession(conversation.sessionId);
  const appendTranscript = (role, text, requestId) => {
    conversation.transcript.push({ role, text, requestId });
    conversation.transcript = conversation.transcript.slice(-12);
  };
  const renderTranscript = () => {
    if (!conversation.transcript.length) return "暂无对话记录";
    const lines = [];
    let length = 0;
    for (const entry of conversation.transcript.slice(-8).reverse()) {
      const text = String(entry.text || "").replace(/\s+/g, " ").trim();
      const remaining = Math.max(0, 720 - length);
      if (!remaining) break;
      const preview = text.length > remaining ? `${text.slice(0, Math.max(0, remaining - 1))}…` : text;
      lines.unshift(`${entry.role === "user" ? "你" : "AI"}：${preview}`);
      length += preview.length;
    }
    return lines.join("\n\n");
  };
  const animateAssistantResponse = (requestId, text) => {
    if (retained.typingTimer) clearInterval(retained.typingTimer);
    const entry = conversation.transcript.findLast((item) =>
      item.role === "assistant" && item.requestId === requestId);
    if (!entry) return;
    entry.text = "";
    let offset = 0;
    retained.typingTimer = setInterval(() => {
      if (requestId !== conversation.latestRequestId || offset >= text.length) {
        clearInterval(retained.typingTimer);
        retained.typingTimer = undefined;
        if (requestId === conversation.latestRequestId) {
          entry.text = text;
          render();
        }
        return;
      }
      const chunk = text.slice(offset, offset + 2);
      entry.text += chunk;
      offset += chunk.length;
      viewModel.response = entry.text;
      render();
    }, 140);
  };
  const processDailyInput = (normalized, source, requestId) => {
    viewModel.source = source;
    viewModel.state = "处理中";
    viewModel.response = "正在理解你的请求";
    conversation.latestRequestId = requestId;
    if (retained.typingTimer) {
      clearInterval(retained.typingTimer);
      retained.typingTimer = undefined;
      const previous = conversation.transcript.findLast((item) => item.role === "assistant");
      if (previous && previous.text === "AI 正在思考…") previous.text = "上一条请求未完成";
    }
    appendTranscript("user", normalized, requestId);
    appendTranscript("assistant", "AI 正在思考…", requestId);
    render();
    console.log(JSON.stringify({
      event: "daily_agent.requested",
      request_id: requestId,
      source,
      text: normalized,
      ts: new Date().toISOString(),
      data_source: "real",
      is_injected: false,
    }));
    dailyAgent.handle({
      history: conversation.history,
      text: normalized,
    }).then((result) => {
      if (requestId !== conversation.latestRequestId) return;
      conversation.history.push({ role: "user", text: normalized, request_id: requestId });
      conversation.history.push({ role: "assistant", text: result.response, request_id: requestId });
      viewModel.title = "日常智能体";
      viewModel.items = [];
      viewModel.visibleItems = [];
      viewModel.state = "完成";
      viewModel.response = "";
      bumpAruiVersion();
      render();
      animateAssistantResponse(requestId, result.response);
      console.log(JSON.stringify({
        event: result.processor === "ai" ? "daily_agent.responded" : "daily_agent.executed",
        request_id: requestId,
        intent: result.intent,
        processor: result.processor,
        ts: new Date().toISOString(),
        data_source: "real",
        is_injected: false,
      }));
    }).catch((error) => {
      console.error("IrisView daily agent failed", error);
      console.log(JSON.stringify({
        event: "daily_agent.failed",
        request_id: requestId,
        reason: error.message,
        ts: new Date().toISOString(),
        data_source: "real",
        is_injected: false,
      }));
      if (requestId === conversation.latestRequestId) {
        const assistantEntry = conversation.transcript.findLast((item) =>
          item.role === "assistant" && item.requestId === requestId);
        if (assistantEntry) assistantEntry.text = `处理失败：${error.message}`;
        updateResponse(`日常智能体暂时不可用：${error.message}`, "异常");
      }
    });
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
  const observableStates = ["待命", "处理中", "待确认", "完成", "异常"];
  const renderStateLabels = () => `状态栏：${observableStates.map((state) =>
    state === viewModel.state ? `【● ${state}】` : `○ ${state}`,
  ).join("  ")}`;
  const renderItems = () => {
    if (!viewModel.visibleItems.length) return "暂无匹配行动项";
    return viewModel.visibleItems.map((item, index) => {
      const marker = viewModel.highlighted && index === 0 ? "【置顶 · 高亮】" : "";
      const fields = projectEntity({
        device: item.device,
        issue: item.issue || item.action,
        owner: item.owner,
        reviewer: item.reviewer,
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
      `AI 日常助手\n\n` +
      `${renderStateLabels()}\n\n` +
      `当前状态：${viewModel.state}\n\n` +
      `对话记录\n${renderTranscript()}\n\n` +
      `语音输入已开启 · 可直接说话`,
    );
    displayText.getLocalStyle().setTextColor(stateColors[viewModel.state]);
  };
  const bumpAruiVersion = () => {
    viewModel.aruiVersion += 1;
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
    bumpAruiVersion();
    render();
  };
  const buildActionItem = (entities, summary, status = "处理中") => ({
    device: entities.device || "待提取",
    issue: entities.issue || "待提取",
    action: entities.issue || summary || "待提取",
    owner: entities.owner || "待提取",
    reviewer: entities.reviewer || "待提取",
    deadline: entities.deadline || "待提取",
    priority: entities.priority || "待提取",
    status,
    data_source: "real",
    is_injected: false,
  });
  const applyConfirmedResult = (pending) => {
    const { result, normalized, requestId } = pending;
    const merged = mergeContext({
      context: conversation.context,
      patch: result.entities,
      source: result.processor || "ai",
      updatedAt: new Date().toISOString(),
    });
    conversation.context = merged.context;
    conversation.entity = conversation.context.entities;
    conversation.changes.push(...merged.changes);
    const entity = conversation.entity;
    const item = buildActionItem(entity, result.summary || normalized);
    updateItems(
      [item],
      result.summary || "已确认并更新行动项",
      "完成",
    );
    return {
      status: "applied",
      state: "完成",
      message: result.summary || "已确认并更新行动项",
      items: [item],
    };
  };
  const applyAiResult = (result, normalized, requestId) => {
    if (requestId !== conversation.latestRequestId) {
      console.log(JSON.stringify({
        event: "ai.obsolete",
        request_id: requestId,
        session_id: conversation.sessionId,
        ts: new Date().toISOString(),
        data_source: "real",
        is_injected: false,
      }));
      return;
    }
    const command = adaptAiResult({
      result,
      sessionId: conversation.sessionId,
      requestId,
      baseVersion: conversation.domainSession.version,
    });
    if (["UpdateActionItem", "CorrectEntity"].includes(command.type)) {
      const target = resolveTarget({
        items: viewModel.items,
        target: command.target,
      });
      if (target.status !== "resolved") {
        viewModel.state = target.status === "ambiguous" ? "待确认" : "异常";
        viewModel.response = target.message || "无法确定要修改的行动项";
        bumpAruiVersion();
        render();
        console.log(JSON.stringify({
          event: "ai.ambiguous",
          request_id: requestId,
          session_id: conversation.sessionId,
          reason: target.reason,
          candidates: target.candidates || [],
          ts: new Date().toISOString(),
          data_source: "real",
          is_injected: false,
        }));
        return;
      }
    }
    if (command.needsConfirmation &&
        ["CreateActionItem", "UpdateActionItem", "CorrectEntity"].includes(command.type)) {
      const changeId = `change-${requestId}`;
      const pending = conversation.domainSession.pendingChange;
      if (pending) {
        const entities = {
          ...(pending.result?.entities || {}),
          ...result.entities,
        };
        pending.command = command;
        pending.diff = { fields: entities };
        pending.result = { ...result, entities };
        pending.normalized = normalized;
        pending.requestId = requestId;
        updateItems(
          [buildActionItem(entities, result.summary, "待确认")],
          result.summary || pending.message,
          "待确认",
        );
        conversation.history.push({ role: "user", text: normalized, request_id: requestId });
        conversation.history.push({ role: "assistant", text: result.summary, request_id: requestId });
        console.log(JSON.stringify({
          event: "ai.pending_confirmation_updated",
          request_id: requestId,
          session_id: conversation.sessionId,
          change_id: pending.id,
          domain_version: conversation.domainSession.version,
          ts: new Date().toISOString(),
          data_source: "real",
          is_injected: false,
        }));
        return;
      }
      const proposal = proposeChange({
        session: conversation.domainSession,
        changeId,
        command,
        diff: { fields: result.entities },
        message: result.summary || "检测到行动项变更，请确认后执行",
      });
      if (proposal.status !== "pending_confirmation") {
        viewModel.state = "异常";
        viewModel.response = proposal.message;
      } else {
        conversation.domainSession.pendingChange.result = result;
        conversation.domainSession.pendingChange.normalized = normalized;
        conversation.domainSession.pendingChange.requestId = requestId;
        const item = buildActionItem(result.entities, result.summary, "待确认");
        updateItems([item], proposal.message, "待确认");
        conversation.history.push({ role: "user", text: normalized, request_id: requestId });
        conversation.history.push({ role: "assistant", text: result.summary, request_id: requestId });
        viewModel.state = "待确认";
        viewModel.response = proposal.message;
      }
      bumpAruiVersion();
      render();
      console.log(JSON.stringify({
        event: "ai.pending_confirmation",
        request_id: requestId,
        session_id: conversation.sessionId,
        change_id: changeId,
        domain_version: proposal.version,
        ts: new Date().toISOString(),
        data_source: "real",
        is_injected: false,
      }));
      return;
    }
    const domainResult = dispatchDomainCommand({
      command,
      session: conversation.domainSession,
      apply: (received) => ({
        status: received.needsConfirmation ? "pending_confirmation" : "applied",
        state: received.needsConfirmation ? "待确认" : "处理中",
        message: received.summary,
      }),
    });
    if (domainResult.status === "obsolete") {
      console.log(JSON.stringify({
        event: "ai.obsolete",
        request_id: requestId,
        session_id: conversation.sessionId,
        reason: domainResult.reason,
        domain_version: domainResult.version,
        ts: new Date().toISOString(),
        data_source: "real",
        is_injected: false,
      }));
      return;
    }
    const merged = mergeContext({
      context: conversation.context,
      patch: result.entities,
      source: result.processor || "ai",
      updatedAt: new Date().toISOString(),
    });
    conversation.context = merged.context;
    conversation.entity = conversation.context.entities;
    conversation.changes.push(...merged.changes);
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
      viewModel.state = "完成";
      viewModel.response = result.summary || `已按条件筛选 ${viewModel.visibleItems.length} 条行动项`;
      bumpAruiVersion();
      render();
    } else if (result.intent === "prioritize") {
      viewModel.highlighted = Boolean(result.view.highlight);
      viewModel.visibleItems = [...viewModel.items].sort((a, b) =>
        (b.status === "待确认") - (a.status === "待确认"));
      viewModel.state = "完成";
      viewModel.response = result.summary || "已将重点行动项置顶";
      bumpAruiVersion();
      render();
    } else if (["create_ticket", "update_field", "correct_entity"].includes(result.intent)) {
      const entity = conversation.entity;
      const item = buildActionItem(
        entity,
        result.summary || normalized,
        result.needs_confirmation ? "待确认" : "处理中",
      );
      updateItems(
        [item],
        result.summary || (result.intent === "correct_entity" ? "已更正行动项字段" : "AI 已更新行动项"),
        result.needs_confirmation ? "待确认" : "完成",
      );
    } else if (result.intent === "summarize" || result.intent === "explain") {
      viewModel.response = result.summary || "当前会话暂无摘要";
      viewModel.state = result.needs_confirmation ? "待确认" : "完成";
      bumpAruiVersion();
      render();
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
      bumpAruiVersion();
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
      if (result.intent === "unknown") {
        console.log(JSON.stringify({
          event: "ai.chat.responded",
          request_id: requestId,
          session_id: conversation.sessionId,
          response: viewModel.response,
          ts: new Date().toISOString(),
          data_source: "real",
          is_injected: false,
        }));
      }
      render();
    }
    console.log(JSON.stringify({
      event: "ai.processed",
      request_id: requestId,
      session_id: conversation.sessionId,
      intent: result.intent,
      entities: result.entities,
      processor: result.processor,
      context_changes: merged.changes,
      domain_version: domainResult.version,
      state: viewModel.state,
      arui_version: viewModel.aruiVersion,
      ts: new Date().toISOString(),
      data_source: "real",
      is_injected: false,
    }));
  };
  const tryAi = (normalized, source, requestId) => {
    if (!process.env.DASHSCOPE_API_KEY) return false;
    viewModel.state = "处理中";
    viewModel.response = "AI 正在理解输入";
    conversation.latestRequestId = requestId;
    bumpAruiVersion();
    render();
    analyzeConversation({ history: conversation.history, text: normalized })
      .then((result) => applyAiResult(result, normalized, requestId))
      .catch((error) => {
        console.error("IrisView AI processing failed", error);
        if (requestId !== conversation.latestRequestId) {
          console.log(JSON.stringify({
            event: "ai.obsolete",
            request_id: requestId,
            session_id: conversation.sessionId,
            reason: "stale_fallback",
            ts: new Date().toISOString(),
            data_source: "real",
            is_injected: false,
          }));
          return;
        }
        const isRuleRequest = isSummaryRequest(normalized) ||
          parseDeadlineUpdate(normalized) ||
          parseRuleActionItems(normalized).length ||
          parseIntent(normalized).intent === "correct_entity";
        if (!isRuleRequest && parseIntent(normalized).intent === "unknown") {
          updateResponse(`AI 暂时不可用：${error.message}`, "异常");
          console.log(JSON.stringify({
            event: "ai.chat.failed",
            request_id: requestId,
            session_id: conversation.sessionId,
            reason: error.message,
            ts: new Date().toISOString(),
            data_source: "real",
            is_injected: false,
          }));
          return;
        }
        updateResponse(`AI 不可用，已切换规则模式：${error.message}`, "处理中");
        try {
          handleRuleText(normalized, source, requestId);
        } catch (fallbackError) {
          console.error("IrisView rule fallback failed", fallbackError);
          updateResponse(`规则回退失败：${fallbackError.message}`, "异常");
        }
      });
    return true;
  };
  const handleRuleText = (normalized, source, requestId) => {
    conversation.latestRequestId = requestId;
    conversation.history.push({ role: "user", text: normalized, request_id: requestId });
    return processRuleText(normalized, source, requestId);
  };
  const handleText = (text, source = "text") => {
    const normalized = text.trim();
    if (!normalized) return;
    viewModel.source = source;
    viewModel.isInjected = false;
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    conversation.latestRequestId = requestId;
    console.log(JSON.stringify({
      event: "input.received",
      request_id: requestId,
      source,
      text: normalized,
      ts: new Date().toISOString(),
      data_source: "real",
      is_injected: false,
    }));
    processDailyInput(normalized, source, requestId);
    return;
    if (/^(?:确认|执行|好的|取消|撤销)/.test(normalized)) {
      const pending = conversation.domainSession.pendingChange;
      const decision = /^(?:取消|撤销)/.test(normalized) ? "cancel" : "confirm";
      const result = decision === "confirm"
        ? confirmChange({
          session: conversation.domainSession,
          changeId: pending?.id || "",
          apply: applyConfirmedResult,
        })
        : cancelChange({
          session: conversation.domainSession,
          changeId: pending?.id || "",
        });
      viewModel.state = result.state || (result.status === "obsolete" ? "异常" : "完成");
      viewModel.response = result.message;
      bumpAruiVersion();
      render();
      console.log(JSON.stringify({
        event: "confirmation.processed",
        request_id: requestId,
        session_id: conversation.sessionId,
        decision,
        status: result.status,
        reason: result.reason,
        domain_version: result.version,
        ts: new Date().toISOString(),
        data_source: "real",
        is_injected: false,
      }));
      return;
    }
    const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every((line) =>
      isSummaryRequest(line) ||
      parseDeadlineUpdate(line) ||
      parseRuleActionItems(line).length ||
      parseIntent(line).intent === "correct_entity")) {
      for (const line of lines) handleRuleText(line, source, requestId);
      return;
    }
    const hasDeterministicRule = Boolean(
      isSummaryRequest(normalized) ||
      parseDeadlineUpdate(normalized) ||
      parseRuleActionItems(normalized).length,
    );
    if (!hasDeterministicRule &&
        !["待命", "待确认", "异常", "完成"].includes(normalized) &&
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
    if (parsedIntent.intent === "correct_entity") {
      const { field, from, to } = parsedIntent.slots;
      const currentItem = viewModel.items[0];
      const currentValue = field
        ? conversation.entity[field] || currentItem?.[field]
        : undefined;
      const resolvedField = field || Object.keys(conversation.entity)
        .find((key) => conversation.entity[key] === from);
      if (!resolvedField || !to || (from && currentValue && currentValue !== from)) {
        viewModel.state = "异常";
        viewModel.response = "无法确定要更正的字段，请说明字段名称";
      } else {
        conversation.entity[resolvedField] = to;
        const item = {
          ...(currentItem || {}),
          [resolvedField]: to,
          status: "处理中",
          data_source: "real",
          is_injected: false,
        };
        updateItems([item], `已将${from}更正为${to}`, "完成");
      }
    } else if (normalized === "待命") {
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
    } else if (isSummaryRequest(normalized) &&
        !parseRuleActionItems(normalized).length &&
        parseIntent(normalized).intent !== "correct_entity") {
      viewModel.visibleItems = viewModel.items;
      viewModel.title = `行动项 ${viewModel.items.length}/${viewModel.items.length}`;
      viewModel.state = "完成";
      viewModel.highlighted = viewModel.items.some((item) => item.status === "待确认");
      viewModel.response = viewModel.items.length
        ? `当前工单共 ${viewModel.items.length} 条：${viewModel.items.map((item) =>
          `${item.device || "设备待提取"}，${item.issue || item.action || "事项待提取"}，负责人${item.owner || "待提取"}，截止时间${item.deadline || "待提取"}`,
        ).join("；")}`
        : "当前暂无行动项";
      bumpAruiVersion();
      console.log(JSON.stringify({
        event: "action_items.summarized",
        request_id: requestId,
        result_count: viewModel.items.length,
        ts: new Date().toISOString(),
        data_source: "real",
        is_injected: false,
      }));
    } else {
      viewModel.state = "处理中";
      viewModel.highlighted = false;
      viewModel.response = "正在提取行动项";
      render();
      const deadline = parseDeadlineUpdate(normalized);
      const items = extractActionItems(normalized);
      if (deadline) {
        if (items.length) {
          for (const item of items) item.deadline = deadline;
        } else if (viewModel.items.length) {
          items.push(...viewModel.items.map((item) => ({ ...item, deadline })));
        }
      }
      const nextItems = items.length || !viewModel.items.length ? items : viewModel.items;
      updateItems(
        nextItems,
        items.length
          ? `已自动提取 ${items.length} 条行动项`
          : source === "voice-asr"
            ? `语音转写完成，未识别到行动项：${normalized}`
            : viewModel.items.length
              ? "未识别到新的行动项，已保留当前行动项"
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
  const extractActionItems = (text) => parseRuleActionItems(text);
  setTimeout(() => startVoiceInput(updateResponse), 0);
  retained.inputTimer = setInterval(() => {
    try {
      const input = takeTextInput();
      if (input && typeof input.text === "string") handleText(input.text);
      readVoiceEvents(updateResponse);
    } catch (error) {
      console.error("IrisView input event loop failed", error);
      updateResponse(`输入事件异常：${error.message}`, "异常");
    }
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
    if (retained.typingTimer) clearInterval(retained.typingTimer);
    if (retained.voiceRestartTimer) clearTimeout(retained.voiceRestartTimer);
    if (retained.voiceSession) retained.voiceSession.cancel();
    if (retained.asr) retained.asr.close();
    retained.inputTimer = undefined;
    retained.typingTimer = undefined;
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
