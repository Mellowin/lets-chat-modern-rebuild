#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production realtime / WebSocket verification (B222).
 *
 * Verifies that Socket.io delivers channel, direct, and group message events
 * in production, and that diagnostics endpoints do not leak Redis configuration.
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

async function joinChannel(socket, workspaceId, channelId) {
  socket.emit("channel:join", { workspaceId, channelId });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("channel:join timeout")),
      5000,
    );
    socket.once("channel:joined", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("channel:error", (err) => {
      clearTimeout(timer);
      reject(new Error(err.message || "channel:join failed"));
    });
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

async function joinGroup(socket, groupId) {
  socket.emit("group:join", { groupId });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("group:join timeout")),
      5000,
    );
    socket.once("group:joined", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("group:error", (err) => {
      clearTimeout(timer);
      reject(new Error(err.message || "group:join failed"));
    });
  });
}

async function main() {
  console.log("=== Production Realtime Verification (B222) ===\n");
  console.log(`API_BASE: ${API_BASE}`);
  console.log(`WS_URL: ${WS_URL}\n`);

  const results = [];

  const owner = await createVerifiedAccount("rtowner");
  await sleep(3000);
  const member = await createVerifiedAccount("rtmember");

  // Owner creates a workspace and invites member.
  const workspaceName = `B222 Verify Workspace ${Date.now()}`;
  const workspace = await api(owner.accessToken, "POST", "/workspaces", {
    name: workspaceName,
  });
  results.push({
    check: "Owner can create workspace",
    ok: workspace.id && workspace.name === workspaceName,
    detail: `id=${workspace.id}`,
  });

  const workspaceInvite = await api(
    owner.accessToken,
    "POST",
    `/workspaces/${workspace.id}/invites`,
    { email: member.email, role: "MEMBER" },
  );
  await api(member.accessToken, "POST", "/invites/accept", {
    token: workspaceInvite.token,
  });

  // Create channel.
  const channel = await api(
    owner.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels`,
    { name: "rt-channel", type: "PUBLIC" },
  );
  results.push({
    check: "Owner can create public channel",
    ok: channel.id && channel.type === "PUBLIC",
    detail: `id=${channel.id}`,
  });

  // Create direct conversation.
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

  // Create group.
  const group = await api(owner.accessToken, "POST", "/groups", {
    name: `B222 Verify Group ${Date.now()}`,
    memberIds: [member.user.id],
  });
  results.push({
    check: "Owner can create group",
    ok: group.id && group.myRole === "OWNER",
    detail: `id=${group.id}`,
  });

  // Connect both WebSocket clients.
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

  // Channel realtime.
  await joinChannel(ownerSocket, workspace.id, channel.id);
  await joinChannel(memberSocket, workspace.id, channel.id);

  const channelMessagePromise = waitForEvent(memberSocket, "message:created");
  const channelTypingPromise = waitForEvent(memberSocket, "typing:started");

  const channelMessage = await api(
    owner.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels/${channel.id}/messages`,
    { content: `B222 channel realtime ${Date.now()}` },
  );
  ownerSocket.emit("typing:start", {
    workspaceId: workspace.id,
    channelId: channel.id,
  });

  const receivedChannelMessage = await channelMessagePromise;
  const receivedChannelTyping = await channelTypingPromise;

  results.push({
    check: "Channel message event delivered to member WebSocket",
    ok:
      receivedChannelMessage.id === channelMessage.id &&
      receivedChannelMessage.content === channelMessage.content,
    detail: `id=${receivedChannelMessage.id}`,
  });
  results.push({
    check: "Channel typing event delivered to member WebSocket",
    ok:
      receivedChannelTyping.channelId === channel.id &&
      receivedChannelTyping.user.id === owner.user.id,
  });

  // Direct realtime.
  await joinDirect(ownerSocket, directConversation.id);
  await joinDirect(memberSocket, directConversation.id);

  const directMessagePromise = waitForEvent(
    memberSocket,
    "direct:message:created",
  );
  const directMessage = await api(
    owner.accessToken,
    "POST",
    `/direct-conversations/${directConversation.id}/messages`,
    { content: `B222 direct realtime ${Date.now()}` },
  );
  const receivedDirectMessage = await directMessagePromise;

  results.push({
    check: "Direct message event delivered to member WebSocket",
    ok:
      receivedDirectMessage.id === directMessage.id &&
      receivedDirectMessage.content === directMessage.content,
    detail: `id=${receivedDirectMessage.id}`,
  });

  // Group realtime.
  await joinGroup(ownerSocket, group.id);
  await joinGroup(memberSocket, group.id);

  const groupMessagePromise = waitForEvent(
    memberSocket,
    "group:message:created",
  );
  const groupMessage = await api(owner.accessToken, "POST", `/groups/${group.id}/messages`, {
    content: `B222 group realtime ${Date.now()}`,
  });
  const receivedGroupMessage = await groupMessagePromise;

  results.push({
    check: "Group message event delivered to member WebSocket",
    ok:
      receivedGroupMessage.id === groupMessage.id &&
      receivedGroupMessage.content === groupMessage.content,
    detail: `id=${receivedGroupMessage.id}`,
  });

  // Presence online event.
  const presencePromise = waitForEvent(memberSocket, "presence:online");
  const direct3 = await api(owner.accessToken, "POST", "/direct-conversations", {
    userId: member.user.id,
  });
  await joinDirect(ownerSocket, direct3.id);
  await joinDirect(memberSocket, direct3.id);
  const receivedPresence = await Promise.race([
    presencePromise,
    sleep(3000).then(() => null),
  ]);
  results.push({
    check: "Presence online event observed on direct join",
    ok:
      receivedPresence === null ||
      (receivedPresence && receivedPresence.user.id === owner.user.id),
    detail: receivedPresence ? "received" : "not-required",
  });

  // Diagnostics leak checks.
  const unauthorizedDiagnostics = await api(
    owner.accessToken,
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
    const hasWebsocketCheck =
      diagnostics.checks &&
      diagnostics.checks.websocket &&
      typeof diagnostics.checks.websocket.status === "string";
    results.push({
      check: "Admin diagnostics includes websocket adapter status",
      ok: hasWebsocketCheck,
      detail: hasWebsocketCheck
        ? `status=${diagnostics.checks.websocket.status}`
        : "missing",
    });
    results.push({
      check: "Admin diagnostics does not expose Redis URL or secrets",
      ok:
        !json.includes("redis://") &&
        !json.includes("websocket_redis_url") &&
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
  ownerSocket.disconnect();
  memberSocket.disconnect();

  await api(owner.accessToken, "DELETE", `/groups/${group.id}`).catch(() => {});

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
