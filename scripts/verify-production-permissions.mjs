#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Permission/destructive-action verification.
 *
 * Requires disposable Mail.tm accounts for an owner and a member.
 * Destructive tests (channel/workspace delete) run only when explicitly enabled:
 *
 *   VERIFY_PERMISSIONS_ENABLE_DESTRUCTIVE=1 node scripts/verify-production-permissions.mjs
 *
 * Optional env vars:
 *   VERIFY_PASSWORD                      — fixed password (do not commit)
 *   VERIFY_API_BASE / VERIFY_MAIL_BASE   — override endpoints
 *
 * Test data is cleaned up by deleting the workspace at the end.
 */

import {
  API_BASE,
  getVerifiedAccount,
  api,
  finalize,
  sleep,
} from "./lib/verify-helpers.mjs";

const runId = `verify-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const ENABLE_DESTRUCTIVE = process.env.VERIFY_PERMISSIONS_ENABLE_DESTRUCTIVE === "1";

function expectStatus(fn, expected) {
  return fn.catch((err) => ({
    __expectedError: true,
    status: err.message.match(/HTTP (\d+)/)?.[1] || "error",
    message: err.message,
  }));
}

async function main() {
  console.log("=== Production Permissions Verification ===\n");
  console.log(`API_BASE: ${API_BASE}`);
  console.log(`Destructive tests enabled: ${ENABLE_DESTRUCTIVE ? "YES" : "NO (skipping delete checks)"}\n`);

  const results = [];

  const owner = await getVerifiedAccount("owner");
  await sleep(3000);
  const member = await getVerifiedAccount("member");

  // Owner creates workspace
  const workspaceName = `B203 Verify Workspace ${runId}`;
  const workspace = await api(owner.accessToken, "POST", "/workspaces", { name: workspaceName });
  results.push({
    check: "Owner can create workspace",
    ok: workspace.id && workspace.name === workspaceName,
    detail: `id=${workspace.id}`,
  });

  // Owner invites member
  const invite = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/invites`, {
    email: member.email,
    role: "MEMBER",
  });
  results.push({
    check: "Owner can invite member",
    ok: !!invite.id,
    detail: `invite=${invite.id}`,
  });

  // Member accepts invite
  const accepted = await api(member.accessToken, "POST", `/invites/${invite.id}/accept`);
  results.push({
    check: "Member can accept invite",
    ok: accepted.workspaceId === workspace.id || accepted.id === workspace.id,
  });

  // Owner creates channel
  const channel = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels`, {
    name: `verify-channel-${runId}`,
    description: "Verification channel",
    type: "PUBLIC",
  });
  results.push({
    check: "Owner can create channel",
    ok: channel.id && channel.workspaceId === workspace.id,
    detail: `id=${channel.id}`,
  });

  // Owner invites member to the channel
  const channelInvite = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels/${channel.id}/invites`, {
    email: member.email,
    role: "MEMBER",
  });
  results.push({
    check: "Owner can invite member to channel",
    ok: !!channelInvite.id,
    detail: `invite=${channelInvite.id}`,
  });

  // Member accepts channel invite
  await api(member.accessToken, "POST", `/channel-invites/${channelInvite.id}/accept`);
  results.push({
    check: "Member can accept channel invite",
    ok: true,
  });

  // Seed a message for visibility tests
  const messageText = `B203 verify message ${Date.now()}`;
  const message = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels/${channel.id}/messages`, {
    content: messageText,
  });
  results.push({
    check: "Owner can post message",
    ok: message.id && message.content === messageText,
    detail: `id=${message.id}`,
  });

  // Member can see channel
  const memberChannelList = await api(member.accessToken, "GET", `/workspaces/${workspace.id}/channels`);
  results.push({
    check: "Member can list workspace channels",
    ok: Array.isArray(memberChannelList) && memberChannelList.some((c) => c.id === channel.id),
  });

  // Member cannot delete channel
  const memberDeleteChannel = await expectStatus(
    api(member.accessToken, "DELETE", `/workspaces/${workspace.id}/channels/${channel.id}`),
  );
  results.push({
    check: "Member cannot delete channel",
    ok: memberDeleteChannel.__expectedError && memberDeleteChannel.status === "403",
    detail: `status=${memberDeleteChannel.status}`,
  });

  if (!ENABLE_DESTRUCTIVE) {
    results.push({
      check: "Owner channel delete (skipped — destructive tests disabled)",
      ok: true,
      detail: "skipped",
    });
    results.push({
      check: "Deleted channel not visible (skipped — destructive tests disabled)",
      ok: true,
      detail: "skipped",
    });
    results.push({
      check: "Owner workspace delete (skipped — destructive tests disabled)",
      ok: true,
      detail: "skipped",
    });
    results.push({
      check: "Deleted workspace not accessible (skipped — destructive tests disabled)",
      ok: true,
      detail: "skipped",
    });
    results.push({
      check: "Deleted workspace messages excluded from global search (skipped)",
      ok: true,
      detail: "skipped",
    });
    finalize(results);
    return;
  }

  // Owner deletes channel
  await api(owner.accessToken, "DELETE", `/workspaces/${workspace.id}/channels/${channel.id}`);
  results.push({
    check: "Owner can delete channel",
    ok: true,
  });

  // Channel no longer in member's list
  const memberChannelListAfterDelete = await api(member.accessToken, "GET", `/workspaces/${workspace.id}/channels`);
  results.push({
    check: "Deleted channel not visible in channel list",
    ok: !memberChannelListAfterDelete.some((c) => c.id === channel.id),
  });

  // Direct channel fetch returns 404
  const channelFetchAfterDelete = await expectStatus(
    api(member.accessToken, "GET", `/workspaces/${workspace.id}/channels/${channel.id}`),
  );
  results.push({
    check: "Deleted channel direct fetch returns 404",
    ok: channelFetchAfterDelete.__expectedError && channelFetchAfterDelete.status === "404",
    detail: `status=${channelFetchAfterDelete.status}`,
  });

  // Workspace search does not return deleted channel message
  const searchTerm = messageText.split(" ").pop();
  const workspaceSearchAfterChannelDelete = await api(member.accessToken, "GET", `/workspaces/${workspace.id}/search/messages?q=${encodeURIComponent(searchTerm)}`);
  results.push({
    check: "Deleted channel message not returned by workspace search",
    ok: !workspaceSearchAfterChannelDelete.messages?.some((m) => m.id === message.id),
  });

  // Owner deletes workspace
  await api(owner.accessToken, "DELETE", `/workspaces/${workspace.id}`);
  results.push({
    check: "Owner can delete workspace",
    ok: true,
  });

  // Member can no longer access workspace
  const workspaceFetchAfterDelete = await expectStatus(
    api(member.accessToken, "GET", `/workspaces/${workspace.id}`),
  );
  results.push({
    check: "Deleted workspace direct fetch returns 404 for member",
    ok: workspaceFetchAfterDelete.__expectedError && workspaceFetchAfterDelete.status === "404",
    detail: `status=${workspaceFetchAfterDelete.status}`,
  });

  // Member's workspace list excludes deleted workspace
  const memberWorkspaces = await api(member.accessToken, "GET", "/workspaces");
  results.push({
    check: "Deleted workspace not in workspace list",
    ok: !memberWorkspaces.some((w) => w.id === workspace.id),
  });

  // Global search excludes deleted workspace messages
  const globalSearch = await api(member.accessToken, "GET", `/me/search/messages?q=${encodeURIComponent(searchTerm)}`);
  results.push({
    check: "Deleted workspace messages excluded from global search",
    ok: !globalSearch.messages?.some((m) => m.id === message.id),
  });

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
