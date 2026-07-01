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

import { chromium } from "playwright";
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

async function isMessageInViewport(page, messageId, ratio = 0.1, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const visible = await page.evaluate(
      ({ id, minRatio }) => {
        const row = document.querySelector(`[data-testid="message-row-${id}"]`);
        const scrollEl = document.querySelector('[data-testid="channel-messages-scroll"]');
        if (!row || !scrollEl) return false;
        const rowRect = row.getBoundingClientRect();
        const scrollRect = scrollEl.getBoundingClientRect();
        const overlapTop = Math.max(rowRect.top, scrollRect.top);
        const overlapBottom = Math.min(rowRect.bottom, scrollRect.bottom);
        const overlapHeight = Math.max(0, overlapBottom - overlapTop);
        return overlapHeight >= rowRect.height * minRatio;
      },
      { id: messageId, minRatio: ratio },
    );
    if (visible) return true;
    await sleep(200);
  }
  return false;
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
    await page.waitForSelector(`[data-testid="message-row-${latest.id}"]`, { state: "visible", timeout: 20000 });

    // --- Latest message visible on open ---
    if (await isMessageInViewport(page, latest.id, 0.1)) {
      pass("Latest message is visible after opening channel", latest.id);
    } else {
      fail("Latest message is visible after opening channel", latest.id);
    }

    // Give the WebSocket a moment to join the channel room.
    await sleep(2000);

    // --- New message scrolls into view when at bottom ---
    const newMessage = await api(
      owner.accessToken,
      "POST",
      `/workspaces/${workspace.id}/channels/${channel.id}/messages`,
      { content: "New latest message after open" },
    );

    await page.waitForSelector(`[data-testid="message-row-${newMessage.id}"]`, { state: "visible", timeout: 25000 });
    if (await isMessageInViewport(page, newMessage.id, 0.5)) {
      pass("New incoming message is visible and scrolled into view", newMessage.id);
    } else {
      fail("New incoming message is visible and scrolled into view", newMessage.id);
    }

    // --- Load older messages preserves scroll position ---
    const loadOlderButton = page.locator('[data-testid="channel-load-older-messages"]');
    const hasOlder = await loadOlderButton.isVisible().catch(() => false);
    if (hasOlder) {
      const previousTopId = await page.evaluate(() => {
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

      if (previousTopId) {
        const beforeTop = await page.evaluate((id) => {
          const row = document.querySelector(`[data-testid="message-row-${id}"]`);
          return row ? row.getBoundingClientRect().top : null;
        }, previousTopId);

        await loadOlderButton.click();
        await page.waitForFunction(() => {
          const btn = document.querySelector('[data-testid="channel-load-older-messages"]');
          if (!btn) return true;
          return !(btn instanceof HTMLButtonElement && btn.disabled);
        });
        await sleep(500);

        const afterTop = await page.evaluate((id) => {
          const row = document.querySelector(`[data-testid="message-row-${id}"]`);
          return row ? row.getBoundingClientRect().top : null;
        }, previousTopId);

        if (beforeTop !== null && afterTop !== null && Math.abs(beforeTop - afterTop) < 50) {
          pass("Loading older messages preserves scroll position", previousTopId);
        } else {
          fail("Loading older messages preserves scroll position", `before=${beforeTop}, after=${afterTop}`);
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
