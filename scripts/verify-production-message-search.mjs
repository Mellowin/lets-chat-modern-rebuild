#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production message search verification (B219).
 *
 * Creates disposable accounts, a workspace, a public channel, a private channel,
 * a direct conversation, and a group. Sends messages containing a unique token,
 * then exercises global search, scoped search, and permission boundaries.
 *
 * Optional env vars:
 *   VERIFY_API_BASE  — override API endpoint
 *   VERIFY_PASSWORD  — fixed password (do not commit)
 */

import {
  API_BASE,
  getVerifiedAccount,
  api,
  finalize,
  sleep,
} from "./lib/verify-helpers.mjs";

const runId = `verify-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function expectStatus(fn, expected) {
  return fn.catch((err) => ({
    __expectedError: true,
    status: err.message.match(/HTTP (\d+)/)?.[1] || "error",
    message: err.message,
  }));
}

async function main() {
  console.log("=== Production Message Search Verification (B219) ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  async function createAccount(prefix) {
    return getVerifiedAccount(prefix);
  }

  const owner = await createAccount("searchowner");
  await sleep(1500);
  const member = await createAccount("searchmember");
  await sleep(1500);
  const stranger = await createAccount("searchstranger");

  // Owner creates a workspace and adds member.
  const workspaceName = `B219 Verify Workspace ${runId}`;
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
    {
      email: member.email,
      role: "MEMBER",
    },
  );
  await api(member.accessToken, "POST", "/invites/accept", {
    token: workspaceInvite.token,
  });
  results.push({
    check: "Member can join workspace via invite",
    ok: workspaceInvite.token && workspaceInvite.role === "MEMBER",
  });

  // Create public and private channels.
  const publicChannel = await api(
    owner.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels`,
    { name: `public-search-${runId}`, type: "PUBLIC" },
  );
  const privateChannel = await api(
    owner.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels`,
    { name: `private-search-${runId}`, type: "PRIVATE" },
  );
  results.push({
    check: "Owner can create public channel",
    ok: publicChannel.id && publicChannel.type === "PUBLIC",
    detail: `id=${publicChannel.id}`,
  });
  results.push({
    check: "Owner can create private channel",
    ok: privateChannel.id && privateChannel.type === "PRIVATE",
    detail: `id=${privateChannel.id}`,
  });

  // Owner creates a group with member.
  const groupName = `B219 Verify Group ${runId}`;
  const group = await api(owner.accessToken, "POST", "/groups", {
    name: groupName,
    memberIds: [member.user.id],
  });
  results.push({
    check: "Owner can create group",
    ok: group.id && group.name === groupName && group.myRole === "OWNER",
    detail: `id=${group.id}`,
  });

  // Owner starts a direct conversation with member.
  const directConversation = await api(owner.accessToken, "POST", "/direct-conversations", {
    userId: member.user.id,
  });
  results.push({
    check: "Owner can start direct conversation",
    ok: !!directConversation.id,
    detail: `id=${directConversation.id}`,
  });

  const searchToken = `B219-search-token-${Date.now()}`;

  // Send messages in each context.
  const publicMsg = await api(
    owner.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels/${publicChannel.id}/messages`,
    { content: searchToken },
  );
  const privateMsg = await api(
    owner.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels/${privateChannel.id}/messages`,
    { content: searchToken },
  );
  const directMsg = await api(
    owner.accessToken,
    "POST",
    `/direct-conversations/${directConversation.id}/messages`,
    { content: searchToken },
  );
  const groupMsg = await api(
    owner.accessToken,
    "POST",
    `/groups/${group.id}/messages`,
    { content: searchToken },
  );

  results.push({
    check: "Owner can send public channel message",
    ok: publicMsg.id && publicMsg.content === searchToken,
    detail: `id=${publicMsg.id}`,
  });
  results.push({
    check: "Owner can send private channel message",
    ok: privateMsg.id && privateMsg.content === searchToken,
    detail: `id=${privateMsg.id}`,
  });
  results.push({
    check: "Owner can send direct message",
    ok: directMsg.id && directMsg.content === searchToken,
    detail: `id=${directMsg.id}`,
  });
  results.push({
    check: "Owner can send group message",
    ok: groupMsg.id && groupMsg.content === searchToken,
    detail: `id=${groupMsg.id}`,
  });

  // Allow generated searchVector columns to be flushed (they are synchronous, but brief wait is defensive).
  await sleep(500);

  const encode = (v) => encodeURIComponent(v);

  // Global search for owner sees all sources.
  const ownerGlobal = await api(
    owner.accessToken,
    "GET",
    `/search/messages?q=${encode(searchToken)}`,
  );
  const ownerSourceTypes = ownerGlobal.items.map((item) => item.source.type);
  results.push({
    check: "Owner global search returns all source types",
    ok:
      ownerSourceTypes.includes("CHANNEL") &&
      ownerSourceTypes.includes("DIRECT") &&
      ownerSourceTypes.includes("GROUP"),
    detail: `sources=${ownerSourceTypes.join(",")}`,
  });

  // Legacy route still works.
  const legacySearch = await api(
    owner.accessToken,
    "GET",
    `/me/search/messages?q=${encode(searchToken)}&scope=group`,
  );
  results.push({
    check: "Legacy /me/search/messages route still works",
    ok:
      legacySearch.items.length === 1 &&
      legacySearch.items[0].source.type === "GROUP",
  });

  // Scope filtering.
  const groupScoped = await api(
    owner.accessToken,
    "GET",
    `/search/messages?q=${encode(searchToken)}&scope=group`,
  );
  results.push({
    check: "Scope=group returns only group messages",
    ok:
      groupScoped.items.length === 1 &&
      groupScoped.items[0].source.type === "GROUP" &&
      groupScoped.items[0].source.groupId === group.id,
  });

  const channelScoped = await api(
    owner.accessToken,
    "GET",
    `/search/messages?q=${encode(searchToken)}&scope=channel&workspaceId=${workspace.id}`,
  );
  results.push({
    check: "Scope=channel with workspaceId returns channel messages",
    ok:
      channelScoped.items.length === 2 &&
      channelScoped.items.every((item) => item.source.type === "CHANNEL"),
  });

  const directScoped = await api(
    owner.accessToken,
    "GET",
    `/search/messages?q=${encode(searchToken)}&scope=direct&conversationId=${directConversation.id}`,
  );
  results.push({
    check: "Scope=direct with conversationId returns direct message",
    ok:
      directScoped.items.length === 1 &&
      directScoped.items[0].source.type === "DIRECT" &&
      directScoped.items[0].source.conversationId === directConversation.id,
  });

  // Permission boundaries.
  const memberGlobal = await api(
    member.accessToken,
    "GET",
    `/search/messages?q=${encode(searchToken)}`,
  );
  const memberSourceTypes = memberGlobal.items.map((item) => item.source.type);
  results.push({
    check: "Member global search includes public channel, direct and group",
    ok:
      memberSourceTypes.includes("CHANNEL") &&
      memberSourceTypes.includes("DIRECT") &&
      memberSourceTypes.includes("GROUP"),
    detail: `sources=${memberSourceTypes.join(",")}`,
  });

  const memberChannelScoped = await api(
    member.accessToken,
    "GET",
    `/search/messages?q=${encode(searchToken)}&scope=channel`,
  );
  results.push({
    check: "Member cannot see private channel results",
    ok:
      memberChannelScoped.items.length === 1 &&
      memberChannelScoped.items[0].source.channelId === publicChannel.id,
  });

  const strangerGroupScoped = await api(
    stranger.accessToken,
    "GET",
    `/search/messages?q=${encode(searchToken)}&scope=group`,
  );
  results.push({
    check: "Stranger cannot see group messages",
    ok: Array.isArray(strangerGroupScoped.items) && strangerGroupScoped.items.length === 0,
  });

  // Block boundary: member blocks owner, then member no longer sees direct or group messages from owner.
  await api(member.accessToken, "POST", "/blocks", {
    userId: owner.user.id,
  });

  const memberDirectAfterBlock = await api(
    member.accessToken,
    "GET",
    `/search/messages?q=${encode(searchToken)}&scope=direct`,
  );
  results.push({
    check: "Blocked user's direct messages are hidden",
    ok: memberDirectAfterBlock.items.length === 0,
  });

  const memberGroupAfterBlock = await api(
    member.accessToken,
    "GET",
    `/search/messages?q=${encode(searchToken)}&scope=group`,
  );
  results.push({
    check: "Blocked user's group messages are hidden",
    ok: memberGroupAfterBlock.items.length === 0,
  });

  // Cleanup: archive group, channels, workspace? Production verifier usually leaves data.
  // We only archive the group to avoid clutter.
  await api(owner.accessToken, "DELETE", `/groups/${group.id}`);

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
