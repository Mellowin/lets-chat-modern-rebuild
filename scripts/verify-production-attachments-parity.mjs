#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production attachment parity verification (B226 Part C).
 *
 * Verifies that direct messages and group messages support the same attachment
 * lifecycle as channel messages: upload, link to message, list, and download.
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

  const alice = await createVerifiedAccount("attachalice");
  await sleep(1500);
  const bob = await createVerifiedAccount("attachbob");
  await sleep(1500);
  const carol = await createVerifiedAccount("attachcarol");

  // ---- Direct message attachments ----

  const direct = await api(alice.accessToken, "POST", "/direct-conversations", {
    userId: bob.user.id,
  });
  results.push({
    check: "Direct conversation created",
    ok: Boolean(direct.id),
    detail: `id=${direct.id}`,
  });

  const directContent = Buffer.from("Direct message attachment content 🚀");
  const directAttachment = await uploadFile(
    alice.accessToken,
    `/direct-conversations/${direct.id}/messages/attachments/upload`,
    "parity-direct.txt",
    directContent,
    "text/plain",
  );
  results.push({
    check: "Direct attachment upload returns attachment metadata",
    ok:
      directAttachment.id &&
      directAttachment.fileName === "parity-direct.txt" &&
      directAttachment.sizeBytes === directContent.length,
    detail: `id=${directAttachment.id}`,
  });

  const directMessage = await api(alice.accessToken, "POST", `/direct-conversations/${direct.id}/messages`, {
    content: "Message with direct attachment",
    attachmentIds: [directAttachment.id],
  });
  results.push({
    check: "Direct message links attachment",
    ok:
      Array.isArray(directMessage.attachments) &&
      directMessage.attachments.some((a) => a.id === directAttachment.id),
  });

  const directDownloadUrl = `${API_BASE}/direct-conversations/${direct.id}/messages/${directMessage.id}/attachments/${directAttachment.id}/file`;
  const directDownloaded = await downloadFile(alice.accessToken, directDownloadUrl);
  results.push({
    check: "Direct attachment download returns identical content",
    ok: directDownloaded.equals(directContent),
  });

  // Recipient can also list and download
  const bobMessages = await api(bob.accessToken, "GET", `/direct-conversations/${direct.id}/messages`);
  const bobMessage = bobMessages.items?.[0] ?? bobMessages[0];
  results.push({
    check: "Recipient sees direct message with attachment",
    ok:
      bobMessage &&
      Array.isArray(bobMessage.attachments) &&
      bobMessage.attachments.some((a) => a.id === directAttachment.id),
  });

  const bobDownloaded = await downloadFile(
    bob.accessToken,
    `${API_BASE}/direct-conversations/${direct.id}/messages/${directMessage.id}/attachments/${directAttachment.id}/file`,
  );
  results.push({
    check: "Recipient can download direct attachment",
    ok: bobDownloaded.equals(directContent),
  });

  // ---- Group message attachments ----

  const group = await api(alice.accessToken, "POST", "/groups", {
    name: `B226 Attach Parity ${Date.now()}`,
    memberIds: [bob.user.id, carol.user.id],
  });
  results.push({
    check: "Group created",
    ok: Boolean(group.id) && group.myRole === "OWNER",
    detail: `id=${group.id}`,
  });

  const groupContent = Buffer.from("Group message attachment content 🌟");
  const groupAttachment = await uploadFile(
    alice.accessToken,
    `/groups/${group.id}/messages/attachments/upload`,
    "parity-group.txt",
    groupContent,
    "text/plain",
  );
  results.push({
    check: "Group attachment upload returns attachment metadata",
    ok:
      groupAttachment.id &&
      groupAttachment.fileName === "parity-group.txt" &&
      groupAttachment.sizeBytes === groupContent.length,
    detail: `id=${groupAttachment.id}`,
  });

  const groupMessage = await api(alice.accessToken, "POST", `/groups/${group.id}/messages`, {
    content: "Message with group attachment",
    attachmentIds: [groupAttachment.id],
  });
  results.push({
    check: "Group message links attachment",
    ok:
      Array.isArray(groupMessage.attachments) &&
      groupMessage.attachments.some((a) => a.id === groupAttachment.id),
  });

  const groupDownloaded = await downloadFile(
    bob.accessToken,
    `${API_BASE}/groups/${group.id}/messages/${groupMessage.id}/attachments/${groupAttachment.id}/file`,
  );
  results.push({
    check: "Member can download group attachment",
    ok: groupDownloaded.equals(groupContent),
  });

  const carolMessages = await api(carol.accessToken, "GET", `/groups/${group.id}/messages`);
  const carolMessage = carolMessages.items?.[0] ?? carolMessages[0];
  results.push({
    check: "Other member sees group message with attachment",
    ok:
      carolMessage &&
      Array.isArray(carolMessage.attachments) &&
      carolMessage.attachments.some((a) => a.id === groupAttachment.id),
  });

  finalize(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
