#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production presence verification (B223).
 *
 * Verifies that the pluggable presence store tracks users across WebSocket
 * connections, broadcasts presence:online / presence:offline events, and
 * surfaces safe diagnostics without leaking Redis URLs or secrets.
 *
 * Optional env vars:
 *   VERIFY_API_BASE  — override backend REST API base
 *   VERIFY_WS_URL    — override WebSocket URL
 *   VERIFY_PASSWORD  — fixed password (do not commit)
 *   VERIFY_ADMIN_ACCESS_TOKEN — admin token for full diagnostics checks
 */

import { io } from "socket.io-client";
import {
  API_BASE,
  createVerifiedAccount,
  api,
  finalize,
  sleep,
} from "./lib/verify-helpers.mjs";

const WS_URL =
  process.env.VERIFY_WS_URL ||
  process.env.WS_URL ||
  "wss://lets-chat-api-v2.onrender.com";

const ADMIN_TOKEN = process.env.VERIFY_ADMIN_ACCESS_TOKEN || null;

async function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(WS_URL, {
      transports: ["websocket"],
      auth: { token },
      reconnection: false,
      timeout: 10000,
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Socket connection timeout"));
    }, 10000);

    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });

    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForEvent(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    function handler(payload) {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }

    socket.once(event, handler);
  });
}

async function joinDirect(socket, conversationId) {
  socket.emit("direct:join", { conversationId });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("direct:join timeout")),
      5000,
    );
    socket.once("direct:joined", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("direct:error", (err) => {
      clearTimeout(timer);
      reject(new Error(err.message || "direct:join failed"));
    });
  });
}

async function expectNoEvent(socket, event, durationMs = 2000) {
  let received = null;
  function handler(payload) {
    received = payload;
  }
  socket.on(event, handler);
  await sleep(durationMs);
  socket.off(event, handler);
  return received;
}

async function main() {
  console.log("=== Production Presence Verification (B223) ===\n");
  console.log(`API_BASE: ${API_BASE}`);
  console.log(`WS_URL: ${WS_URL}\n`);

  const results = [];

  const owner = await createVerifiedAccount("prowner");
  await sleep(3000);
  const member = await createVerifiedAccount("prmember");

  // Direct conversation between owner and member.
  const directConversation = await api(
    owner.accessToken,
    "POST",
    "/direct-conversations",
    { userId: member.user.id },
  );
  results.push({
    check: "Owner can start direct conversation",
    ok: !!directConversation.id,
    detail: `id=${directConversation.id}`,
  });

  // Connect both sockets.
  const ownerSocket = await connectSocket(owner.accessToken);
  const memberSocket = await connectSocket(member.accessToken);
  results.push({
    check: "Owner WebSocket connects and authenticates",
    ok: ownerSocket.connected,
  });
  results.push({
    check: "Member WebSocket connects and authenticates",
    ok: memberSocket.connected,
  });

  // Join the direct room from both sides. Member joins first so they are in
  // the room when owner joins and emits presence:online.
  await joinDirect(memberSocket, directConversation.id);
  const onlinePromise = waitForEvent(memberSocket, "presence:online", 5000);
  await joinDirect(ownerSocket, directConversation.id);
  let receivedOnline;
  try {
    receivedOnline = await onlinePromise;
  } catch {
    receivedOnline = null;
  }
  results.push({
    check: "Member receives presence:online when owner joins direct room",
    ok: receivedOnline && receivedOnline.user.id === owner.user.id,
    detail: receivedOnline ? "received" : "timeout",
  });

  // REST list should report the other participant as online.
  await sleep(1000);
  const ownerConversations = await api(
    owner.accessToken,
    "GET",
    "/direct-conversations",
  );
  const memberConversations = await api(
    member.accessToken,
    "GET",
    "/direct-conversations",
  );
  const ownerView = ownerConversations.find((c) => c.id === directConversation.id);
  const memberView = memberConversations.find((c) => c.id === directConversation.id);
  results.push({
    check: "REST direct conversations report other participant online",
    ok: ownerView?.isOnline === true && memberView?.isOnline === true,
    detail: `ownerView=${ownerView?.isOnline}, memberView=${memberView?.isOnline}`,
  });

  // Owner disconnects; member should observe offline.
  const offlinePromise = waitForEvent(memberSocket, "presence:offline", 6000);
  ownerSocket.disconnect();
  let receivedOffline;
  try {
    receivedOffline = await offlinePromise;
  } catch {
    receivedOffline = null;
  }
  results.push({
    check: "Member receives presence:offline when owner disconnects",
    ok: receivedOffline && receivedOffline.user.id === owner.user.id,
    detail: receivedOffline ? "received" : "timeout",
  });

  // After disconnect, REST should report offline.
  await sleep(1000);
  const memberConversationsAfter = await api(
    member.accessToken,
    "GET",
    "/direct-conversations",
  );
  const memberViewAfter = memberConversationsAfter.find(
    (c) => c.id === directConversation.id,
  );
  results.push({
    check: "REST direct conversations report other participant offline after disconnect",
    ok: memberViewAfter?.isOnline === false,
    detail: `isOnline=${memberViewAfter?.isOnline}`,
  });

  // Diagnostics leak checks.
  const unauthorizedDiagnostics = await api(
    member.accessToken,
    "GET",
    "/admin/diagnostics/health",
  ).catch((err) => ({ __expectedError: true, message: err.message }));
  results.push({
    check: "Non-admin cannot access admin diagnostics",
    ok:
      unauthorizedDiagnostics.__expectedError === true &&
      !unauthorizedDiagnostics.message.toLowerCase().includes("redis"),
  });

  if (ADMIN_TOKEN) {
    const diagnostics = await api(
      ADMIN_TOKEN,
      "GET",
      "/admin/diagnostics/health",
    );
    const json = JSON.stringify(diagnostics).toLowerCase();
    const hasPresenceCheck =
      diagnostics.checks &&
      diagnostics.checks.presence &&
      typeof diagnostics.checks.presence.status === "string";
    results.push({
      check: "Admin diagnostics includes presence store status",
      ok: hasPresenceCheck,
      detail: hasPresenceCheck
        ? `status=${diagnostics.checks.presence.status}, detail=${diagnostics.checks.presence.detail}`
        : "missing",
    });
    results.push({
      check: "Admin diagnostics does not expose Redis URL or secrets",
      ok:
        !json.includes("redis://") &&
        !json.includes("websocket_redis_url") &&
        !json.includes("presence_redis_url") &&
        !json.includes("password") &&
        !json.includes("secret"),
    });
  } else {
    results.push({
      check: "Admin diagnostics Redis leak check skipped (no admin token)",
      ok: true,
      detail: "VERIFY_ADMIN_ACCESS_TOKEN not set",
    });
  }

  // Cleanup.
  memberSocket.disconnect();

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
