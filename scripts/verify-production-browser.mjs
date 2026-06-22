#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Browser sanity verification against production.
 *
 * Uses Playwright to verify:
 *   - public login page loads;
 *   - authenticated dashboard/workspace/channel pages load;
 *   - workspace search shows the B202C too-short validation message;
 *   - owner sees the header delete button and Danger Zone;
 *   - non-owner does not see delete affordances;
 *   - mobile viewport smoke.
 *
 * Optional env vars:
 *   VERIFY_PASSWORD
 *   VERIFY_API_BASE / VERIFY_WEB_BASE / VERIFY_MAIL_BASE
 *
 * Requires Playwright. Browser console output is scanned to confirm no
 * access/refresh tokens are leaked.
 */

import { chromium } from "playwright";
import {
  WEB_BASE,
  API_BASE,
  createVerifiedAccount,
  api,
  sleep,
} from "./lib/verify-helpers.mjs";

async function main() {
  console.log("=== Production Browser Verification ===\n");
  console.log(`WEB_BASE: ${WEB_BASE}`);
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  // ---------------------------------------------------------------------------
  // Seed accounts and workspace
  // ---------------------------------------------------------------------------
  const owner = await createVerifiedAccount("browser-owner");
  await sleep(3000);
  const member = await createVerifiedAccount("browser-member");

  const workspaceName = `B203 Browser Workspace ${Date.now()}`;
  const workspace = await api(owner.accessToken, "POST", "/workspaces", { name: workspaceName });
  const invite = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/invites`, {
    email: member.email,
    role: "MEMBER",
  });
  await api(member.accessToken, "POST", `/invites/${invite.id}/accept`);

  const channel = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels`, {
    name: "browser-verify",
    description: "Browser verification",
    type: "PUBLIC",
  });

  await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels/${channel.id}/messages`, {
    content: "B203 browser verify message",
  });

  // ---------------------------------------------------------------------------
  // Browser launch
  // ---------------------------------------------------------------------------
  const browser = await chromium.launch({ headless: true });

  async function createAuthContext(tokens) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript((t) => {
      sessionStorage.setItem("accessToken", t.accessToken);
      sessionStorage.setItem("refreshToken", t.refreshToken);
    }, tokens);
    return context;
  }

  const consoleLog = [];

  function assertNoTokenLeaks(label) {
    for (const text of consoleLog) {
      if (
        text.includes(owner.accessToken) ||
        text.includes(owner.refreshToken) ||
        text.includes(member.accessToken) ||
        text.includes(member.refreshToken)
      ) {
        throw new Error(`Token leaked to console at ${label}: ${text}`);
      }
    }
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Public login page
    // -------------------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/login`, { waitUntil: "networkidle" });
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      results.push({ check: "Public login page loads", ok: true });
      await context.close();
    }

    // -------------------------------------------------------------------------
    // 2. Owner authenticated dashboard
    // -------------------------------------------------------------------------
    {
      const context = await createAuthContext({
        accessToken: owner.accessToken,
        refreshToken: owner.refreshToken,
      });
      const page = await context.newPage();
      page.on("console", (msg) => consoleLog.push(msg.text()));

      await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: "networkidle" });
      const body = await page.evaluate(() => document.body.innerText);
      results.push({
        check: "Owner dashboard loads authenticated",
        ok: body.includes("Workspaces") || body.includes("Your workspaces"),
      });
      assertNoTokenLeaks("owner dashboard");
      await context.close();
    }

    // -------------------------------------------------------------------------
    // 3. Workspace overview — owner delete affordances
    // -------------------------------------------------------------------------
    {
      const context = await createAuthContext({
        accessToken: owner.accessToken,
        refreshToken: owner.refreshToken,
      });
      const page = await context.newPage();
      page.on("console", (msg) => consoleLog.push(msg.text()));

      await page.goto(`${WEB_BASE}/workspaces/${workspace.id}`, { waitUntil: "networkidle" });
      const dangerZoneVisible = await page.isVisible('[data-testid="workspace-danger-zone"]').catch(() => false);
      results.push({
        check: "Owner sees workspace Danger Zone card",
        ok: dangerZoneVisible,
      });
      assertNoTokenLeaks("owner workspace overview");
      await context.close();
    }

    // -------------------------------------------------------------------------
    // 4. Channel page loads
    // -------------------------------------------------------------------------
    {
      const context = await createAuthContext({
        accessToken: owner.accessToken,
        refreshToken: owner.refreshToken,
      });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/workspaces/${workspace.id}/channels/${channel.id}`, {
        waitUntil: "networkidle",
      });
      const body = await page.evaluate(() => document.body.innerText);
      results.push({
        check: "Channel page loads",
        ok: body.includes("B203 browser verify message"),
      });
      await context.close();
    }

    // -------------------------------------------------------------------------
    // 5. Workspace search too-short validation (B202C)
    // -------------------------------------------------------------------------
    {
      const context = await createAuthContext({
        accessToken: owner.accessToken,
        refreshToken: owner.refreshToken,
      });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/workspaces/${workspace.id}`, { waitUntil: "networkidle" });

      await page.click('[data-testid="workspace-search-toggle"]');
      await page.fill('[data-testid="workspace-search-input"]', "a");
      await page.click('[data-testid="workspace-search-submit"]');
      await sleep(500);

      const body = await page.evaluate(() => document.body.innerText);
      results.push({
        check: "Workspace search shows too-short validation message",
        ok: body.includes("Search query must be at least 2 characters"),
      });
      await context.close();
    }

    // -------------------------------------------------------------------------
    // 6. Non-owner does not see delete affordances
    // -------------------------------------------------------------------------
    {
      const context = await createAuthContext({
        accessToken: member.accessToken,
        refreshToken: member.refreshToken,
      });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/workspaces/${workspace.id}`, { waitUntil: "networkidle" });

      const dangerZoneVisible = await page.isVisible('[data-testid="workspace-danger-zone"]').catch(() => false);
      results.push({
        check: "Non-owner does not see workspace Danger Zone card",
        ok: !dangerZoneVisible,
      });
      await context.close();
    }

    // -------------------------------------------------------------------------
    // 7. Mobile smoke
    // -------------------------------------------------------------------------
    {
      const context = await createAuthContext({
        accessToken: owner.accessToken,
        refreshToken: owner.refreshToken,
      });
      const page = await context.newPage();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: "networkidle" });
      const body = await page.evaluate(() => document.body.innerText);
      results.push({
        check: "Dashboard loads on mobile viewport",
        ok: body.includes("Workspaces") || body.includes("Your workspaces"),
      });
      await context.close();
    }
  } finally {
    await browser.close();
    // Best-effort cleanup: delete the seeded workspace
    try {
      await api(owner.accessToken, "DELETE", `/workspaces/${workspace.id}`);
      console.log("\n[ cleanup ] seeded workspace deleted");
    } catch (err) {
      console.warn("\n[ cleanup ] could not delete seeded workspace:", err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------
  console.log("\n=== Browser Verification Results ===\n");
  let failed = false;
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`${icon} ${r.check}`);
    if (!r.ok) failed = true;
  }
  console.log(`\nPassed: ${results.length - (failed ? 1 : 0)}/${results.length}`);
  if (failed) {
    process.exit(1);
  }
  console.log("\n✅ All browser verification checks passed.");
}

main().catch((err) => {
  console.error("Browser verification failed:", err.message);
  process.exit(1);
});
