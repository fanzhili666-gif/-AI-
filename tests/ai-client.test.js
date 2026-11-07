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

  await assert.rejects(
    requestStructuredJson({
      apiKey: "",
      messages: [{ role: "user", content: "请输出 JSON" }],
    }),
    /DASHSCOPE_API_KEY 未配置/,
  );

  console.log("ai-client: 6 cases passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
