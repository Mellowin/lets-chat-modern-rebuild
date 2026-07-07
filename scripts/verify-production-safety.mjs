#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production safety and blocking verification.
 *
 * Creates disposable accounts and verifies:
 *   - Block/unblock lifecycle and idempotency
 *   - Block prevents new DMs in either direction
 *   - Block prevents sending messages in existing DMs
 *   - Block prevents contact adds in either direction
 *   - Block prevents targeted group member adds in either direction
 *   - Reports can be created and self-reports are rejected
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
  console.log("=== Production Safety & Blocking Verification ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  const alice = await getVerifiedAccount("safetyalice");
  await sleep(1500);
  const bob = await getVerifiedAccount("safetybob");
  await sleep(1500);
  const carol = await getVerifiedAccount("safetycarol");

  // ---- Block lifecycle ----

  const blocked = await api(alice.accessToken, "POST", "/blocks", {
    userId: bob.user.id,
    reason: "Verification block",
  });
  results.push({
    check: "Alice can block Bob",
    ok: blocked.blockedUserId === bob.user.id && blocked.username === bob.user.username,
    detail: `blockedUserId=${blocked.blockedUserId}`,
  });

  const blockedAgain = await api(alice.accessToken, "POST", "/blocks", {
    userId: bob.user.id,
  });
  results.push({
    check: "Blocking the same user again is idempotent",
    ok: blockedAgain.blockedUserId === bob.user.id,
  });

  const aliceBlocks = await api(alice.accessToken, "GET", "/blocks");
  results.push({
    check: "Alice can list users she has blocked",
    ok: Array.isArray(aliceBlocks) && aliceBlocks.some((b) => b.blockedUserId === bob.user.id),
  });

  const bobBlocks = await api(bob.accessToken, "GET", "/blocks");
  results.push({
    check: "Bob cannot see Alice's block list",
    ok: Array.isArray(bobBlocks) && !bobBlocks.some((b) => b.blockedUserId === alice.user.id),
  });

  const unblocked = await api(alice.accessToken, "DELETE", `/blocks/${bob.user.id}`);
  results.push({
    check: "Alice can unblock Bob",
    ok: unblocked.success === true,
  });

  const aliceBlocksAfterUnblock = await api(alice.accessToken, "GET", "/blocks");
  results.push({
    check: "Unblocked user no longer appears in list",
    ok: Array.isArray(aliceBlocksAfterUnblock) && !aliceBlocksAfterUnblock.some((b) => b.blockedUserId === bob.user.id),
  });

  const selfBlock = await expectStatus(
    api(alice.accessToken, "POST", "/blocks", { userId: alice.user.id }),
  );
  results.push({
    check: "Self-block is rejected",
    ok: selfBlock.__expectedError && selfBlock.status === "400",
    detail: `status=${selfBlock.status}`,
  });

  // ---- Block prevents new DMs ----

  await api(alice.accessToken, "POST", "/blocks", { userId: bob.user.id });

  const bobToAliceDm = await expectStatus(
    api(bob.accessToken, "POST", "/direct-conversations", { userId: alice.user.id }),
  );
  results.push({
    check: "Blocked user cannot start a DM with the blocker",
    ok: bobToAliceDm.__expectedError && bobToAliceDm.status === "403",
    detail: `status=${bobToAliceDm.status}`,
  });

  const aliceToBobDm = await expectStatus(
    api(alice.accessToken, "POST", "/direct-conversations", { userId: bob.user.id }),
  );
  results.push({
    check: "Blocker cannot start a DM with the blocked user",
    ok: aliceToBobDm.__expectedError && aliceToBobDm.status === "403",
    detail: `status=${aliceToBobDm.status}`,
  });

  await api(alice.accessToken, "DELETE", `/blocks/${bob.user.id}`);

  // ---- Block prevents messages in existing DMs ----

  const existingDm = await api(alice.accessToken, "POST", "/direct-conversations", {
    userId: bob.user.id,
  });
  results.push({
    check: "DM can be created while no block exists",
    ok: existingDm.id && existingDm.otherParticipant?.id === bob.user.id,
    detail: `conversationId=${existingDm.id}`,
  });

  await api(alice.accessToken, "POST", "/blocks", { userId: bob.user.id });

  const blockedMessage = await expectStatus(
    api(alice.accessToken, "POST", `/direct-conversations/${existingDm.id}/messages`, {
      content: "should be blocked",
    }),
  );
  results.push({
    check: "Block prevents sending messages in an existing DM",
    ok: blockedMessage.__expectedError && blockedMessage.status === "403",
    detail: `status=${blockedMessage.status}`,
  });

  await api(alice.accessToken, "DELETE", `/blocks/${bob.user.id}`);

  // ---- Block prevents contact adds ----

  await api(alice.accessToken, "POST", "/blocks", { userId: bob.user.id });

  const aliceAddBobContact = await expectStatus(
    api(alice.accessToken, "POST", "/contacts", { userId: bob.user.id }),
  );
  results.push({
    check: "Blocker cannot add the blocked user as a contact",
    ok: aliceAddBobContact.__expectedError && aliceAddBobContact.status === "403",
    detail: `status=${aliceAddBobContact.status}`,
  });

  const bobAddAliceContact = await expectStatus(
    api(bob.accessToken, "POST", "/contacts", { userId: alice.user.id }),
  );
  results.push({
    check: "Blocked user cannot add the blocker as a contact",
    ok: bobAddAliceContact.__expectedError && bobAddAliceContact.status === "403",
    detail: `status=${bobAddAliceContact.status}`,
  });

  await api(alice.accessToken, "DELETE", `/blocks/${bob.user.id}`);

  // ---- Block prevents targeted group member add ----

  const group = await api(alice.accessToken, "POST", "/groups", {
    name: `B215 Verify Group ${runId}`,
    memberIds: [carol.user.id],
  });
  results.push({
    check: "Alice can create a group for safety testing",
    ok: group.id && group.myRole === "OWNER" && group.memberCount === 2,
    detail: `groupId=${group.id}`,
  });

  await api(alice.accessToken, "POST", "/blocks", { userId: bob.user.id });

  const addBlocked = await expectStatus(
    api(alice.accessToken, "POST", `/groups/${group.id}/members`, { userId: bob.user.id }),
  );
  results.push({
    check: "Owner cannot add a user they have blocked to a group",
    ok: addBlocked.__expectedError && addBlocked.status === "403",
    detail: `status=${addBlocked.status}`,
  });

  await api(alice.accessToken, "DELETE", `/blocks/${bob.user.id}`);
  await api(bob.accessToken, "POST", "/blocks", { userId: alice.user.id });

  const addBlockedByTarget = await expectStatus(
    api(alice.accessToken, "POST", `/groups/${group.id}/members`, { userId: bob.user.id }),
  );
  results.push({
    check: "Owner cannot add a user who has blocked them to a group",
    ok: addBlockedByTarget.__expectedError && addBlockedByTarget.status === "403",
    detail: `status=${addBlockedByTarget.status}`,
  });

  await api(bob.accessToken, "DELETE", `/blocks/${alice.user.id}`);

  // ---- Reports ----

  const report = await api(alice.accessToken, "POST", "/reports", {
    reportedUserId: bob.user.id,
    reason: "harassment",
    details: "Verification report",
  });
  results.push({
    check: "Alice can report Bob",
    ok: report.success === true,
  });

  const selfReport = await expectStatus(
    api(alice.accessToken, "POST", "/reports", { reportedUserId: alice.user.id, reason: "spam" }),
  );
  results.push({
    check: "Self-report is rejected",
    ok: selfReport.__expectedError && selfReport.status === "400",
    detail: `status=${selfReport.status}`,
  });

  const reportWithoutReason = await expectStatus(
    api(alice.accessToken, "POST", "/reports", { reportedUserId: bob.user.id }),
  );
  results.push({
    check: "Report without a reason is rejected",
    ok: reportWithoutReason.__expectedError && reportWithoutReason.status === "400",
    detail: `status=${reportWithoutReason.status}`,
  });

  // Archive the disposable group.
  await api(alice.accessToken, "DELETE", `/groups/${group.id}`);
  results.push({
    check: "Disposable verification group archived",
    ok: true,
  });

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
