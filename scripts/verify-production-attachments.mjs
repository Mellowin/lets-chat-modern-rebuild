#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production attachment upload / drag-drop / lightbox verification.
 */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  WEB_BASE,
  API_BASE,
  createVerifiedAccount,
  api,
  sleep,
} from "./lib/verify-helpers.mjs";

const SCREENSHOT_DIR = join(process.cwd(), "visual-qa", "production-attachments");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

function screenshotPath(name) {
  return join(SCREENSHOT_DIR, `${name}.png`);
}

function createTempFile(name, content, encoding = "utf8") {
  const dir = tmpdir();
  const path = join(dir, name);
  writeFileSync(path, content, encoding);
  return path;
}

async function main() {
  console.log("=== Production Attachment Verification ===\n");
  console.log(`WEB_BASE: ${WEB_BASE}`);
  console.log(`API_BASE: ${API_BASE}\n`);

  await sleep(3000);

  const results = [];
  const owner = await createVerifiedAccount("attach-owner");
  await sleep(3000);

  const workspace = await api(owner.accessToken, "POST", "/workspaces", {
    name: `B204 Attach Verify ${Date.now()}`,
  });
  const channel = await api(owner.accessToken, "POST", `/workspaces/${workspace.id}/channels`, {
    name: "attach-verify",
    description: "Attachment verification",
    type: "PUBLIC",
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(
    (t) => {
      sessionStorage.setItem("accessToken", t.accessToken);
      sessionStorage.setItem("refreshToken", t.refreshToken);
    },
    { accessToken: owner.accessToken, refreshToken: owner.refreshToken },
  );

  const page = await context.newPage();
  const consoleLogs = [];
  const failedRequests = [];
  const allRequests = [];

  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push(text);
  });
  page.on("pageerror", (err) => {
    consoleLogs.push(`PAGEERROR: ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    failedRequests.push({ url: req.url(), failure: req.failure()?.errorText || "unknown" });
  });
  page.on("requestfinished", (req) => {
    const resp = req.response();
    allRequests.push({ url: req.url(), status: typeof resp?.status === "function" ? resp.status() : null });
  });

  async function debugState(label) {
    const path = screenshotPath(label);
    await page.screenshot({ path, fullPage: false });
    console.log(`[debug] screenshot: ${path}`);
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 800));
    console.log(`[debug] body text: ${bodyText.replace(/\n/g, " | ")}`);
  }

  try {
    await page.goto(`${WEB_BASE}/workspaces/${workspace.id}/channels/${channel.id}`, {
      waitUntil: "networkidle",
    });
    await debugState("channel-initial");

    const pdfPath = createTempFile("test.pdf", "%PDF-1.4 sample content", "utf8");
    const pngPath = createTempFile("test.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
    const dropPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // PDF upload by button.
    console.log("[step] upload PDF");
    await page.setInputFiles('[data-testid="composer-file-input"]', pdfPath);
    await sleep(500);
    await page.click('button[type="submit"]');
    await sleep(3000);
    await debugState("after-pdf");

    results.push({
      check: "PDF upload by button appears in channel",
      ok: await page.isVisible('[data-testid^="message-attachment-"]:not([data-testid^="message-attachment-image-"])').catch(() => false),
    });

    // Image upload by button.
    console.log("[step] upload image");
    await page.setInputFiles('[data-testid="composer-file-input"]', pngPath);
    await sleep(500);
    await page.click('button[type="submit"]');
    await sleep(3000);
    await debugState("after-image");

    results.push({
      check: "Image upload by button appears in channel",
      ok: await page.isVisible('[data-testid^="message-attachment-image-"]').catch(() => false),
    });

    // Drag & drop upload.
    console.log("[step] drag & drop");
    const form = await page.$('form');
    await form.evaluate(async (el, base64) => {
      const res = await fetch(`data:image/png;base64,${base64}`);
      const blob = await res.blob();
      const dt = new DataTransfer();
      const file = new File([blob], "drop.png", { type: "image/png" });
      dt.items.add(file);
      el.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
      el.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true }));
      el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }));
    }, dropPngBase64);
    await sleep(800);
    await page.click('button[type="submit"]');
    await sleep(3000);
    await debugState("after-drop");

    results.push({
      check: "Drag & drop upload appears in channel",
      ok: (await page.$$('[data-testid^="message-attachment-image-"]')).length >= 2,
    });

    await page.screenshot({ path: screenshotPath("channel-with-attachments"), fullPage: false });

    // Image lightbox.
    const imageButton = await page.$('[data-testid^="message-attachment-image-"]');
    if (imageButton) {
      await imageButton.click();
      await sleep(800);
      results.push({
        check: "Image opens in lightbox",
        ok: await page.isVisible('[data-testid="image-lightbox"]').catch(() => false),
      });
      await page.screenshot({ path: screenshotPath("image-lightbox"), fullPage: false });
      await page.click('[data-testid="lightbox-close"]');
      await sleep(500);
    } else {
      results.push({ check: "Image opens in lightbox", ok: false, detail: "no image attachment" });
    }

    // PDF download authenticated request.
    const fileRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/attachments/") && req.url().endsWith("/file"),
      { timeout: 10000 },
    );
    const fileCard = await page.$('[data-testid^="message-attachment-"]:not([data-testid^="message-attachment-image-"])');
    if (fileCard) {
      await fileCard.click();
      try {
        const req = await fileRequestPromise;
        const authHeader = req.headers()["authorization"] || "";
        results.push({
          check: "PDF download uses authenticated request",
          ok: authHeader.toLowerCase().startsWith("bearer "),
          detail: authHeader ? "Authorization header present" : "missing",
        });
      } catch {
        results.push({ check: "PDF download uses authenticated request", ok: false, detail: "request timeout" });
      }
    } else {
      results.push({ check: "PDF download uses authenticated request", ok: false, detail: "no file card" });
    }

    // No CORS / ERR_FAILED.
    const corsErrors = failedRequests.filter(
      (r) => r.failure.includes("CORS") || r.failure.includes("ERR_FAILED"),
    );
    results.push({
      check: "No CORS / net::ERR_FAILED in network failures",
      ok: corsErrors.length === 0,
      detail: corsErrors.map((r) => `${r.url} -> ${r.failure}`).join("; ") || "none",
    });

    // Token leakage.
    const leaked = consoleLogs.some(
      (text) => text.includes(owner.accessToken) || text.includes(owner.refreshToken),
    );
    results.push({
      check: "No access/refresh token leaked to console",
      ok: !leaked,
    });

    // DM attachments not supported.
    const other = await createVerifiedAccount("attach-other");
    const conv = await api(owner.accessToken, "POST", "/direct-conversations", {
      userId: other.user.id,
    });
    const dmPage = await context.newPage();
    await dmPage.goto(`${WEB_BASE}/direct/${conv.id}`, { waitUntil: "networkidle" });
    const dmAttachButton = await dmPage.$('[data-testid="composer-attach-button"]');
    const dmFileInput = await dmPage.$('[data-testid="composer-file-input"]');
    results.push({
      check: "Direct messages do not expose attachment upload",
      ok: !dmAttachButton && !dmFileInput,
      detail: dmAttachButton ? "attach button found" : dmFileInput ? "file input found" : "not supported",
    });
    await dmPage.close();

    await page.screenshot({ path: screenshotPath("channel-final-state"), fullPage: false });

    if (results.some((r) => !r.ok)) {
      console.log("\n[debug] console logs:");
      consoleLogs.slice(-30).forEach((l) => console.log("  ", l));
      console.log("\n[debug] failed requests:");
      failedRequests.forEach((r) => console.log("  ", r.url, r.failure));
      console.log("\n[debug] attachment-related requests:");
      allRequests
        .filter((r) => r.url.includes("attachments") || r.url.includes("messages"))
        .forEach((r) => console.log("  ", r.url, r.status));
    }
  } finally {
    await browser.close();
    try {
      await api(owner.accessToken, "DELETE", `/workspaces/${workspace.id}`);
      console.log("\n[ cleanup ] seeded workspace deleted");
    } catch (err) {
      console.warn("\n[ cleanup ] could not delete seeded workspace:", err.message);
    }
  }

  console.log("\n=== Attachment Verification Results ===\n");
  let failed = 0;
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    const detail = r.detail ? ` (${r.detail})` : "";
    console.log(`${icon} ${r.check}${detail}`);
    if (!r.ok) failed++;
  }
  console.log(`\nPassed: ${results.length - failed}/${results.length}`);
  if (failed > 0) process.exit(1);
  console.log("\n✅ All attachment verification checks passed.");
  console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}`);
}

main().catch((err) => {
  console.error("Attachment verification failed:", err.message);
  process.exit(1);
});
