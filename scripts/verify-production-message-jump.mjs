#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production message deep-link verification (B221).
 *
 * Creates disposable accounts, a workspace/channel, a direct conversation,
 * and a group. Sends messages, then verifies the message-context endpoints
 * used by the frontend to scroll to/highlight a target message.
 *
 * Optional env vars:
 *   VERIFY_API_BASE  — override API endpoint
 *   VERIFY_PASSWORD  — fixed password (do not commit)
 */

import {
  API_BASE,
  createVerifiedAccount,
  api,
  finalize,
  sleep,
} from "./lib/verify-helpers.mjs";

async function main() {
  console.log("=== Production Message Jump Verification (B221) ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  async function createAccount(prefix, attempts = 5) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await createVerifiedAccount(prefix);
      } catch (err) {
        if (i < attempts - 1 && err.message.includes("429")) {
          const delay = 30000 * (i + 1);
          console.warn(`[auth] ${prefix} hit rate limit, retrying in ${delay}ms...`);
          await sleep(delay);
        } else {
          throw err;
        }
      }
    }
    throw new Error(`Could not create ${prefix} account`);
  }

  const owner = await createAccount("jumpowner");
  await sleep(5000);
  const member = await createAccount("jumpmember");
  await sleep(5000);
  const stranger = await createAccount("jumpstranger");

  // Owner creates a workspace and adds member.
  const workspaceName = `B221 Verify Workspace ${Date.now()}`;
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

  // Create a public channel.
  const channel = await api(
    owner.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels`,
    { name: "jump-channel", type: "PUBLIC" },
  );
  results.push({
    check: "Owner can create public channel",
    ok: channel.id && channel.type === "PUBLIC",
    detail: `id=${channel.id}`,
  });

  // Owner creates a group with member.
  const groupName = `B221 Verify Group ${Date.now()}`;
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

  const jumpToken = `B221-jump-token-${Date.now()}`;

  // Send messages before and after the target so it is not in the latest page
  // and the context endpoint can return both sides.
  const olderChannelMessages = [];
  for (let i = 0; i < 55; i++) {
    const msg = await api(
      owner.accessToken,
      "POST",
      `/workspaces/${workspace.id}/channels/${channel.id}/messages`,
      { content: `B221 channel filler ${i}` },
    );
    olderChannelMessages.push(msg);
  }

  const channelTarget = await api(
    owner.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels/${channel.id}/messages`,
    { content: jumpToken },
  );

  const newerChannelMessages = [];
  for (let i = 0; i < 5; i++) {
    const msg = await api(
      owner.accessToken,
      "POST",
      `/workspaces/${workspace.id}/channels/${channel.id}/messages`,
      { content: `B221 channel after ${i}` },
    );
    newerChannelMessages.push(msg);
  }

  const olderDirectMessages = [];
  for (let i = 0; i < 55; i++) {
    const msg = await api(
      owner.accessToken,
      "POST",
      `/direct-conversations/${directConversation.id}/messages`,
      { content: `B221 direct filler ${i}` },
    );
    olderDirectMessages.push(msg);
  }

  const directTarget = await api(
    owner.accessToken,
    "POST",
    `/direct-conversations/${directConversation.id}/messages`,
    { content: jumpToken },
  );

  const newerDirectMessages = [];
  for (let i = 0; i < 5; i++) {
    const msg = await api(
      owner.accessToken,
      "POST",
      `/direct-conversations/${directConversation.id}/messages`,
      { content: `B221 direct after ${i}` },
    );
    newerDirectMessages.push(msg);
  }

  const olderGroupMessages = [];
  for (let i = 0; i < 55; i++) {
    const msg = await api(
      owner.accessToken,
      "POST",
      `/groups/${group.id}/messages`,
      { content: `B221 group filler ${i}` },
    );
    olderGroupMessages.push(msg);
  }

  const groupTarget = await api(
    owner.accessToken,
    "POST",
    `/groups/${group.id}/messages`,
    { content: jumpToken },
  );

  const newerGroupMessages = [];
  for (let i = 0; i < 5; i++) {
    const msg = await api(
      owner.accessToken,
      "POST",
      `/groups/${group.id}/messages`,
      { content: `B221 group after ${i}` },
    );
    newerGroupMessages.push(msg);
  }

  results.push({
    check: "Owner can send channel target message",
    ok: channelTarget.id && channelTarget.content === jumpToken,
    detail: `id=${channelTarget.id}`,
  });
  results.push({
    check: "Owner can send direct target message",
    ok: directTarget.id && directTarget.content === jumpToken,
    detail: `id=${directTarget.id}`,
  });
  results.push({
    check: "Owner can send group target message",
    ok: groupTarget.id && groupTarget.content === jumpToken,
    detail: `id=${groupTarget.id}`,
  });

  // Channel message context.
  const channelContext = await api(
    owner.accessToken,
    "GET",
    `/workspaces/${workspace.id}/channels/${channel.id}/messages/${channelTarget.id}/context?before=5&after=5`,
  );
  results.push({
    check: "Channel context returns target, before, and after",
    ok:
      channelContext.target.id === channelTarget.id &&
      Array.isArray(channelContext.before) &&
      Array.isArray(channelContext.after) &&
      channelContext.before.length === 5 &&
      channelContext.after.length === 5,
    detail: `before=${channelContext.before.length}, after=${channelContext.after.length}`,
  });

  // Direct message context.
  const directContext = await api(
    owner.accessToken,
    "GET",
    `/direct-conversations/${directConversation.id}/messages/${directTarget.id}/context?before=5&after=5`,
  );
  results.push({
    check: "Direct context returns target, before, and after",
    ok:
      directContext.target.id === directTarget.id &&
      Array.isArray(directContext.before) &&
      Array.isArray(directContext.after) &&
      directContext.before.length === 5 &&
      directContext.after.length === 5,
    detail: `before=${directContext.before.length}, after=${directContext.after.length}`,
  });

  // Group message context.
  const groupContext = await api(
    owner.accessToken,
    "GET",
    `/groups/${group.id}/messages/${groupTarget.id}/context?before=5&after=5`,
  );
  results.push({
    check: "Group context returns target, before, and after",
    ok:
      groupContext.target.id === groupTarget.id &&
      Array.isArray(groupContext.before) &&
      Array.isArray(groupContext.after) &&
      groupContext.before.length === 5 &&
      groupContext.after.length === 5,
    detail: `before=${groupContext.before.length}, after=${groupContext.after.length}`,
  });

  // Permission boundaries: stranger should not access contexts.
  const strangerChannel = await api(
    stranger.accessToken,
    "GET",
    `/workspaces/${workspace.id}/channels/${channel.id}/messages/${channelTarget.id}/context`,
  ).catch((err) => ({ __expectedError: true, status: err.message.match(/HTTP (\d+)/)?.[1] }));
  results.push({
    check: "Stranger cannot access channel message context",
    ok:
      strangerChannel.__expectedError === true &&
      Number(strangerChannel.status) === 404,
    detail: `status=${strangerChannel.status}`,
  });

  const strangerDirect = await api(
    stranger.accessToken,
    "GET",
    `/direct-conversations/${directConversation.id}/messages/${directTarget.id}/context`,
  ).catch((err) => ({ __expectedError: true, status: err.message.match(/HTTP (\d+)/)?.[1] }));
  results.push({
    check: "Stranger cannot access direct message context",
    ok:
      strangerDirect.__expectedError === true &&
      Number(strangerDirect.status) === 403,
    detail: `status=${strangerDirect.status}`,
  });

  const strangerGroup = await api(
    stranger.accessToken,
    "GET",
    `/groups/${group.id}/messages/${groupTarget.id}/context`,
  ).catch((err) => ({ __expectedError: true, status: err.message.match(/HTTP (\d+)/)?.[1] }));
  results.push({
    check: "Stranger cannot access group message context",
    ok:
      strangerGroup.__expectedError === true &&
      Number(strangerGroup.status) === 404,
    detail: `status=${strangerGroup.status}`,
  });

  // Negative: target from another context returns 404.
  const wrongChannelContext = await api(
    owner.accessToken,
    "GET",
    `/workspaces/${workspace.id}/channels/${channel.id}/messages/${directTarget.id}/context`,
  ).catch((err) => ({ __expectedError: true, status: err.message.match(/HTTP (\d+)/)?.[1] }));
  results.push({
    check: "Channel context returns 404 for message in a different conversation",
    ok:
      wrongChannelContext.__expectedError === true &&
      Number(wrongChannelContext.status) === 404,
    detail: `status=${wrongChannelContext.status}`,
  });

  // Cleanup.
  await api(owner.accessToken, "DELETE", `/groups/${group.id}`).catch(() => {});

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
