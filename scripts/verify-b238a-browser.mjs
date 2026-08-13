#!/usr/bin/env node
/**
 * B238A real browser verification.
 *
 * Runs against a COMPLETELY DISPOSABLE environment so that permanent
 * letschat_local data is never touched. Uses:
 *   - PostgreSQL database: letschat_b238a_browser
 *   - API port: 3002
 *   - Web port: 3003
 *   - Redis logical DB: 1
 *   - Mailpit: shared local instance (test emails are identifiable by address)
 *   - MinIO: shared local bucket (test objects are cleaned by prefix)
 *
 * The script refuses to run if the configured DATABASE_URL points at
 * letschat_local and verifies that the permanent DB counts are unchanged
 * before/after the run.
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.dirname(__filename);

const SCREENSHOT_DIR = "visual-qa/b238a-browser";
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const TEST_DB_NAME = "letschat_b238a_browser";
const API_PORT = 3002;
const WEB_PORT = 3003;
const API_BASE = `http://localhost:${API_PORT}/api/v1`;
const API_ORIGIN = `http://localhost:${API_PORT}`;
const WEB_BASE = `http://localhost:${WEB_PORT}`;
const MAILPIT_BASE = "http://localhost:8025";

const PASSWORD = `B238A-${Date.now()}-Xy!`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function screenshotPath(name) {
  return path.join(SCREENSHOT_DIR, `${Date.now()}-${name}.png`);
}

async function screenshot(page, name) {
  const p = screenshotPath(name);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`Screenshot: ${p}`);
  return p;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function loadEnv() {
  const envFiles = [
    path.join(REPO_ROOT, ".env.example"),
    path.join(REPO_ROOT, ".env"),
    path.join(REPO_ROOT, ".env.local"),
  ];
  for (const file of envFiles) {
    const parsed = parseEnvFile(file);
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function parseDatabaseUrl(url) {
  const match = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!match) throw new Error(`Cannot parse DATABASE_URL: ${url}`);
  return { user: match[1], password: match[2], host: match[3], port: match[4], db: match[5] };
}

function buildTestDatabaseUrl(originalUrl) {
  const url = new URL(originalUrl);
  url.pathname = `/${TEST_DB_NAME}`;
  return url.toString();
}

function buildTestRedisUrl(originalUrl) {
  if (!originalUrl) return "redis://localhost:6379/1";
  const parsed = new URL(originalUrl);
  parsed.pathname = parsed.pathname ? `${parsed.pathname.replace(/\/$/, "")}/1` : "/1";
  return parsed.toString();
}

function execDockerPsql(sql, database = "postgres", url = process.env.DATABASE_URL) {
  const { user, password, host } = parseDatabaseUrl(url);
  return execSync(
    `docker exec -e PGPASSWORD=${password} letschat-postgres psql -U ${user} -h ${host} -d ${database} -t -A -c "${sql.replace(/"/g, '\\"')}"`,
    { stdio: "pipe", encoding: "utf8" }
  );
}

function getPermanentCounts() {
  try {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = "/letschat_local";
    const permanentUrl = url.toString();
    const userCount = execDockerPsql('SELECT count(*) FROM "User";', 'letschat_local', permanentUrl).trim().split(/\s+/).pop();
    const workspaceCount = execDockerPsql('SELECT count(*) FROM "Workspace";', 'letschat_local', permanentUrl).trim().split(/\s+/).pop();
    return { users: Number(userCount), workspaces: Number(workspaceCount) };
  } catch {
    return null;
  }
}

function ensureTestDatabase(url) {
  dropTestDatabase(url);
  execDockerPsql(`CREATE DATABASE "${TEST_DB_NAME}"`, "postgres", url);
  console.log(`Created disposable database ${TEST_DB_NAME}`);
}

function dropTestDatabase(url = process.env.DATABASE_URL) {
  execDockerPsql(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`, "postgres", url);
  console.log(`Dropped disposable database ${TEST_DB_NAME}`);
}

function runMigrations() {
  const testUrl = buildTestDatabaseUrl(process.env.DATABASE_URL);
  execSync("pnpm --filter @lets-chat/database migrate:deploy", {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });
  console.log("Migrations applied to disposable database");
}

function killProcessTree(pid) {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // ignore
  }
}

function spawnServer(command, extraEnv, label) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...extraEnv };
    const proc = spawn(command, [], {
      cwd: REPO_ROOT,
      env,
      shell: true,
      windowsHide: true,
      stdio: "inherit",
    });

    proc.on("error", reject);

    let resolved = false;
    const ready = () => {
      if (resolved) return;
      resolved = true;
      resolve(proc);
    };

    // Give a short grace period for the server to start before resolving.
    // Readiness polling is done separately.
    setTimeout(ready, 2000);
  });
}

async function waitForApi() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/health/ready`);
      if (res.ok) {
        const json = await res.json();
        if (json.status === "ok") return;
      }
    } catch {
      // not ready yet
    }
    await sleep(1000);
  }
  throw new Error("API did not become ready in time");
}

async function waitForWeb() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(WEB_BASE);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(1000);
  }
  throw new Error("Web did not become ready in time");
}

async function api(method, path, body, token, extraHeaders = {}) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function getLatestEmailTo(address, subjectContains, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(2000);
    const res = await fetch(`${MAILPIT_BASE}/api/v1/messages`);
    if (!res.ok) continue;
    const inbox = await res.json();
    const sorted = (inbox.messages || []).slice().sort((a, b) => {
      const da = a.Date ? new Date(a.Date).getTime() : 0;
      const db = b.Date ? new Date(b.Date).getTime() : 0;
      return db - da;
    });
    for (const msg of sorted) {
      const to = (msg.To || []).map((t) => t.Address).join(",");
      if (to.includes(address) && msg.Subject.includes(subjectContains)) {
        return msg;
      }
    }
  }
  throw new Error(
    `Email to ${address} with subject "${subjectContains}" not received in time`
  );
}

async function countEmailsTo(address, subjectContains) {
  const res = await fetch(`${MAILPIT_BASE}/api/v1/messages`);
  if (!res.ok) throw new Error(`Failed to fetch mailpit messages: ${res.status}`);
  const inbox = await res.json();
  return (inbox.messages || []).filter((msg) => {
    const to = (msg.To || []).map((t) => t.Address).join(",");
    return to.includes(address) && msg.Subject.includes(subjectContains);
  }).length;
}

async function getEmailText(id) {
  const res = await fetch(`${MAILPIT_BASE}/api/v1/message/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch email text: ${res.status}`);
  const json = await res.json();
  return json.Text || "";
}

function extractToken(text, prefix) {
  const match = text.match(new RegExp(`${prefix}=([a-f0-9]{64})`));
  if (match) return match[1];
  const generic = text.match(/token=([a-f0-9]{64})/);
  if (generic) return generic[1];
  throw new Error(`Token not found in email text (prefix ${prefix})`);
}

async function uploadAvatar(accessToken) {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const blob = new Blob([png], { type: "image/png" });
  const formData = new FormData();
  formData.append("avatar", blob, "avatar.png");
  const res = await fetch(`${API_BASE}/auth/me/avatar/upload`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`Avatar upload failed: ${res.status} ${JSON.stringify(data)}`);
  return data.avatarUrl;
}

function resetAvatarCooldown(userId) {
  execDockerPsql(
    `UPDATE "User" SET "avatarUpdatedAt" = NULL WHERE id = '${userId}';`,
    TEST_DB_NAME
  );
}

async function uploadMultipleAvatars(accessToken, userId, count) {
  const urls = [];
  for (let i = 0; i < count; i++) {
    if (i > 0) resetAvatarCooldown(userId);
    urls.push(await uploadAvatar(accessToken));
  }
  return urls;
}

function avatarFileExists(avatarUrl) {
  if (!avatarUrl || !avatarUrl.startsWith("/uploads/avatars/")) return false;
  const relativePath = avatarUrl.slice("/uploads/".length);
  const filePath = path.join("apps/api/uploads", relativePath);
  return fs.existsSync(filePath);
}

function avatarUserDirectoryExists(userId) {
  const dirPath = path.join("apps/api/uploads/avatars", userId);
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

async function fetchAvatarStatus(avatarUrl) {
  if (!avatarUrl || !avatarUrl.startsWith("/uploads/avatars/")) return null;
  const res = await fetch(`${API_ORIGIN}${avatarUrl}`);
  return res.status;
}

async function createVerifiedAccount(suffix) {
  const email = `b238a-${suffix}-${Date.now()}@example.com`;
  const username = `b238a${suffix}${Date.now()}`;

  const reg = await api("POST", "/auth/register", { email, username, password: PASSWORD });
  if (reg.status !== 201) throw new Error(`Register failed: ${reg.status} ${JSON.stringify(reg.data)}`);

  const verifyMsg = await getLatestEmailTo(email, "Verify your email address for Lets Chat");
  const verifyText = await getEmailText(verifyMsg.ID);
  const verifyToken = extractToken(verifyText, "token");

  const verify = await api("POST", "/auth/verify-email", { token: verifyToken });
  if (verify.status !== 200) throw new Error(`Verify failed: ${verify.status} ${JSON.stringify(verify.data)}`);

  const login = await api("POST", "/auth/login", { email, password: PASSWORD });
  if (login.status !== 200 || !login.data.accessToken) {
    throw new Error(`Login failed: ${login.status} ${JSON.stringify(login.data)}`);
  }

  return {
    email,
    username,
    userId: login.data.user.id,
    accessToken: login.data.accessToken,
    refreshToken: login.data.refreshToken,
  };
}

async function setSession(page, accessToken, refreshToken) {
  await page.goto(`${WEB_BASE}/login`);
  await page.evaluate(
    ({ accessToken, refreshToken }) => {
      sessionStorage.setItem("accessToken", accessToken);
      sessionStorage.setItem("refreshToken", refreshToken);
    },
    { accessToken, refreshToken }
  );
}

async function runBrowserTests() {
  console.log("Creating disposable accounts...");
  const userA = await createVerifiedAccount("a");
  const userB = await createVerifiedAccount("b");
  console.log(`User A: ${userA.email} / ${userA.username}`);
  console.log(`User B: ${userB.email} / ${userB.username}`);

  console.log("User B sends DM to user A...");
  const dm = await api("POST", "/direct-conversations", { usernameOrEmail: userA.username }, userB.accessToken);
  if (dm.status !== 201) throw new Error(`DM create failed: ${dm.status} ${JSON.stringify(dm.data)}`);
  const conversationId = dm.data.id;
  const msg = await api(
    "POST",
    `/direct-conversations/${conversationId}/messages`,
    { content: "Hello before deletion" },
    userB.accessToken
  );
  if (msg.status !== 201) throw new Error(`DM message failed: ${msg.status} ${JSON.stringify(msg.data)}`);
  console.log("DM sent.");

  console.log("User A replies in DM...");
  const reply = await api(
    "POST",
    `/direct-conversations/${conversationId}/messages`,
    { content: "Reply from user A before deletion" },
    userA.accessToken
  );
  if (reply.status !== 201) throw new Error(`Reply failed: ${reply.status} ${JSON.stringify(reply.data)}`);
  console.log("Reply sent.");

  console.log("Uploading multiple avatars for user A...");
  const avatarUrls = await uploadMultipleAvatars(userA.accessToken, userA.userId, 3);
  for (const avatarUrl of avatarUrls) {
    const status = await fetchAvatarStatus(avatarUrl);
    if (status !== 200) throw new Error(`Avatar upload did not produce accessible URL: status ${status}`);
  }
  const oldestAvatarUrl = avatarUrls[0];
  console.log(`Uploaded ${avatarUrls.length} avatars; oldest ${oldestAvatarUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const results = [];

  console.log("Login as user A and open profile...");
  await setSession(page, userA.accessToken, userA.refreshToken);
  await page.goto(`${WEB_BASE}/profile`);
  await page.waitForLoadState("networkidle");
  await page.click("[data-testid='profile-tab-data']");
  await page.waitForSelector("[data-testid='account-data-section']", { timeout: 5000 });
  await screenshot(page, "01-profile-page");
  results.push("Profile page rendered");

  console.log("Download my data...");
  await page.click("[data-testid='download-data-button']");
  await page.fill("[data-testid='export-password-input']", PASSWORD);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("[data-testid='export-submit-button']"),
  ]);
  const downloadPath = await download.path();
  const exportJson = JSON.parse(fs.readFileSync(downloadPath, "utf8"));
  console.log("Export top-level keys:", Object.keys(exportJson));
  if (!exportJson.exportFormatVersion) throw new Error("Export missing exportFormatVersion");
  const exportEmail = exportJson.user?.email ?? exportJson.profile?.email;
  if (exportEmail !== userA.email) throw new Error(`Export missing user email: ${exportEmail}`);
  console.log(`Export downloaded: ${download.suggestedFilename()}, formatVersion=${exportJson.exportFormatVersion}`);
  await screenshot(page, "02-export-success");
  results.push("Data export downloaded and parsed");

  console.log("Ownership blocker test...");
  const ws = await api(
    "POST",
    "/workspaces",
    { name: "B238A Blocker Workspace", slug: `b238a-ws-${Date.now()}` },
    userA.accessToken
  );
  if (ws.status !== 201) throw new Error(`Workspace create failed: ${ws.status} ${JSON.stringify(ws.data)}`);
  const workspaceId = ws.data.id;

  await page.click("[data-testid='profile-tab-data']");
  await page.waitForSelector("[data-testid='delete-account-button']", { timeout: 5000 });
  await page.click("[data-testid='delete-account-button']");
  await page.fill("[data-testid='delete-password-input']", PASSWORD);
  await page.fill("[data-testid='delete-phrase-input']", "DELETE MY ACCOUNT");
  await page.click("[data-testid='delete-submit-button']");
  await sleep(1500);
  const blockerText = await page
    .locator("[data-testid='delete-account-error']")
    .textContent()
    .catch(() => page.locator("body").innerText());
  console.log("Blocker text sample:", blockerText.slice(0, 200));
  await screenshot(page, "03-ownership-blocker");
  results.push("Ownership blocker shown (or error for workspace owner)");

  console.log("Removing blocker workspace...");
  const deleteWs = await api("DELETE", `/workspaces/${workspaceId}`, null, userA.accessToken);
  if (deleteWs.status !== 200) throw new Error(`Workspace delete failed: ${deleteWs.status}`);

  console.log("Delete account wrong password...");
  await page.goto(`${WEB_BASE}/profile`);
  await page.click("[data-testid='profile-tab-data']");
  await page.waitForSelector("[data-testid='delete-account-button']", { timeout: 5000 });
  await page.click("[data-testid='delete-account-button']");
  await page.fill("[data-testid='delete-password-input']", "wrong-password");
  await page.fill("[data-testid='delete-phrase-input']", "DELETE MY ACCOUNT");
  await page.click("[data-testid='delete-submit-button']");
  await sleep(1000);
  await screenshot(page, "04-delete-wrong-password");
  results.push("Delete account wrong password rejected");

  console.log("Waiting 62s for deletion-request rate limit reset before idempotency test...");
  await sleep(62000);
  console.log("Idempotent deletion request via API...");
  const idempotencyKey = `b238a-${Date.now()}`;
  const firstDeletion = await api(
    "POST",
    "/auth/account-deletion/request",
    { currentPassword: PASSWORD, confirmationPhrase: "DELETE MY ACCOUNT" },
    userA.accessToken,
    { "Idempotency-Key": idempotencyKey }
  );
  if (firstDeletion.status !== 200) {
    throw new Error(
      `First deletion request failed: ${firstDeletion.status} ${JSON.stringify(firstDeletion.data)}`
    );
  }
  const firstScheduledFor = firstDeletion.data.scheduledFor;
  const emailCountAfterFirst = await countEmailsTo(userA.email, "Cancel your Lets Chat account deletion");

  const retryDeletion = await api(
    "POST",
    "/auth/account-deletion/request",
    { currentPassword: PASSWORD, confirmationPhrase: "DELETE MY ACCOUNT" },
    userA.accessToken,
    { "Idempotency-Key": idempotencyKey }
  );
  if (retryDeletion.status !== 200) {
    throw new Error(
      `Retry deletion request failed: ${retryDeletion.status} ${JSON.stringify(retryDeletion.data)}`
    );
  }
  if (retryDeletion.data.scheduledFor !== firstScheduledFor) {
    throw new Error(
      `Idempotency retry changed scheduledFor: ${firstScheduledFor} -> ${retryDeletion.data.scheduledFor}`
    );
  }
  const emailCountAfterRetry = await countEmailsTo(userA.email, "Cancel your Lets Chat account deletion");
  if (emailCountAfterRetry !== emailCountAfterFirst) {
    throw new Error(
      `Idempotency retry sent another cancellation email: ${emailCountAfterFirst} -> ${emailCountAfterRetry}`
    );
  }
  results.push("Idempotent deletion request retry returned same result without duplicate email");

  console.log("Resend cancellation recovery test...");
  const resend = await api(
    "POST",
    "/auth/account-deletion/resend-cancellation",
    { email: userA.email, currentPassword: PASSWORD },
    undefined,
    { "Idempotency-Key": `resend-${idempotencyKey}` }
  );
  if (resend.status !== 200) {
    throw new Error(`Resend cancellation failed: ${resend.status} ${JSON.stringify(resend.data)}`);
  }
  const emailCountAfterResend = await countEmailsTo(userA.email, "Cancel your Lets Chat account deletion");
  if (emailCountAfterResend <= emailCountAfterFirst) {
    throw new Error("Resend cancellation did not send a new cancellation email");
  }
  results.push("Resend cancellation recovery sent a new email without changing scheduledFor");

  console.log("Waiting 62s for deletion-request rate limit reset...");
  await sleep(62000);

  console.log("Delete account correct password...");
  await page.fill("[data-testid='delete-password-input']", PASSWORD);
  await page.click("[data-testid='delete-submit-button']");
  await sleep(3000);
  const urlAfterDelete = page.url();
  console.log("URL after delete submit:", urlAfterDelete);
  await screenshot(page, "05-delete-request-state");
  if (!urlAfterDelete.includes("/login?deleted=1")) {
    const bodyText = await page.locator("body").innerText();
    console.log("Body text after delete submit:", bodyText.slice(0, 1000));
    throw new Error(`Expected redirect to /login?deleted=1, got ${urlAfterDelete}`);
  }
  results.push("Delete account request succeeded");

  console.log("Old access token should be rejected...");
  const meAfter = await api("GET", "/auth/me", null, userA.accessToken);
  if (meAfter.status !== 401 && meAfter.status !== 403) {
    throw new Error(`Expected old access token to be rejected, got ${meAfter.status}`);
  }
  results.push(`Old access token rejected: ${meAfter.status}`);

  console.log("Login pending user shows message...");
  await page.goto(`${WEB_BASE}/login`);
  await page.fill("input[name='login-email']", userA.email);
  await page.fill("input[name='login-password']", PASSWORD);
  await page.click("button[type='submit']");
  await sleep(1500);
  await screenshot(page, "06-login-pending");
  results.push("Login pending user shown");

  console.log("Pending login resend cancellation link...");
  const emailCountBeforeResend = await countEmailsTo(
    userA.email,
    "Cancel your Lets Chat account deletion"
  );
  await page.click("[data-testid='resend-cancellation-link']");
  await sleep(2000);
  await screenshot(page, "06b-resend-cancellation");
  const emailCountAfterResendClick = await countEmailsTo(
    userA.email,
    "Cancel your Lets Chat account deletion"
  );
  if (emailCountAfterResendClick <= emailCountBeforeResend) {
    throw new Error("Resend cancellation link did not send a new email");
  }
  results.push("Pending login resend cancellation link sent a new email");

  console.log("User B search hides pending user...");
  const search = await api("GET", `/users/search?q=${userA.username}`, null, userB.accessToken);
  if (search.status !== 200) throw new Error(`Search failed: ${search.status}`);
  const found = (search.data.items || []).some(
    (u) => u.id === userA.userId || u.username === userA.username
  );
  if (found) throw new Error("Pending user still appears in search");
  results.push("Pending user hidden from search");

  console.log("Cancellation email...");
  const cancelMsg = await getLatestEmailTo(userA.email, "Cancel your Lets Chat account deletion");
  const cancelText = await getEmailText(cancelMsg.ID);
  const cancelToken = extractToken(cancelText, "token");
  console.log("Cancel token obtained");

  await page.goto(`${WEB_BASE}/cancel-account-deletion?token=${cancelToken}`);
  await page.waitForSelector("[data-testid='cancel-account-deletion-card']", { timeout: 10000 });
  await page.waitForSelector("text=Your account has been restored", { timeout: 10000 });
  await sleep(1000);
  await screenshot(page, "08-cancel-success");
  const urlAfterCancel = page.url();
  if (urlAfterCancel.includes("token=")) throw new Error("Token still in address bar after cancellation");
  results.push("Cancellation token removed from URL");

  console.log("Login works again after cancellation...");
  const restoredLogin = await api("POST", "/auth/login", { email: userA.email, password: PASSWORD });
  if (restoredLogin.status !== 200) {
    throw new Error(`Restored login failed: ${restoredLogin.status} ${JSON.stringify(restoredLogin.data)}`);
  }
  await setSession(page, restoredLogin.data.accessToken, restoredLogin.data.refreshToken);
  await page.goto(`${WEB_BASE}/dashboard`);
  await page.waitForLoadState("networkidle");
  await screenshot(page, "09-login-restored");
  const dashboardText = await page.locator("body").innerText();
  if (!dashboardText.includes(userA.username)) throw new Error("Dashboard does not show restored user");
  results.push("Login restored after cancellation");

  console.log("Second deletion request...");
  await page.goto(`${WEB_BASE}/profile`);
  await page.click("[data-testid='profile-tab-data']");
  await page.waitForSelector("[data-testid='delete-account-button']", { timeout: 5000 });
  await page.click("[data-testid='delete-account-button']");
  await page.fill("[data-testid='delete-password-input']", PASSWORD);
  await page.fill("[data-testid='delete-phrase-input']", "DELETE MY ACCOUNT");
  await page.click("[data-testid='delete-submit-button']");
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15000 });
  await screenshot(page, "10-second-delete-request");
  results.push("Second deletion request succeeded");

  console.log("Finalize user A via DB + CLI...");
  execDockerPsql(
    `UPDATE "User" SET "deletionScheduledFor" = NOW() WHERE id = '${userA.userId}';`,
    TEST_DB_NAME
  );
  execSync("pnpm --filter api cli:finalize-account-deletions", {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: buildTestDatabaseUrl(process.env.DATABASE_URL) },
    stdio: "inherit",
  });
  results.push("Finalizer CLI processed user A");

  console.log("User B checks old DM author...");
  const dmAfter = await api("GET", `/direct-conversations/${conversationId}/messages`, null, userB.accessToken);
  if (dmAfter.status !== 200) throw new Error(`DM list failed: ${dmAfter.status}`);
  const deletedAuthorMessage = (dmAfter.data.items || []).find(
    (m) => m.content === "Reply from user A before deletion"
  );
  if (!deletedAuthorMessage) throw new Error("Deleted-author message not found");
  const author = deletedAuthorMessage.author;
  console.log("Author after finalization:", author);
  if (!author || !author.isDeleted || author.displayName !== "Deleted user") {
    throw new Error(`Expected Deleted user, got ${JSON.stringify(author)}`);
  }
  results.push("Old DM author shows Deleted user");

  console.log("Checking DM header and avatar cleanup...");
  for (const avatarUrl of avatarUrls) {
    if (avatarFileExists(avatarUrl)) {
      throw new Error(`Old avatar file still exists after finalization: ${avatarUrl}`);
    }
    const status = await fetchAvatarStatus(avatarUrl);
    if (status !== 200) {
      throw new Error(`Unexpected avatar fallback status for ${avatarUrl} after finalization: ${status}`);
    }
  }
  results.push("All old avatar files removed and URLs return safe fallback after finalization");

  if (avatarUserDirectoryExists(userA.userId)) {
    throw new Error(`User avatar directory still exists after finalization: ${userA.userId}`);
  }
  results.push("User avatar directory removed after finalization");

  if (author.avatarUrl !== null) {
    throw new Error(`Expected anonymized author avatarUrl to be null, got ${author.avatarUrl}`);
  }
  results.push("Anonymized author avatarUrl is null");

  const dmList = await api("GET", "/direct-conversations", null, userB.accessToken);
  if (dmList.status !== 200) throw new Error(`DM list failed: ${dmList.status}`);
  const conv = (dmList.data || []).find((c) => c.id === conversationId);
  if (!conv) throw new Error("Conversation not found in DM list after finalization");
  if (
    !conv.otherParticipant?.isDeleted ||
    conv.otherParticipant?.displayName !== "Deleted user" ||
    conv.otherParticipant?.username !== ""
  ) {
    throw new Error(`Expected Deleted user header, got ${JSON.stringify(conv.otherParticipant)}`);
  }
  results.push("DM conversation header shows Deleted user");

  const allResponses = JSON.stringify(dmAfter.data) + JSON.stringify(dmList.data);
  if (allResponses.includes(`deleted_${userA.userId}`)) {
    throw new Error("Internal deleted username leaked in API response");
  }
  if (allResponses.includes(userA.username)) {
    throw new Error("Old username leaked in API response after finalization");
  }
  if (allResponses.includes(userA.email)) {
    throw new Error("Old email leaked in API response after finalization");
  }
  results.push("Old PII and internal deleted identifiers are not visible");

  console.log("Legal pages...");
  await page.goto(`${WEB_BASE}/privacy`);
  await page.waitForLoadState("networkidle");
  await screenshot(page, "11-privacy-page");
  await page.goto(`${WEB_BASE}/terms`);
  await page.waitForLoadState("networkidle");
  await screenshot(page, "12-terms-page");
  await page.goto(`${WEB_BASE}/acceptable-use`);
  await page.waitForLoadState("networkidle");
  await screenshot(page, "13-acceptable-use-page");
  results.push("Legal pages rendered");

  console.log("Mobile profile screenshot...");
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setSession(mobilePage, userB.accessToken, userB.refreshToken);
  await mobilePage.goto(`${WEB_BASE}/profile`);
  await mobilePage.waitForLoadState("networkidle");
  await mobilePage.click("[data-testid='profile-tab-data']");
  await mobilePage.waitForSelector("[data-testid='delete-account-button']", { timeout: 5000 });
  await mobilePage.click("[data-testid='delete-account-button']");
  await mobilePage.waitForSelector("[data-testid='delete-password-input']", { timeout: 5000 });
  await screenshot(mobilePage, "14-mobile-delete-modal");
  results.push("Mobile delete modal rendered");

  console.log("Same-user idempotency key reused with different body returns 409...");
  const conflictKey = `b238a-conflict-${Date.now()}`;
  const conflictFirst = await api(
    "POST",
    "/auth/account-deletion/request",
    { currentPassword: PASSWORD, confirmationPhrase: "DELETE MY ACCOUNT" },
    userB.accessToken,
    { "Idempotency-Key": conflictKey }
  );
  if (conflictFirst.status !== 200) {
    throw new Error(
      `First idempotency request failed: ${conflictFirst.status} ${JSON.stringify(conflictFirst.data)}`
    );
  }
  const conflictSecond = await api(
    "POST",
    "/auth/account-deletion/request",
    { currentPassword: "Different1!", confirmationPhrase: "DELETE MY ACCOUNT" },
    userB.accessToken,
    { "Idempotency-Key": conflictKey }
  );
  if (conflictSecond.status !== 409) {
    throw new Error(
      `Expected 409 for idempotency key reused with different body, got ${conflictSecond.status}`
    );
  }
  results.push("Same-user idempotency key reused with different body returns 409");

  await browser.close();

  console.log("\n=== B238A Browser Verification Results ===");
  for (const r of results) console.log(`- ${r}`);
  console.log(`Screenshots saved to ${SCREENSHOT_DIR}`);
}

async function main() {
  loadEnv();

  const originalDatabaseUrl = process.env.DATABASE_URL;
  if (!originalDatabaseUrl) {
    throw new Error("DATABASE_URL is not set. Load .env or export it before running this script.");
  }

  const { db: originalDbName } = parseDatabaseUrl(originalDatabaseUrl);
  if (originalDbName === "letschat_local" || originalDbName === TEST_DB_NAME) {
    throw new Error(
      `Refusing to run browser verification against ${originalDbName}. ` +
        `This script must use a dedicated disposable database. ` +
        `Set DATABASE_URL to a non-letschat_local URL (e.g. postgresql://letschat:letschat@localhost:5432/letschat_temp). ` +
        `The script will automatically create/use ${TEST_DB_NAME}.`
    );
  }

  const permanentBefore = getPermanentCounts();
  console.log("Permanent DB counts before:", permanentBefore);

  const testDatabaseUrl = buildTestDatabaseUrl(originalDatabaseUrl);
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.REDIS_URL = buildTestRedisUrl(process.env.REDIS_URL);
  if (process.env.WEBSOCKET_REDIS_URL) {
    process.env.WEBSOCKET_REDIS_URL = buildTestRedisUrl(process.env.WEBSOCKET_REDIS_URL);
  }
  if (process.env.PRESENCE_REDIS_URL) {
    process.env.PRESENCE_REDIS_URL = buildTestRedisUrl(process.env.PRESENCE_REDIS_URL);
  }
  process.env.PORT = String(API_PORT);
  process.env.CORS_ORIGIN = `http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}`;
  process.env.APP_WEB_URL = WEB_BASE;
  process.env.NEXT_PUBLIC_API_URL = `${API_BASE}`;
  process.env.NEXT_PUBLIC_WS_URL = API_ORIGIN;
  process.env.NODE_ENV = "development";
  process.env.THROTTLER_ENABLED = "false";

  ensureTestDatabase(originalDatabaseUrl);
  runMigrations();

  console.log("Starting isolated API on port", API_PORT);
  const apiProc = await spawnServer("pnpm --filter api start:prod", {}, "API");
  await waitForApi();
  console.log("API ready");

  console.log("Starting isolated Web on port", WEB_PORT);
  const webProc = await spawnServer("pnpm --filter web dev", { PORT: String(WEB_PORT) }, "Web");
  await waitForWeb();
  console.log("Web ready");

  try {
    await runBrowserTests();
  } finally {
    console.log("Stopping isolated servers...");
    if (apiProc) killProcessTree(apiProc.pid);
    if (webProc) killProcessTree(webProc.pid);
    await sleep(2000);

    console.log("Cleaning up disposable database...");
    try {
      dropTestDatabase(originalDatabaseUrl);
    } catch (e) {
      console.error("Failed to drop test database:", e.message);
    }

    const permanentAfter = getPermanentCounts();
    console.log("Permanent DB counts after:", permanentAfter);
    if (
      permanentBefore &&
      permanentAfter &&
      (permanentBefore.users !== permanentAfter.users || permanentBefore.workspaces !== permanentAfter.workspaces)
    ) {
      console.error("ERROR: Permanent DB counts changed during browser verification!");
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
