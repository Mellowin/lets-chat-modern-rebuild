#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Capture LetsChat production screenshots for portfolio use.
 *
 * Creates disposable Mail.tm accounts, seeds a workspace, channel, group,
 * contact, and DM, then uses Playwright to capture desktop and mobile
 * screenshots. No production secrets are committed; accounts are disposable.
 */

import { chromium } from "playwright";
import {
  WEB_BASE,
  API_BASE,
  createVerifiedAccount,
  api,
  sleep,
} from "./lib/verify-helpers.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../docs/portfolio/screenshots/letschat");

async function wakeBackend() {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) return;
    } catch {}
    console.log("[wake] waiting for backend...");
    await sleep(3000);
  }
}

async function screenshotPage(page, name, opts = {}) {
  const filePath = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false, ...opts });
  console.log(`[screenshot] ${filePath}`);
}

async function createAuthContext(browser, tokens, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((t) => {
    sessionStorage.setItem("accessToken", t.accessToken);
    sessionStorage.setItem("refreshToken", t.refreshToken);
  }, tokens);
  return context;
}

async function main() {
  console.log("=== LetsChat Screenshot Capture ===\n");
  console.log(`WEB_BASE: ${WEB_BASE}`);
  console.log(`OUT_DIR:  ${OUT_DIR}\n`);

  await wakeBackend();

  const owner = await createVerifiedAccount("screenshotsowner");
  await sleep(3000);
  const member = await createVerifiedAccount("screenshotsmember");

  const workspaceName = `Screenshot Workspace ${Date.now()}`;
  const workspace = await api(owner.accessToken, "POST", "/workspaces", { name: workspaceName });
  const invite = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/invites`, {
    email: member.email,
    role: "MEMBER",
  });
  await api(member.accessToken, "POST", `/invites/${invite.id}/accept`);

  const channel = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels`, {
    name: "design-review",
    description: "Design feedback",
    type: "PUBLIC",
  });

  await api(owner.accessToken, "POST", "/contacts", { userId: member.user.id });

  const group = await api(owner.accessToken, "POST", "/groups", {
    name: "Product Team",
    memberIds: [member.user.id],
  });

  const dm = await api(owner.accessToken, "POST", "/direct-conversations", {
    userId: member.user.id,
  });

  await api(owner.accessToken, "POST", `/groups/${group.id}/messages`, {
    content: "Hey team, let's finalize the design today.",
  });

  await api(owner.accessToken, "POST", `/direct-conversations/${dm.id}/messages`, {
    content: "Hi! Can you review the mockup I shared in the channel?",
  });

  const groupInvite = await api(owner.accessToken, "POST", `/groups/${group.id}/invites`, {
    expiresInHours: 24,
    maxUses: 10,
  });

  const sampleAttachment = path.resolve(__dirname, "../docs/portfolio/screenshots/sample-attachment.png");

  const browser = await chromium.launch({ headless: true });

  try {
    // ---------------- Desktop: login / register ----------------
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/login`, { waitUntil: "networkidle" });
      await page.waitForSelector('input[type="email"]', { timeout: 15000 });
      await screenshotPage(page, "desktop-01-login");
      await context.close();
    }

    // ---------------- Desktop: dashboard ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 1280, height: 900 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: "networkidle" });
      await sleep(1000);
      await screenshotPage(page, "desktop-02-dashboard");
      await context.close();
    }

    // ---------------- Desktop: direct messages list ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 1280, height: 900 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/direct`, { waitUntil: "networkidle" });
      await sleep(1000);
      await screenshotPage(page, "desktop-03-direct-list");
      await context.close();
    }

    // ---------------- Desktop: DM conversation ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 1280, height: 900 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/direct/${dm.id}`, { waitUntil: "networkidle" });
      await sleep(1000);
      await screenshotPage(page, "desktop-04-direct-conversation");
      await context.close();
    }

    // ---------------- Desktop: group list ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 1280, height: 900 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/groups`, { waitUntil: "networkidle" });
      await sleep(1000);
      await screenshotPage(page, "desktop-05-groups-list");
      await context.close();
    }

    // ---------------- Desktop: group conversation ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 1280, height: 900 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/groups/${group.id}`, { waitUntil: "networkidle" });
      await sleep(1000);
      await screenshotPage(page, "desktop-06-group-conversation");
      await context.close();
    }

    // ---------------- Desktop: group settings / members ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 1280, height: 900 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/groups/${group.id}`, { waitUntil: "networkidle" });
      const settingsBtn = page.locator('[data-testid="group-settings-button"]').first();
      if (await settingsBtn.isVisible().catch(() => false)) {
        await settingsBtn.click();
        await sleep(1000);
      }
      await screenshotPage(page, "desktop-07-group-settings");
      await context.close();
    }

    // ---------------- Desktop: contacts ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 1280, height: 900 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/contacts`, { waitUntil: "networkidle" });
      await sleep(1000);
      await screenshotPage(page, "desktop-08-contacts");
      await context.close();
    }

    // ---------------- Desktop: invite link public preview ----------------
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/group-invites/${groupInvite.token}`, { waitUntil: "networkidle" });
      await sleep(1000);
      await screenshotPage(page, "desktop-09-group-invite-preview");
      await context.close();
    }

    // ---------------- Desktop: file attachment message ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 1280, height: 900 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/workspaces/${workspace.id}/channels/${channel.id}`, { waitUntil: "networkidle" });
      await sleep(1000);
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(sampleAttachment);
      const composer = page.locator('textarea').first();
      if (await composer.isVisible().catch(() => false)) {
        await composer.fill("Here is the dashboard mockup");
      }
      const sendBtn = page.locator('button[type="submit"]').filter({ hasText: /send/i }).first();
      await sendBtn.waitFor({ state: "visible", timeout: 15000 });
      let sendEnabled = false;
      for (let i = 0; i < 60; i++) {
        sendEnabled = await sendBtn.isEnabled().catch(() => false);
        if (sendEnabled) break;
        await sleep(500);
      }
      if (!sendEnabled) {
        console.warn("[screenshot] send button stayed disabled; taking screenshot anyway");
      } else {
        await sendBtn.click();
        await page.waitForSelector('text=Here is the dashboard mockup', { timeout: 20000 });
        await sleep(1000);
      }
      await screenshotPage(page, "desktop-10-channel-attachment");
      await context.close();
    }

    // ---------------- Desktop: profile notifications ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 1280, height: 900 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/profile`, { waitUntil: "networkidle" });
      const notificationsTab = page.locator('[data-testid="profile-tab-notifications"]').first();
      if (await notificationsTab.isVisible().catch(() => false)) {
        await notificationsTab.click();
        await sleep(800);
      }
      await screenshotPage(page, "desktop-11-profile-notifications");
      await context.close();
    }

    // ---------------- Desktop: profile app install / PWA ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 1280, height: 900 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/profile`, { waitUntil: "networkidle" });
      const appTab = page.locator('[data-testid="profile-tab-app"]').first();
      if (await appTab.isVisible().catch(() => false)) {
        await appTab.click();
        await sleep(800);
      }
      await screenshotPage(page, "desktop-12-profile-app-install");
      await context.close();
    }

    // ---------------- Mobile: dashboard ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 390, height: 844 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: "networkidle" });
      await sleep(1000);
      await screenshotPage(page, "mobile-01-dashboard");
      await context.close();
    }

    // ---------------- Mobile: DM conversation ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 390, height: 844 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/direct/${dm.id}`, { waitUntil: "networkidle" });
      await sleep(1000);
      await screenshotPage(page, "mobile-02-direct-conversation");
      await context.close();
    }

    // ---------------- Mobile: group conversation ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 390, height: 844 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/groups/${group.id}`, { waitUntil: "networkidle" });
      await sleep(1000);
      await screenshotPage(page, "mobile-03-group-conversation");
      await context.close();
    }

    // ---------------- Mobile: contacts ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 390, height: 844 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/contacts`, { waitUntil: "networkidle" });
      await sleep(1000);
      await screenshotPage(page, "mobile-04-contacts");
      await context.close();
    }

    // ---------------- Mobile: profile / PWA ----------------
    {
      const context = await createAuthContext(browser, { accessToken: owner.accessToken, refreshToken: owner.refreshToken }, { width: 390, height: 844 });
      const page = await context.newPage();
      await page.goto(`${WEB_BASE}/profile`, { waitUntil: "networkidle" });
      const appTab = page.locator('[data-testid="profile-tab-app"]').first();
      if (await appTab.isVisible().catch(() => false)) {
        await appTab.click();
        await sleep(800);
      }
      await screenshotPage(page, "mobile-05-profile-app-install");
      await context.close();
    }

    console.log("\n✅ Screenshot capture complete.");
  } finally {
    await browser.close();
    // Best-effort cleanup: archive group and delete workspace.
    try {
      await api(owner.accessToken, "DELETE", `/groups/${group.id}`);
      console.log("[cleanup] group archived");
    } catch (err) {
      console.warn("[cleanup] could not archive group:", err.message);
    }
    try {
      await api(owner.accessToken, "DELETE", `/workspaces/${workspace.id}`);
      console.log("[cleanup] workspace deleted");
    } catch (err) {
      console.warn("[cleanup] could not delete workspace:", err.message);
    }
  }
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err.message);
  console.error(err);
  process.exit(1);
});
