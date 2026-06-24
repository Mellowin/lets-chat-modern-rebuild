#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Mobile shell QA.
 *
 * Opens key app pages in a mobile viewport on production and checks for
 * horizontal overflow, reachable buttons, and readable sections.
 *
 * Usage:
 *   WEB_BASE=https://lets-chat-web.vercel.app API_BASE=https://lets-chat-api-v2.onrender.com/api/v1 node scripts/verify-mobile-shell.mjs
 */

import fs from "fs";
import path from "path";
import os from "os";
import { chromium, devices } from "playwright";
import { WEB_BASE, API_BASE, createVerifiedAccount, api, sleep, finalize } from "./lib/verify-helpers.mjs";

const OUT_DIR = path.join(process.cwd(), "visual-qa", "mobile-shell");
const VIEWPORT = devices["iPhone SE"].viewport;

const results = [];

function pass(check, detail) {
  results.push({ ok: true, check, detail });
  console.log(`  ✅ ${check}${detail ? `: ${detail}` : ""}`);
}

function fail(check, detail) {
  results.push({ ok: false, check, detail });
  console.log(`  ❌ ${check}${detail ? `: ${detail}` : ""}`);
}

async function screenshot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  if (overflow > 1) {
    fail(`${label}: no horizontal overflow`, `overflow ${overflow}px`);
  } else {
    pass(`${label}: no horizontal overflow`);
  }
}

async function assertElementVisible(page, selector, label) {
  try {
    const el = page.locator(selector).first();
    await el.waitFor({ state: "visible", timeout: 10000 });
    pass(`${label}: ${selector} visible`);
  } catch (err) {
    fail(`${label}: ${selector} visible`, err.message);
  }
}

async function loginPageMobile(page) {
  await page.goto(`${WEB_BASE}/login`, { waitUntil: "networkidle" });
  await screenshot(page, "login");
  await assertNoHorizontalOverflow(page, "Login page");
  await assertElementVisible(page, 'input[type="email"]', "Login page");
  await assertElementVisible(page, 'input[type="password"]', "Login page");
  await assertElementVisible(page, 'button[type="submit"]', "Login page");
}

async function dashboardPageMobile(page) {
  await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: "networkidle" });
  await screenshot(page, "dashboard");
  await assertNoHorizontalOverflow(page, "Dashboard");
  await assertElementVisible(page, 'text="Your Workspaces"', "Dashboard");
}

async function profilePageMobile(page) {
  await page.goto(`${WEB_BASE}/profile`, { waitUntil: "networkidle" });
  await page.click('[data-testid="profile-tab-app"]');
  await page.waitForSelector('[data-testid="pwa-install-button"], [data-testid="pwa-manual-instructions"], [data-testid="pwa-installed"], [data-testid="pwa-unsupported"]', { timeout: 10000 });
  await screenshot(page, "profile-app");
  await assertNoHorizontalOverflow(page, "Profile app install");
  await page.click('[data-testid="profile-tab-notifications"]');
  await page.waitForSelector(
    '[data-testid="enable-push-notifications"], [data-testid="disable-push-notifications"], [data-testid="push-notifications-blocked"], [data-testid="push-notifications-unsupported"]',
    { timeout: 10000 },
  );
  await screenshot(page, "profile-notifications");
  await assertNoHorizontalOverflow(page, "Profile notifications");
}

async function directPageMobile(page) {
  await page.goto(`${WEB_BASE}/direct`, { waitUntil: "networkidle" });
  await screenshot(page, "direct");
  await assertNoHorizontalOverflow(page, "Direct messages");
  await assertElementVisible(page, 'text=/Direct messages/i', "Direct messages");
}

async function workspacePageMobile(page, workspace) {
  await page.goto(`${WEB_BASE}/workspaces/${workspace.id}`, { waitUntil: "networkidle" });
  await screenshot(page, "workspace");
  await assertNoHorizontalOverflow(page, "Workspace");
  await assertElementVisible(page, 'text=/Channels/i', "Workspace");
}

async function channelPageMobile(page, workspace, channel) {
  await page.goto(`${WEB_BASE}/workspaces/${workspace.id}/channels/${channel.id}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#channel-message-input", { timeout: 10000 });
  await screenshot(page, "channel");
  await assertNoHorizontalOverflow(page, "Channel");
  await assertElementVisible(page, "#channel-message-input", "Channel");
  await assertElementVisible(page, 'form button[type="submit"]', "Channel");
  const composerBox = await page.locator('form:has(#channel-message-input)').first().boundingBox();
  if (composerBox) {
    const viewportHeight = page.viewportSize().height;
    if (composerBox.y + composerBox.height > viewportHeight + 10) {
      fail("Channel: composer is in viewport", `y=${composerBox.y} height=${composerBox.height}`);
    } else {
      pass("Channel: composer is in viewport");
    }
  } else {
    fail("Channel: composer is in viewport", "composer form not found");
  }
}

async function main() {
  console.log("=== Mobile Shell QA ===\n");
  console.log(`WEB_BASE: ${WEB_BASE}`);
  console.log(`API_BASE: ${API_BASE}\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let context;
  let page;
  let profileDir;

  try {
    const account = await createVerifiedAccount("mobile");
    await sleep(5000);
    const peer = await createVerifiedAccount("mobile2");

    // Seed workspace/channel/direct content.
    const workspace = await api(account.accessToken, "POST", "/workspaces", { name: `Mobile QA ${Date.now()}` });
    const channel = await api(account.accessToken, "POST", `/workspaces/${workspace.id}/channels`, {
      name: "mobile-channel",
      description: "Mobile QA channel",
      type: "PUBLIC",
    });
    await api(account.accessToken, "POST", "/direct-conversations", { userId: peer.user.id });

    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "mobile-shell-"));
    const headless = process.env.HEADLESS ? process.env.HEADLESS === "true" : false;
    context = await chromium.launchPersistentContext(profileDir, {
      headless,
      viewport: VIEWPORT,
      userAgent: devices["iPhone SE"].userAgent,
    });
    page = context.pages()[0] || (await context.newPage());

    // Authenticate.
    await page.goto(`${WEB_BASE}/login`, { waitUntil: "networkidle" });
    await page.evaluate((t) => {
      sessionStorage.setItem("accessToken", t.accessToken);
      sessionStorage.setItem("refreshToken", t.refreshToken);
    }, account);
    await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: "networkidle" });
    await sleep(1000);

    await loginPageMobile(page);
    await dashboardPageMobile(page);
    await profilePageMobile(page);
    await directPageMobile(page);
    await workspacePageMobile(page, workspace);
    await channelPageMobile(page, workspace, channel);
  } catch (err) {
    console.error("\nUnexpected error:", err.message);
    if (page) {
      await page.screenshot({ path: path.join(OUT_DIR, "error.png"), fullPage: true }).catch(() => {});
    }
    process.exit(1);
  } finally {
    if (context) await context.close();
    if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
  }

  finalize(results);
}

main();
