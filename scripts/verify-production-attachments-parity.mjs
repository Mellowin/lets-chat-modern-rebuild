#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production attachment parity verification (B226 Part C).
 *
 * Verifies that direct messages and group messages support the same attachment
 * lifecycle as channel messages: upload, link to message, list, and download.
 *
 * Also verifies attachment-only messages (empty text + file) work, because
 * that is the primary real-world flow for file sharing.
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

function expectStatus(fn) {
  return fn.catch((err) => ({
    __expectedError: true,
    status: err.message.match(/HTTP (\d+)/)?.[1] || "error",
    message: err.message,
  }));
}

async function uploadFile(token, endpoint, filename, content, mimeType = "text/plain") {
  const form = new FormData();
  const blob = new Blob([content], { type: mimeType });
  form.append("file", blob, filename);

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const summary = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${endpoint}: ${summary}`);
  }
  return body;
}

async function downloadFile(token, url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText} downloading ${url}: ${text}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log("=== Production Attachment Parity Verification (B226 Part C) ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  const alice = await getVerifiedAccount("attachalice");
  await sleep(1500);
  const bob = await getVerifiedAccount("attachbob");
  await sleep(1500);
  const carol = await getVerifiedAccount("attachcarol");

  // ---- Direct message attachments ----

  const direct = await api(alice.accessToken, "POST", "/direct-conversations", {
    userId: bob.user.id,
  });
  results.push({
    check: "Direct conversation created",
    ok: Boolean(direct.id),
    detail: `id=${direct.id}`,
  });

  // Empty message without attachments must be rejected.
  const emptyDirect = await expectStatus(
    api(alice.accessToken, "POST", `/direct-conversations/${direct.id}/messages`, {}),
  );
  results.push({
    check: "Direct empty message without attachments is rejected",
    ok: emptyDirect.__expectedError && emptyDirect.status === "400",
    detail: emptyDirect.status,
  });

  const directContent = Buffer.from("Direct message attachment content 🚀");
  const directAttachment = await uploadFile(
    alice.accessToken,
    `/direct-conversations/${direct.id}/messages/attachments/upload`,
    `parity-direct-${runId}.txt`,
    directContent,
    "text/plain",
  );
  results.push({
    check: "Direct attachment upload returns attachment metadata",
    ok:
      directAttachment.id &&
      directAttachment.fileName === `parity-direct-${runId}.txt` &&
      directAttachment.sizeBytes === directContent.length,
    detail: `id=${directAttachment.id}`,
  });

  // Text + attachment
  const directMessage = await api(alice.accessToken, "POST", `/direct-conversations/${direct.id}/messages`, {
    content: "Message with direct attachment",
    attachmentIds: [directAttachment.id],
  });
  results.push({
    check: "Direct message with text links attachment",
    ok:
      Array.isArray(directMessage.attachments) &&
      directMessage.attachments.some((a) => a.id === directAttachment.id),
  });

  // Attachment-only
  const directOnlyContent = Buffer.from("Direct attachment-only content 🚀");
  const directOnlyAttachment = await uploadFile(
    alice.accessToken,
    `/direct-conversations/${direct.id}/messages/attachments/upload`,
    `parity-direct-only-${runId}.txt`,
    directOnlyContent,
    "text/plain",
  );

  const directOnlyMessage = await api(alice.accessToken, "POST", `/direct-conversations/${direct.id}/messages`, {
    content: "",
    attachmentIds: [directOnlyAttachment.id],
  });
  results.push({
    check: "Direct attachment-only message (empty text) is accepted",
    ok:
      directOnlyMessage.id &&
      Array.isArray(directOnlyMessage.attachments) &&
      directOnlyMessage.attachments.some((a) => a.id === directOnlyAttachment.id),
    detail: `messageId=${directOnlyMessage.id}`,
  });

  const directDownloadUrl = `${API_BASE}/direct-conversations/${direct.id}/messages/${directOnlyMessage.id}/attachments/${directOnlyAttachment.id}/file`;
  const directDownloaded = await downloadFile(alice.accessToken, directDownloadUrl);
  results.push({
    check: "Direct attachment-only download returns identical content",
    ok: directDownloaded.equals(directOnlyContent),
  });

  // Recipient can also list and download
  const bobMessages = await api(bob.accessToken, "GET", `/direct-conversations/${direct.id}/messages`);
  const bobMessage = bobMessages.items?.find((m) => m.id === directOnlyMessage.id) ?? bobMessages.find((m) => m.id === directOnlyMessage.id);
  results.push({
    check: "Recipient sees direct attachment-only message",
    ok:
      bobMessage &&
      Array.isArray(bobMessage.attachments) &&
      bobMessage.attachments.some((a) => a.id === directOnlyAttachment.id),
  });

  const bobDownloaded = await downloadFile(
    bob.accessToken,
    `${API_BASE}/direct-conversations/${direct.id}/messages/${directOnlyMessage.id}/attachments/${directOnlyAttachment.id}/file`,
  );
  results.push({
    check: "Recipient can download direct attachment-only file",
    ok: bobDownloaded.equals(directOnlyContent),
  });

  // ---- Group message attachments ----

  const group = await api(alice.accessToken, "POST", "/groups", {
    name: `B226 Attach Parity ${runId}`,
    memberIds: [bob.user.id, carol.user.id],
  });
  results.push({
    check: "Group created",
    ok: Boolean(group.id) && group.myRole === "OWNER",
    detail: `id=${group.id}`,
  });

  // Empty message without attachments must be rejected.
  const emptyGroup = await expectStatus(
    api(alice.accessToken, "POST", `/groups/${group.id}/messages`, {}),
  );
  results.push({
    check: "Group empty message without attachments is rejected",
    ok: emptyGroup.__expectedError && emptyGroup.status === "400",
    detail: emptyGroup.status,
  });

  const groupContent = Buffer.from("Group message attachment content 🌟");
  const groupAttachment = await uploadFile(
    alice.accessToken,
    `/groups/${group.id}/messages/attachments/upload`,
    `parity-group-${runId}.txt`,
    groupContent,
    "text/plain",
  );
  results.push({
    check: "Group attachment upload returns attachment metadata",
    ok:
      groupAttachment.id &&
      groupAttachment.fileName === `parity-group-${runId}.txt` &&
      groupAttachment.sizeBytes === groupContent.length,
    detail: `id=${groupAttachment.id}`,
  });

  // Text + attachment
  const groupMessage = await api(alice.accessToken, "POST", `/groups/${group.id}/messages`, {
    content: "Message with group attachment",
    attachmentIds: [groupAttachment.id],
  });
  results.push({
    check: "Group message with text links attachment",
    ok:
      Array.isArray(groupMessage.attachments) &&
      groupMessage.attachments.some((a) => a.id === groupAttachment.id),
  });

  // Attachment-only
  const groupOnlyContent = Buffer.from("Group attachment-only content 🌟");
  const groupOnlyAttachment = await uploadFile(
    alice.accessToken,
    `/groups/${group.id}/messages/attachments/upload`,
    `parity-group-only-${runId}.txt`,
    groupOnlyContent,
    "text/plain",
  );

  const groupOnlyMessage = await api(alice.accessToken, "POST", `/groups/${group.id}/messages`, {
    content: "",
    attachmentIds: [groupOnlyAttachment.id],
  });
  results.push({
    check: "Group attachment-only message (empty text) is accepted",
    ok:
      groupOnlyMessage.id &&
      Array.isArray(groupOnlyMessage.attachments) &&
      groupOnlyMessage.attachments.some((a) => a.id === groupOnlyAttachment.id),
    detail: `messageId=${groupOnlyMessage.id}`,
  });

  const groupDownloaded = await downloadFile(
    bob.accessToken,
    `${API_BASE}/groups/${group.id}/messages/${groupOnlyMessage.id}/attachments/${groupOnlyAttachment.id}/file`,
  );
  results.push({
    check: "Member can download group attachment-only file",
    ok: groupDownloaded.equals(groupOnlyContent),
  });

  const carolMessages = await api(carol.accessToken, "GET", `/groups/${group.id}/messages`);
  const carolMessage = carolMessages.items?.find((m) => m.id === groupOnlyMessage.id) ?? carolMessages.find((m) => m.id === groupOnlyMessage.id);
  results.push({
    check: "Other member sees group attachment-only message",
    ok:
      carolMessage &&
      Array.isArray(carolMessage.attachments) &&
      carolMessage.attachments.some((a) => a.id === groupOnlyAttachment.id),
  });

  finalize(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
