#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Verify persistent test data after a restart.
 *
 * Env:
 *   LOCAL_API_EMAIL     — account email
 *   LOCAL_API_PASSWORD  — account password
 *   PERSISTENCE_IDS     — path to JSON file with IDs
 */

import { readFileSync } from "fs";

const API = "http://localhost:3001/api/v1";
const idsPath = process.env.PERSISTENCE_IDS || "./scripts/persistence-test-ids.json";
const ids = JSON.parse(readFileSync(idsPath, "utf8"));

const ORIGINAL_ATTACHMENT_TEXT = "Hello from persistence test";

async function apiCall(path, options = {}) {
  const url = `${API}${path}`;
  const defaultHeaders = { "Content-Type": "application/json", Accept: "application/json" };
  const res = await fetch(url, {
    ...options,
    headers: { ...defaultHeaders, ...(options.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}: ${JSON.stringify(body)}`);
  }
  return body;
}

function attachmentFileUrl(messageId, attachmentId) {
  return `/workspaces/${ids.workspaceId}/channels/${ids.channelId}/messages/${messageId}/attachments/${attachmentId}/file`;
}

async function main() {
  const session = await apiCall("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: process.env.LOCAL_API_EMAIL, password: process.env.LOCAL_API_PASSWORD }),
  });
  const token = session.accessToken;
  const authHeaders = { Authorization: `Bearer ${token}` };

  if (session.user.id !== ids.userId) {
    throw new Error(`User ID mismatch: ${session.user.id} != ${ids.userId}`);
  }
  console.log("✅ User login OK and userId matches");

  const workspace = await apiCall(`/workspaces/${ids.workspaceId}`, { headers: authHeaders });
  console.log(`✅ Workspace exists: ${workspace.id} (${workspace.name})`);

  const channel = await apiCall(`/workspaces/${ids.workspaceId}/channels/${ids.channelId}`, { headers: authHeaders });
  console.log(`✅ Channel exists: ${channel.id} (${channel.name})`);

  const messages = await apiCall(`/workspaces/${ids.workspaceId}/channels/${ids.channelId}/messages?limit=50`, { headers: authHeaders });
  const foundIds = new Set(messages.items.map((m) => m.id));
  for (const id of ids.messageIds) {
    if (!foundIds.has(id)) {
      throw new Error(`Message ${id} not found after restart`);
    }
    console.log(`✅ Message exists: ${id}`);
  }

  // Determine the message that owns the attachment.
  let attachmentMessageId = ids.attachmentMessageId;
  if (!attachmentMessageId) {
    const candidates = messages.items.filter((m) =>
      Array.isArray(m.attachments) && m.attachments.some((a) => a.id === ids.attachmentId),
    );
    if (candidates.length !== 1) {
      throw new Error(
        `IDs file is missing attachmentMessageId and migration fallback is ambiguous (${candidates.length} candidates). Regenerate the persistence fixture.`,
      );
    }
    attachmentMessageId = candidates[0].id;
    console.log(`⚠️ Migrated missing attachmentMessageId to ${attachmentMessageId}`);
  }

  const downloadUrl = `${API}${attachmentFileUrl(attachmentMessageId, ids.attachmentId)}`;
  console.log(`Downloading attachment via scoped route: ${downloadUrl}`);
  const download = await fetch(downloadUrl, { headers: authHeaders });
  if (!download.ok) {
    throw new Error(`Attachment download failed: ${download.status} ${download.statusText}`);
  }
  const contentType = download.headers.get("content-type") || "";
  const contentDisposition = download.headers.get("content-disposition") || "";
  const content = await download.text();

  if (!contentType.includes("text/plain")) {
    throw new Error(`Unexpected content-type: ${contentType}`);
  }
  console.log(`✅ Content-Type OK: ${contentType}`);

  if (!contentDisposition.includes("persistence-test.txt")) {
    throw new Error(`Unexpected Content-Disposition: ${contentDisposition}`);
  }
  console.log(`✅ Content-Disposition OK: ${contentDisposition}`);

  if (!content.includes(ORIGINAL_ATTACHMENT_TEXT)) {
    throw new Error("Attachment content mismatch");
  }
  console.log(`✅ Attachment content matches original`);

  // Scoped-route security checks
  console.log("Checking scoped-route authorization...");
  const wrongWorkspace = await fetch(
    `${API}/workspaces/00000000-0000-0000-0000-000000000000/channels/${ids.channelId}/messages/${attachmentMessageId}/attachments/${ids.attachmentId}/file`,
    { headers: authHeaders },
  );
  if (wrongWorkspace.status !== 404 && wrongWorkspace.status !== 403) {
    throw new Error(`Wrong workspace scope should fail with 404/403, got ${wrongWorkspace.status}`);
  }
  console.log(`✅ Wrong workspace scope rejected: ${wrongWorkspace.status}`);

  const wrongAttachment = await fetch(
    `${API}/workspaces/${ids.workspaceId}/channels/${ids.channelId}/messages/${attachmentMessageId}/attachments/00000000-0000-0000-0000-000000000000/file`,
    { headers: authHeaders },
  );
  if (wrongAttachment.status !== 404) {
    throw new Error(`Wrong attachment scope should fail with 404, got ${wrongAttachment.status}`);
  }
  console.log(`✅ Wrong attachment scope rejected: ${wrongAttachment.status}`);

  // Unauthenticated request must fail
  const unauth = await fetch(downloadUrl);
  if (unauth.status !== 401 && unauth.status !== 403) {
    throw new Error(`Unauthenticated request should fail with 401/403, got ${unauth.status}`);
  }
  console.log(`✅ Unauthenticated download rejected: ${unauth.status}`);

  console.log(`✅ Attachment download OK via scoped route: ${downloadUrl}`);
}

main().catch((err) => {
  console.error("Persistence verification failed:", err.message);
  process.exit(1);
});
