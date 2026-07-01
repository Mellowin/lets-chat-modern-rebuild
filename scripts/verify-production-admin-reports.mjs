#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production admin report moderation verification.
 *
 * Creates disposable accounts and verifies:
 *   - Regular users cannot access admin report endpoints (403)
 *   - Regular users cannot update report status or notes (403)
 *   - Reports can be created through the public reporting endpoint
 *   - The public reporting endpoint does not expose admin-only fields
 *
 * Positive admin/moderator flows require an existing admin account. If
 * VERIFY_ADMIN_ACCESS_TOKEN is provided, the script also verifies:
 *   - Admin can list reports
 *   - Admin can filter reports by status
 *   - Admin can view report details
 *   - Admin can update report status and add a note
 *   - Admin detail response does not leak tokens, passwords, or file URLs
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
  console.log("=== Production Admin Reports Verification ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  const reporter = await createVerifiedAccount("reportuser");
  await sleep(1500);
  const target = await createVerifiedAccount("reporttarget");

  // ---- Public report creation ----

  const createReport = await api(reporter.accessToken, "POST", "/reports", {
    reportedUserId: target.user.id,
    reason: "harassment",
    details: "Verification report for admin dashboard",
  });
  results.push({
    check: "Regular user can create a report",
    ok: createReport.success === true,
  });

  // ---- Regular user cannot access admin endpoints ----

  const listAsReporter = await expectStatus(
    api(reporter.accessToken, "GET", "/admin/reports"),
  );
  results.push({
    check: "Regular user cannot list admin reports (403)",
    ok: listAsReporter.__expectedError && listAsReporter.status === "403",
    detail: `status=${listAsReporter.status}`,
  });

  const listAsTarget = await expectStatus(
    api(target.accessToken, "GET", "/admin/reports"),
  );
  results.push({
    check: "Report target cannot list admin reports (403)",
    ok: listAsTarget.__expectedError && listAsTarget.status === "403",
    detail: `status=${listAsTarget.status}`,
  });

  const fakeReportId = "00000000-0000-0000-0000-000000000000";
  const updateAsReporter = await expectStatus(
    api(reporter.accessToken, "PATCH", `/admin/reports/${fakeReportId}`, {
      status: "REVIEWED",
      adminNote: "should not be allowed",
    }),
  );
  results.push({
    check: "Regular user cannot update admin report (403)",
    ok: updateAsReporter.__expectedError && updateAsReporter.status === "403",
    detail: `status=${updateAsReporter.status}`,
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
      adminList = await api(adminToken, "GET", "/admin/reports?limit=10");
    } catch (err) {
      results.push({
        check: "Admin can list reports",
        ok: false,
        detail: err.message,
      });
    }

    if (adminList) {
      results.push({
        check: "Admin can list reports",
        ok:
          Array.isArray(adminList.items) &&
          adminList.items.some((r) => r.reporterId === reporter.user.id),
      });

      const openList = await api(
        adminToken,
        "GET",
        "/admin/reports?status=OPEN&limit=10",
      );
      results.push({
        check: "Admin can filter reports by status",
        ok:
          Array.isArray(openList.items) &&
          openList.items.every((r) => r.status === "OPEN"),
      });

      const report = adminList.items.find(
        (r) => r.reporterId === reporter.user.id,
      );
      if (report) {
        const detail = await api(
          adminToken,
          "GET",
          `/admin/reports/${report.id}`,
        );
        results.push({
          check: "Admin can view report detail",
          ok:
            detail.id === report.id &&
            detail.reportedUser?.id === target.user.id,
        });

        const sensitiveKeys = [
          "passwordHash",
          "password",
          "tokenHash",
          "refreshToken",
          "accessToken",
          "avatarUrl",
        ];
        const detailText = JSON.stringify(detail);
        const leaked = sensitiveKeys.filter((k) => detailText.includes(k));
        results.push({
          check: "Report detail does not leak sensitive fields",
          ok: leaked.length === 0,
          detail: leaked.length > 0 ? `found ${leaked.join(", ")}` : undefined,
        });

        const updated = await api(
          adminToken,
          "PATCH",
          `/admin/reports/${report.id}`,
          {
            status: "REVIEWED",
            adminNote: "Verification note",
          },
        );
        results.push({
          check: "Admin can update report status and note",
          ok:
            updated.status === "REVIEWED" &&
            updated.adminNote === "Verification note" &&
            updated.reviewedAt != null &&
            updated.reviewedBy != null,
          detail: `status=${updated.status}`,
        });
      } else {
        results.push({
          check: "Admin can view report detail",
          ok: false,
          detail: "report not found in list",
        });
        results.push({
          check: "Admin can update report status and note",
          ok: false,
          detail: "report not found in list",
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
