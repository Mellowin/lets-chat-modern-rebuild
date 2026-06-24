#!/usr/bin/env node
/**
 * Generate PWA icons from apps/web/public/icon.svg.
 *
 * Outputs:
 *   - apps/web/public/icons/icon-192x192.png
 *   - apps/web/public/icons/icon-512x512.png
 *   - apps/web/public/icons/icon-maskable-192x192.png
 *   - apps/web/public/icons/icon-maskable-512x512.png
 *   - apps/web/public/apple-touch-icon.png
 */

import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "apps", "web", "public", "icons");
const SVG_PATH = join(ROOT, "apps", "web", "public", "icon.svg");

const svg = readFileSync(SVG_PATH, "utf8").trim();

mkdirSync(OUT_DIR, { recursive: true });

function renderPage({ size, padding, bg }) {
  if (padding === 0) {
    const sizedSvg = svg.replace("<svg", `<svg width="${size}" height="${size}"`);
    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>html,body{margin:0;padding:0;background:transparent}</style></head>
<body>${sizedSvg}</body></html>
    `.trim();
  }

  const contentSize = Math.round(size * (1 - padding * 2));
  const offset = Math.round((size - contentSize) / 2);
  const sizedSvg = svg.replace("<svg", `<svg x="${offset}" y="${offset}" width="${contentSize}" height="${contentSize}"`);
  const rectBg = bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : "";

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>html,body{margin:0;padding:0;background:transparent}</style></head>
<body>
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${rectBg}
    ${sizedSvg}
  </svg>
</body></html>
  `.trim();
}

async function capture(browser, { name, size, padding, bg }) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const html = renderPage({ size, padding, bg });
  await page.setContent(html, { waitUntil: "networkidle" });
  const outPath = name.startsWith("apple")
    ? join(ROOT, "apps", "web", "public", name)
    : join(OUT_DIR, name);
  await page.screenshot({ path: outPath, type: "png", clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log(`Generated ${outPath}`);
}

async function main() {
  const browser = await chromium.launch();
  try {
    await capture(browser, { name: "icon-192x192.png", size: 192, padding: 0, bg: null });
    await capture(browser, { name: "icon-512x512.png", size: 512, padding: 0, bg: null });
    await capture(browser, { name: "icon-maskable-192x192.png", size: 192, padding: 0.1, bg: "#4f46e5" });
    await capture(browser, { name: "icon-maskable-512x512.png", size: 512, padding: 0.1, bg: "#4f46e5" });
    await capture(browser, { name: "apple-touch-icon.png", size: 180, padding: 0.08, bg: "#ffffff" });
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
