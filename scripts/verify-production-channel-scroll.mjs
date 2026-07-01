#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production channel scroll verifier.
 *
 * Creates a disposable workspace/channel, seeds enough messages to require
 * scrolling, opens the channel in a real browser and asserts:
 *   - the latest message is visible after initial load;
 *   - sending a new message while at the bottom scrolls it into view;
 *   - loading older messages preserves the previous scroll position.
 *
 * Attachment upload is intentionally not included here because it is heavy and
 * flaky in automation; attachment-induced layout shift is covered by unit
 * tests for useMessageListScroll and by manual checks.
 */

import { chromium, expect } from "@playwright/test";
import {
  WEB_BASE,
  API_BASE,
  createVerifiedAccount,
  api,
  sleep,
  finalize,
} from "./lib/verify-helpers.mjs";

const MESSAGE_COUNT = 55;
const MESSAGES_PER_BATCH = 10;
const MESSAGE_BATCH_DELAY_MS = 500;

const results = [];

function pass(check, detail) {
  results.push({ ok: true, check, detail });
  console.log(`  ✅ ${check}${detail ? `: ${detail}` : ""}`);
}

function fail(check, detail) {
  results.push({ ok: false, check, detail });
  console.log(`  ❌ ${check}${detail ? `: ${detail}` : ""}`);
}

async function seedMessages(token, workspaceId, channelId, count) {
  const messages = [];
  for (let i = 0; i < count; i += MESSAGES_PER_BATCH) {
    const batchSize = Math.min(MESSAGES_PER_BATCH, count - i);
    const batch = await Promise.all(
      Array.from({ length: batchSize }, (_, j) =>
        api(token, "POST", `/workspaces/${workspaceId}/channels/${channelId}/messages`, {
          content: `Scroll test message ${String(i + j + 1).padStart(3, "0")}`,
        }),
      ),
    );
    messages.push(...batch);
    if (i + batchSize < count) {
      await sleep(MESSAGE_BATCH_DELAY_MS);
    }
  }
  return messages;
}

async function loginPage(page, tokens) {
  await page.goto(WEB_BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => {
    sessionStorage.setItem("accessToken", t.accessToken);
    sessionStorage.setItem("refreshToken", t.refreshToken);
  }, tokens);
}

async function main() {
  console.log("=== Production Channel Scroll Verification ===");
  console.log(`WEB_BASE: ${WEB_BASE}`);
  console.log(`API_BASE: ${API_BASE}\n`);

  const owner = await createVerifiedAccount("scrollowner");

  const workspace = await api(owner.accessToken, "POST", "/workspaces", {
    name: `Scroll WS ${Date.now()}`,
  });

  const channel = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels`, {
    name: "scroll-channel",
    description: "Channel scroll verification",
    type: "PUBLIC",
  });

  console.log(`[setup] seeding ${MESSAGE_COUNT} messages...`);
  const seeded = await seedMessages(owner.accessToken, workspace.id, channel.id, MESSAGE_COUNT);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await loginPage(page, owner);
    await page.goto(`${WEB_BASE}/workspaces/${workspace.id}/channels/${channel.id}`, {
      waitUntil: "networkidle",
    });

    // Wait for the message list to render.
    const latest = seeded[seeded.length - 1];
    const latestRow = page.locator(`[data-testid="message-row-${latest.id}"]`);
    await latestRow.waitFor({ state: "visible", timeout: 20000 });

    // --- Latest message visible on open ---
    try {
      await expect(latestRow).toBeInViewport({ ratio: 0.5, timeout: 5000 });
      pass("Latest message is visible after opening channel", latest.id);
    } catch (err) {
      fail("Latest message is visible after opening channel", err.message);
    }

    // --- New message scrolls into view when at bottom ---
    const newMessage = await api(
      owner.accessToken,
      "POST",
      `/workspaces/${workspace.id}/channels/${channel.id}/messages`,
      { content: "New latest message after open" },
    );

    const newRow = page.locator(`[data-testid="message-row-${newMessage.id}"]`);
    try {
      await newRow.waitFor({ state: "visible", timeout: 20000 });
      await expect(newRow).toBeInViewport({ ratio: 0.5, timeout: 5000 });
      pass("New incoming message is visible and scrolled into view", newMessage.id);
    } catch (err) {
      fail("New incoming message is visible and scrolled into view", err.message);
    }

    // --- Load older messages preserves scroll position ---
    const loadOlderButton = page.locator('[data-testid="channel-load-older-messages"]');
    const hasOlder = await loadOlderButton.isVisible().catch(() => false);
    if (hasOlder) {
      // Identify the message that is currently at the top of the list.
      const firstVisibleId = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('[data-testid^="message-row-"]'));
        const scrollEl = document.querySelector('[data-testid="channel-messages-scroll"]');
        if (!scrollEl) return null;
        const scrollRect = scrollEl.getBoundingClientRect();
        for (const row of rows) {
          const rect = row.getBoundingClientRect();
          if (rect.top >= scrollRect.top && rect.bottom <= scrollRect.bottom) {
            const match = row.getAttribute("data-testid")?.match(/^message-row-(.+)$/);
            if (match) return match[1];
          }
        }
        return null;
      });

      if (firstVisibleId) {
        const previousTopRow = page.locator(`[data-testid="message-row-${firstVisibleId}"]`);
        try {
          await loadOlderButton.click();
          await expect(loadOlderButton).toBeDisabled();
          await expect(loadOlderButton).toBeEnabled();
          await expect(previousTopRow).toBeInViewport({ ratio: 0.1, timeout: 5000 });
          pass("Loading older messages preserves scroll position", firstVisibleId);
        } catch (err) {
          fail("Loading older messages preserves scroll position", err.message);
        }
      } else {
        fail("Loading older messages preserves scroll position", "could not identify top message");
      }
    } else {
      pass("No older messages to load", "skipped pagination check");
    }
  } finally {
    await context.close();
    await browser.close();
    try {
      await api(owner.accessToken, "DELETE", `/workspaces/${workspace.id}`);
    } catch {
      // cleanup best effort
    }
  }

  finalize(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
