#!/usr/bin/env node
/* eslint-disable no-console */
import { chromium } from "playwright";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const WEB_BASE = "https://lets-chat-web.vercel.app";

function randomSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function startApi() {
  const env = {
    ...process.env,
    NODE_ENV: "development",
    PORT: "3001",
    DATABASE_URL: "postgresql://letschat:letschat@localhost:5432/letschat_local?schema=public",
    CORS_ORIGIN: "http://localhost:3000,http://127.0.0.1:3000,https://lets-chat-web.vercel.app",
    APP_WEB_URL: "https://lets-chat-web.vercel.app",
    MAIL_PROVIDER: "smtp",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    SMTP_SECURE: "false",
    SMTP_USER: "mailpit",
    SMTP_PASS: "mailpit",
    SMTP_FROM: "noreply@example.com",
  };
  const proc = spawn("node", [path.join(repoRoot, "apps/api/dist/src/main.js")], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", (d) => console.log("[api]", d.toString().trim()));
  proc.stderr.on("data", (d) => console.error("[api err]", d.toString().trim()));

  const healthy = await new Promise((resolve) => {
    let resolved = false;
    const check = async () => {
      try {
        const res = await fetch("http://localhost:3001/api/v1/health");
        if (res.status === 200 && !resolved) {
          resolved = true;
          clearInterval(interval);
          resolve(true);
        }
      } catch {}
    };
    const interval = setInterval(check, 500);
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(interval);
        resolve(false);
      }
    }, 30000);
    check();
  });

  if (!healthy) {
    proc.kill();
    throw new Error("API did not become healthy within 30s");
  }
  return { proc };
}

async function run() {
  console.log("Starting local API...");
  const { proc } = await startApi();

  let browser;
  try {
    console.log("Opening Vercel register page...");
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults",
      ],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    const networkLog = [];
    page.on("request", (req) => {
      if (req.url().includes("localhost:3001")) {
        networkLog.push(`${req.method()} ${req.url()}`);
      }
    });
    page.on("requestfinished", async (req) => {
      if (req.url().includes("localhost:3001")) {
        const resp = await req.response();
        networkLog.push(`RESPONSE ${req.method()} ${req.url()} ${resp?.status() ?? "?"}`);
      }
    });
    page.on("requestfailed", (req) => {
      if (req.url().includes("localhost:3001")) {
        networkLog.push(`FAILED ${req.method()} ${req.url()} — ${req.failure().errorText}`);
      }
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.log("[browser error]", msg.text());
      }
    });

    await page.goto(`${WEB_BASE}/register`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "vercel-hint-visible.png" });

    console.log("Clicking 'Use local API' hint button...");
    const useLocalBtn = page.getByRole("button", { name: /Use local API/ });
    await useLocalBtn.waitFor({ state: "visible", timeout: 5000 });
    await useLocalBtn.click();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "vercel-after-hint-click.png" });

    const override = await page.evaluate(() => localStorage.getItem("letsChatApiUrl"));
    console.log("localStorage letsChatApiUrl after click:", override);

    const suffix = randomSuffix();
    const email = `hint-test-${suffix}@example.com`;
    const username = `hintuser${suffix.replace(/-/g, "")}`;
    const password = "TryPass123!";

    console.log("Filling registration form...", email);
    await page.fill("#register-email", email);
    await page.fill("#register-username", username);
    await page.fill("#register-password", password);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(5000);
    await page.screenshot({ path: "vercel-register-success.png" });

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("\n--- Page body after submit ---");
    console.log(bodyText.slice(0, 1000));

    console.log("\n--- Localhost network log ---");
    networkLog.forEach((line) => console.log(line));

    const success = bodyText.toLowerCase().includes("check your email");
    console.log("\nSuccess indicator present:", success);

    fs.writeFileSync(
      "vercel-hint-e2e-summary.txt",
      [
        "Vercel local-API hint E2E summary",
        "",
        `Email: ${email}`,
        `Username: ${username}`,
        `API override after click: ${override}`,
        `Success: ${success}`,
        "",
        "Network log:",
        ...networkLog,
        "",
        "Page body:",
        bodyText.slice(0, 1200),
      ].join("\n"),
    );

    if (!success) {
      throw new Error("Registration success panel not detected");
    }
  } finally {
    if (browser) await browser.close();
    proc.kill();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
