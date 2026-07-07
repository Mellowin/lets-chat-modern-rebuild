#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Authenticated auth flow verification.
 *
 * Creates a disposable Mail.tm account, registers, verifies email, logs in,
 * refreshes tokens, validates the new access token, logs out, and confirms the
 * old refresh token is rejected.
 *
 * Optional env vars:
 *   VERIFY_PASSWORD          — fixed password for reproducible runs (do not commit)
 *   VERIFY_MAIL_BASE         — override Mail.tm API base
 *   VERIFY_API_BASE          — override backend API base
 *
 * No tokens or passwords are printed.
 */

import {
  API_BASE,
  getVerifiedAccount,
  api,
  finalize,
} from "./lib/verify-helpers.mjs";

async function main() {
  console.log("=== Production Auth Verification ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  const account = await getVerifiedAccount("auth");

  // GET /auth/me with fresh access token
  {
    const me = await api(account.accessToken, "GET", "/auth/me");
    results.push({
      check: "GET /auth/me returns current user",
      ok: me.email === account.email,
      detail: `id=${me.id}`,
    });
  }

  // Refresh
  let refreshRes;
  try {
    refreshRes = await api(undefined, "POST", "/auth/refresh", {
      refreshToken: account.refreshToken,
    });
  } catch (err) {
    results.push({
      check: "POST /auth/refresh returns new tokens",
      ok: false,
      detail: err.message,
    });
  }

  if (refreshRes) {
    results.push({
      check: "POST /auth/refresh returns new tokens",
      ok: !!refreshRes.accessToken && !!refreshRes.refreshToken,
    });

    // Use new access token
    const me = await api(refreshRes.accessToken, "GET", "/auth/me");
    results.push({
      check: "New access token is accepted by GET /auth/me",
      ok: me.email === account.email,
    });

    // Logout (api() throws on non-ok, so reaching here means success)
    await api(undefined, "POST", "/auth/logout", {
      refreshToken: refreshRes.refreshToken,
    });
    results.push({
      check: "Logout succeeds",
      ok: true,
    });

    // Reuse revoked refresh token
    try {
      await api(undefined, "POST", "/auth/refresh", {
        refreshToken: refreshRes.refreshToken,
      });
      results.push({
        check: "Revoked refresh token is rejected",
        ok: false,
        detail: "refresh succeeded after logout",
      });
    } catch (err) {
      results.push({
        check: "Revoked refresh token is rejected",
        ok: err.message.includes("401"),
        detail: err.message.includes("401") ? "401" : err.message,
      });
    }
  }

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
