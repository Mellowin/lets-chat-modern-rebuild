#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production message-list pagination verification.
 *
 * Creates disposable accounts, a workspace with a public channel, a group,
 * and a direct conversation; posts messages; and verifies that channel,
 * group, and direct-conversation message-list endpoints return the new
 * paginated shape `{ items, nextCursor, hasMore }` and that cursors walk
 * through older pages without overlap.
 *
 * Optional env vars:
 *   VERIFY_API_BASE — override API endpoint
 *   VERIFY_PASSWORD — fixed password (do not commit)
 */

import {
  API_BASE,
  getVerifiedAccount,
  api,
  finalize,
  sleep,
} from "./lib/verify-helpers.mjs";

const runId = `verify-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function isPaginatedShape(body) {
  return (
    body &&
    Array.isArray(body.items) &&
    typeof body.hasMore === "boolean" &&
    (body.nextCursor === null || typeof body.nextCursor === "string")
  );
}

function assertNoOverlappingIds(firstPage, secondPage) {
  const firstIds = new Set(firstPage.items.map((m) => m.id));
  const overlap = secondPage.items.filter((m) => firstIds.has(m.id));
  return overlap.length === 0;
}

async function sendMessages(token, sendFn, count) {
  for (let i = 1; i <= count; i++) {
    await sendFn(i);
    await sleep(250);
  }
}

async function verifyChannelPagination(owner, workspace, results) {
  const channel = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels`, {
    name: `B216 Pagination Channel ${runId}`,
    type: "PUBLIC",
  });
  results.push({
    check: "Owner can create a public channel for pagination testing",
    ok: channel.id && channel.workspaceId === workspace.id,
    detail: `channelId=${channel.id}`,
  });

  await sendMessages(
    owner.accessToken,
    (i) =>
      api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels/${channel.id}/messages`, {
        content: `channel-msg-${i}`,
      }),
    5,
  );

  const first = await api(
    owner.accessToken,
    "GET",
    `/workspaces/${workspace.id}/channels/${channel.id}/messages?limit=3`,
  );
  results.push({
    check: "Channel message list returns paginated shape",
    ok: isPaginatedShape(first),
    detail: `items=${first?.items?.length}, hasMore=${first?.hasMore}`,
  });
  results.push({
    check: "Channel first page returns requested limit and signals more pages",
    ok: first.items.length === 3 && first.hasMore === true && typeof first.nextCursor === "string",
    detail: `items=${first.items.length}, hasMore=${first.hasMore}`,
  });

  const second = await api(
    owner.accessToken,
    "GET",
    `/workspaces/${workspace.id}/channels/${channel.id}/messages?limit=3&cursor=${encodeURIComponent(first.nextCursor)}`,
  );
  results.push({
    check: "Channel cursor page returns remaining messages without overlap",
    ok: second.items.length === 2 && second.hasMore === false && assertNoOverlappingIds(first, second),
    detail: `items=${second.items.length}, hasMore=${second.hasMore}`,
  });

  await api(owner.accessToken, "DELETE", `/workspaces/${workspace.id}/channels/${channel.id}`);
  results.push({
    check: "Pagination test channel archived",
    ok: true,
  });
}

async function verifyGroupPagination(owner, memberUserId, results) {
  const group = await api(owner.accessToken, "POST", "/groups", {
    name: `B216 Pagination Group ${runId}`,
    memberIds: [memberUserId],
  });
  results.push({
    check: "Owner can create a group for pagination testing",
    ok: group.id && group.myRole === "OWNER",
    detail: `groupId=${group.id}`,
  });

  await sendMessages(
    owner.accessToken,
    (i) =>
      api(owner.accessToken, "POST", `/groups/${group.id}/messages`, {
        content: `group-msg-${i}`,
      }),
    5,
  );

  const first = await api(owner.accessToken, "GET", `/groups/${group.id}/messages?limit=3`);
  results.push({
    check: "Group message list returns paginated shape",
    ok: isPaginatedShape(first),
    detail: `items=${first?.items?.length}, hasMore=${first?.hasMore}`,
  });
  results.push({
    check: "Group first page returns requested limit and signals more pages",
    ok: first.items.length === 3 && first.hasMore === true && typeof first.nextCursor === "string",
    detail: `items=${first.items.length}, hasMore=${first.hasMore}`,
  });

  const second = await api(
    owner.accessToken,
    "GET",
    `/groups/${group.id}/messages?limit=3&cursor=${encodeURIComponent(first.nextCursor)}`,
  );
  results.push({
    check: "Group cursor page returns remaining messages without overlap",
    ok: second.items.length === 2 && second.hasMore === false && assertNoOverlappingIds(first, second),
    detail: `items=${second.items.length}, hasMore=${second.hasMore}`,
  });

  await api(owner.accessToken, "DELETE", `/groups/${group.id}`);
  results.push({
    check: "Pagination test group archived",
    ok: true,
  });
}

async function verifyDirectPagination(owner, member, results) {
  const conversation = await api(owner.accessToken, "POST", "/direct-conversations", {
    userId: member.user.id,
  });
  results.push({
    check: "Owner can create a direct conversation for pagination testing",
    ok: conversation.id && conversation.otherParticipant?.id === member.user.id,
    detail: `conversationId=${conversation.id}`,
  });

  await sendMessages(
    owner.accessToken,
    (i) =>
      api(owner.accessToken, "POST", `/direct-conversations/${conversation.id}/messages`, {
        content: `direct-msg-${i}`,
      }),
    5,
  );

  const first = await api(
    owner.accessToken,
    "GET",
    `/direct-conversations/${conversation.id}/messages?limit=3`,
  );
  results.push({
    check: "Direct conversation message list returns paginated shape",
    ok: isPaginatedShape(first),
    detail: `items=${first?.items?.length}, hasMore=${first?.hasMore}`,
  });
  results.push({
    check: "Direct conversation first page returns requested limit and signals more pages",
    ok: first.items.length === 3 && first.hasMore === true && typeof first.nextCursor === "string",
    detail: `items=${first.items.length}, hasMore=${first.hasMore}`,
  });

  const second = await api(
    owner.accessToken,
    "GET",
    `/direct-conversations/${conversation.id}/messages?limit=3&cursor=${encodeURIComponent(first.nextCursor)}`,
  );
  results.push({
    check: "Direct conversation cursor page returns remaining messages without overlap",
    ok: second.items.length === 2 && second.hasMore === false && assertNoOverlappingIds(first, second),
    detail: `items=${second.items.length}, hasMore=${second.hasMore}`,
  });
}

async function main() {
  console.log("=== Production Message Pagination Verification ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  const owner = await getVerifiedAccount("pageowner");
  await sleep(1500);
  const member = await getVerifiedAccount("pagemember");

  const workspace = await api(owner.accessToken, "POST", "/workspaces", {
    name: `B216 Pagination ${runId}`,
    slug: `b216-page-${runId}`,
  });
  results.push({
    check: "Owner can create a workspace for pagination testing",
    ok: workspace.id,
    detail: `workspaceId=${workspace.id}`,
  });

  await verifyChannelPagination(owner, workspace, results);
  await verifyGroupPagination(owner, member.user.id, results);
  await verifyDirectPagination(owner, member, results);

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
