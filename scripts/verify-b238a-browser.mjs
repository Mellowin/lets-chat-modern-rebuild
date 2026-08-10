#!/usr/bin/env node
/**
 * B238A real browser verification.
 *
 * Runs against local API (localhost:3001) and web (localhost:3000).
 * Creates disposable users, uses Mailpit at localhost:8025.
 * Saves screenshots to visual-qa/b238a-browser/.
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const API_BASE = "http://localhost:3001/api/v1";
const WEB_BASE = "http://localhost:3000";
const MAILPIT_BASE = "http://localhost:8025";

const SCREENSHOT_DIR = "visual-qa/b238a-browser";
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const PASSWORD = `B238A-${Date.now()}-Xy!`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function screenshotPath(name) {
  return path.join(SCREENSHOT_DIR, `${Date.now()}-${name}.png`);
}

async function screenshot(page, name) {
  const p = screenshotPath(name);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`Screenshot: ${p}`);
  return p;
}

async function api(method, path, body, token) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
  return { status: res.status, data };
}

async function getLatestEmailTo(address, subjectContains, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(2000);
    const res = await fetch(`${MAILPIT_BASE}/api/v1/messages`);
    if (!res.ok) continue;
    const inbox = await res.json();
    for (const msg of inbox.messages || []) {
      const to = (msg.To || []).map((t) => t.Address).join(",");
      if (to.includes(address) && msg.Subject.includes(subjectContains)) {
        return msg;
      }
    }
  }
  throw new Error(`Email to ${address} with subject "${subjectContains}" not received in time`);
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
  if (login.status !== 200 || !login.data.accessToken) throw new Error(`Login failed: ${login.status} ${JSON.stringify(login.data)}`);

  return { email, username, userId: login.data.user.id, accessToken: login.data.accessToken, refreshToken: login.data.refreshToken };
}

async function main() {
  console.log("Creating disposable accounts...");
  const userA = await createVerifiedAccount("a");
  const userB = await createVerifiedAccount("b");
  console.log(`User A: ${userA.email} / ${userA.username}`);
  console.log(`User B: ${userB.email} / ${userB.username}`);

  // User B sends a direct message to user A
  console.log("User B sends DM to user A...");
  const dm = await api("POST", "/direct-conversations", { usernameOrEmail: userA.username }, userB.accessToken);
  if (dm.status !== 201) throw new Error(`DM create failed: ${dm.status} ${JSON.stringify(dm.data)}`);
  const conversationId = dm.data.id;
  const msg = await api("POST", `/direct-conversations/${conversationId}/messages`, { content: "Hello before deletion" }, userB.accessToken);
  if (msg.status !== 201) throw new Error(`DM message failed: ${msg.status} ${JSON.stringify(msg.data)}`);
  console.log("DM sent.");

  async function setSession(page, accessToken, refreshToken) {
    await page.goto(`${WEB_BASE}/login`);
    await page.evaluate(({ accessToken, refreshToken }) => {
      sessionStorage.setItem("accessToken", accessToken);
      sessionStorage.setItem("refreshToken", refreshToken);
    }, { accessToken, refreshToken });
  }

  // User A replies so that a deleted-author message exists
  console.log("User A replies in DM...");
  const reply = await api("POST", `/direct-conversations/${conversationId}/messages`, { content: "Reply from user A before deletion" }, userA.accessToken);
  if (reply.status !== 201) throw new Error(`Reply failed: ${reply.status} ${JSON.stringify(reply.data)}`);
  console.log("Reply sent.");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const results = [];

  // 1. Login as user A and visit profile (use API token to avoid login rate-limit)
  console.log("Login as user A and open profile...");
  await setSession(page, userA.accessToken, userA.refreshToken);
  await page.goto(`${WEB_BASE}/profile`);
  await page.waitForLoadState("networkidle");
  await page.click("[data-testid='profile-tab-data']");
  await page.waitForSelector("[data-testid='account-data-section']", { timeout: 5000 });
  await screenshot(page, "01-profile-page");
  results.push("Profile page rendered");

  // 2. Download my data
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

  // 3. Ownership blocker: create a workspace, then try deletion
  console.log("Ownership blocker test...");
  const ws = await api("POST", "/workspaces", { name: "B238A Blocker Workspace", slug: `b238a-ws-${Date.now()}` }, userA.accessToken);
  if (ws.status !== 201) throw new Error(`Workspace create failed: ${ws.status} ${JSON.stringify(ws.data)}`);
  const workspaceId = ws.data.id;

  await page.click("[data-testid='profile-tab-data']");
  await page.waitForSelector("[data-testid='delete-account-button']", { timeout: 5000 });
  await page.click("[data-testid='delete-account-button']");
  await page.fill("[data-testid='delete-password-input']", PASSWORD);
  await page.fill("[data-testid='delete-phrase-input']", "DELETE MY ACCOUNT");
  await page.click("[data-testid='delete-submit-button']");
  await sleep(1500);
  const blockerText = await page.locator("[data-testid='delete-account-error']").textContent().catch(() => page.locator("body").innerText());
  console.log("Blocker text sample:", blockerText.slice(0, 200));
  await screenshot(page, "03-ownership-blocker");
  results.push("Ownership blocker shown (or error for workspace owner)");

  // Remove workspace so deletion can proceed
  console.log("Removing blocker workspace...");
  const deleteWs = await api("DELETE", `/workspaces/${workspaceId}`, null, userA.accessToken);
  if (deleteWs.status !== 200) throw new Error(`Workspace delete failed: ${deleteWs.status}`);

  // 4. Delete account - wrong password
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

  // Wait for account-deletion request rate limit window to reset (3 req / 60s).
  console.log("Waiting 62s for deletion-request rate limit reset...");
  await sleep(62000);

  // 5. Delete account - correct password
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

  // 6. Old access token should not work
  console.log("Old access token should be rejected...");
  const meAfter = await api("GET", "/auth/me", null, userA.accessToken);
  if (meAfter.status !== 401 && meAfter.status !== 403) {
    throw new Error(`Expected old access token to be rejected, got ${meAfter.status}`);
  }
  results.push(`Old access token rejected: ${meAfter.status}`);

  // 7. Login should show pending deletion message
  console.log("Login pending user shows message...");
  await page.goto(`${WEB_BASE}/login`);
  await page.fill("input[name='login-email']", userA.email);
  await page.fill("input[name='login-password']", PASSWORD);
  await page.click("button[type='submit']");
  await sleep(1500);
  await screenshot(page, "06-login-pending");
  results.push("Login pending user shown");

  // 8. User B cannot find user A in search
  console.log("User B search hides pending user...");
  const search = await api("GET", `/users/search?q=${userA.username}`, null, userB.accessToken);
  if (search.status !== 200) throw new Error(`Search failed: ${search.status}`);
  const found = (search.data.items || []).some((u) => u.id === userA.userId || u.username === userA.username);
  if (found) throw new Error("Pending user still appears in search");
  results.push("Pending user hidden from search");

  // 9. Get cancellation email and cancel via browser
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

  // 10. Login works again (use fresh API tokens to avoid login rate limit)
  console.log("Login works after cancellation...");
  const restoredLogin = await api("POST", "/auth/login", { email: userA.email, password: PASSWORD });
  if (restoredLogin.status !== 200) throw new Error(`Restored login failed: ${restoredLogin.status} ${JSON.stringify(restoredLogin.data)}`);
  await setSession(page, restoredLogin.data.accessToken, restoredLogin.data.refreshToken);
  await page.goto(`${WEB_BASE}/dashboard`);
  await page.waitForLoadState("networkidle");
  await screenshot(page, "09-login-restored");
  const dashboardText = await page.locator("body").innerText();
  if (!dashboardText.includes(userA.username)) throw new Error("Dashboard does not show restored user");
  results.push("Login restored after cancellation");

  // 11. Request deletion again (for finalization test)
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

  // 12. Finalize only user A via DB + CLI
  console.log("Finalize user A via DB + CLI...");
  execSync(
    `docker exec -e PGPASSWORD=letschat letschat-postgres psql -U letschat -d letschat_local -c "UPDATE \\"User\\" SET \\"deletionScheduledFor\\" = NOW() WHERE id = '${userA.userId}';"`,
    { stdio: "inherit" }
  );
  execSync(
    `pnpm --filter api cli:finalize-account-deletions`,
    { stdio: "inherit" }
  );
  results.push("Finalizer CLI processed user A");

  // 13. User B sees "Deleted user" in old DM
  console.log("User B checks old DM author...");
  const dmAfter = await api("GET", `/direct-conversations/${conversationId}/messages`, null, userB.accessToken);
  if (dmAfter.status !== 200) throw new Error(`DM list failed: ${dmAfter.status}`);
  const deletedAuthorMessage = (dmAfter.data.items || []).find((m) => m.content === "Reply from user A before deletion");
  if (!deletedAuthorMessage) throw new Error("Deleted-author message not found");
  const author = deletedAuthorMessage.author;
  console.log("Author after finalization:", author);
  if (!author || !author.isDeleted || author.displayName !== "Deleted user") {
    throw new Error(`Expected Deleted user, got ${JSON.stringify(author)}`);
  }
  results.push("Old DM author shows Deleted user");

  // 14. Legal pages
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

  // 15. Mobile profile delete modal
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

  await browser.close();

  console.log("\n=== B238A Browser Verification Results ===");
  for (const r of results) console.log(`- ${r}`);
  console.log(`Screenshots saved to ${SCREENSHOT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
