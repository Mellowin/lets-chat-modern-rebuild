#!/usr/bin/env node
/**
 * B200 production refresh probe.
 * Registers a disposable account, verifies email, logs in, refreshes tokens,
 * verifies the new access token works, logs out, and confirms the old refresh
 * token is rejected.
 *
 * Optional env var:
 *   B200_PROBE_PASSWORD=<password>  (if omitted, a random password is generated)
 */

const API_BASE = "https://lets-chat-api-v2.onrender.com/api/v1";
const CATCHMAIL_BASE = "https://api.catchmail.io/api/v1";

function getProbePassword() {
  if (process.env.B200_PROBE_PASSWORD) return process.env.B200_PROBE_PASSWORD;
  return `Test-${Date.now()}-${Math.random().toString(36).slice(2)}!`;
}

const PASSWORD = getProbePassword();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(method, path, body, token) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  return { status: res.status, data };
}

async function waitForVerificationEmail(address, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(2000);
    const res = await fetch(
      `${CATCHMAIL_BASE}/mailbox?address=${encodeURIComponent(address)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) continue;
    const inbox = await res.json();
    if (!inbox.messages || inbox.messages.length === 0) continue;
    const msgId = inbox.messages[0].id;
    const msgRes = await fetch(
      `${CATCHMAIL_BASE}/message/${msgId}?mailbox=${encodeURIComponent(address)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!msgRes.ok) continue;
    const msgText = await msgRes.text();
    const match = msgText.match(/token=([a-f0-9]{64})/);
    if (match) return match[1];
  }
  throw new Error("Verification email not received in time");
}

async function main() {
  const suffix = Date.now();
  const email = `b200-refresh-${suffix}@catchmail.io`;
  const username = `b200refresh${suffix}`;

  const results = [];

  // Register
  {
    const { status, data } = await api("POST", "/auth/register", {
      email,
      username,
      password: PASSWORD,
    });
    results.push({
      check: "Register disposable account",
      ok: status === 201,
      status,
      detail: data,
    });
    if (status !== 201) throw new Error("Register failed");
  }

  // Verify email
  const verifyToken = await waitForVerificationEmail(email);
  {
    const { status, data } = await api("POST", "/auth/verify-email", {
      token: verifyToken,
    });
    results.push({
      check: "Verify email",
      ok: status === 200,
      status,
      detail: data,
    });
  }

  // Login
  let accessToken;
  let refreshToken;
  {
    const { status, data } = await api("POST", "/auth/login", {
      email,
      password: PASSWORD,
    });
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    results.push({
      check: "Login returns tokens",
      ok: status === 200 && !!accessToken && !!refreshToken,
      status,
      detail: { userId: data.user?.id },
    });
  }

  // Refresh
  let newAccessToken;
  let newRefreshToken;
  {
    const { status, data } = await api("POST", "/auth/refresh", {
      refreshToken,
    });
    newAccessToken = data.accessToken;
    newRefreshToken = data.refreshToken;
    results.push({
      check: "POST /auth/refresh returns new tokens",
      ok: status === 200 && !!newAccessToken && !!newRefreshToken,
      status,
      detail: { userId: data.user?.id },
    });
  }

  // Use new access token
  {
    const { status, data } = await api("GET", "/auth/me", undefined, newAccessToken);
    results.push({
      check: "New access token is accepted by GET /auth/me",
      ok: status === 200 && data.email === email,
      status,
      detail: data,
    });
  }

  // Logout invalidates refresh token
  {
    const { status, data } = await api("POST", "/auth/logout", {
      refreshToken: newRefreshToken,
    });
    results.push({
      check: "Logout succeeds",
      ok: status === 200 || status === 201,
      status,
      detail: data,
    });
  }

  // Reuse revoked refresh token
  {
    const { status, data } = await api("POST", "/auth/refresh", {
      refreshToken: newRefreshToken,
    });
    results.push({
      check: "Revoked refresh token is rejected",
      ok: status === 401,
      status,
      detail: data,
    });
  }

  let failed = false;
  for (const r of results) {
    const icon = r.ok ? "PASS" : "FAIL";
    console.log(`${icon}: ${r.check} (status=${r.status})`);
    if (!r.ok) failed = true;
  }

  if (failed) {
    process.exit(1);
  }
  console.log("\nAll B200 production refresh probes passed.");
}

main().catch((err) => {
  console.error("Probe error:", err.message);
  process.exit(1);
});
