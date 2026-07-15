#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Verify that the Vercel frontend entry point correctly forces the local API,
 * using normal Chromium security (no --disable-web-security).
 *
 * Checks:
 * - CORS/PNA preflight response from the local API includes the required headers.
 * - Without the `local-network-access` permission the browser blocks the login.
 * - With the `local-network-access` permission granted:
 *     ?apiUrl / ?wsUrl query params are persisted to localStorage;
 *     the login POST is sent to localhost:3001, not Render;
 *     local-verifier@example.com / LocalDevPass123! signs in and reaches /dashboard.
 */

import { chromium } from "playwright";

const LOGIN_URL =
  "https://lets-chat-web.vercel.app/login?apiUrl=http://localhost:3001/api/v1&wsUrl=ws://localhost:3001";
const API_LOGIN_URL = "http://localhost:3001/api/v1/auth/login";
const HEALTH_URL = "http://localhost:3001/api/v1/health";
const VERCEL_ORIGIN = "https://lets-chat-web.vercel.app";
const EXPECTED_API_URL = "http://localhost:3001/api/v1";
const EXPECTED_WS_URL = "ws://localhost:3001";
const LOCAL_EMAIL = "local-verifier@example.com";
const LOCAL_PASSWORD = "LocalDevPass123!";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", got "${actual}"`);
  }
  console.log(`✅ ${label}: ${actual}`);
}

function assertIncludes(haystack, needle, label) {
  const s = String(haystack).toLowerCase();
  const n = String(needle).toLowerCase();
  if (!s.includes(n)) {
    throw new Error(`${label}: expected to include "${needle}", got "${haystack}"`);
  }
  console.log(`✅ ${label}: includes "${needle}"`);
}

async function assertApiHealthy() {
  const res = await fetch(HEALTH_URL);
  if (!res.ok) {
    throw new Error(`Local API health check failed: ${res.status}`);
  }
  console.log("✅ Local API health is 200");
}

async function verifyPreflight() {
  console.log("\n--- CORS/PNA preflight check ---");
  const res = await fetch(API_LOGIN_URL, {
    method: "OPTIONS",
    headers: {
      Origin: VERCEL_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
      "Access-Control-Request-Private-Network": "true",
    },
  });
  if (res.status !== 204) {
    throw new Error(`Expected preflight status 204, got ${res.status}`);
  }
  const allowOrigin = res.headers.get("access-control-allow-origin");
  const allowMethods = res.headers.get("access-control-allow-methods") || "";
  const allowHeaders = res.headers.get("access-control-allow-headers") || "";
  const allowPrivateNetwork = res.headers.get("access-control-allow-private-network");

  assertEqual(allowOrigin, VERCEL_ORIGIN, "Access-Control-Allow-Origin");
  assertIncludes(allowMethods, "POST", "Access-Control-Allow-Methods");
  assertIncludes(allowHeaders, "content-type", "Access-Control-Allow-Headers");
  assertEqual(allowPrivateNetwork, "true", "Access-Control-Allow-Private-Network");
}

async function runBlockedLoginTest(allRequestUrls) {
  console.log("\n--- Negative security check (no local-network-access permission) ---");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    let loginRequestUrl = null;
    let loginResponseStatus = null;

    page.on("request", (req) => {
      allRequestUrls.push(req.url());
      if (req.method() === "POST" && req.url().includes("/auth/login")) {
        loginRequestUrl = req.url();
        console.log(`[request] POST ${req.url()}`);
      }
    });
    page.on("response", (res) => {
      const req = res.request();
      if (req.method() === "POST" && req.url().includes("/auth/login")) {
        loginResponseStatus = res.status();
        console.log(`[response] ${res.status()} ${req.url()}`);
      }
    });
    page.on("requestfailed", (req) => {
      if (req.url().includes("/auth/login")) {
        console.log(`[requestfailed] ${req.url()}: ${req.failure()?.errorText}`);
      }
    });

    await page.goto(LOGIN_URL, { waitUntil: "networkidle", timeout: 60000 });
    await page.fill('input[type="email"]', LOCAL_EMAIL);
    await page.fill('input[type="password"]', LOCAL_PASSWORD);
    await page.click('button[type="submit"]');

    // Give Chrome time to block the request and for the UI to settle.
    await page.waitForTimeout(3000);

    if (!loginRequestUrl) {
      throw new Error("Negative check: login request was not even attempted");
    }
    if (loginResponseStatus) {
      throw new Error(
        `Negative check: login unexpectedly succeeded with status ${loginResponseStatus}`,
      );
    }
    if (page.url().includes("/dashboard")) {
      throw new Error("Negative check: page reached /dashboard without the loopback permission");
    }
    console.log("✅ Login is blocked when local-network-access permission is denied");
  } finally {
    await browser.close();
  }
}

async function runAllowedLoginTest(allRequestUrls) {
  console.log("\n--- Positive browser verification (local-network-access permission granted) ---");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.grantPermissions(["local-network-access"], { origin: VERCEL_ORIGIN });

    const page = await context.newPage();

    let loginRequestUrl = null;
    let loginResponseStatus = null;

    page.on("request", (req) => {
      allRequestUrls.push(req.url());
      if (req.method() === "POST" && req.url().includes("/auth/login")) {
        loginRequestUrl = req.url();
        console.log(`[request] POST ${req.url()}`);
      }
    });
    page.on("response", (res) => {
      const req = res.request();
      if (req.method() === "POST" && req.url().includes("/auth/login")) {
        loginResponseStatus = res.status();
        console.log(`[response] ${res.status()} ${req.url()}`);
      }
    });

    await page.goto(LOGIN_URL, { waitUntil: "networkidle", timeout: 60000 });

    const storage = await page.evaluate(() => ({
      apiUrl: localStorage.getItem("letsChatApiUrl"),
      wsUrl: localStorage.getItem("letsChatWsUrl"),
    }));
    assertEqual(storage.apiUrl, EXPECTED_API_URL, "localStorage.letsChatApiUrl");
    assertEqual(storage.wsUrl, EXPECTED_WS_URL, "localStorage.letsChatWsUrl");

    await page.fill('input[type="email"]', LOCAL_EMAIL);
    await page.fill('input[type="password"]', LOCAL_PASSWORD);

    await Promise.all([
      page.waitForResponse(
        (res) => res.request().method() === "POST" && res.url().includes("/auth/login"),
        { timeout: 15000 },
      ),
      page.click('button[type="submit"]'),
    ]);

    if (!loginRequestUrl) {
      throw new Error("Login request was not captured");
    }
    if (!loginRequestUrl.startsWith("http://localhost:3001/")) {
      throw new Error(`Login request went to ${loginRequestUrl}, not localhost:3001`);
    }
    console.log("✅ Login POST went to localhost:3001");

    if (loginResponseStatus !== 200) {
      throw new Error(`Login failed with HTTP ${loginResponseStatus}`);
    }

    await page.waitForURL("**/dashboard", { timeout: 10000 });
    console.log("✅ local-verifier@example.com signed in and reached /dashboard");
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("=== Vercel + local backend entry verification (real browser security) ===\n");

  await assertApiHealthy();
  await verifyPreflight();

  const allRequestUrls = [];

  await runBlockedLoginTest(allRequestUrls);
  await runAllowedLoginTest(allRequestUrls);

  const renderHit = allRequestUrls.find((url) => url.includes("onrender.com"));
  if (renderHit) {
    throw new Error(`A request was sent to Render: ${renderHit}`);
  }
  console.log("✅ No request was sent to the Render API");

  console.log("\n=== All real-security Vercel-local entry checks passed ===");
}

main().catch((err) => {
  console.error("\nVerification failed:", err.message);
  process.exit(1);
});
