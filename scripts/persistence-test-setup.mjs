#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Create persistent test data for the local LetsChat installation.
 *
 * Env:
 *   LOCAL_API_EMAIL     — account email
 *   LOCAL_API_PASSWORD  — account password
 *
 * Prints JSON with userId, workspaceId, channelId, messageIds and attachment info.
 */

const API = "http://localhost:3001/api/v1";

const email = process.env.LOCAL_API_EMAIL;
const password = process.env.LOCAL_API_PASSWORD;
if (!email || !password) {
  console.error("Set LOCAL_API_EMAIL and LOCAL_API_PASSWORD");
  process.exit(1);
}

async function apiCall(path, options = {}) {
  const url = `${API}${path}`;
  const defaultHeaders = { "Content-Type": "application/json", Accept: "application/json" };
  const mergedHeaders = { ...defaultHeaders, ...(options.headers || {}) };
  const res = await fetch(url, {
    ...options,
    headers: mergedHeaders,
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

async function main() {
  // 1. Login
  const session = await apiCall("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const token = session.accessToken;
  const userId = session.user.id;
  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Create workspace
  const workspace = await apiCall("/workspaces", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ name: "Persistence Test Workspace", slug: `persistence-test-${Date.now()}` }),
  });

  // 3. Create channel
  const channel = await apiCall(`/workspaces/${workspace.id}/channels`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ name: "general", type: "PUBLIC" }),
  });

  // 4. Upload attachment
  const fileContent = new Blob(["Hello from persistence test"], { type: "text/plain" });
  const form = new FormData();
  form.append("file", fileContent, "persistence-test.txt");
  const upload = await fetch(
    `${API}/workspaces/${workspace.id}/channels/${channel.id}/messages/attachments/upload`,
    {
      method: "POST",
      headers: authHeaders,
      body: form,
    },
  );
  if (!upload.ok) {
    const text = await upload.text();
    throw new Error(`Attachment upload failed: ${upload.status} ${text}`);
  }
  const attachment = await upload.json();

  // 5. Send text-only message
  const message1 = await apiCall(
    `/workspaces/${workspace.id}/channels/${channel.id}/messages`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ content: "First persistent message" }),
    },
  );

  // 6. Send message with attachment
  const message2 = await apiCall(
    `/workspaces/${workspace.id}/channels/${channel.id}/messages`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        content: "Message with attachment",
        attachments: [
          {
            storageKey: attachment.storageKey,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            kind: attachment.kind,
          },
        ],
      }),
    },
  );

  const result = {
    userId,
    workspaceId: workspace.id,
    channelId: channel.id,
    attachmentId: message2.attachments?.[0]?.id || attachment.id,
    attachmentStorageKey: attachment.storageKey,
    attachmentMessageId: message2.id,
    messageIds: [message1.id, message2.id],
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Persistence setup failed:", err.message);
  process.exit(1);
});
