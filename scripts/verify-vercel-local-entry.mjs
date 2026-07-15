#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Verify that the Vercel frontend entry point correctly forces the local API.
 *
 * Checks:
 * - ?apiUrl / ?wsUrl query params are persisted to localStorage.
 * - The login POST is sent to localhost:3001, not Render.
 * - local-verifier@example.com / LocalDevPass123! can sign in.
 *
 * NOTE: We launch the browser with --disable-web-security so the headless
 * verifier can reach http://localhost:3001 from the https://lets-chat-web.vercel.app
 * origin without the manual loopback permission prompt. The real local API already
 * sends the Private-Network-Access CORS header; a normal Chrome/Edge window will
 * show the permission prompt and work after the user clicks Allow.
 */

import { chromium } from "playwright";

const LOGIN_URL =
  "https://lets-chat-web.vercel.app/login?apiUrl=http://localhost:3001/api/v1&wsUrl=ws://localhost:3001";
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

async function main() {
  console.log("=== Vercel + local backend entry verification ===\n");

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-web-security"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  /** @type {string | null} */
  let loginRequestUrl = null;

  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/auth/login")) {
      loginRequestUrl = req.url();
      console.log(`[request] POST ${req.url()}`);
    }
  });

  // 1. Open the Vercel login page with the local override.
  await page.goto(LOGIN_URL, { waitUntil: "networkidle", timeout: 60000 });

  // 2. Verify localStorage overrides.
  const storage = await page.evaluate(() => ({
    apiUrl: localStorage.getItem("letsChatApiUrl"),
    wsUrl: localStorage.getItem("letsChatWsUrl"),
  }));
  assertEqual(storage.apiUrl, EXPECTED_API_URL, "localStorage.letsChatApiUrl");
  assertEqual(storage.wsUrl, EXPECTED_WS_URL, "localStorage.letsChatWsUrl");

  // 3. Fill local verifier credentials and submit.
  await page.fill('input[type="email"]', LOCAL_EMAIL);
  await page.fill('input[type="password"]', LOCAL_PASSWORD);

  await Promise.all([
    page.waitForRequest(
      (req) => req.method() === "POST" && req.url().includes("/auth/login"),
      { timeout: 15000 },
    ),
    page.click('button[type="submit"]'),
  ]);

  // 4. Verify the login request went to localhost.
  if (!loginRequestUrl) {
    throw new Error("Login request was not captured");
  }
  if (!loginRequestUrl.startsWith("http://localhost:3001/")) {
    throw new Error(`Login request went to ${loginRequestUrl}, not localhost:3001`);
  }
  console.log(`✅ Login POST went to localhost:3001`);

  // 5. Verify login succeeded by waiting for the dashboard redirect.
  try {
    await page.waitForURL("**/dashboard", { timeout: 10000 });
  } catch {
    const errorText = await page
      .locator("text=/Invalid email or password|Something went wrong|timeout/i")
      .first()
      .innerText({ timeout: 2000 })
      .catch(() => "<no error text>");
    throw new Error(`Did not reach /dashboard after login. UI error: ${errorText}`);
  }
  console.log(`✅ local-verifier@example.com signed in successfully`);

  await browser.close();

  console.log("\n=== All Vercel-local entry checks passed ===");
}

main().catch((err) => {
  console.error("\nVerification failed:", err.message);
  process.exit(1);
});
