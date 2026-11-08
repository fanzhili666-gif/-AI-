"use strict";

const crypto = require("node:crypto");
const WebSocket = require("./websocket-client");

const ASR_URL = "wss://maas.qianwenaiapi.com/api-ws/v1/inference";
const ASR_MODEL = "qwen-audio-3.1-asr-flash-message";
const CONNECT_TIMEOUT_MS = 15000;
const FINISH_TIMEOUT_MS = 20000;

class AsrClient {
  constructor({
    onStatus,
    onText,
    onError,
    onFinished,
    apiKey = process.env.DASHSCOPE_API_KEY,
    WebSocketImpl = WebSocket,
    connectTimeoutMs = CONNECT_TIMEOUT_MS,
    finishTimeoutMs = FINISH_TIMEOUT_MS,
  }) {
    this.onStatus = onStatus;
    this.onText = onText;
    this.onError = onError;
    this.onFinished = onFinished;
    this.apiKey = apiKey;
    this.WebSocketImpl = WebSocketImpl;
    this.connectTimeoutMs = connectTimeoutMs;
    this.finishTimeoutMs = finishTimeoutMs;
    this.taskId = crypto.randomUUID();
    this.started = false;
    this.finished = false;
    this.finishRequested = false;
    this.timeout = undefined;
    this.pendingFrames = [];
    this.sentences = new Map();
    this.socket = undefined;
  }

  start() {
    if (!this.apiKey) {
      this.fail(new Error("DASHSCOPE_API_KEY 未配置"));
      return false;
    }

    const apiKey = this.apiKey;
    this.onStatus("正在连接语音识别服务");
    this.socket = new this.WebSocketImpl(ASR_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    this.socket.on("open", () => this.sendRunTask());
    this.socket.on("message", (data) => this.handleMessage(data));
    this.socket.on("error", (error) => this.fail(error));
    this.socket.on("close", () => {
      if (!this.finished && !this.finishRequested) {
        this.fail(new Error("语音识别连接已关闭"));
      }
    });
    this.setTimeout(this.connectTimeoutMs, "语音识别连接超时");
    return true;
  }

  setTimeout(delay, message) {
    this.clearTimeout();
    this.timeout = setTimeout(() => this.fail(new Error(message)), delay);
  }

  clearTimeout() {
    clearTimeout(this.timeout);
    this.timeout = undefined;
  }

  sendRunTask() {
    this.send({
      header: {
        action: "run-task",
        task_id: this.taskId,
        streaming: "duplex",
      },
      payload: {
        task_group: "audio",
        task: "asr",
        function: "recognition",
        model: ASR_MODEL,
        input: {},
        parameters: {
          format: "pcm",
          sample_rate: 16000,
          intermediate_result_enabled: true,
          disfluency_removal_enabled: true,
          vad_model: "far_field_meeting_16k",
        },
      },
    });
  }

  pushAudio(frame) {
    if (this.finished) return;
    const bytes = Buffer.from(frame);
    if (!this.started) {
      this.pendingFrames.push(bytes);
      return;
    }
    this.socket.send(bytes);
  }

  finish() {
    if (this.finished || this.finishRequested) return;
    this.finishRequested = true;
    if (this.started) this.sendFinishTask();
  }

  sendFinishTask() {
    if (!this.started || this.finished) return;
    this.setTimeout(this.finishTimeoutMs, "语音识别结果等待超时");
    this.send({
      header: {
        action: "finish-task",
        task_id: this.taskId,
        streaming: "duplex",
      },
      payload: { input: {} },
    });
  }

  close() {
    this.finished = true;
    this.clearTimeout();
    if (this.socket) this.socket.close();
  }

  send(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      this.fail(new Error(`ASR 返回无效 JSON：${error.message}`));
      return;
    }
    const event = message.header && message.header.event;
    if (event === "task-started") {
      this.started = true;
      this.clearTimeout();
      this.onStatus("语音识别已连接，请说话");
      for (const frame of this.pendingFrames) this.socket.send(frame);
      this.pendingFrames = [];
      if (this.finishRequested) this.sendFinishTask();
      return;
    }
    if (event === "result-generated") {
      const sentence = message.payload?.output?.sentence;
      if (!sentence || sentence.heartbeat) return;
      this.sentences.set(sentence.sentence_id, sentence.text || "");
      const text = [...this.sentences.values()].join("");
      this.onText(text, Boolean(sentence.sentence_end));
      return;
    }
    if (event === "task-finished") {
      this.finished = true;
      this.clearTimeout();
      this.onFinished();
      this.socket.close();
      return;
    }
    if (event === "task-failed") {
      const error = message.payload?.error || message.header?.error || "ASR 任务失败";
      this.fail(new Error(typeof error === "string" ? error : JSON.stringify(error)));
    }
  }

  fail(error) {
    if (this.finished) return;
    this.finished = true;
    this.clearTimeout();
    if (this.socket) this.socket.close();
    this.onError(error);
  }
}

module.exports = { AsrClient };
