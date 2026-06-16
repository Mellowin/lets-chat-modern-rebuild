#!/usr/bin/env node
/**
 * Production deployment smoke check.
 *
 * Usage:
 *   WEB_URL=https://app.example.com API_URL=https://api.example.com/api/v1 node scripts/smoke-deploy.mjs
 *
 * Optional authenticated checks (recommended for post-B197 deploys):
 *   SMOKE_ACCESS_TOKEN=<jwt> SMOKE_WORKSPACE_ID=<uuid> [SMOKE_CHANNEL_ID=<uuid>] node scripts/smoke-deploy.mjs
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

async function checkProjectStatus() {
  const label = "GET /project-status returns 200 with expected content";
  try {
    const res = await fetch(`${WEB_URL}/project-status`, { method: "GET" });
    if (res.status !== 200) {
      fail(label, `status ${res.status}`);
      return;
    }
    const body = await res.text();
    if (!body.includes("Project Status")) {
      fail(label, "missing 'Project Status' in response");
      return;
    }
    if (!body.includes("actively in development")) {
      fail(label, "missing 'actively in development' in response");
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

async function checkMissingAvatarFallback() {
  const label = "GET /uploads/missing-avatar.png returns 200 transparent PNG";
  try {
    const apiUrl = new URL(API_URL);
    const fallbackUrl = `${apiUrl.origin}/uploads/missing-avatar.png`;
    const res = await fetch(fallbackUrl, { method: "GET" });
    const contentType = res.headers.get("content-type") || "";
    if (res.status !== 200) {
      fail(label, `status ${res.status}`);
      return;
    }
    if (!contentType.includes("image/png")) {
      fail(label, `content-type ${contentType}`);
      return;
    }
    pass(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

async function checkAuthenticatedChannels() {
  const token = process.env.SMOKE_ACCESS_TOKEN;
  const workspaceId = process.env.SMOKE_WORKSPACE_ID;

  if (!token || !workspaceId) {
    console.log(
      "  ⏭️  Authenticated channel checks skipped (set SMOKE_ACCESS_TOKEN and SMOKE_WORKSPACE_ID)",
    );
    return;
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };

  const listLabel = "GET /workspaces/:id/channels returns 200 for authenticated user";
  try {
    const res = await fetch(`${API_URL}/workspaces/${workspaceId}/channels`, {
      method: "GET",
      headers,
    });
    if (res.status !== 200) {
      fail(listLabel, `status ${res.status}: ${await res.text()}`);
    } else {
      const body = await res.json();
      if (!Array.isArray(body)) {
        fail(listLabel, "response is not an array");
      } else {
        pass(listLabel);
      }
    }
  } catch (err) {
    fail(listLabel, err instanceof Error ? err.message : String(err));
  }

  const archivedLabel = "GET /workspaces/:id/channels/archived returns 200 for authenticated user";
  try {
    const res = await fetch(`${API_URL}/workspaces/${workspaceId}/channels/archived`, {
      method: "GET",
      headers,
    });
    if (res.status !== 200) {
      fail(archivedLabel, `status ${res.status}: ${await res.text()}`);
    } else {
      const body = await res.json();
      if (!Array.isArray(body)) {
        fail(archivedLabel, "response is not an array");
      } else {
        pass(archivedLabel);
      }
    }
  } catch (err) {
    fail(archivedLabel, err instanceof Error ? err.message : String(err));
  }

  const channelId = process.env.SMOKE_CHANNEL_ID;
  if (channelId) {
    const channelLabel = "GET /workspaces/:id/channels/:channelId returns 200 for authenticated user";
    try {
      const res = await fetch(`${API_URL}/workspaces/${workspaceId}/channels/${channelId}`, {
        method: "GET",
        headers,
      });
      if (res.status !== 200) {
        fail(channelLabel, `status ${res.status}: ${await res.text()}`);
      } else {
        pass(channelLabel);
      }
    } catch (err) {
      fail(channelLabel, err instanceof Error ? err.message : String(err));
    }
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
      "Wrong Render host: use lets-chat-api-v2.onrender.com, not lets-chat-api-w43.onrender.com",
    );
    process.exit(1);
  }

  if (API_URL.includes("lets-chat-api-wa43.onrender.com")) {
    console.warn(
      "Warning: API_URL points to the deprecated Render host lets-chat-api-wa43.onrender.com. Active backend is lets-chat-api-v2.onrender.com.",
    );
  }

  console.log("\n--- Public endpoints ---");
  await checkWeb();
  await checkProjectStatus();
  await checkHealth();
  await checkForgotPassword();
  await checkResendVerification();
  await checkMissingAvatarFallback();

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
    "POST /auth/sessions/revoke-others rejects anonymous with 401",
    "POST",
    "/auth/sessions/revoke-others",
  );
  await checkProtected(
    "POST /auth/change-password rejects anonymous with 401",
    "POST",
    "/auth/change-password",
  );

  console.log("\n--- Authenticated endpoints ---");
  await checkAuthenticatedChannels();

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
