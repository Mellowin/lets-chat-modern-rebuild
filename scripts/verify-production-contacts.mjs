#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production contacts and group-invite verification.
 *
 * Creates disposable accounts and verifies:
 *   - Contacts: add, idempotency, list privacy, remove, start DM
 *   - Group invite links: owner-only create/revoke, public preview, accept join
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
  console.log("=== Production Contacts & Group Invites Verification ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  const owner = await getVerifiedAccount("contactowner");
  await sleep(1500);
  const contact = await getVerifiedAccount("contacttarget");
  await sleep(1500);
  const stranger = await getVerifiedAccount("contactstranger");

  // The classic contact lifecycle assumes the target accepts direct adds.
  await api(contact.accessToken, "PATCH", "/users/me/contact-privacy", {
    contactPrivacySetting: "EVERYONE",
  });

  // ---- Contacts ----

  const added = await api(owner.accessToken, "POST", "/contacts", {
    userId: contact.user.id,
  });
  results.push({
    check: "Owner can add a contact by userId",
    ok: added.contactUserId === contact.user.id && added.username === contact.user.username,
    detail: `contactId=${added.contactUserId}`,
  });

  const addedAgain = await api(owner.accessToken, "POST", "/contacts", {
    userId: contact.user.id,
  });
  results.push({
    check: "Adding a contact is idempotent",
    ok: addedAgain.contactUserId === contact.user.id,
  });

  const ownerContacts = await api(owner.accessToken, "GET", "/contacts");
  results.push({
    check: "Owner can list their contacts",
    ok: Array.isArray(ownerContacts) && ownerContacts.some((c) => c.contactUserId === contact.user.id),
  });

  const strangerContacts = await api(stranger.accessToken, "GET", "/contacts");
  results.push({
    check: "Contacts are private to each user",
    ok: Array.isArray(strangerContacts) && !strangerContacts.some((c) => c.contactUserId === contact.user.id),
  });

  const selfAdd = await expectStatus(
    api(owner.accessToken, "POST", "/contacts", { userId: owner.user.id }),
  );
  results.push({
    check: "Self-add is rejected",
    ok: selfAdd.__expectedError && selfAdd.status === "400",
    detail: `status=${selfAdd.status}`,
  });

  const dm = await api(owner.accessToken, "POST", `/contacts/${contact.user.id}/start-dm`);
  results.push({
    check: "Owner can start a DM with a contact",
    ok: dm.id && dm.otherParticipant?.id === contact.user.id,
    detail: `conversationId=${dm.id}`,
  });

  const removed = await api(owner.accessToken, "DELETE", `/contacts/${contact.user.id}`);
  results.push({
    check: "Owner can remove a contact",
    ok: removed.success === true,
  });

  const ownerContactsAfterRemove = await api(owner.accessToken, "GET", "/contacts");
  results.push({
    check: "Removed contact no longer appears in list",
    ok: Array.isArray(ownerContactsAfterRemove) && !ownerContactsAfterRemove.some((c) => c.contactUserId === contact.user.id),
  });

  // ---- Group invite links ----

  const groupName = `B214 Verify Group ${runId}`;
  const group = await api(owner.accessToken, "POST", "/groups", {
    name: groupName,
    memberIds: [contact.user.id],
  });
  results.push({
    check: "Owner can create a group for invite testing",
    ok: group.id && group.name === groupName && group.myRole === "OWNER",
    detail: `groupId=${group.id}`,
  });

  const invite = await api(owner.accessToken, "POST", `/groups/${group.id}/invites`, {
    expiresInHours: 1,
  });
  results.push({
    check: "Owner can create a group invite link",
    ok: invite.id && invite.groupId === group.id && invite.token.length === 64,
    detail: `inviteId=${invite.id}`,
  });

  const memberCreateInvite = await expectStatus(
    api(contact.accessToken, "POST", `/groups/${group.id}/invites`, { expiresInHours: 1 }),
  );
  results.push({
    check: "Non-owner cannot create an invite link",
    ok: memberCreateInvite.__expectedError && memberCreateInvite.status === "403",
    detail: `status=${memberCreateInvite.status}`,
  });

  const preview = await api(undefined, "GET", `/group-invites/${invite.token}`);
  results.push({
    check: "Public invite preview is valid before acceptance",
    ok: preview.valid === true && preview.groupName === groupName,
  });

  const accepted = await api(stranger.accessToken, "POST", `/group-invites/${invite.token}/accept`);
  results.push({
    check: "Stranger can accept the invite and join the group",
    ok: accepted.id === group.id && accepted.myRole === "MEMBER",
  });

  const strangerGroupList = await api(stranger.accessToken, "GET", "/groups");
  results.push({
    check: "Group appears in invitee's list after accepting",
    ok: Array.isArray(strangerGroupList) && strangerGroupList.some((g) => g.id === group.id),
  });

  const acceptedAgain = await api(stranger.accessToken, "POST", `/group-invites/${invite.token}/accept`);
  results.push({
    check: "Re-accepting invite is idempotent",
    ok: acceptedAgain.id === group.id,
  });

  const revoked = await api(owner.accessToken, "DELETE", `/groups/${group.id}/invites/${invite.id}`);
  results.push({
    check: "Owner can revoke an invite link",
    ok: revoked.id === invite.id && !!revoked.revokedAt,
  });

  const previewAfterRevoke = await api(undefined, "GET", `/group-invites/${invite.token}`);
  results.push({
    check: "Revoked invite preview is invalid",
    ok: previewAfterRevoke.valid === false,
  });

  const acceptAfterRevoke = await expectStatus(
    api(stranger.accessToken, "POST", `/group-invites/${invite.token}/accept`),
  );
  results.push({
    check: "Accepting a revoked invite is rejected",
    ok: acceptAfterRevoke.__expectedError && acceptAfterRevoke.status === "410",
    detail: `status=${acceptAfterRevoke.status}`,
  });

  // Archive the disposable group.
  const archived = await api(owner.accessToken, "DELETE", `/groups/${group.id}`);
  results.push({
    check: "Owner can archive the verification group",
    ok: archived.success === true,
  });

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
