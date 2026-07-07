#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Demo mode production verification.
 *
 * Checks whether the public demo onboarding endpoint is available and returns
 * a fully verified demo user with a seeded workspace and channels.
 *
 * This verifier is skipped when demo mode is disabled.
 *
 * Required env vars:
 *   API_BASE  (defaults to https://lets-chat-api-v2.onrender.com/api/v1)
 */

import { API_BASE, api, fetchJson, finalize } from "./lib/verify-helpers.mjs";

async function main() {
  console.log("=== Production Demo Verification ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  let status;
  try {
    status = await fetchJson(`${API_BASE}/demo/status`);
  } catch (err) {
    if (err.message.includes("404")) {
      console.log(
        "Demo status endpoint is not deployed or demo mode is unavailable; skipping verification.",
      );
      process.exit(0);
    }
    throw err;
  }

  if (!status.enabled) {
    console.log("Demo mode is disabled; skipping verification.");
    process.exit(0);
  }

  results.push({
    check: "GET /demo/status reports enabled",
    ok: status.enabled === true,
  });

  const session = await fetchJson(`${API_BASE}/demo/session`, {
    method: "POST",
  });

  results.push({
    check: "POST /demo/session returns access and refresh tokens",
    ok:
      typeof session.accessToken === "string" &&
      typeof session.refreshToken === "string" &&
      session.accessToken.length > 0 &&
      session.refreshToken.length > 0,
  });

  results.push({
    check: "Demo user is a verified regular user",
    ok:
      session.user?.role === "USER" &&
      typeof session.user?.email === "string" &&
      session.user.email.endsWith("@lets-chat.demo"),
  });

  results.push({
    check: "Demo workspace is seeded",
    ok:
      session.workspace?.name === "LetsChat Demo" &&
      Array.isArray(session.channels) &&
      session.channels.length >= 3 &&
      session.defaultChannel?.name === "general",
  });

  // Verify the issued token actually works for authenticated routes.
  const workspaces = await api(session.accessToken, "GET", "/workspaces");
  results.push({
    check: "Demo access token can list workspaces",
    ok:
      Array.isArray(workspaces) &&
      workspaces.some((w) => w.id === session.workspace.id),
  });

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
