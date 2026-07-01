#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production group-chats verification.
 *
 * Creates two disposable accounts (owner + member), exercises group CRUD,
 * membership, messaging, read state, and access-control rules, then archives
 * the group.
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

function expectStatus(fn, expected) {
  return fn.catch((err) => ({
    __expectedError: true,
    status: err.message.match(/HTTP (\d+)/)?.[1] || "error",
    message: err.message,
  }));
}

async function main() {
  console.log("=== Production Group Chats Verification ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  const owner = await createVerifiedAccount("groupowner");
  await sleep(1500);
  const member = await createVerifiedAccount("groupmember");
  await sleep(1500);
  const stranger = await createVerifiedAccount("groupstranger");

  // Owner creates a group with the member.
  const groupName = `B213 Verify Group ${Date.now()}`;
  const group = await api(owner.accessToken, "POST", "/groups", {
    name: groupName,
    memberIds: [member.user.id],
  });
  results.push({
    check: "Owner can create group",
    ok: group.id && group.name === groupName && group.myRole === "OWNER",
    detail: `id=${group.id}`,
  });

  // Both users see the group in their list.
  const ownerList = await api(owner.accessToken, "GET", "/groups");
  const memberList = await api(member.accessToken, "GET", "/groups");
  results.push({
    check: "Group appears in owner's list",
    ok: Array.isArray(ownerList) && ownerList.some((g) => g.id === group.id),
  });
  results.push({
    check: "Group appears in member's list",
    ok: Array.isArray(memberList) && memberList.some((g) => g.id === group.id),
  });

  // Member can fetch group details.
  const memberGroup = await api(member.accessToken, "GET", `/groups/${group.id}`);
  results.push({
    check: "Member can get group details",
    ok: memberGroup.id === group.id && memberGroup.myRole === "MEMBER",
  });

  // Stranger cannot access the group.
  const strangerGet = await expectStatus(
    api(stranger.accessToken, "GET", `/groups/${group.id}`),
  );
  results.push({
    check: "Non-member gets 404 for group details",
    ok: strangerGet.__expectedError && strangerGet.status === "404",
    detail: `status=${strangerGet.status}`,
  });

  // Owner can rename the group.
  const renamedName = `${groupName} renamed`;
  const renamed = await api(owner.accessToken, "PATCH", `/groups/${group.id}`, {
    name: renamedName,
  });
  results.push({
    check: "Owner can rename group",
    ok: renamed.name === renamedName,
  });

  // Member cannot rename the group.
  const memberRename = await expectStatus(
    api(member.accessToken, "PATCH", `/groups/${group.id}`, { name: "Hacked" }),
  );
  results.push({
    check: "Member cannot rename group",
    ok: memberRename.__expectedError && memberRename.status === "403",
    detail: `status=${memberRename.status}`,
  });

  // Member can send a message.
  const messageText = `B213 verify message ${Date.now()}`;
  const message = await api(member.accessToken, "POST", `/groups/${group.id}/messages`, {
    content: messageText,
  });
  results.push({
    check: "Member can send group message",
    ok: message.id && message.content === messageText,
    detail: `id=${message.id}`,
  });

  // Owner can list messages.
  const messages = await api(owner.accessToken, "GET", `/groups/${group.id}/messages`);
  const messageItems = Array.isArray(messages) ? messages : messages.items;
  results.push({
    check: "Owner can list group messages",
    ok: Array.isArray(messageItems) && messageItems.some((m) => m.id === message.id),
  });

  // Stranger cannot send or list messages.
  const strangerList = await expectStatus(
    api(stranger.accessToken, "GET", `/groups/${group.id}/messages`),
  );
  const strangerSend = await expectStatus(
    api(stranger.accessToken, "POST", `/groups/${group.id}/messages`, { content: "intruder" }),
  );
  results.push({
    check: "Non-member cannot list group messages",
    ok: strangerList.__expectedError && strangerList.status === "404",
    detail: `status=${strangerList.status}`,
  });
  results.push({
    check: "Non-member cannot send group messages",
    ok: strangerSend.__expectedError && strangerSend.status === "404",
    detail: `status=${strangerSend.status}`,
  });

  // Owner can mark group as read.
  const read = await api(owner.accessToken, "POST", `/groups/${group.id}/read`);
  results.push({
    check: "Owner can mark group as read",
    ok: read.success === true && !!read.lastReadAt,
  });

  // Owner can add a new member.
  await api(owner.accessToken, "POST", `/groups/${group.id}/members`, {
    userId: stranger.user.id,
  });
  const afterAdd = await api(stranger.accessToken, "GET", `/groups/${group.id}`);
  results.push({
    check: "Owner can add member",
    ok: afterAdd.id === group.id && afterAdd.myRole === "MEMBER",
  });

  // Owner can remove that member.
  await api(owner.accessToken, "DELETE", `/groups/${group.id}/members/${stranger.user.id}`);
  const afterRemove = await expectStatus(
    api(stranger.accessToken, "GET", `/groups/${group.id}`),
  );
  results.push({
    check: "Owner can remove member",
    ok: afterRemove.__expectedError && afterRemove.status === "404",
    detail: `status=${afterRemove.status}`,
  });

  // Member can leave the group.
  await api(member.accessToken, "POST", `/groups/${group.id}/leave`);
  const afterLeave = await expectStatus(
    api(member.accessToken, "GET", `/groups/${group.id}`),
  );
  results.push({
    check: "Member can leave group",
    ok: afterLeave.__expectedError && afterLeave.status === "404",
    detail: `status=${afterLeave.status}`,
  });

  // Owner can archive the group.
  const archived = await api(owner.accessToken, "DELETE", `/groups/${group.id}`);
  results.push({
    check: "Owner can archive group",
    ok: archived.success === true,
  });

  // Archived group is no longer in owner's list.
  const ownerListAfterArchive = await api(owner.accessToken, "GET", "/groups");
  results.push({
    check: "Archived group no longer appears in list",
    ok: !ownerListAfterArchive.some((g) => g.id === group.id),
  });

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
