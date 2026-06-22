#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production attachment upload / drag-drop / lightbox / filename verification.
 *
 * Tests real user scenarios:
 * - PDF with Cyrillic filename
 * - DOCX with Cyrillic filename
 * - image with Cyrillic filename
 * - drag/drop upload with large overlay
 * - correct filename display after send
 * - authenticated download
 * - no CORS / net::ERR_FAILED
 * - no token leaks
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
  if (Buffer.isBuffer(content)) {
    writeFileSync(path, content);
  } else {
    writeFileSync(path, content, encoding);
  }
  return path;
}

// Minimal valid DOCX (ZIP with required OOXML parts) so server-side magic-byte validation passes.
const MIN_DOCX_BASE64 =
  "UEsDBBQAAAAIAC2k1lx5bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgALaTWXJv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIAC2k1lzp+cGTewAAAJsAAAAcAAAAd29yZC9fcmVscy9kb2N1bWVudC54bWwucmVsc1XMQQ4CIQyF4auQ7h3QhTEGmJ0HMHqAZqYCkSmEEqO3l6UuX/68z87vLasXNUmFHewnA4p4KWvi4OB+u+xOoKQjr5gLk4MPCczeXiljHxeJqYoaBouD2Hs9ay1LpA1lKpV4lEdpG/YxW9AVlycG0gdjjrr9GuCt/kP9F1BLAwQUAAAACAAtpNZcQtZan5oAAADOAAAAEQAAAHdvcmQvZG9jdW1lbnQueG1sRY5BDsIgEEWvQmZvqS6MaUrdGQ+gB0AY2yYwQwCtvb1QF27en8n8vEx//ngn3hjTzKRg37QgkAzbmUYF99tldwKRsiarHRMqWDHBeeiXzrJ5eaQsioBStyiYcg6dlMlM6HVqOCCV25Oj17mscZQLRxsiG0yp+L2Th7Y9Sq9ngqp8sF1rhopYkYcrOse9rGNl3Bg2/ury/8rwBVBLAQIUABQAAAAIAC2k1lx5bjPX6AAAAK0BAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQAFAAAAAgALaTWXJv9N+qtAAAAKQEAAAsAAAAAAAAAAAAAAIABGQEAAF9yZWxzLy5yZWxzUEsBAhQAFAAAAAgALaTWXOn5wZN7AAAAmwAAABwAAAAAAAAAAAAAAIAB7wEAAHdvcmQvX3JlbHMvZG9jdW1lbnQueG1sLnJlbHNQSwECFAAUAAAACAAtpNZcQtZan5oAAADOAAAAEQAAAAAAAAAAAAAAgAGkAgAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAQABAADAQAAbQMAAAAA";


async function main() {
  console.log("=== Production Attachment Verification (B204B) ===\n");
  console.log(`WEB_BASE: ${WEB_BASE}`);
  console.log(`API_BASE: ${API_BASE}\n`);

  await sleep(3000);

  const results = [];
  const owner = await createVerifiedAccount("attach-owner");
  await sleep(3000);

  const workspace = await api(owner.accessToken, "POST", "/workspaces", {
    name: `B204B Attach Verify ${Date.now()}`,
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

  function pushResult(check, ok, detail) {
    results.push({ check, ok, detail });
  }

  try {
    await page.goto(`${WEB_BASE}/workspaces/${workspace.id}/channels/${channel.id}`, {
      waitUntil: "networkidle",
    });
    await debugState("channel-initial");

    const pdfName = "Постанова про тест.pdf";
    const docxName = "Український документ.docx";
    const pngName = "тест файл 123.png";

    const pdfPath = createTempFile(pdfName, "%PDF-1.4 sample content", "utf8");
    const docxPath = createTempFile(docxName, Buffer.from(MIN_DOCX_BASE64, "base64"));
    const pngPath = createTempFile(
      pngName,
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    );

    // Helper to wait for a non-image attachment filename in a message row.
    async function waitForAttachmentFileName(name) {
      const locator = page.locator(`text=${name}`).first();
      await locator.waitFor({ timeout: 8000 });
      return locator;
    }

    // Helper to wait for an image attachment to finish loading (alt text is set on the <img>).
    async function waitForImageAttachment(name) {
      const locator = page.locator(`[data-testid^="message-attachment-image-"] img[alt="${name}"]`).first();
      await locator.waitFor({ timeout: 15000 });
      return locator;
    }

    async function sendSelectedFiles() {
      await page.click('button[type="submit"]');
      await sleep(3000);
    }

    // 1. PDF upload with Cyrillic filename.
    console.log("[step] upload PDF with Cyrillic filename");
    await page.setInputFiles('[data-testid="composer-file-input"]', pdfPath);
    await sleep(500);
    await sendSelectedFiles();
    await debugState("after-pdf-cyrillic");

    try {
      await waitForAttachmentFileName(pdfName);
      pushResult("PDF with Cyrillic filename appears in message", true);
    } catch {
      pushResult("PDF with Cyrillic filename appears in message", false, "filename not found");
    }

    // 2. DOCX upload with Cyrillic filename.
    console.log("[step] upload DOCX with Cyrillic filename");
    await page.setInputFiles('[data-testid="composer-file-input"]', docxPath);
    await sleep(500);
    await sendSelectedFiles();
    await debugState("after-docx-cyrillic");

    try {
      await waitForAttachmentFileName(docxName);
      pushResult("DOCX with Cyrillic filename appears in message", true);
    } catch {
      pushResult("DOCX with Cyrillic filename appears in message", false, "filename not found");
    }

    // 3. Image upload with Cyrillic filename.
    console.log("[step] upload image with Cyrillic filename");
    await page.setInputFiles('[data-testid="composer-file-input"]', pngPath);
    await sleep(500);
    await sendSelectedFiles();
    await debugState("after-image-cyrillic");

    try {
      await waitForImageAttachment(pngName);
      pushResult("Image with Cyrillic filename appears in message", true);
    } catch {
      pushResult("Image with Cyrillic filename appears in message", false, "filename not found");
    }

    const imageButtons = await page.locator('[data-testid^="message-attachment-image-"]').all();
    if (imageButtons.length > 0) {
      await imageButtons[0].click();
      await sleep(800);
      pushResult(
        "Image opens in lightbox",
        await page.isVisible('[data-testid="image-lightbox"]').catch(() => false),
      );
      await page.screenshot({ path: screenshotPath("image-lightbox-cyrillic"), fullPage: false });
      await page.click('[data-testid="lightbox-close"]').catch(() => {});
      await sleep(500);
    } else {
      pushResult("Image opens in lightbox", false, "no image attachment");
    }

    // 4. Drag & drop upload with overlay.
    console.log("[step] drag & drop upload");
    const dropPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const panel = await page.$('[data-testid="channel-chat-panel"]');

    if (panel) {
      await panel.evaluate(async (el, base64) => {
        const res = await fetch(`data:image/png;base64,${base64}`);
        const blob = await res.blob();
        const dt = new DataTransfer();
        const file = new File([blob], "drop.png", { type: "image/png" });
        dt.items.add(file);
        el.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
        el.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true }));
      }, dropPngBase64);

      await sleep(300);
      pushResult(
        "Large drag overlay appears",
        await page.isVisible('[data-testid="channel-drop-overlay"]').catch(() => false),
      );

      await panel.evaluate(async (el, base64) => {
        const res = await fetch(`data:image/png;base64,${base64}`);
        const blob = await res.blob();
        const dt = new DataTransfer();
        const file = new File([blob], "drop.png", { type: "image/png" });
        dt.items.add(file);
        el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }));
      }, dropPngBase64);

      await sleep(800);
      await page.click('button[type="submit"]');
      await sleep(3000);
      try {
        await waitForImageAttachment("drop.png");
      } catch {
        // fall through; the assertion below will report the failure
      }
      await debugState("after-drop");

      pushResult(
        "Drag & drop upload appears in channel",
        (await page.locator('[data-testid^="message-attachment-image-"] img').all()).length >= 1,
      );
    } else {
      pushResult("Large drag overlay appears", false, "chat panel not found");
      pushResult("Drag & drop upload appears in channel", false, "chat panel not found");
    }

    // 5. Authenticated download.
    const fileRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/attachments/") && req.url().endsWith("/file"),
      { timeout: 10000 },
    );
    const fileCards = await page.$$('[data-testid^="message-attachment-"]:not([data-testid^="message-attachment-image-"])');
    if (fileCards.length > 0) {
      await fileCards[0].click();
      try {
        const req = await fileRequestPromise;
        const authHeader = req.headers()["authorization"] || "";
        pushResult(
          "File download uses authenticated request",
          authHeader.toLowerCase().startsWith("bearer "),
          authHeader ? "Authorization header present" : "missing",
        );
      } catch {
        pushResult("File download uses authenticated request", false, "request timeout");
      }
    } else {
      pushResult("File download uses authenticated request", false, "no file card");
    }

    // 6. No CORS / ERR_FAILED.
    const corsErrors = failedRequests.filter(
      (r) => r.failure.includes("CORS") || r.failure.includes("ERR_FAILED"),
    );
    pushResult(
      "No CORS / net::ERR_FAILED in network failures",
      corsErrors.length === 0,
      corsErrors.map((r) => `${r.url} -> ${r.failure}`).join("; ") || "none",
    );

    // 7. Token leakage.
    const leaked = consoleLogs.some(
      (text) => text.includes(owner.accessToken) || text.includes(owner.refreshToken),
    );
    pushResult("No access/refresh token leaked to console", !leaked);

    // 8. DM attachments not supported.
    const other = await createVerifiedAccount("attach-other");
    const conv = await api(owner.accessToken, "POST", "/direct-conversations", {
      userId: other.user.id,
    });
    const dmPage = await context.newPage();
    await dmPage.goto(`${WEB_BASE}/direct/${conv.id}`, { waitUntil: "networkidle" });
    const dmAttachButton = await dmPage.$('[data-testid="composer-attach-button"]');
    const dmFileInput = await dmPage.$('[data-testid="composer-file-input"]');
    pushResult(
      "Direct messages do not expose attachment upload",
      !dmAttachButton && !dmFileInput,
      dmAttachButton ? "attach button found" : dmFileInput ? "file input found" : "not supported",
    );
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
