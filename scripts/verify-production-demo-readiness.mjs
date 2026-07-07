#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Demo mode readiness verification.
 *
 * Confirms that demo mode is safely disabled in production:
 *   - GET /demo/status returns { enabled: false }
 *   - POST /demo/session returns 404
 *   - No demo session is created
 *   - Docs explain how to enable demo mode safely
 *
 * This verifier does NOT enable demo mode and does not create demo users.
 *
 * Optional env vars:
 *   VERIFY_API_BASE — override API endpoint
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { API_BASE, fetchJson, finalize } from "./lib/verify-helpers.mjs";

function expectStatus(fn) {
  return fn.catch((err) => ({
    __expectedError: true,
    status: err.message.match(/HTTP (\d+)/)?.[1] || "error",
    message: err.message,
  }));
}

async function main() {
  console.log("=== Production Demo Readiness Verification ===\n");
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  // 1. Status endpoint reports disabled.
  const status = await fetchJson(`${API_BASE}/demo/status`);
  results.push({
    check: "GET /demo/status returns { enabled: false }",
    ok: status.enabled === false,
    detail: `enabled=${status.enabled}`,
  });

  // 2. Session creation is rejected when disabled.
  const sessionResponse = await expectStatus(
    fetchJson(`${API_BASE}/demo/session`, { method: "POST" }),
  );
  results.push({
    check: "POST /demo/session returns 404 when demo mode is disabled",
    ok: sessionResponse.__expectedError && sessionResponse.status === "404",
    detail: sessionResponse.status,
  });

  // 3. Docs explain safe enablement.
  const docsPath = join(process.cwd(), "docs", "production-verification.md");
  let docsExplainDemo = false;
  if (existsSync(docsPath)) {
    const docs = readFileSync(docsPath, "utf8");
    docsExplainDemo =
      /DEMO_MODE_ENABLED/.test(docs) && /demo\/status/.test(docs);
  }
  results.push({
    check: "Docs explain how to enable demo mode safely",
    ok: docsExplainDemo,
  });

  finalize(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
