"use strict";

const AI_BASE_URL = "https://maas.qianwenaiapi.com/compatible-mode/v1";
const AI_MODEL = "qwen3.8-flash";

function buildStructuredRequest({
  messages,
  model = AI_MODEL,
  enableSearch = false,
  searchOptions,
}) {
  const request = {
    model,
    messages,
    response_format: { type: "json_object" },
    extra_body: { enable_thinking: false },
  };
  if (enableSearch) {
    request.enable_search = true;
    request.search_options = searchOptions || { enable_search_extension: true };
  }
  return request;
}

function readStructuredContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI 响应缺少结构化内容");
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`AI 响应不是有效 JSON：${error.message}`);
  }
}

async function requestStructuredJson({
  messages,
  apiKey = process.env.DASHSCOPE_API_KEY,
  fetchImpl = fetch,
  timeoutMs = 20000,
  enableSearch = false,
  searchOptions,
  signal,
}) {
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY 未配置");
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("AI 请求缺少 messages");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortRequest = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortRequest, { once: true });
  try {
    if (signal?.aborted) throw new Error("AI 请求已取消");
    const response = await fetchImpl(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildStructuredRequest({
        messages,
        enableSearch,
        searchOptions,
      })),
      signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) {
      const code = body?.error?.code || `HTTP_${response.status}`;
      throw new Error(`AI 请求失败：${code}`);
    }
    return readStructuredContent(body);
  } catch (error) {
    if (error.name === "AbortError" && timedOut) {
      throw new Error(`AI 请求超时（${timeoutMs}ms）`);
    }
    if (error.name === "AbortError" && signal?.aborted) {
      throw new Error("AI 请求已取消");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortRequest);
  }
}

module.exports = {
  AI_BASE_URL,
  AI_MODEL,
  buildStructuredRequest,
  readStructuredContent,
  requestStructuredJson,
};
