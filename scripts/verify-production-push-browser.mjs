#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Real browser push notification verification against production (B211B).
 *
 * Uses Playwright with persistent browser profiles (Chrome disables Push API in
 * incognito) to enable push for two disposable accounts, then drives messages
 * through the API and verifies that:
 *   - recipients receive push notifications;
 *   - senders do not receive their own pushes;
 *   - DM and channel notifications contain safe payloads and correct links;
 *   - disabling notifications stops delivery;
 *   - private-channel non-members do not receive pushes.
 *
 * No tokens, passwords, or VAPID keys are printed.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { chromium } from "playwright";
import {
  WEB_BASE,
  API_BASE,
  createVerifiedAccount,
  api,
  sleep,
} from "./lib/verify-helpers.mjs";

const PUSH_TIMEOUT_MS = 20000;
const PUSH_POLL_MS = 500;

const results = [];

function pass(check, detail) {
  results.push({ ok: true, check, detail });
  console.log(`  ✅ ${check}${detail ? `: ${detail}` : ""}`);
}

function fail(check, detail) {
  results.push({ ok: false, check, detail });
  console.log(`  ❌ ${check}${detail ? `: ${detail}` : ""}`);
}

async function createAuthContext(tokens) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "push-profile-"));
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  await context.grantPermissions(["notifications"]);
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(`${WEB_BASE}/profile`, { waitUntil: "networkidle" });
  await page.evaluate((t) => {
    sessionStorage.setItem("accessToken", t.accessToken);
    sessionStorage.setItem("refreshToken", t.refreshToken);
  }, tokens);
  await page.reload({ waitUntil: "networkidle" });
  return { context, page, profileDir };
}

async function enableNotifications(page, label) {
  await page.click('[data-testid="profile-tab-notifications"]');
  await page.waitForSelector('[data-testid="enable-push-notifications"]', {
    timeout: 10000,
  });
  await page.click('[data-testid="enable-push-notifications"]');
  try {
    await page.waitForSelector('[data-testid="disable-push-notifications"]', {
      timeout: 60000,
    });
  } catch (err) {
    const body = await page.evaluate(() => document.body.innerText);
    throw new Error(
      `${label} failed to subscribe. body:\n${body.slice(0, 800)}`,
    );
  }
}

async function disableNotifications(page) {
  await page.click('[data-testid="profile-tab-notifications"]');
  await page.waitForSelector('[data-testid="disable-push-notifications"]', {
    timeout: 10000,
  });
  await page.click('[data-testid="disable-push-notifications"]');
  await page.waitForSelector('[data-testid="enable-push-notifications"]', {
    timeout: 30000,
  });
}

async function keepServiceWorkerAlive(page) {
  await page.evaluate(() => {
    setInterval(() => {
      navigator.serviceWorker.controller?.postMessage("push-keep-alive");
    }, 2000);
  });
}

async function getServiceWorker(context) {
  let sw = context.serviceWorkers()[0];
  for (let i = 0; i < 20 && !sw; i++) {
    await sleep(200);
    sw = context.serviceWorkers()[0];
  }
  return sw || null;
}

async function installPushCapture(sw) {
  if (!sw) return false;
  await sw.evaluate(() => {
    self.__pushCapture = null;
    const original = self.registration.showNotification;
    self.registration.showNotification = async (title, options) => {
      self.__pushCapture = { title, options, at: Date.now() };
      return original.call(self.registration, title, options);
    };
  });
  return true;
}

async function clearPushCapture(sw) {
  if (!sw) return;
  await sw.evaluate(() => {
    self.__pushCapture = null;
  });
}

async function getPushCapture(sw) {
  if (!sw) return null;
  return sw.evaluate(() => self.__pushCapture);
}

async function waitForPush(sw, expectPresent = true, timeoutMs = PUSH_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const capture = await getPushCapture(sw);
    if (expectPresent && capture) return capture;
    if (!expectPresent && !capture) return null;
    await sleep(PUSH_POLL_MS);
  }
  return expectPresent ? null : getPushCapture(sw);
}

function hasSecret(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /p256dh|auth|eyJ[\w-]*\.eyJ|refresh_token|access_token/i.test(text);
}

function hasFileUrl(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /https?:\/\/[^\s"]+\.(pdf|docx?|xlsx?|pptx?|zip|mp4|mp3|png|jpe?g|gif|svg)/i.test(
    text,
  );
}

async function verifyDmPush(accountA, accountB, ctxA, swA, ctxB, swB) {
  console.log("\n--- DM push test ---");

  const conversation = await api(accountB.accessToken, "POST", "/direct-conversations", {
    userId: accountA.user.id,
  });

  const messageText = `DM push test ${Date.now()}`;
  await clearPushCapture(swA);
  await clearPushCapture(swB);
  await api(accountB.accessToken, "POST", `/direct-conversations/${conversation.id}/messages`, {
    content: messageText,
  });

  const captureA = await waitForPush(swA, true);
  const captureB = await waitForPush(swB, false);

  if (!captureA) {
    fail("DM: Account A received push notification");
    return null;
  }
  pass("DM: Account A received push notification");

  if (captureB) {
    fail("DM: Account B did not receive own push", JSON.stringify(captureB).slice(0, 120));
  } else {
    pass("DM: Account B did not receive own push");
  }

  const payload = captureA.options || {};
  if (hasSecret(payload) || hasSecret(captureA.title)) {
    fail("DM: notification payload contains secret-like value");
  } else {
    pass("DM: notification payload has no secrets");
  }

  if (hasFileUrl(payload) || hasFileUrl(captureA.title)) {
    fail("DM: notification payload contains file URL");
  } else {
    pass("DM: notification payload has no file URLs");
  }

  const data = payload.data || {};
  const expectedUrl = `/direct/${conversation.id}`;
  if (data.type === "direct_message" && data.conversationId === conversation.id) {
    pass("DM: notification payload contains correct conversation link data");
  } else {
    fail("DM: notification payload contains correct conversation link data", JSON.stringify(data));
  }

  try {
    const checkPage = await ctxA.newPage();
    await checkPage.goto(`${WEB_BASE}${expectedUrl}`, { waitUntil: "networkidle" });
    const body = await checkPage.evaluate(() => document.body.innerText);
    await checkPage.close();
    if (body.includes(messageText)) {
      pass("DM: clicking notification opens correct conversation");
    } else {
      fail("DM: opened conversation does not contain message");
    }
  } catch (err) {
    fail("DM: navigate to notification URL", err.message);
  }

  return conversation;
}

async function verifyChannelPush(accountA, accountB, ctxA, swA, swB) {
  console.log("\n--- Channel push test ---");

  const workspaceName = `Push WS ${Date.now()}`;
  const workspace = await api(accountB.accessToken, "POST", "/workspaces", {
    name: workspaceName,
  });

  const invite = await api(accountB.accessToken, "POST", `/workspaces/${workspace.id}/invites`, {
    email: accountA.email,
    role: "MEMBER",
  });
  await api(accountA.accessToken, "POST", `/invites/${invite.id}/accept`);

  const channel = await api(
    accountB.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels`,
    {
      name: "push-channel",
      description: "Push channel verification",
      type: "PUBLIC",
    },
  );

  const channelInvite = await api(
    accountB.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels/${channel.id}/invites`,
    { email: accountA.email, role: "MEMBER" },
  );
  await api(accountA.accessToken, "POST", `/channel-invites/${channelInvite.id}/accept`);

  const messageText = `Channel push test ${Date.now()}`;
  await clearPushCapture(swA);
  await clearPushCapture(swB);
  await api(
    accountB.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels/${channel.id}/messages`,
    { content: messageText },
  );

  const captureA = await waitForPush(swA, true);
  const captureB = await waitForPush(swB, false);

  if (!captureA) {
    fail("Channel: Account A received push notification");
    return;
  }
  pass("Channel: Account A received push notification");

  if (captureB) {
    fail("Channel: Account B did not receive own push");
  } else {
    pass("Channel: Account B did not receive own push");
  }

  const payload = captureA.options || {};
  if (hasSecret(payload) || hasSecret(captureA.title)) {
    fail("Channel: notification payload contains secret-like value");
  } else {
    pass("Channel: notification payload has no secrets");
  }

  if (hasFileUrl(payload) || hasFileUrl(captureA.title)) {
    fail("Channel: notification payload contains file URL");
  } else {
    pass("Channel: notification payload has no file URLs");
  }

  const data = payload.data || {};
  const expectedUrl = `/workspaces/${workspace.id}/channels/${channel.id}`;
  if (
    data.type === "channel_message" &&
    data.workspaceId === workspace.id &&
    data.channelId === channel.id
  ) {
    pass("Channel: notification payload contains correct channel link data");
  } else {
    fail("Channel: notification payload contains correct channel link data", JSON.stringify(data));
  }

  try {
    const checkPage = await ctxA.newPage();
    await checkPage.goto(`${WEB_BASE}${expectedUrl}`, { waitUntil: "networkidle" });
    const body = await checkPage.evaluate(() => document.body.innerText);
    await checkPage.close();
    if (body.includes(messageText)) {
      pass("Channel: clicking notification opens correct channel");
    } else {
      fail("Channel: opened channel does not contain message");
    }
  } catch (err) {
    fail("Channel: navigate to notification URL", err.message);
  }
}

async function verifyPrivateChannelNoPush(accountA, accountB, swA) {
  console.log("\n--- Private channel non-member push test ---");

  const workspaceName = `Private Push WS ${Date.now()}`;
  const workspace = await api(accountB.accessToken, "POST", "/workspaces", {
    name: workspaceName,
  });

  const invite = await api(accountB.accessToken, "POST", `/workspaces/${workspace.id}/invites`, {
    email: accountA.email,
    role: "MEMBER",
  });
  await api(accountA.accessToken, "POST", `/invites/${invite.id}/accept`);

  const privateChannel = await api(
    accountB.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels`,
    {
      name: "private-push-channel",
      description: "Private channel push test",
      type: "PRIVATE",
    },
  );

  await clearPushCapture(swA);
  await api(
    accountB.accessToken,
    "POST",
    `/workspaces/${workspace.id}/channels/${privateChannel.id}/messages`,
    { content: `Private channel message ${Date.now()}` },
  );

  const captureA = await waitForPush(swA, false);

  if (captureA) {
    fail(
      "Private channel: Account A (non-member) did not receive push",
      JSON.stringify(captureA).slice(0, 120),
    );
  } else {
    pass("Private channel: Account A (non-member) did not receive push");
  }
}

async function verifyDisableNotifications(accountA, accountB, ctxA, swA) {
  console.log("\n--- Disable notifications test ---");

  const pageA = ctxA.pages()[0];
  await disableNotifications(pageA);
  await clearPushCapture(swA);

  const conversation = await api(accountB.accessToken, "POST", "/direct-conversations", {
    userId: accountA.user.id,
  });
  await api(accountB.accessToken, "POST", `/direct-conversations/${conversation.id}/messages`, {
    content: `After disable ${Date.now()}`,
  });

  const captureA = await waitForPush(swA, false);

  if (captureA) {
    fail(
      "Disable: Account A did not receive push after disabling",
      JSON.stringify(captureA).slice(0, 120),
    );
  } else {
    pass("Disable: Account A did not receive push after disabling");
  }
}

async function main() {
  console.log("=== Production Real Browser Push Verification (B211B) ===\n");
  console.log(`WEB_BASE: ${WEB_BASE}`);
  console.log(`API_BASE: ${API_BASE}\n`);

  let ctxA;
  let ctxB;
  let pageA;
  let pageB;
  let dirA;
  let dirB;

  try {
    const accountA = await createVerifiedAccount("pushA");
    // Mail.tm rate-limits account creation to roughly 1 per 60 seconds.
    console.log("Waiting for Mail.tm rate-limit window before creating second account...");
    await sleep(65000);
    const accountB = await createVerifiedAccount("pushB");

    ({ context: ctxA, page: pageA, profileDir: dirA } = await createAuthContext(accountA));
    ({ context: ctxB, page: pageB, profileDir: dirB } = await createAuthContext(accountB));

    await enableNotifications(pageA, "A");
    await keepServiceWorkerAlive(pageA);
    await enableNotifications(pageB, "B");
    await keepServiceWorkerAlive(pageB);

    const swA = await getServiceWorker(ctxA);
    const swB = await getServiceWorker(ctxB);
    if (!(await installPushCapture(swA))) {
      throw new Error("Account A service worker not found");
    }
    await installPushCapture(swB);

    await verifyDmPush(accountA, accountB, ctxA, swA, ctxB, swB);
    await verifyChannelPush(accountA, accountB, ctxA, swA, swB);
    await verifyPrivateChannelNoPush(accountA, accountB, swA);
    await verifyDisableNotifications(accountA, accountB, ctxA, swA);
  } catch (err) {
    console.error("\nUnexpected error:", err.message);
    process.exit(1);
  } finally {
    if (ctxA) await ctxA.close();
    if (ctxB) await ctxB.close();
    if (dirA) fs.rmSync(dirA, { recursive: true, force: true });
    if (dirB) fs.rmSync(dirB, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nPassed: ${results.length - failed.length}/${results.length}`);
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) {
      console.log(`  ❌ ${f.check}: ${f.detail || "no detail"}`);
    }
    process.exit(1);
  }
  console.log("\n✅ All real browser push checks passed.");
}

main();
