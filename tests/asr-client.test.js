"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { AsrClient } = require("../src/asr-client");

class FakeWebSocket extends EventEmitter {
  static OPEN = 1;

  constructor() {
    super();
    this.readyState = 0;
    this.closed = false;
  }

  send() {}

  close() {
    this.closed = true;
    this.readyState = 3;
  }
}

function createClient(options = {}) {
  const errors = [];
  const client = new AsrClient({
    apiKey: "test-key",
    WebSocketImpl: FakeWebSocket,
    connectTimeoutMs: 10,
    finishTimeoutMs: 10,
    onStatus() {},
    onText() {},
    onError: (error) => errors.push(error),
    onFinished() {},
    ...options,
  });
  return { client, errors };
}

function waitForTimeout() {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

async function main() {
  const connecting = createClient();
  assert.equal(connecting.client.start(), true);
  await waitForTimeout();
  assert.match(connecting.errors[0].message, /连接超时/);
  assert.equal(connecting.client.socket.closed, true);

  const finishing = createClient();
  finishing.client.start();
  finishing.client.socket.readyState = FakeWebSocket.OPEN;
  finishing.client.socket.emit("open");
  finishing.client.handleMessage(Buffer.from(JSON.stringify({
    header: { event: "task-started" },
  })));
  finishing.client.finish();
  await waitForTimeout();
  assert.match(finishing.errors[0].message, /结果等待超时/);
  assert.equal(finishing.client.socket.closed, true);

  console.log("asr-client: connection and completion timeouts passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
