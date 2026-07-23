#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Register a new LetsChat account locally, capture the verification email from
 * Mailpit, verify it, and log in.
 *
 * Env:
 *   API_BASE      - local API base URL (default http://localhost:3001/api/v1)
 *   MAILPIT_BASE  - Mailpit API base URL (default http://localhost:8025)
 *
 * Outputs JSON: { email, password, username, userId, accessToken }
 */

const API_BASE = process.env.API_BASE || "http://localhost:3001/api/v1";
const MAILPIT_BASE = process.env.MAILPIT_BASE || "http://localhost:8025";
const ALLOWED_HOSTS = ["localhost", "127.0.0.1"];

function assertLocalhostUrl(url) {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      throw new Error(`Refusing to use non-local host: ${parsed.hostname}`);
    }
  } catch (err) {
    throw new Error(`Invalid or non-local URL ${url}: ${err.message}`);
  }
}

assertLocalhostUrl(API_BASE);
assertLocalhostUrl(MAILPIT_BASE);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
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

async function pollForVerificationEmail(email, timeoutMs = 60000, intervalMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const inbox = await fetchJson(`${MAILPIT_BASE}/api/v1/messages?limit=50`);
    const messages = Array.isArray(inbox?.messages) ? inbox.messages : [];
    const match = messages.find((m) => {
      const recipients = Array.isArray(m.To)
        ? m.To.map((t) => t.Address || t)
        : [];
      return recipients.includes(email) && m.Subject?.toLowerCase().includes("verify");
    });
    if (match) {
      const source = await fetchJson(`${MAILPIT_BASE}/api/v1/message/${match.ID}`);
      return source;
    }
    await sleep(intervalMs);
  }
  throw new Error("Timed out waiting for verification email in Mailpit");
}

function extractVerificationToken(source) {
  const text = source?.Text || source?.HTML || "";
  const match = text.match(/verify-email\?token=([a-f0-9]+)/i) || text.match(/token=([a-f0-9]+)/i);
  if (!match) {
    throw new Error("Could not extract verification token from email source");
  }
  return match[1];
}

async function main() {
  const timestamp = Date.now();
  const email = `local-accept-${timestamp}@example.com`;
  const username = `accept_${timestamp}`;
  const password = `Accept-${timestamp}-Test!`;

  console.error(`[acceptance] registering ${email}...`);
  const registerResult = await fetchJson(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, username, password }),
  });
  if (!registerResult.requiresEmailVerification) {
    throw new Error("Account was expected to start unverified; got: " + JSON.stringify(registerResult));
  }

  console.error("[acceptance] waiting for Mailpit verification email...");
  const source = await pollForVerificationEmail(email);
  const token = extractVerificationToken(source);
  console.error("[acceptance] verification token extracted");

  console.error("[acceptance] verifying email...");
  await fetchJson(`${API_BASE}/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token }),
  });

  console.error("[acceptance] logging in...");
  const session = await fetchJson(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!session.user?.id || !session.accessToken) {
    throw new Error("Login did not return a user id and access token; got: " + JSON.stringify(session));
  }

  console.error("[acceptance] login succeeded; email verification is confirmed by successful authentication");

  const result = {
    email,
    username,
    userId: session.user.id,
    accessToken: session.accessToken,
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Local Mailpit registration failed:", err.message);
  process.exit(1);
});
