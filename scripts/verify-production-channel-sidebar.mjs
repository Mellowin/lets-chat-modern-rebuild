#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production channel-sidebar hydration verification (B226 Part B).
 *
 * Seeds a workspace with multiple channels, logs the owner in via the browser,
 * navigates directly to one channel, and verifies the sidebar hydrates the
 * active workspace's channel list without requiring a page transition.
 *
 * Optional env vars:
 *   VERIFY_API_BASE / VERIFY_WEB_BASE / VERIFY_MAIL_BASE
 *   VERIFY_PASSWORD
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
  console.log("=== Production Channel Sidebar Hydration (B226 Part B) ===\n");
  console.log(`WEB_BASE: ${WEB_BASE}`);
  console.log(`API_BASE: ${API_BASE}\n`);

  const results = [];

  const owner = await createVerifiedAccount("sidebarowner");

  const workspaceName = `B226 Sidebar Workspace ${Date.now()}`;
  const workspace = await api(owner.accessToken, "POST", "/workspaces", {
    name: workspaceName,
  });

  const channel1 = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels`, {
    name: "sidebar-public",
    description: "Public channel for sidebar verify",
    type: "PUBLIC",
  });
  const channel2 = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels`, {
    name: "sidebar-second",
    description: "Second public channel",
    type: "PUBLIC",
  });

  await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels/${channel1.id}/messages`, {
    content: "Sidebar hydration seed message",
  });

  const browser = await chromium.launch({ headless: true });

  async function authContext(tokens) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript((t) => {
      sessionStorage.setItem("accessToken", t.accessToken);
      sessionStorage.setItem("refreshToken", t.refreshToken);
    }, tokens);
    return context;
  }

  try {
    const context = await authContext({
      accessToken: owner.accessToken,
      refreshToken: owner.refreshToken,
    });
    const page = await context.newPage();

    await page.goto(`${WEB_BASE}/workspaces/${workspace.id}/channels/${channel1.id}`, {
      waitUntil: "networkidle",
    });

    // Give the sidebar a moment to hydrate channels after login.
    await sleep(1500);

    const body = await page.evaluate(() => document.body.innerText);

    results.push({
      check: "Sidebar shows workspace name",
      ok: body.includes(workspaceName),
    });
    results.push({
      check: "Sidebar shows active channel name",
      ok: body.includes("sidebar-public"),
    });
    results.push({
      check: "Sidebar shows sibling channel name (hydrated list)",
      ok: body.includes("sidebar-second"),
    });
    results.push({
      check: "Sidebar shows the seed message in the channel",
      ok: body.includes("Sidebar hydration seed message"),
    });
    results.push({
      check: "Sidebar sections (Direct / Groups / Workspaces) are present",
      ok: body.includes("Direct messages") && body.includes("Groups") && body.includes("WORKSPACES"),
    });

    await context.close();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`${icon} ${r.check}`);
  }
  if (failed.length > 0) {
    process.exit(1);
  }
  console.log("\n✅ All channel-sidebar verification checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
