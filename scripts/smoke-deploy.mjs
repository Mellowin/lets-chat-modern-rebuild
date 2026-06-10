#!/usr/bin/env node
/**
 * Production deployment smoke check.
 *
 * Usage:
 *   WEB_URL=https://app.example.com API_URL=https://api.example.com/api/v1 node scripts/smoke-deploy.mjs
 *
 * PowerShell:
 *   $env:WEB_URL="https://app.example.com"
 *   $env:API_URL="https://api.example.com/api/v1"
 *   node scripts/smoke-deploy.mjs
 */

const WEB_URL = process.env.WEB_URL;
const API_URL = process.env.API_URL;

const checks = [];

function pass(name) {
  checks.push({ name, ok: true });
  console.log(`  ✅ ${name}`);
}

function fail(name, reason) {
  checks.push({ name, ok: false, reason });
  console.log(`  ❌ ${name}: ${reason}`);
}

async function checkWeb() {
  const label = "WEB_URL returns 200 OK with HTML";
  try {
    const res = await fetch(WEB_URL, { method: "GET" });
    const contentType = res.headers.get("content-type") || "";
    if (res.status !== 200) {
      fail(label, `status ${res.status}`);
      return;
    }
    if (!contentType.includes("text/html")) {
      fail(label, `content-type ${contentType}`);
      return;
    }
    pass(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

async function checkHealth() {
  const label = "API health returns status ok";
  try {
    const res = await fetch(`${API_URL}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (res.status !== 200) {
      fail(label, `status ${res.status}`);
      return;
    }
    const body = await res.json();
    if (body.status !== "ok") {
      fail(label, `body.status = ${body.status}`);
      return;
    }
    pass(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

async function checkForgotPassword() {
  const label = "POST /auth/forgot-password returns generic success";
  try {
    const res = await fetch(`${API_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: "smoke-test@example.com" }),
    });
    if (!res.ok) {
      fail(label, `status ${res.status}`);
      return;
    }
    pass(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

async function checkResendVerification() {
  const label = "POST /auth/resend-verification returns generic success";
  try {
    const res = await fetch(`${API_URL}/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: "smoke-test@example.com" }),
    });
    if (!res.ok) {
      fail(label, `status ${res.status}`);
      return;
    }
    pass(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

async function checkProtected(label, method, path) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Accept: "application/json" },
    });
    if (res.status !== 401) {
      fail(label, `expected 401, got ${res.status}`);
      return;
    }
    pass(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

async function main() {
  console.log("=== Deployment Smoke Check ===\n");

  if (!WEB_URL) {
    console.error("Error: WEB_URL env var is required");
    process.exit(1);
  }
  if (!API_URL) {
    console.error("Error: API_URL env var is required");
    process.exit(1);
  }

  console.log(`WEB_URL: ${WEB_URL}`);
  console.log(`API_URL: ${API_URL}\n`);

  if (API_URL.includes("lets-chat-api-w43.onrender.com")) {
    console.error(
      "Wrong Render host: use lets-chat-api-wa43.onrender.com, not lets-chat-api-w43.onrender.com",
    );
    process.exit(1);
  }

  console.log("\n--- Public endpoints ---");
  await checkWeb();
  await checkHealth();
  await checkForgotPassword();
  await checkResendVerification();

  console.log("\n--- Protected endpoints (no token) ---");
  await checkProtected(
    "GET /auth/sessions rejects anonymous with 401",
    "GET",
    "/auth/sessions",
  );
  await checkProtected(
    "POST /auth/sessions/revoke-all rejects anonymous with 401",
    "POST",
    "/auth/sessions/revoke-all",
  );
  await checkProtected(
    "POST /auth/change-password rejects anonymous with 401",
    "POST",
    "/auth/change-password",
  );

  const failures = checks.filter((c) => !c.ok);
  console.log("\n=== Automated checks completed ===");
  console.log(`Passed: ${checks.length - failures.length}/${checks.length}`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.reason}`);
    }
    console.log("\nCommon causes:");
    console.log("  - wrong NEXT_PUBLIC_API_URL on frontend");
    console.log("  - CORS_ORIGIN missing Vercel domain on backend");
    console.log("  - backend not deployed or unhealthy");
    console.log("  - database migrations not applied");
    console.log("  - email provider env vars missing (non-blocking for smoke)");
    process.exit(1);
  }

  console.log("\n=== Manual checks still required ===");
  console.log("  - registration email arrives in Gmail/Inbox");
  console.log("  - verify email link opens /verify-email?token=...");
  console.log("  - reset password email arrives");
  console.log(
    "  - same-password reset shows 'New password must be different from current password'",
  );

  console.log("\n✅ All automated checks passed.");
  process.exit(0);
}

main();
