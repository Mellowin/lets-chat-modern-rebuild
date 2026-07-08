#!/usr/bin/env node
/* eslint-disable no-console */
import { chromium } from "playwright";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const WEB_BASE = "https://lets-chat-web.vercel.app";
const API_URL = "http://localhost:3001/api/v1";
const WS_URL = "ws://localhost:3001";

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
  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (d) => {
    stdout += d.toString();
    console.log("[api]", d.toString().trim());
  });
  proc.stderr.on("data", (d) => {
    stderr += d.toString();
    console.error("[api err]", d.toString().trim());
  });

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
  return { proc, stdout, stderr };
}

async function run() {
  console.log("Starting local API...");
  const { proc } = await startApi();

  let browser;
  try {
    console.log("Launching browser with PNA disabled...");
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-features=PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,LocalNetworkAccessChecks",
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

    console.log("Navigating to Vercel register page...");
    await page.goto(`${WEB_BASE}/register`, { waitUntil: "networkidle" });

    console.log("Injecting API override into localStorage...");
    await page.evaluate(
      ({ api, ws }) => {
        localStorage.setItem("letsChatApiUrl", api);
        localStorage.setItem("letsChatWsUrl", ws);
      },
      { api: API_URL, ws: WS_URL },
    );
    await page.reload({ waitUntil: "networkidle" });

    const suffix = randomSuffix();
    const email = `pna-test-${suffix}@example.com`;
    const username = `pnauser${suffix.replace(/-/g, "")}`;
    const password = "TryPass123!";

    console.log("Filling registration form...", email);
    await page.fill("#register-email", email);
    await page.fill("#register-username", username);
    await page.fill("#register-password", password);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(5000);

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("\n--- Page body after submit ---");
    console.log(bodyText.slice(0, 1000));

    console.log("\n--- Localhost network log ---");
    networkLog.forEach((line) => console.log(line));

    const success = bodyText.toLowerCase().includes("check your email");
    console.log("\nSuccess indicator present:", success);
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
