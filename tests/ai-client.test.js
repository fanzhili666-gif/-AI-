"use strict";

const assert = require("node:assert/strict");
const {
  AI_BASE_URL,
  AI_MODEL,
  buildStructuredRequest,
  readStructuredContent,
  requestStructuredJson,
} = require("../src/ai-client");

async function main() {
  const request = buildStructuredRequest({
    messages: [{ role: "user", content: "请输出 JSON" }],
  });
  assert.equal(request.model, AI_MODEL);
  assert.equal(request.response_format.type, "json_object");
  assert.equal(request.extra_body.enable_thinking, false);
  const searchRequest = buildStructuredRequest({
    messages: [{ role: "user", content: "今天北京天气" }],
    enableSearch: true,
  });
  assert.equal(searchRequest.enable_search, true);
  assert.equal(searchRequest.search_options.enable_search_extension, true);
  const forcedSearchRequest = buildStructuredRequest({
    messages: [{ role: "user", content: "北京明天的天气" }],
    enableSearch: true,
    searchOptions: { enable_search_extension: true, forced_search: true },
  });
  assert.equal(forcedSearchRequest.search_options.forced_search, true);
  assert.equal(AI_BASE_URL, "https://maas.qianwenaiapi.com/compatible-mode/v1");

  assert.deepEqual(
    readStructuredContent({ choices: [{ message: { content: '{"intent":"summarize"}' } }] }),
    { intent: "summarize" },
  );
  assert.throws(
    () => readStructuredContent({ choices: [{ message: { content: "not-json" } }] }),
    /不是有效 JSON/,
  );

  await requestStructuredJson({
    apiKey: "test-key",
    messages: [{ role: "user", content: "请输出 JSON" }],
    fetchImpl: async (url, options) => {
      assert.equal(url, `${AI_BASE_URL}/chat/completions`);
      assert.equal(options.headers.Authorization, "Bearer test-key");
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
      };
    },
  });

  await requestStructuredJson({
    apiKey: "test-key",
    enableSearch: true,
    searchOptions: { enable_search_extension: true, forced_search: true },
    messages: [{ role: "user", content: "今天北京天气" }],
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.enable_search, true);
      assert.equal(body.search_options.enable_search_extension, true);
      assert.equal(body.search_options.forced_search, true);
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
      };
    },
  });

  await assert.rejects(
    requestStructuredJson({
      apiKey: "",
      messages: [{ role: "user", content: "请输出 JSON" }],
    }),
    /DASHSCOPE_API_KEY 未配置/,
  );

  const abortController = new AbortController();
  const abortingRequest = requestStructuredJson({
    apiKey: "test-key",
    messages: [{ role: "user", content: "取消请求" }],
    signal: abortController.signal,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }, { once: true });
    }),
  });
  abortController.abort();
  await assert.rejects(abortingRequest, /AI 请求已取消/);

  console.log("ai-client: 7 cases passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
