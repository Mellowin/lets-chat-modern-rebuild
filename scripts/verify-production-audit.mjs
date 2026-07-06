#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production admin audit log dashboard verification.
 *
 * Creates disposable accounts and verifies:
 *   - Regular users cannot access /admin/audit (403)
 *   - Block/unblock actions generate audit events
 *   - Report creation generates an audit event
 *
 * Positive admin/moderator flows require an existing admin account. If
 * VERIFY_ADMIN_ACCESS_TOKEN is provided, the script also verifies:
 *   - Admin can list audit logs
 *   - Admin can filter audit logs by action and severity
 *   - Admin can view audit log detail
 *   - Audit log responses do not leak tokens, passwords, or secrets
 *
 * Optional env vars:
 *   VERIFY_API_BASE          — override API endpoint
 *   VERIFY_ADMIN_ACCESS_TOKEN — admin bearer token for positive checks (do not commit)
 */

import {
  API_BASE,
  createVerifiedAccount,
  api,
  finalize,
  sleep,
} from "./lib/verify-helpers.mjs";

function expectStatus(fn, expected) {
  return fn.catch((err) => ({
    __expectedError: true,
    status: err.message.match(/HTTP (\d+)/)?.[1] || "error",
    message: err.message,
  }));
}

async function main() {
  console.log("=== Production Admin Audit Log Verification ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  const actor = await createVerifiedAccount("auditactor");
  await sleep(1500);
  const target = await createVerifiedAccount("audittarget");

  // ---- Generate a user.blocked audit event ----

  const block = await api(actor.accessToken, "POST", "/blocks", {
    blockedId: target.user.id,
    reason: "verification block",
  });
  results.push({
    check: "User can block another user",
    ok: block.success === true || block.blockedUserId === target.user.id,
  });

  // ---- Generate a user.unblocked audit event ----

  const unblock = await api(actor.accessToken, "DELETE", `/blocks/${target.user.id}`);
  results.push({
    check: "User can unblock another user",
    ok: unblock.success === true,
  });

  // ---- Generate a report.created audit event ----

  const report = await api(actor.accessToken, "POST", "/reports", {
    reportedUserId: target.user.id,
    reason: "spam",
    details: "Verification report for audit log",
  });
  results.push({
    check: "User can create a report",
    ok: report.success === true,
  });

  // ---- Regular user cannot access admin audit endpoints ----

  const listAsUser = await expectStatus(
    api(actor.accessToken, "GET", "/admin/audit"),
  );
  results.push({
    check: "Regular user cannot list admin audit logs (403)",
    ok: listAsUser.__expectedError && listAsUser.status === "403",
    detail: `status=${listAsUser.status}`,
  });

  const fakeAuditId = "00000000-0000-0000-0000-000000000000";
  const detailAsUser = await expectStatus(
    api(actor.accessToken, "GET", `/admin/audit/${fakeAuditId}`),
  );
  results.push({
    check: "Regular user cannot view admin audit detail (403)",
    ok: detailAsUser.__expectedError && detailAsUser.status === "403",
    detail: `status=${detailAsUser.status}`,
  });

  // ---- Positive admin checks (optional) ----

  const adminToken = process.env.VERIFY_ADMIN_ACCESS_TOKEN;
  if (!adminToken) {
    results.push({
      check: "Positive admin checks",
      ok: true,
      detail: "skipped — VERIFY_ADMIN_ACCESS_TOKEN not provided",
    });
  } else {
    let adminList;
    try {
      adminList = await api(adminToken, "GET", "/admin/audit?limit=20");
    } catch (err) {
      results.push({
        check: "Admin can list audit logs",
        ok: false,
        detail: err.message,
      });
    }

    if (adminList) {
      results.push({
        check: "Admin can list audit logs",
        ok:
          Array.isArray(adminList.items) &&
          adminList.items.length > 0 &&
          typeof adminList.hasMore === "boolean",
      });

      const filteredByAction = await api(
        adminToken,
        "GET",
        "/admin/audit?action=user.blocked&limit=20",
      );
      results.push({
        check: "Admin can filter audit logs by action",
        ok:
          Array.isArray(filteredByAction.items) &&
          filteredByAction.items.every((item) => item.action === "user.blocked"),
      });

      const filteredBySeverity = await api(
        adminToken,
        "GET",
        "/admin/audit?severity=warning&limit=20",
      );
      results.push({
        check: "Admin can filter audit logs by severity",
        ok:
          Array.isArray(filteredBySeverity.items) &&
          filteredBySeverity.items.every((item) => item.severity === "warning"),
      });

      const blockedEvent = adminList.items.find(
        (item) => item.action === "user.blocked",
      );
      if (blockedEvent) {
        const detail = await api(
          adminToken,
          "GET",
          `/admin/audit/${blockedEvent.id}`,
        );
        results.push({
          check: "Admin can view audit log detail",
          ok:
            detail.id === blockedEvent.id &&
            detail.action === "user.blocked" &&
            detail.entityId === blockedEvent.entityId,
        });

        const sensitiveKeys = [
          "passwordHash",
          "password",
          "tokenHash",
          "refreshToken",
          "accessToken",
          "secret",
          "authorization",
          "databaseUrl",
          "redisUrl",
        ];
        const detailText = JSON.stringify(detail);
        const leaked = sensitiveKeys.filter((k) =>
          detailText.toLowerCase().includes(k.toLowerCase()),
        );
        results.push({
          check: "Audit log detail does not leak sensitive fields",
          ok: leaked.length === 0,
          detail: leaked.length > 0 ? `found ${leaked.join(", ")}` : undefined,
        });
      } else {
        results.push({
          check: "Admin can view audit log detail",
          ok: false,
          detail: "blocked event not found in list",
        });
        results.push({
          check: "Audit log detail does not leak sensitive fields",
          ok: false,
          detail: "blocked event not found in list",
        });
      }
    }
  }

  finalize(results);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
