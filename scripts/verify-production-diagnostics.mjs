#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production diagnostics verification (B220).
 *
 * - Creates a disposable normal user and confirms they cannot access admin
 *   diagnostics endpoints.
 * - If VERIFY_ADMIN_ACCESS_TOKEN is provided, calls the endpoints as an admin
 *   and validates the safe response shape.
 *
 * Optional env vars:
 *   VERIFY_API_BASE            — override API endpoint
 *   VERIFY_PASSWORD            — fixed password (do not commit)
 *   VERIFY_ADMIN_ACCESS_TOKEN  — admin/moderator access token for positive checks
 */

import {
  API_BASE,
  createVerifiedAccount,
  api,
  finalize,
} from "./lib/verify-helpers.mjs";

const SENSITIVE_SUBSTRINGS = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "RESEND",
  "VAPID_PRIVATE",
  "S3_SECRET",
  "S3_ACCESS_KEY",
  "password",
  "token",
];

function expectStatus(fn) {
  return fn.catch((err) => ({
    __expectedError: true,
    status: err.message.match(/HTTP (\d+)/)?.[1] || "error",
    message: err.message,
  }));
}

function isSafeResponse(body) {
  const text = JSON.stringify(body).toLowerCase();
  return !SENSITIVE_SUBSTRINGS.some((s) => text.includes(s.toLowerCase()));
}

async function main() {
  console.log("=== Production Diagnostics Verification (B220) ===\n");
  console.log(`API_BASE: ${API_BASE}`);
  console.log(
    `Admin token: ${process.env.VERIFY_ADMIN_ACCESS_TOKEN ? "configured" : "not configured"}\n`,
  );

  const results = [];

  const normalUser = await createVerifiedAccount("diagnormal");

  const healthAsUser = await expectStatus(
    api(normalUser.accessToken, "GET", "/admin/diagnostics/health"),
    403,
  );
  results.push({
    check: "Normal user cannot access health diagnostics",
    ok: healthAsUser.__expectedError && healthAsUser.status === "403",
    detail: `status=${healthAsUser.status}`,
  });

  const configAsUser = await expectStatus(
    api(normalUser.accessToken, "GET", "/admin/diagnostics/config"),
    403,
  );
  results.push({
    check: "Normal user cannot access diagnostics config",
    ok: configAsUser.__expectedError && configAsUser.status === "403",
    detail: `status=${configAsUser.status}`,
  });

  const checksAsUser = await expectStatus(
    api(normalUser.accessToken, "GET", "/admin/diagnostics/checks"),
    403,
  );
  results.push({
    check: "Normal user cannot access diagnostics checks",
    ok: checksAsUser.__expectedError && checksAsUser.status === "403",
    detail: `status=${checksAsUser.status}`,
  });

  const adminToken = process.env.VERIFY_ADMIN_ACCESS_TOKEN;
  if (!adminToken) {
    console.log("\nℹ️  VERIFY_ADMIN_ACCESS_TOKEN not set; skipping positive admin checks.");
    finalize(results);
    return;
  }

  const health = await api(adminToken, "GET", "/admin/diagnostics/health");
  results.push({
    check: "Admin can access health diagnostics",
    ok: !!health && typeof health.status === "string" && typeof health.checks === "object",
    detail: `status=${health?.status}`,
  });
  results.push({
    check: "Health status is ok or degraded",
    ok: health?.status === "ok" || health?.status === "degraded",
    detail: `status=${health?.status}`,
  });
  results.push({
    check: "Health response contains expected checks",
    ok:
      health?.checks?.api &&
      health?.checks?.database &&
      health?.checks?.redis &&
      health?.checks?.push &&
      health?.checks?.attachments &&
      health?.checks?.mail,
  });
  results.push({
    check: "Health response does not expose secrets",
    ok: isSafeResponse(health),
  });

  const config = await api(adminToken, "GET", "/admin/diagnostics/config");
  results.push({
    check: "Admin can access diagnostics config",
    ok:
      !!config &&
      typeof config.push === "boolean" &&
      typeof config.pwa === "boolean" &&
      typeof config.attachments === "boolean" &&
      typeof config.email === "boolean" &&
      typeof config.redis === "boolean" &&
      typeof config.rateLimit === "boolean" &&
      typeof config.websocket === "boolean" &&
      typeof config.adminModeration === "boolean" &&
      typeof config.messageSearch === "boolean",
  });
  results.push({
    check: "Config response does not expose secrets",
    ok: isSafeResponse(config),
  });

  const checks = await api(adminToken, "GET", "/admin/diagnostics/checks");
  results.push({
    check: "Admin can access diagnostics checks",
    ok: !!checks && typeof checks.checks === "object" && typeof checks.timestamp === "string",
  });
  results.push({
    check: "Checks response does not expose secrets",
    ok: isSafeResponse(checks),
  });

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
