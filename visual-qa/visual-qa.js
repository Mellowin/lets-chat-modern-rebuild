/* eslint-disable no-console */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const WEB_BASE = "https://lets-chat-web.vercel.app";
const API_BASE = "https://lets-chat-api-v2.onrender.com/api/v1";
const MAIL_BASE = "https://api.mail.tm";

function getVisualQAPassword() {
  if (process.env.VISUAL_QA_PASSWORD) return process.env.VISUAL_QA_PASSWORD;
  return `VisualQA-${Date.now()}-${Math.random().toString(36).slice(2)}!`;
}

const PASSWORD = getVisualQAPassword();
const SCREENSHOT_DIR = path.join(__dirname, "screenshots");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const summary = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}: ${summary}`);
  }
  return body;
}

async function retry(label, fn, attempts = 5, delayMs = 2000) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`[retry] ${label} attempt ${i + 1}/${attempts} failed: ${err.message}`);
      await sleep(delayMs * (i + 1));
    }
  }
  throw lastErr;
}

async function getMailDomain() {
  const domains = await fetchJson(`${MAIL_BASE}/domains`);
  if (!Array.isArray(domains) || !domains[0]?.domain) {
    throw new Error("No Mail.tm domains available");
  }
  return domains[0].domain;
}

async function createMailbox(domain) {
  const local = `vq${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const address = `${local}@${domain}`;
  const password = PASSWORD;
  await fetchJson(`${MAIL_BASE}/accounts`, {
    method: "POST",
    body: JSON.stringify({ address, password }),
  });
  return { address, password };
}

async function getMailToken(address, password) {
  const data = await fetchJson(`${MAIL_BASE}/token`, {
    method: "POST",
    body: JSON.stringify({ address, password }),
  });
  return data.token;
}

async function listMessages(token) {
  return fetchJson(`${MAIL_BASE}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function getMessageSource(token, messageId) {
  const data = await fetchJson(`${MAIL_BASE}/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.text || data.html || "";
}

async function pollForMessage(token, predicate, timeoutMs = 120000, intervalMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const messages = await listMessages(token);
    if (Array.isArray(messages)) {
      const match = messages.find(predicate);
      if (match) {
        return getMessageSource(token, match.id);
      }
    }
    await sleep(intervalMs);
  }
  throw new Error("Timed out waiting for email");
}

function extractVerificationToken(source) {
  const match = source.match(/verify-email\?token=([a-f0-9]+)/i) || source.match(/token=([a-f0-9]+)/i);
  if (!match) {
    throw new Error("Could not extract verification token from email");
  }
  return match[1];
}

async function registerAccount(email, username) {
  return fetchJson(`${API_BASE}/auth/register`, {
    method: "POST",
    body: JSON.stringify({ email, username, password: PASSWORD }),
  });
}

async function verifyEmail(token) {
  return fetchJson(`${API_BASE}/auth/verify-email`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

async function login(email) {
  return fetchJson(`${API_BASE}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD }),
  });
}

function api(token, method, endpoint, body) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return fetchJson(`${API_BASE}${endpoint}`, opts);
}

async function capture(page, name, opts = {}) {
  const filePath = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: filePath, fullPage: opts.fullPage ?? true });
  console.log(`[screenshot] ${name}`);
  return filePath;
}

async function waitForNetwork(page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 15000 });
  } catch {
    // continue; production may have long-lived WebSocket
  }
}

async function createAndVerifyAccount(prefix) {
  console.log(`[auth] creating ${prefix} account...`);
  const domain = await retry("get mail domain", getMailDomain);
  const mailbox = await createMailbox(domain);
  console.log(`[auth] ${prefix} email: ${mailbox.address}`);

  await registerAccount(mailbox.address, `${prefix}${Date.now()}`);
  const mailToken = await retry("get mail token", () => getMailToken(mailbox.address, mailbox.password));
  const source = await pollForMessage(mailToken, (m) => m.subject?.toLowerCase().includes("verify"));
  const verifyToken = extractVerificationToken(source);
  await verifyEmail(verifyToken);
  const session = await retry("login", () => login(mailbox.address));
  console.log(`[auth] ${prefix} logged in as ${session.user.username}`);
  return { ...session, email: mailbox.address };
}

(async () => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const report = [];
  const findings = [];

  try {
    // Wake up the API
    console.log("[health] pinging API...");
    await retry("health check", () => fetchJson(`${API_BASE}/health`));

    // Create accounts
    const userA = await createAndVerifyAccount("visqa");
    await sleep(3000);
    const userB = await createAndVerifyAccount("visqab");

    // Seed workspace / channel / messages
    console.log("[seed] creating workspace...");
    const workspaceName = `Visual QA Workspace ${Date.now()}`;
    const workspace = await api(userA.accessToken, "POST", "/workspaces", { name: workspaceName });
    report.push(`Workspace: ${workspace.name} (${workspace.id})`);

    const channel = await api(userA.accessToken, "POST", `/workspaces/${workspace.id}/channels`, {
      name: "general",
      description: "Channel for visual QA screenshots",
      type: "PUBLIC",
    });
    report.push(`Channel: #${channel.name} (${channel.id})`);

    const channelMessages = [
      "Welcome to the visual QA workspace!",
      "This channel is seeded with sample messages for screenshots.",
      "The B192 redesign uses a unified indigo primary, soft surfaces, and rounded cards.",
      "We are checking spacing, alignment, and typography across all authenticated screens.",
    ];
    for (const content of channelMessages) {
      await api(userA.accessToken, "POST", `/workspaces/${workspace.id}/channels/${channel.id}/messages`, { content });
    }
    console.log("[seed] channel messages created");

    // Invite and accept
    const invite = await api(userA.accessToken, "POST", `/workspaces/${workspace.id}/invites`, {
      email: userB.email,
      role: "MEMBER",
    });
    report.push(`Invite: ${invite.id}`);
    await api(userB.accessToken, "POST", `/invites/${invite.id}/accept`);
    console.log("[seed] user B accepted invite");

    // DM conversation
    const dm = await api(userA.accessToken, "POST", "/direct-conversations", { userId: userB.user.id });
    report.push(`DM conversation: ${dm.id}`);
    const dmMessages = [
      { sender: userA, text: "Hey, can you check the new UI?" },
      { sender: userB, text: "Sure — the channel page looks polished." },
      { sender: userA, text: "How does the mobile viewport feel?" },
    ];
    for (const { sender, text } of dmMessages) {
      await api(sender.accessToken, "POST", `/direct-conversations/${dm.id}/messages`, { content: text });
    }
    console.log("[seed] DM messages created");

    // Playwright screenshots
    console.log("[playwright] launching browser...");
    const browser = await chromium.launch({ headless: true });

    // Anonymous context for public login page
    const anonContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const loginPage = await anonContext.newPage();
    await loginPage.goto(`${WEB_BASE}/login`, { waitUntil: "networkidle" });
    await loginPage.waitForSelector('input[type="email"]', { timeout: 10000 });
    await capture(loginPage, "01-login-desktop.png");

    await loginPage.setViewportSize({ width: 390, height: 844 });
    await capture(loginPage, "01-login-mobile.png");
    await anonContext.close();

    // Authenticated context with tokens seeded
    const authContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await authContext.addInitScript(
      (tokens) => {
        sessionStorage.setItem("accessToken", tokens.accessToken);
        sessionStorage.setItem("refreshToken", tokens.refreshToken);
      },
      { accessToken: userA.accessToken, refreshToken: userA.refreshToken },
    );
    const page = await authContext.newPage();

    async function captureAuthenticatedMobile(nameSuffix) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: "networkidle" });
      await page.waitForSelector("text=Your workspaces", { timeout: 20000 });
      await capture(page, `02-dashboard-${nameSuffix}.png`);

      await page.goto(`${WEB_BASE}/workspaces/${workspace.id}`, { waitUntil: "networkidle" });
      await page.waitForSelector(`h1:has-text("${workspaceName}")`, { timeout: 20000 });
      await capture(page, `03-workspace-${nameSuffix}.png`);

      await page.goto(`${WEB_BASE}/workspaces/${workspace.id}/channels/${channel.id}`, { waitUntil: "networkidle" });
      await page.waitForSelector("text=Welcome to the visual QA workspace!", { timeout: 20000 });
      await capture(page, `04-channel-${nameSuffix}.png`, { fullPage: false });

      await page.click('[data-testid="global-search-open-button"]');
      await page.waitForSelector('[data-testid="global-search-modal"]', { timeout: 10000 });
      await page.fill('[data-testid="global-search-input"]', "screenshots");
      await page.click('[data-testid="global-search-submit"]');
      await page.waitForSelector("text=Search results", { timeout: 20000 }).catch(() => {});
      await sleep(2000);
      await capture(page, `05-global-search-${nameSuffix}.png`, { fullPage: false });
      await page.click('[data-testid="global-search-close-button"]');

      await page.goto(`${WEB_BASE}/direct/${dm.id}`, { waitUntil: "networkidle" });
      await page.waitForSelector("text=Hey, can you check the new UI?", { timeout: 20000 });
      await capture(page, `06-dm-${nameSuffix}.png`, { fullPage: false });

      await page.goto(`${WEB_BASE}/profile`, { waitUntil: "networkidle" });
      await page.waitForSelector("text=Sessions", { timeout: 20000 });
      await page.click('button:has-text("Sessions")');
      await page.waitForSelector('[data-testid="toggle-sessions-list"]', { timeout: 20000 });
      await page.click('[data-testid="toggle-sessions-list"]');
      await page.waitForSelector('[data-testid^="session-item-"]', { timeout: 20000 });
      await capture(page, `07-profile-sessions-${nameSuffix}.png`);
    }

    // Desktop screenshots
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Your workspaces", { timeout: 20000 });
    await capture(page, "02-dashboard-desktop.png");

    await page.goto(`${WEB_BASE}/workspaces/${workspace.id}`, { waitUntil: "networkidle" });
    await page.waitForSelector(`h1:has-text("${workspaceName}")`, { timeout: 20000 });
    await capture(page, "03-workspace-desktop.png");

    await page.goto(`${WEB_BASE}/workspaces/${workspace.id}/channels/${channel.id}`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Welcome to the visual QA workspace!", { timeout: 20000 });
    await capture(page, "04-channel-desktop.png", { fullPage: false });

    await page.click('[data-testid="global-search-open-button"]');
    await page.waitForSelector('[data-testid="global-search-modal"]', { timeout: 10000 });
    await page.fill('[data-testid="global-search-input"]', "screenshots");
    await page.click('[data-testid="global-search-submit"]');
    await page.waitForSelector("text=Search results", { timeout: 20000 }).catch(() => {});
    await sleep(2000);
    await capture(page, "05-global-search-desktop.png", { fullPage: false });
    await page.click('[data-testid="global-search-close-button"]');

    await page.goto(`${WEB_BASE}/direct/${dm.id}`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Hey, can you check the new UI?", { timeout: 20000 });
    await capture(page, "06-dm-desktop.png", { fullPage: false });

    await page.goto(`${WEB_BASE}/profile`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Sessions", { timeout: 20000 });
    await page.click('button:has-text("Sessions")');
    await page.waitForSelector('[data-testid="toggle-sessions-list"]', { timeout: 20000 });
    await page.click('[data-testid="toggle-sessions-list"]');
    await page.waitForSelector('[data-testid^="session-item-"]', { timeout: 20000 });
    await capture(page, "07-profile-sessions-desktop.png");

    // Mobile screenshots
    await captureAuthenticatedMobile("mobile");

    // Tablet screenshots
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto(`${WEB_BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Your workspaces", { timeout: 20000 });
    await capture(page, "02-dashboard-tablet.png");

    await page.goto(`${WEB_BASE}/workspaces/${workspace.id}/channels/${channel.id}`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=Welcome to the visual QA workspace!", { timeout: 20000 });
    await capture(page, "04-channel-tablet.png", { fullPage: false });

    await authContext.close();
    await browser.close();

    console.log("\n[done] screenshots saved to", SCREENSHOT_DIR);
  } catch (err) {
    console.error("\n[error]", err.message);
    findings.push(`Pipeline error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    const reportPath = path.join(SCREENSHOT_DIR, "report.md");
    const reportBody = [
      "# B196 Visual QA Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Production: ${WEB_BASE}`,
      `API: ${API_BASE}`,
      "",
      "## Seed summary",
      ...report.map((line) => `- ${line}`),
      "",
      "## Screenshots",
      "- `01-login-desktop.png` — public login page (desktop)",
      "- `01-login-mobile.png` — public login page (390×844 mobile)",
      "- `02-dashboard-desktop.png` — authenticated dashboard (desktop)",
      "- `02-dashboard-tablet.png` — authenticated dashboard (768×1024 tablet)",
      "- `03-workspace-desktop.png` — workspace overview (desktop)",
      "- `04-channel-desktop.png` — public channel (desktop)",
      "- `04-channel-tablet.png` — public channel (768×1024 tablet)",
      "- `05-global-search-desktop.png` — global message search modal (desktop)",
      "- `06-dm-desktop.png` — direct message conversation (desktop)",
      "- `07-profile-sessions-desktop.png` — profile settings / sessions (desktop)",
      "- `02-dashboard-mobile.png` — dashboard (390×844 mobile)",
      "- `03-workspace-mobile.png` — workspace overview (390×844 mobile)",
      "- `04-channel-mobile.png` — channel (375×812 mobile small)",
      "- `05-global-search-mobile.png` — global search modal (390×844 mobile)",
      "- `06-dm-mobile.png` — DM conversation (390×844 mobile)",
      "- `07-profile-sessions-mobile.png` — profile sessions (390×844 mobile)",
      "",
      "## Findings",
      findings.length ? findings.map((f) => `- ${f}`).join("\n") : "- No automated issues detected. Human review of screenshots required.",
      "",
    ].join("\n");
    fs.writeFileSync(reportPath, reportBody);
    console.log("[report]", reportPath);
  }
})();
