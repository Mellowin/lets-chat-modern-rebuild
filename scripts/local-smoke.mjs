#!/usr/bin/env node
/**
 * Local end-to-end smoke test:
 *   register → receive verification email in Mailpit → verify → login.
 *
 * Env:
 *   API_BASE      default: http://localhost:3001/api/v1
 *   MAILPIT_BASE  default: http://localhost:8025
 *
 * Usage:
 *   pnpm db:local:up
 *   pnpm db:migrate:local
 *   pnpm dev:api   # in another terminal
 *   node scripts/local-smoke.mjs
 */

const API_BASE = process.env.API_BASE ?? "http://localhost:3001/api/v1";
const MAILPIT_BASE = process.env.MAILPIT_BASE ?? "http://localhost:8025";

function randomSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function register(email, username, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Register failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function findVerificationEmail(email) {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${MAILPIT_BASE}/api/v1/messages`);
    if (!res.ok) {
      throw new Error(`Mailpit query failed: ${res.status}`);
    }
    const data = await res.json();
    const message = data.messages?.find((m) => m.To?.some((to) => to.Address === email));
    if (message) {
      const detailRes = await fetch(`${MAILPIT_BASE}/api/v1/message/${message.ID}`);
      if (!detailRes.ok) {
        throw new Error(`Mailpit message fetch failed: ${detailRes.status}`);
      }
      const detail = await detailRes.json();
      return detail;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Verification email for ${email} was not received in Mailpit`);
}

function extractToken(text) {
  const match = text.match(/[?&]token=([^"\s<>]+)/);
  if (!match) {
    throw new Error("Could not extract verification token from email body");
  }
  return decodeURIComponent(match[1]);
}

async function verifyEmail(token) {
  const res = await fetch(`${API_BASE}/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Verify email failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const suffix = randomSuffix();
  const email = `local-smoke-${suffix}@example.com`;
  const username = `localsmoke${suffix.replace(/-/g, "")}`;
  const password = "LocalSmokePass123!";

  console.log(`Registering ${email}...`);
  await register(email, username, password);
  console.log("✅ Register returned success");

  console.log("Waiting for verification email in Mailpit...");
  const mail = await findVerificationEmail(email);
  console.log(`✅ Mailpit received: ${mail.Subject}`);

  const token = extractToken(mail.Text ?? mail.HTML ?? "");
  console.log("✅ Extracted verification token");

  console.log("Verifying email...");
  await verifyEmail(token);
  console.log("✅ Email verified");

  console.log("Logging in...");
  const session = await login(email, password);
  console.log(`✅ Login succeeded, user id: ${session.user.id}`);

  console.log("\n✅ Local smoke test passed");
}

main().catch((err) => {
  console.error("\n❌ Local smoke test failed:", err.message);
  process.exit(1);
});
