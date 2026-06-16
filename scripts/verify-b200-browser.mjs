#!/usr/bin/env node
/**
 * B200 production browser acceptance check.
 *
 * Verifies the actual silent refresh UX in a real browser against
 * https://lets-chat-web.vercel.app
 *
 * Optional env var:
 *   B200_PROBE_PASSWORD=<password>  (if omitted, a random password is generated)
 */

import { chromium } from "playwright";

const WEB_BASE = "https://lets-chat-web.vercel.app";
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

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function makeExpiredToken(sub, email) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub,
      email,
      exp: Math.floor(Date.now() / 1000) - 60,
    }),
  );
  return `${header}.${payload}.invalid-signature`;
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

async function createVerifiedAccount() {
  const suffix = Date.now();
  const email = `b200-browser-${suffix}@catchmail.io`;
  const username = `b200browser${suffix}`;

  const reg = await api("POST", "/auth/register", {
    email,
    username,
    password: PASSWORD,
  });
  if (reg.status !== 201) {
    throw new Error(`Register failed: ${reg.status} ${JSON.stringify(reg.data)}`);
  }

  const verifyToken = await waitForVerificationEmail(email);
  const verify = await api("POST", "/auth/verify-email", { token: verifyToken });
  if (verify.status !== 200) {
    throw new Error(`Verify failed: ${verify.status} ${JSON.stringify(verify.data)}`);
  }

  const login = await api("POST", "/auth/login", { email, password: PASSWORD });
  if (login.status !== 200 || !login.data.accessToken || !login.data.refreshToken) {
    throw new Error(`Login failed: ${login.status} ${JSON.stringify(login.data)}`);
  }

  return {
    email,
    userId: login.data.user.id,
    accessToken: login.data.accessToken,
    refreshToken: login.data.refreshToken,
  };
}

function isAuthenticated(page, email) {
  return page.evaluate(
    ({ email }) => {
      const body = document.body.innerText || "";
      return body.includes(email);
    },
    { email },
  );
}

function isAuthRequired(page) {
  return page.evaluate(() => {
    const body = document.body.innerText || "";
    return body.includes("Sign in") || body.includes("authRequired");
  });
}

async function main() {
  console.log("Creating disposable verified production account...");
  const account = await createVerifiedAccount();
  console.log(`Account: ${account.email}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const networkLog = [];
  const consoleLog = [];

  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/auth/refresh") || url.includes("/auth/me") || url.includes("/workspaces")) {
      networkLog.push({ type: "request", method: req.method(), url });
    }
  });

  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/auth/refresh") || url.includes("/auth/me") || url.includes("/workspaces")) {
      networkLog.push({ type: "response", status: res.status(), url });
    }
  });

  page.on("console", (msg) => {
    consoleLog.push(msg.text());
  });

  function assertNoTokensLeaked(label) {
    for (const text of consoleLog) {
      if (
        text.includes(account.accessToken) ||
        text.includes(account.refreshToken)
      ) {
        throw new Error(`Token leaked to console at ${label}: ${text}`);
      }
    }
  }

  function countRefreshCalls(log) {
    return log.filter(
      (e) => e.type === "request" && e.method === "POST" && e.url.includes("/auth/refresh"),
    ).length;
  }

  function countMeResponses(log, status = null) {
    return log.filter(
      (e) =>
        e.type === "response" &&
        e.url.includes("/auth/me") &&
        (status === null || e.status === status),
    ).length;
  }

  const results = [];

  // ---------------------------------------------------------------------------
  // 1. Inject valid tokens and confirm dashboard loads authenticated
  // ---------------------------------------------------------------------------
  console.log("Injecting tokens and loading dashboard...");
  await page.goto(`${WEB_BASE}/login`);
  await page.evaluate(
    ({ accessToken, refreshToken }) => {
      sessionStorage.setItem("accessToken", accessToken);
      sessionStorage.setItem("refreshToken", refreshToken);
    },
    { accessToken: account.accessToken, refreshToken: account.refreshToken },
  );
  // Full navigation to dashboard so AuthProvider initializes with the tokens.
  await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Workspaces", { timeout: 15000 });

  results.push({
    name: "Dashboard loads authenticated after token injection",
    ok: await isAuthenticated(page, account.email),
  });

  assertNoTokensLeaked("after initial load");

  // ---------------------------------------------------------------------------
  // 2. Startup silent refresh: expired access token + valid refresh token
  // ---------------------------------------------------------------------------
  console.log("Testing startup silent refresh with expired access token...");
  const expiredToken = makeExpiredToken(account.userId, account.email);

  await page.evaluate(
    ({ expiredToken }) => {
      sessionStorage.setItem("accessToken", expiredToken);
    },
    { expiredToken },
  );

  const logBeforeStartup = networkLog.length;
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=Workspaces", { timeout: 15000 });

  // Give any final API settle time.
  await sleep(1000);

  const startupLog = networkLog.slice(logBeforeStartup);
  const startupRefreshCalls = countRefreshCalls(startupLog);
  const me200AfterStartup = countMeResponses(startupLog, 200);

  const newAccessToken = await page.evaluate(() => sessionStorage.getItem("accessToken"));
  const newRefreshToken = await page.evaluate(() => sessionStorage.getItem("refreshToken"));

  results.push({
    name: "Startup: AuthProvider calls /auth/refresh exactly once",
    ok: startupRefreshCalls === 1,
    detail: `refreshCalls=${startupRefreshCalls}`,
  });
  results.push({
    name: "Startup: /auth/me succeeds after refresh",
    ok: me200AfterStartup >= 1,
    detail: `me200=${me200AfterStartup}`,
  });
  results.push({
    name: "Startup: new access token stored",
    ok: !!newAccessToken && newAccessToken !== expiredToken,
  });
  results.push({
    name: "Startup: user remains logged in (dashboard visible)",
    ok: await isAuthenticated(page, account.email),
  });

  assertNoTokensLeaked("after startup refresh");

  // ---------------------------------------------------------------------------
  // 3. Authenticated API request retry on 401
  // ---------------------------------------------------------------------------
  console.log("Testing authenticated API request retry on 401...");

  await page.evaluate(
    ({ expiredToken }) => {
      sessionStorage.setItem("accessToken", expiredToken);
    },
    { expiredToken },
  );

  const logBeforeRetry = networkLog.length;

  // Navigate to profile to force authenticated calls through authFetch.
  await page.goto(`${WEB_BASE}/profile`, { waitUntil: "networkidle" });
  await sleep(1000);

  const retryLog = networkLog.slice(logBeforeRetry);
  const refreshCallsDuringRetry = countRefreshCalls(retryLog);
  const me200DuringRetry = countMeResponses(retryLog, 200);
  const accessTokenAfterRetry = await page.evaluate(() =>
    sessionStorage.getItem("accessToken"),
  );

  results.push({
    name: "API retry: exactly one /auth/refresh call",
    ok: refreshCallsDuringRetry === 1,
    detail: `refreshCalls=${refreshCallsDuringRetry}`,
  });
  results.push({
    name: "API retry: /auth/me succeeds after refresh",
    ok: me200DuringRetry >= 1,
    detail: `me200=${me200DuringRetry}`,
  });
  results.push({
    name: "API retry: access token was renewed",
    ok: accessTokenAfterRetry !== expiredToken,
  });
  results.push({
    name: "API retry: no infinite retry loop",
    ok: refreshCallsDuringRetry <= 1,
  });

  assertNoTokensLeaked("after API retry");

  // ---------------------------------------------------------------------------
  // 4. Refresh failure => clean logout
  // ---------------------------------------------------------------------------
  console.log("Testing refresh failure logout...");
  // The refresh token may have been rotated again during the API retry test,
  // so read the currently stored one before revoking it.
  const currentRefreshToken = await page.evaluate(() =>
    sessionStorage.getItem("refreshToken"),
  );

  const logout = await api("POST", "/auth/logout", {
    refreshToken: currentRefreshToken,
  });
  results.push({
    name: "Logout via API succeeds",
    ok: logout.status === 200 || logout.status === 201,
    detail: `status=${logout.status}`,
  });

  await page.evaluate(
    ({ expiredToken }) => {
      sessionStorage.setItem("accessToken", expiredToken);
      // Keep the now-revoked refresh token as-is.
    },
    { expiredToken },
  );

  await page.reload({ waitUntil: "networkidle" });
  await sleep(1500);

  const accessTokenAfterFailure = await page.evaluate(() =>
    sessionStorage.getItem("accessToken"),
  );
  const refreshTokenAfterFailure = await page.evaluate(() =>
    sessionStorage.getItem("refreshToken"),
  );

  results.push({
    name: "Refresh failure: sessionStorage cleared",
    ok: !accessTokenAfterFailure && !refreshTokenAfterFailure,
  });
  results.push({
    name: "Refresh failure: UI shows auth required",
    ok: await isAuthRequired(page),
  });

  assertNoTokensLeaked("after refresh failure");

  await browser.close();

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------
  console.log("\n=== B200 Browser Acceptance Report ===\n");
  let failed = false;
  for (const r of results) {
    const icon = r.ok ? "PASS" : "FAIL";
    const detail = r.detail ? ` (${r.detail})` : "";
    console.log(`${icon}: ${r.name}${detail}`);
    if (!r.ok) failed = true;
  }

  console.log("\n--- Network highlights ---");
  for (const e of networkLog) {
    console.log(`${e.type.toUpperCase()} ${e.status ?? ""} ${e.method ?? ""} ${e.url}`);
  }

  if (failed) {
    console.log("\nB200 browser acceptance FAILED");
    process.exit(1);
  }
  console.log("\nB200 browser acceptance PASSED");
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
