#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production mentions and notification preferences verification.
 *
 * Creates two disposable accounts, checks notification preference endpoints,
 * then verifies that mentions in direct messages and groups resolve to the
 * correct user and are returned in message responses.
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
  console.log("=== Production Mentions & Notification Preferences Verification ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  const sender = await createVerifiedAccount("mentionsender");
  await sleep(1500);
  const recipient = await createVerifiedAccount("mentionrecipient");
  await sleep(1500);

  // GET /auth/me/notification-preferences
  const prefs = await api(sender.accessToken, "GET", "/auth/me/notification-preferences");
  results.push({
    check: "GET /auth/me/notification-preferences returns all fields",
    ok:
      typeof prefs.pushNotificationsEnabled === "boolean" &&
      typeof prefs.mentionNotificationsEnabled === "boolean" &&
      typeof prefs.directMessageNotificationsEnabled === "boolean" &&
      typeof prefs.groupMessageNotificationsEnabled === "boolean" &&
      typeof prefs.channelMessageNotificationsEnabled === "boolean",
    detail: JSON.stringify(prefs),
  });

  // PUT /auth/me/notification-preferences
  const updatedPrefs = await api(sender.accessToken, "PUT", "/auth/me/notification-preferences", {
    mentionNotificationsEnabled: false,
  });
  results.push({
    check: "PUT /auth/me/notification-preferences updates a single field",
    ok:
      updatedPrefs.mentionNotificationsEnabled === false &&
      typeof updatedPrefs.directMessageNotificationsEnabled === "boolean",
    detail: `mention=${updatedPrefs.mentionNotificationsEnabled}`,
  });

  // Restore mention preference for later checks.
  await api(sender.accessToken, "PUT", "/auth/me/notification-preferences", {
    mentionNotificationsEnabled: true,
  });

  // Create a direct conversation between sender and recipient.
  const direct = await api(sender.accessToken, "POST", "/direct-conversations", {
    userId: recipient.user.id,
  });
  results.push({
    check: "Sender can create a direct conversation with recipient",
    ok: direct.id && direct.otherParticipant?.id === recipient.user.id,
    detail: `conversationId=${direct.id}`,
  });

  // Send a direct message that mentions the recipient.
  const dmText = `Hello @${recipient.user.username}`;
  const dmMessage = await api(sender.accessToken, "POST", `/direct-conversations/${direct.id}/messages`, {
    content: dmText,
  });
  results.push({
    check: "Direct message with mention is created",
    ok: dmMessage.id && dmMessage.content === dmText,
    detail: `messageId=${dmMessage.id}`,
  });
  results.push({
    check: "Direct message response includes resolved mention",
    ok:
      Array.isArray(dmMessage.mentions) &&
      dmMessage.mentions.some(
        (m) => m.userId === recipient.user.id && m.username === recipient.user.username,
      ),
    detail: `mentions=${JSON.stringify(dmMessage.mentions)}`,
  });

  // Listing direct messages also includes mentions.
  const dmList = await api(sender.accessToken, "GET", `/direct-conversations/${direct.id}/messages`);
  const dmItems = Array.isArray(dmList) ? dmList : dmList.items;
  const dmListed = dmItems?.find((m) => m.id === dmMessage.id);
  results.push({
    check: "Listed direct messages preserve mention metadata",
    ok:
      dmListed &&
      Array.isArray(dmListed.mentions) &&
      dmListed.mentions.some((m) => m.userId === recipient.user.id),
    detail: `found=${!!dmListed}`,
  });

  // Non-resolvable mention (stranger not in conversation) should not resolve.
  const dmInvalidText = "Hey @notintheconversation";
  const dmInvalidMessage = await api(sender.accessToken, "POST", `/direct-conversations/${direct.id}/messages`, {
    content: dmInvalidText,
  });
  results.push({
    check: "Mention of non-participant in DM is not resolved",
    ok: Array.isArray(dmInvalidMessage.mentions) && dmInvalidMessage.mentions.length === 0,
    detail: `mentions=${JSON.stringify(dmInvalidMessage.mentions)}`,
  });

  // Create a group with sender as owner and recipient as member.
  const groupName = `B217 Verify Mentions ${Date.now()}`;
  const group = await api(sender.accessToken, "POST", "/groups", {
    name: groupName,
    memberIds: [recipient.user.id],
  });
  results.push({
    check: "Sender can create a group with recipient",
    ok: group.id && group.name === groupName,
    detail: `groupId=${group.id}`,
  });

  // Send a group message mentioning the recipient.
  const groupText = `Hi @${recipient.user.username}`;
  const groupMessage = await api(sender.accessToken, "POST", `/groups/${group.id}/messages`, {
    content: groupText,
  });
  results.push({
    check: "Group message with mention is created",
    ok: groupMessage.id && groupMessage.content === groupText,
    detail: `messageId=${groupMessage.id}`,
  });
  results.push({
    check: "Group message response includes resolved mention",
    ok:
      Array.isArray(groupMessage.mentions) &&
      groupMessage.mentions.some(
        (m) => m.userId === recipient.user.id && m.username === recipient.user.username,
      ),
    detail: `mentions=${JSON.stringify(groupMessage.mentions)}`,
  });

  // Non-resolvable mention in group (stranger not a member) should not resolve.
  const groupInvalidText = "Hey @notamember";
  const groupInvalidMessage = await api(sender.accessToken, "POST", `/groups/${group.id}/messages`, {
    content: groupInvalidText,
  });
  results.push({
    check: "Mention of non-member in group is not resolved",
    ok: Array.isArray(groupInvalidMessage.mentions) && groupInvalidMessage.mentions.length === 0,
    detail: `mentions=${JSON.stringify(groupInvalidMessage.mentions)}`,
  });

  // Mention of sender themselves should not resolve.
  const selfMentionText = `Note to @${sender.user.username}`;
  const selfMentionMessage = await api(sender.accessToken, "POST", `/groups/${group.id}/messages`, {
    content: selfMentionText,
  });
  results.push({
    check: "Self-mention in group is not resolved",
    ok: Array.isArray(selfMentionMessage.mentions) && selfMentionMessage.mentions.length === 0,
    detail: `mentions=${JSON.stringify(selfMentionMessage.mentions)}`,
  });

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
