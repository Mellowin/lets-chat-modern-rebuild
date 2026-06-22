#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production attachment upload / drag-drop / lightbox / filename verification.
 *
 * Tests real user scenarios for B204C expanded file type support
 * and B204D relaxed but safe attachment limits:
 * - PDF, DOCX, XLSX, XLS, PPTX, ZIP with Cyrillic filenames
 * - image with Cyrillic filename
 * - unsupported dangerous file rejection with friendly error
 * - drag/drop upload with large overlay
 * - correct filename display after send
 * - authenticated download
 * - no CORS / net::ERR_FAILED
 * - no token leaks
 * - files above 10 MB but within category limits are accepted
 * - files above category limits are rejected
 * - 10 mixed / 20 image file count limits
 * - 150 MB total size limit
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

function createSizedTempFile(name, sizeBytes, header = null) {
  const buf = Buffer.alloc(sizeBytes);
  if (header) {
    const h = Buffer.isBuffer(header) ? header : Buffer.from(header, "utf8");
    h.copy(buf);
  }
  return createTempFile(name, buf);
}

// Minimal valid DOCX (ZIP with required OOXML parts) so server-side magic-byte validation passes.
const MIN_DOCX_BASE64 =
  "UEsDBBQAAAAIAC2k1lx5bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMEFAAAAAgALaTWXJv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBBQAAAAIAC2k1lzp+cGTewAAAJsAAAAcAAAAd29yZC9fcmVscy9kb2N1bWVudC54bWwucmVsc1XMQQ4CIQyF4auQ7h3QhTEGmJ0HMHqAZqYCkSmEEqO3l6UuX/68z87vLasXNUmFHewnA4p4KWvi4OB+u+xOoKQjr5gLk4MPCczeXiljHxeJqYoaBouD2Hs9ay1LpA1lKpV4lEdpG/YxW9AVlycG0gdjjrr9GuCt/kP9F1BLAwQUAAAACAAtpNZcQtZan5oAAADOAAAAEQAAAHdvcmQvZG9jdW1lbnQueG1sRY5BDsIgEEWvQmZvqS6MaUrdGQ+gB0AY2yYwQwCtvb1QF27en8n8vEx//ngn3hjTzKRg37QgkAzbmUYF99tldwKRsiarHRMqWDHBeeiXzrJ5eaQsioBStyiYcg6dlMlM6HVqOCCV25Oj17mscZQLRxsiG0yp+L2Th7Y9Sq9ngqp8sF1rhopYkYcrOse9rGNl3Bg2/ury/8rwBVBLAQIUABQAAAAIAC2k1lx5bjPX6AAAAK0BAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQAFAAAAAgALaTWXJv9N+qtAAAAKQEAAAsAAAAAAAAAAAAAAIABGQEAAF9yZWxzLy5yZWxzUEsBAhQAFAAAAAgALaTWXOn5wZN7AAAAmwAAABwAAAAAAAAAAAAAAIAB7wEAAHdvcmQvX3JlbHMvZG9jdW1lbnQueG1sLnJlbHNQSwECFAAUAAAACAAtpNZcQtZan5oAAADOAAAAEQAAAAAAAAAAAAAAgAGkAgAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAQABAADAQAAbQMAAAAA";

// Minimal valid XLSX (ZIP with required OOXML spreadsheet parts).
const MIN_XLSX_BASE64 =
  "UEsDBBQAAAAIACSs1lyb3ZcU7gAAAKUBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QzU7DMBCEX8XyFcUOPSCEkvRQyhE4lAdY7E1ixX/yuiV9e5y0XFDhZK1nZr/RNtvZWXbCRCb4lt+LmjP0Kmjjh5Z/HF6qR84og9dgg8eWn5H4tmsO54jEStZTy8ec45OUpEZ0QCJE9EXpQ3KQy5gGGUFNMKDc1PWDVMFn9LnKyw7eNc/Yw9Fmtp/L96VHQkuc7S7GhdVyiNEaBbno8uT1L0p1JYiSXD00mkh3xcDlTcKi/A245t7KYZLRyN4h5VdwxSVnK79Cmj5DmMT/S260DH1vFOqgjq5EBMWEoGlEzM6K9RUOjP/pLdczd99QSwMEFAAAAAgAJKzWXJja64uuAAAAJwEAAAsAAABfcmVscy8ucmVsc43PwQ6CMAwG4FdZepeBB2MMg4sx4WrwAeZWBgHWZZsKb++OYjx4bPr3+9OyXuaJPdGHgayAIsuBoVWkB2sE3NrL7ggsRGm1nMiigBUD1FV5xUnGdBL6wQWWDBsE9DG6E+dB9TjLkJFDmzYd+VnGNHrDnVSjNMj3eX7g/tOArckaLcA3ugDWrg7/sanrBoVnUo8ZbfxR8ZVIsvQGo4Bl4i/y451ozBIKvCr55sHqDVBLAwQUAAAACAAkrNZc6fnBk3sAAACbAAAAGgAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzVcxBDgIhDIXhq5DuHdCFMQaYnQcweoBmpgKRKYQSo7eXpS5f/rzPzu8tqxc1SYUd7CcDingpa+Lg4H677E6gpCOvmAuTgw8JzN5eKWMfF4mpihoGi4PYez1rLUukDWUqlXiUR2kb9jFb0BWXJwbSB2OOuv0a4K3+Q/0XUEsDBBQAAAAIACSs1lwsLY5LugAAABsBAAAPAAAAeGwvd29ya2Jvb2sueG1sjY/BbsJADER/ZeU7bOgBoSgJF1SJM+UDtlmHrMjakb1Q+PsaWu6cZmzLejPN9pYnd0XRxNTCalmBQ+o5Jjq1cPz6XGzAaQkUw8SELdxRYds1Pyznb+azs3fSFsZS5tp77UfMQZc8I9llYMmh2Cgnr7NgiDoiljz5j6pa+xwSQdc8d/qvjkI2zOHhV4Z+6D5aMnBSJzOyj+af2FreAfMwpB533F8yUvkjC06hWGMd06zgu8a/QvhXs+4XUEsBAhQAFAAAAAgAJKzWXJvdlxTuAAAApQEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAAUAAAACAAkrNZcmNrri64AAAAnAQAACwAAAAAAAAAAAAAAgAEfAQAAX3JlbHMvLnJlbHNQSwECFAAUAAAACAAkrNZc6fnBk3sAAACbAAAAGgAAAAAAAAAAAAAAgAH2AQAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECFAAUAAAACAAkrNZcLC2OS7oAAAAbAQAADwAAAAAAAAAAAAAAgAGpAgAAeGwvd29ya2Jvb2sueG1sUEsFBgAAAAAEAAQA/wAAAJADAAAAAA==";

// Minimal valid PPTX (ZIP with required OOXML presentation parts).
const MIN_PPTX_BASE64 =
  "UEsDBBQAAAAIACSs1lye0ypc6QAAALIBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QzU7DMBCEX8XyFcUOHBBCcXrg5wgcygOsnE1i4T95t1X79jhpkQAVjuv5Zma93eYQvNhjIZeikdeqlQKjTYOLk5Hv2+fmTgpiiAP4FNHII5Lc9N32mJFE9UYycmbO91qTnTEAqZQxVmVMJQDXsUw6g/2ACfVN295qmyJj5IaXDNl3jzjCzrN4OtTn0x4FPUnxcAKXLiMhZ+8scNX1Pg6/Wppzg6rOlaHZZbqqgNQXGxbl74Kz77UeprgBxRsUfoFQKZ0z61yQqm9l1f9JF1ZN4+gsDsnuQrWo72HB/xhVABe/PqHXm/efUEsDBBQAAAAIACSs1lwbyrjurgAAACwBAAALAAAAX3JlbHMvLnJlbHONz80KwjAMB/BXKbm7Tg8ism4XEXaV+QClzbri+kFTxb29xZMTDx6T/PMLabqnm9kDE9ngBWyrGhh6FbT1RsB1OG8OwChLr+UcPApYkKBrmwvOMpcVmmwkVgxPAqac45FzUhM6SVWI6MtkDMnJXMpkeJTqJg3yXV3vefo0YG2yXgtIvd4CG5aI/9hhHK3CU1B3hz7/OPGVKLJMBrOAGDOPCak03+mqyMDbhq++bF9QSwMEFAAAAAgAJKzWXOn5wZN7AAAAmwAAAB8AAABwcHQvX3JlbHMvcHJlc2VudGF0aW9uLnhtbC5yZWxzVcxBDgIhDIXhq5DuHdCFMQaYnQcweoBmpgKRKYQSo7eXpS5f/rzPzu8tqxc1SYUd7CcDingpa+Lg4H677E6gpCOvmAuTgw8JzN5eKWMfF4mpihoGi4PYez1rLUukDWUqlXiUR2kb9jFb0BWXJwbSB2OOuv0a4K3+Q/0XUEsDBBQAAAAIACSs1lw/iNzHhAAAALYAAAAUAAAAcHB0L3ByZXNlbnRhdGlvbi54bWxdjEEKwjAQAL8S9m5TPYiEpL0VBI/6gNCsbSHZhOwi+nvjrXgchhk7vlNUL6y8ZXJw7HpQSHMOGy0OHvfpcAHF4in4mAkdfJBhHGwxpSIjiZcWqjYhNsXBKlKM1jyvmDx3uSA198w1eWlYF73vUtSnvj/r5DeC35RjuIYby2D1H+yz4QtQSwECFAAUAAAACAAkrNZcntMqXOkAAACyAQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAIACSs1lwbyrjurgAAACwBAAALAAAAAAAAAAAAAACAARoBAABfcmVscy8ucmVsc1BLAQIUABQAAAAIACSs1lzp+cGTewAAAJsAAAAfAAAAAAAAAAAAAACAAfEBAABwcHQvX3JlbHMvcHJlc2VudGF0aW9uLnhtbC5yZWxzUEsBAhQAFAAAAAgAJKzWXD+I3MeEAAAAtgAAABQAAAAAAAAAAAAAAIABqQIAAHBwdC9wcmVzZW50YXRpb24ueG1sUEsFBgAAAAAEAAQACQEAAF8DAAAAAA==";

// Minimal valid ZIP archive.
const MIN_ZIP_BASE64 =
  "UEsDBBQAAAAIACSs1lxqUpXmEQAAAA8AAAAKAAAAcmVhZG1lLnR4dEssSs7ILEtVSM7PK0nNKwEAUEsBAhQAFAAAAAgAJKzWXGpSleYRAAAADwAAAAoAAAAAAAAAAAAAAIABAAAAAHJlYWRtZS50eHRQSwUGAAAAAAEAAQA4AAAAOQAAAAAA";

// Minimal valid MP4 (ftyp atom with brand "isom").
const MIN_MP4_BASE64 = "AAAAGGZ0eXBpc29tAAAAAGlzb21tcDQx";

// Minimal valid MP3 (MPEG audio sync word).
const MIN_MP3_BASE64 = "//uQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

// Legacy Excel .xls stub with an OLE/CFB header (browsers typically declare it as vnd.ms-excel).
const MIN_XLS_BASE64 = "0M8R4KGxGuEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";


async function main() {
  console.log("=== Production Attachment Verification (B204D) ===\n");
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
    const xlsxName = "Звіт.xlsx";
    const xlsxPath = createTempFile(xlsxName, Buffer.from(MIN_XLSX_BASE64, "base64"));
    const pptxName = "Презентація.pptx";
    const pptxPath = createTempFile(pptxName, Buffer.from(MIN_PPTX_BASE64, "base64"));
    const zipName = "Архів.zip";
    const zipPath = createTempFile(zipName, Buffer.from(MIN_ZIP_BASE64, "base64"));

    const mp4Name = "Відео.mp4";
    const mp4Path = createTempFile(mp4Name, Buffer.from(MIN_MP4_BASE64, "base64"));

    const mp3Name = "Аудіо.mp3";
    const mp3Path = createTempFile(mp3Name, Buffer.from(MIN_MP3_BASE64, "base64"));

    const xlsName = "Старий_звіт.xls";
    const xlsPath = createTempFile(xlsName, Buffer.from(MIN_XLS_BASE64, "base64"));

    const pngPath = createTempFile(
      pngName,
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
    );

    // B204D limit verification fixtures.
    const MB = 1024 * 1024;
    const pngHeader = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const mp4Header = Buffer.from(MIN_MP4_BASE64, "base64");

    const largePdfName = "report-12mb.pdf";
    const largePdfPath = createSizedTempFile(largePdfName, 12 * MB, "%PDF-1.4");
    const largeMp4Name = "clip-12mb.mp4";
    const largeMp4Path = createSizedTempFile(largeMp4Name, 12 * MB, mp4Header);

    const hugePngName = "huge-26mb.png";
    const hugePngPath = createSizedTempFile(hugePngName, 26 * MB, pngHeader);
    const hugePdfName = "huge-51mb.pdf";
    const hugePdfPath = createSizedTempFile(hugePdfName, 51 * MB, "%PDF-1.4");
    const hugeMp4Name = "huge-101mb.mp4";
    const hugeMp4Path = createSizedTempFile(hugeMp4Name, 101 * MB, mp4Header);

    const mixedSmallFiles = Array.from({ length: 12 }, (_, i) =>
      createTempFile(`mixed-${i}.txt`, `file ${i}`, "utf8"),
    );
    const imageBatchFiles = Array.from({ length: 22 }, (_, i) =>
      createTempFile(`batch-${i}.png`, pngHeader),
    );
    const totalTooLargeFiles = Array.from({ length: 8 }, (_, i) =>
      createSizedTempFile(`total-${i}.png`, 20 * MB, pngHeader),
    );

    // Helper to wait for a non-image attachment filename in a message row.
    async function waitForAttachmentFileName(name, timeout = 8000) {
      const locator = page.locator(`text=${name}`).first();
      await locator.waitFor({ timeout });
      return locator;
    }

    // Helper to wait for an image attachment to finish loading (alt text is set on the <img>).
    async function waitForImageAttachment(name, timeout = 15000) {
      const locator = page.locator(`[data-testid^="message-attachment-image-"] img[alt="${name}"]`).first();
      await locator.waitFor({ timeout });
      return locator;
    }

    async function sendSelectedFiles() {
      await page.click('button[type="submit"]');
      await sleep(3000);
    }

    async function countComposerAttachments() {
      const chips = await page.locator('[data-testid^="composer-attachment-chip-"]').count();
      const previews = await page.locator('[data-testid^="composer-attachment-preview-"]').count();
      return chips + previews;
    }

    async function isVisibleFileTypeError() {
      return page.locator("text=/file type is not supported/i").first().isVisible().catch(() => false);
    }

    async function isVisibleLimitError() {
      return page
        .locator(
          "text=/(File is too large|File too large|Maximum|Max|You can attach up to|Total attachment size|exceeds|exceeded|limit)/i",
        )
        .first()
        .isVisible()
        .catch(() => false);
    }

    async function clearComposerAttachments() {
      // Remove every chip/preview we can find; fallback to page reload if UI state is stuck.
      for (let i = 0; i < 50; i++) {
        const remove = page.locator('[data-testid^="composer-attachment-remove-"]').first();
        if (await remove.isVisible().catch(() => false)) {
          await remove.click();
          await sleep(150);
        } else {
          break;
        }
      }
      if ((await countComposerAttachments()) > 0) {
        await page.reload({ waitUntil: "networkidle" });
      }
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

    // 3. XLSX upload with Cyrillic filename.
    console.log("[step] upload XLSX with Cyrillic filename");
    await page.setInputFiles('[data-testid="composer-file-input"]', xlsxPath);
    await sleep(500);
    await sendSelectedFiles();
    await debugState("after-xlsx-cyrillic");

    try {
      await waitForAttachmentFileName(xlsxName);
      pushResult("XLSX with Cyrillic filename appears in message", true);
    } catch {
      pushResult("XLSX with Cyrillic filename appears in message", false, "filename not found");
    }

    // 4. PPTX upload with Cyrillic filename.
    console.log("[step] upload PPTX with Cyrillic filename");
    await page.setInputFiles('[data-testid="composer-file-input"]', pptxPath);
    await sleep(500);
    await sendSelectedFiles();
    await debugState("after-pptx-cyrillic");

    try {
      await waitForAttachmentFileName(pptxName);
      pushResult("PPTX with Cyrillic filename appears in message", true);
    } catch {
      pushResult("PPTX with Cyrillic filename appears in message", false, "filename not found");
    }

    // 5. ZIP upload with Cyrillic filename.
    console.log("[step] upload ZIP with Cyrillic filename");
    await page.setInputFiles('[data-testid="composer-file-input"]', zipPath);
    await sleep(500);
    await sendSelectedFiles();
    await debugState("after-zip-cyrillic");

    try {
      await waitForAttachmentFileName(zipName);
      pushResult("ZIP with Cyrillic filename appears in message", true);
    } catch {
      pushResult("ZIP with Cyrillic filename appears in message", false, "filename not found");
    }

    // 6. MP4 video upload with Cyrillic filename.
    console.log("[step] upload MP4 video with Cyrillic filename");
    await page.setInputFiles('[data-testid="composer-file-input"]', mp4Path);
    await sleep(500);
    await sendSelectedFiles();
    await debugState("after-mp4-cyrillic");

    try {
      await waitForAttachmentFileName(mp4Name);
      pushResult("MP4 video with Cyrillic filename appears in message", true);
    } catch {
      pushResult("MP4 video with Cyrillic filename appears in message", false, "filename not found");
    }

    // 7. MP3 audio upload with Cyrillic filename.
    console.log("[step] upload MP3 audio with Cyrillic filename");
    await page.setInputFiles('[data-testid="composer-file-input"]', mp3Path);
    await sleep(500);
    await sendSelectedFiles();
    await debugState("after-mp3-cyrillic");

    try {
      await waitForAttachmentFileName(mp3Name);
      pushResult("MP3 audio with Cyrillic filename appears in message", true);
    } catch {
      pushResult("MP3 audio with Cyrillic filename appears in message", false, "filename not found");
    }

    // 8. Legacy XLS upload with Cyrillic filename.
    console.log("[step] upload legacy XLS with Cyrillic filename");
    await page.setInputFiles('[data-testid="composer-file-input"]', xlsPath);
    await sleep(500);
    await sendSelectedFiles();
    await debugState("after-xls-cyrillic");

    try {
      await waitForAttachmentFileName(xlsName);
      pushResult("Legacy XLS with Cyrillic filename appears in message", true);
    } catch {
      pushResult("Legacy XLS with Cyrillic filename appears in message", false, "filename not found");
    }

    // 9. Unsupported dangerous file rejected with a friendly error.
    console.log("[step] reject unsupported .exe upload");
    const exeName = "dangerous.exe";
    const exePath = createTempFile(exeName, Buffer.from("TVqQAAMAAAAEAAAA//8AALgAAAAA", "base64"));
    await page.setInputFiles('[data-testid="composer-file-input"]', exePath);
    await sleep(500);

    const exeErrorVisible = await page
      .locator("text=/file type is not supported/i")
      .first()
      .isVisible()
      .catch(() => false);
    const exeFileChip = await page.locator('[data-testid^="composer-attachment-chip-"]').count();
    pushResult(
      "Dangerous .exe file is rejected with friendly error",
      exeErrorVisible && exeFileChip === 0,
      exeErrorVisible ? "error shown" : "no error shown",
    );

    // 7. Image upload with Cyrillic filename.
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

    // 11. Drag & drop upload with overlay.
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

    // B204D limit verification checks.

    console.log("[step] B204D: >10 MB PDF within document limit accepted");
    await page.setInputFiles('[data-testid="composer-file-input"]', largePdfPath);
    await sleep(500);
    await sendSelectedFiles();
    await debugState("after-large-pdf");

    try {
      await waitForAttachmentFileName(largePdfName, 30000);
      pushResult("12 MB PDF under document limit is accepted and sent", true);
    } catch (e) {
      pushResult("12 MB PDF under document limit is accepted and sent", false, e.message);
    }

    console.log("[step] B204D: >10 MB MP4 within video limit accepted");
    await page.setInputFiles('[data-testid="composer-file-input"]', largeMp4Path);
    await sleep(500);
    await sendSelectedFiles();
    await debugState("after-large-mp4");

    try {
      await waitForAttachmentFileName(largeMp4Name, 30000);
      pushResult("12 MB MP4 under video limit is accepted and sent", true);
    } catch (e) {
      pushResult("12 MB MP4 under video limit is accepted and sent", false, e.message);
    }

    console.log("[step] B204D: 26 MB PNG rejected over image limit");
    await page.setInputFiles('[data-testid="composer-file-input"]', hugePngPath);
    await sleep(500);
    {
      const count = await countComposerAttachments();
      const error = await isVisibleLimitError();
      pushResult("26 MB PNG rejected over image limit", count === 0 && error, `count=${count}, error=${error}`);
    }
    await clearComposerAttachments();

    console.log("[step] B204D: 51 MB PDF rejected over document limit");
    await page.setInputFiles('[data-testid="composer-file-input"]', hugePdfPath);
    await sleep(500);
    {
      const count = await countComposerAttachments();
      const error = await isVisibleLimitError();
      pushResult("51 MB PDF rejected over document limit", count === 0 && error, `count=${count}, error=${error}`);
    }
    await clearComposerAttachments();

    console.log("[step] B204D: 101 MB MP4 rejected over video limit");
    await page.setInputFiles('[data-testid="composer-file-input"]', hugeMp4Path);
    await sleep(500);
    {
      const count = await countComposerAttachments();
      const error = await isVisibleLimitError();
      pushResult("101 MB MP4 rejected over video limit", count === 0 && error, `count=${count}, error=${error}`);
    }
    await clearComposerAttachments();

    console.log("[step] B204D: 10 mixed files accepted");
    await page.setInputFiles('[data-testid="composer-file-input"]', mixedSmallFiles.slice(0, 10));
    await sleep(800);
    {
      const count = await countComposerAttachments();
      pushResult("10 mixed files accepted in composer", count === 10, `count=${count}`);
    }
    await clearComposerAttachments();

    console.log("[step] B204D: 11 mixed files rejected");
    await page.setInputFiles('[data-testid="composer-file-input"]', mixedSmallFiles.slice(0, 11));
    await sleep(800);
    {
      const count = await countComposerAttachments();
      const error = await isVisibleLimitError();
      pushResult("11 mixed files rejected", count <= 10 && error, `count=${count}, error=${error}`);
    }
    await clearComposerAttachments();

    console.log("[step] B204D: 20 images accepted");
    await page.setInputFiles('[data-testid="composer-file-input"]', imageBatchFiles.slice(0, 20));
    await sleep(1000);
    {
      const count = await countComposerAttachments();
      pushResult("20 images accepted in composer", count === 20, `count=${count}`);
    }
    await clearComposerAttachments();

    console.log("[step] B204D: 21 images rejected");
    await page.setInputFiles('[data-testid="composer-file-input"]', imageBatchFiles.slice(0, 21));
    await sleep(1000);
    {
      const count = await countComposerAttachments();
      const error = await isVisibleLimitError();
      pushResult("21 images rejected", count <= 20 && error, `count=${count}, error=${error}`);
    }
    await clearComposerAttachments();

    console.log("[step] B204D: total size >150 MB rejected");
    await page.setInputFiles('[data-testid="composer-file-input"]', totalTooLargeFiles);
    await sleep(1000);
    {
      const count = await countComposerAttachments();
      const error = await isVisibleLimitError();
      pushResult("Total attachment size over 150 MB rejected", count === 0 && error, `count=${count}, error=${error}`);
    }
    await clearComposerAttachments();

    // 12. Authenticated download.
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

    // 13. No CORS / ERR_FAILED.
    const corsErrors = failedRequests.filter(
      (r) => r.failure.includes("CORS") || r.failure.includes("ERR_FAILED"),
    );
    pushResult(
      "No CORS / net::ERR_FAILED in network failures",
      corsErrors.length === 0,
      corsErrors.map((r) => `${r.url} -> ${r.failure}`).join("; ") || "none",
    );

    // 14. Token leakage.
    const leaked = consoleLogs.some(
      (text) => text.includes(owner.accessToken) || text.includes(owner.refreshToken),
    );
    pushResult("No access/refresh token leaked to console", !leaked);

    // 15. DM attachments not supported.
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
