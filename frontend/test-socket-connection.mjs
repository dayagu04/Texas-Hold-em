#!/usr/bin/env node
/**
 * 测试 socket.io 连接是否正常
 * 用法：node test-socket-connection.mjs
 */
import { io } from "socket.io-client";

// 测试用 token（从登录接口获取或用测试 token）
const TEST_USER = "Alice";
const API_URL = "http://localhost:8000";

async function testConnection() {
  console.log("=== Socket.IO Connection Test ===\n");

  // 1. 获取 token
  console.log("1. Getting token for", TEST_USER);
  const loginRes = await fetch(`${API_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: TEST_USER }),
  });

  if (!loginRes.ok) {
    console.error("❌ Login failed:", await loginRes.text());
    process.exit(1);
  }

  const { token } = await loginRes.json();
  console.log("✅ Token received:", token.slice(0, 30) + "...\n");

  // 2. 连接 socket.io（默认 transports: ["polling", "websocket"]）
  console.log("2. Connecting to socket.io...");
  const socket = io(API_URL, {
    auth: { token },
  });

  socket.on("connect", () => {
    console.log("✅ Connected! socket.id:", socket.id);
    console.log("   transport:", socket.io.engine.transport.name);

    // 3. 测试发送事件
    console.log("\n3. Emitting lobby:list...");
    socket.emit("lobby:list", {});
  });

  socket.on("lobby:update", (data) => {
    console.log("✅ Received lobby:update:");
    console.log("   tables:", data.tables?.length ?? 0);
    console.log("\n=== Test PASSED ===");
    socket.close();
    process.exit(0);
  });

  socket.on("connect_error", (err) => {
    console.error("❌ Connect error:", err.message);
    process.exit(1);
  });

  socket.on("disconnect", (reason) => {
    console.log("Disconnected:", reason);
  });

  // 超时退出
  setTimeout(() => {
    console.error("\n❌ Timeout: no response after 10s");
    socket.close();
    process.exit(1);
  }, 10000);
}

testConnection().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
