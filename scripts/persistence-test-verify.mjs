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
const idsPath = process.env.PERSISTENCE_IDS || "./scripts/temp_persistence_ids.json";
const ids = JSON.parse(readFileSync(idsPath, "utf8"));

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

  const download = await fetch(`${API}/attachments/${ids.attachmentStorageKey}`, { headers: authHeaders });
  if (!download.ok) {
    throw new Error(`Attachment download failed: ${download.status}`);
  }
  const content = await download.text();
  if (!content.includes("Hello from persistence test")) {
    throw new Error("Attachment content mismatch");
  }
  console.log(`✅ Attachment download OK: ${ids.attachmentStorageKey}`);
}

main().catch((err) => {
  console.error("Persistence verification failed:", err.message);
  process.exit(1);
});
