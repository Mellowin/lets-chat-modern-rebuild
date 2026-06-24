#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production PWA verification.
 *
 * Checks that the Vercel deployment exposes a valid manifest, service worker,
 * offline fallback, and PWA icons.
 *
 * Usage:
 *   WEB_URL=https://lets-chat-web.vercel.app node scripts/verify-production-pwa.mjs
 */

const WEB_URL = process.env.WEB_URL || "https://lets-chat-web.vercel.app";

const checks = [];

function pass(name) {
  checks.push({ name, ok: true });
  console.log(`  ✅ ${name}`);
}

function fail(name, reason) {
  checks.push({ name, ok: false, reason });
  console.log(`  ❌ ${name}: ${reason}`);
}

async function fetchText(url) {
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  return { status: res.status, text, contentType: res.headers.get("content-type") || "" };
}

async function checkManifest() {
  const label = "GET /manifest.webmanifest returns 200 with valid PWA manifest";
  try {
    const res = await fetch(`${WEB_URL}/manifest.webmanifest`);
    if (res.status !== 200) {
      fail(label, `status ${res.status}`);
      return;
    }
    const body = await res.json();
    const required = ["name", "short_name", "start_url", "display", "icons"];
    const missing = required.filter((key) => body[key] == null);
    if (missing.length > 0) {
      fail(label, `missing fields: ${missing.join(", ")}`);
      return;
    }
    if (!Array.isArray(body.icons) || body.icons.length === 0) {
      fail(label, "icons array is empty");
      return;
    }
    const has192 = body.icons.some((icon) => icon.sizes?.includes("192x192"));
    const has512 = body.icons.some((icon) => icon.sizes?.includes("512x512"));
    if (!has192 || !has512) {
      fail(label, `missing required icon sizes (192: ${has192}, 512: ${has512})`);
      return;
    }
    pass(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

async function checkServiceWorker() {
  const label = "GET /service-worker.js returns 200 with expected handlers";
  try {
    const { status, text } = await fetchText(`${WEB_URL}/service-worker.js`);
    if (status !== 200) {
      fail(label, `status ${status}`);
      return;
    }
    const required = [
      "addEventListener('push'",
      "addEventListener('notificationclick'",
      "addEventListener('fetch'",
      "addEventListener('install'",
      "addEventListener('activate'",
    ];
    const missing = required.filter((snippet) => !text.includes(snippet));
    if (missing.length > 0) {
      fail(label, `missing handlers: ${missing.join(", ")}`);
      return;
    }
    pass(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

async function checkOfflinePage() {
  const label = "GET /offline.html returns 200";
  try {
    const { status, text } = await fetchText(`${WEB_URL}/offline.html`);
    if (status !== 200) {
      fail(label, `status ${status}`);
      return;
    }
    if (!text.toLowerCase().includes("offline")) {
      fail(label, "page does not mention offline");
      return;
    }
    pass(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

async function checkWebRoot() {
  const label = "GET / returns 200 HTML";
  try {
    const res = await fetch(WEB_URL, { method: "GET" });
    if (res.status !== 200) {
      fail(label, `status ${res.status}`);
      return;
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      fail(label, `content-type ${contentType}`);
      return;
    }
    const body = await res.text();
    if (!body.includes("manifest.webmanifest")) {
      fail(label, "manifest link not found in HTML");
      return;
    }
    pass(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

async function checkIcons() {
  const label = "PWA icon assets return 200";
  try {
    const icons = [
      "/icons/icon-192x192.png",
      "/icons/icon-512x512.png",
      "/icons/icon-maskable-192x192.png",
      "/icons/icon-maskable-512x512.png",
      "/apple-touch-icon.png",
    ];
    const results = await Promise.all(
      icons.map(async (icon) => {
        const res = await fetch(`${WEB_URL}${icon}`);
        return { icon, ok: res.status === 200 };
      }),
    );
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      fail(label, failed.map((r) => r.icon).join(", "));
      return;
    }
    pass(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

async function main() {
  console.log("=== Production PWA Verification ===\n");
  console.log(`WEB_URL: ${WEB_URL}\n`);

  await checkManifest();
  await checkServiceWorker();
  await checkOfflinePage();
  await checkWebRoot();
  await checkIcons();

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nPassed: ${checks.length - failed.length}/${checks.length}`);
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) {
      console.log(`  ❌ ${f.name}: ${f.reason}`);
    }
    process.exit(1);
  }
  console.log("\n✅ All PWA checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
