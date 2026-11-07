"use strict";

const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const tls = require("node:tls");

class WebSocketClient extends EventEmitter {
  static OPEN = 1;

  constructor(url, options = {}) {
    super();
    const target = new URL(url);
    this.readyState = 0;
    this.buffer = Buffer.alloc(0);
    this.handshakeDone = false;
    this.key = crypto.randomBytes(16).toString("base64");
    this.socket = tls.connect({
      host: target.hostname,
      port: Number(target.port) || 443,
      servername: target.hostname,
    });
    this.socket.on("secureConnect", () => {
      const headers = [
        `GET ${target.pathname}${target.search} HTTP/1.1`,
        `Host: ${target.host}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${this.key}`,
        "Sec-WebSocket-Version: 13",
        ...Object.entries(options.headers || {}).map(([name, value]) => `${name}: ${value}`),
        "\r\n",
      ].join("\r\n");
      this.socket.write(headers);
    });
    this.socket.on("data", (chunk) => this.read(chunk));
    this.socket.on("error", (error) => this.emit("error", error));
    this.socket.on("close", () => {
      this.readyState = 3;
      this.emit("close");
    });
  }

  read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.handshakeDone) {
      const separator = this.buffer.indexOf("\r\n\r\n");
      if (separator < 0) return;
      const header = this.buffer.subarray(0, separator).toString();
      if (!/^HTTP\/1\.1 101 /m.test(header)) {
        this.emit("error", new Error(`WebSocket 握手失败：${header.split("\r\n")[0]}`));
        this.socket.destroy();
        return;
      }
      this.handshakeDone = true;
      this.readyState = WebSocketClient.OPEN;
      this.buffer = this.buffer.subarray(separator + 4);
      this.emit("open");
    }
    this.readFrames();
  }

  readFrames() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const longLength = this.buffer.readBigUInt64BE(2);
        if (longLength > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("WebSocket 帧过大");
        length = Number(longLength);
        offset = 10;
      }
      const maskOffset = masked ? 4 : 0;
      if (this.buffer.length < offset + maskOffset + length) return;
      let payload = this.buffer.subarray(offset + maskOffset, offset + maskOffset + length);
      if (masked) {
        const mask = this.buffer.subarray(offset, offset + 4);
        payload = Buffer.from(payload);
        for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
      }
      this.buffer = this.buffer.subarray(offset + maskOffset + length);
      if (opcode === 1) this.emit("message", payload);
      else if (opcode === 8) {
        this.socket.end();
        return;
      } else if (opcode === 9) this.writeFrame(10, payload);
    }
  }

  send(data) {
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
    this.writeFrame(Buffer.isBuffer(data) ? 2 : 1, payload);
  }

  writeFrame(opcode, payload) {
    if (this.readyState !== WebSocketClient.OPEN) return;
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.from([0x80 | opcode, 0x80 | length]);
    } else if (length <= 0xffff) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    const mask = crypto.randomBytes(4);
    const maskedPayload = Buffer.from(payload);
    for (let index = 0; index < maskedPayload.length; index += 1) {
      maskedPayload[index] ^= mask[index % 4];
    }
    this.socket.write(Buffer.concat([header, mask, maskedPayload]));
  }

  close() {
    if (this.socket) this.socket.end();
  }
}

module.exports = WebSocketClient;
