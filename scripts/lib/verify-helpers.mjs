/* eslint-disable no-console */
/**
 * Shared helpers for production verification scripts.
 *
 * These utilities intentionally avoid printing tokens, passwords, or DB credentials.
 */

export const WEB_BASE =
  process.env.VERIFY_WEB_BASE || process.env.WEB_BASE || "https://lets-chat-web.vercel.app";
export const API_BASE =
  process.env.VERIFY_API_BASE || process.env.API_BASE || "https://lets-chat-api-v2.onrender.com/api/v1";
export const MAIL_BASE =
  process.env.VERIFY_MAIL_BASE || process.env.MAIL_BASE || "https://api.catchmail.io/api/v1";

// Reusable production verifier account pool.
// Supports either VERIFY_ACCOUNT_POOL_JSON or indexed VERIFY_ACCOUNT_N_EMAIL/PASSWORD pairs.
let cachedAccountPool = null;
let accountPoolIndex = 0;

export function maskEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  if (local.length <= 4) return `***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-2)}@${domain}`;
}

function parseAccountPool() {
  const json = process.env.VERIFY_ACCOUNT_POOL_JSON;
  if (json && json.trim()) {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      throw new Error(`VERIFY_ACCOUNT_POOL_JSON is not valid JSON: ${err.message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error("VERIFY_ACCOUNT_POOL_JSON must be a JSON array");
    }
    const accounts = parsed
      .map((entry, idx) => {
        if (!entry || typeof entry !== "object") {
          throw new Error(`VERIFY_ACCOUNT_POOL_JSON entry ${idx} is not an object`);
        }
        const email = entry.email;
        const password = entry.password;
        if (typeof email !== "string" || !email.includes("@")) {
          throw new Error(`VERIFY_ACCOUNT_POOL_JSON entry ${idx} has invalid email`);
        }
        if (typeof password !== "string" || password.length === 0) {
          throw new Error(`VERIFY_ACCOUNT_POOL_JSON entry ${idx} has invalid password`);
        }
        return { email, password };
      });
    return accounts.length > 0 ? accounts : null;
  }

  const accounts = [];
  for (let i = 1; ; i++) {
    const email = process.env[`VERIFY_ACCOUNT_${i}_EMAIL`];
    const password = process.env[`VERIFY_ACCOUNT_${i}_PASSWORD`];
    if (email === undefined && password === undefined) break;
    if (typeof email !== "string" || !email.includes("@")) {
      throw new Error(`VERIFY_ACCOUNT_${i}_EMAIL is missing or invalid`);
    }
    if (typeof password !== "string" || password.length === 0) {
      throw new Error(`VERIFY_ACCOUNT_${i}_PASSWORD is missing or empty`);
    }
    accounts.push({ email, password });
  }
  return accounts.length > 0 ? accounts : null;
}

export function getVerifierAccountPool() {
  if (cachedAccountPool === null) {
    cachedAccountPool = parseAccountPool();
  }
  return cachedAccountPool;
}

export function getAccountMode() {
  return getVerifierAccountPool() ? "reusable pool" : "disposable email";
}

export async function loginVerifierAccount(account) {
  const masked = maskEmail(account.email);
  console.log(`[auth] logging in ${masked}`);
  try {
    const session = await retry("login", () => login(account.email, account.password));
    console.log(`[auth] logged in as ${session.user.username} (${masked})`);
    return { ...session, email: account.email };
  } catch (err) {
    throw new Error(`Login failed for ${masked}: ${err.message}`);
  }
}

export async function getVerifiedAccount(label) {
  const pool = getVerifierAccountPool();
  if (pool) {
    const idx = accountPoolIndex++;
    if (idx >= pool.length) {
      throw new Error(
        `VERIFY_ACCOUNT_POOL_JSON has only ${pool.length} accounts, but this verifier needs at least ${idx + 1}`,
      );
    }
    const account = pool[idx];
    console.log(`[auth] ${label} account: ${maskEmail(account.email)} (pool)`);
    return loginVerifierAccount(account);
  }
  return createVerifiedAccount(label);
}

export async function getVerifiedAccounts(label, count) {
  const pool = getVerifierAccountPool();
  if (pool) {
    const start = accountPoolIndex;
    const end = accountPoolIndex + count;
    if (end > pool.length) {
      throw new Error(
        `VERIFY_ACCOUNT_POOL_JSON has only ${pool.length} accounts, but this verifier needs ${count} more (total ${end})`,
      );
    }
    const accounts = pool.slice(start, end);
    accountPoolIndex = end;
    const masked = accounts.map((a) => maskEmail(a.email)).join(", ");
    console.log(`[auth] ${label} accounts: ${masked} (pool)`);
    return Promise.all(accounts.map((account) => loginVerifierAccount(account)));
  }
  return Promise.all(
    Array.from({ length: count }, (_, i) => createVerifiedAccount(`${label}${i + 1}`)),
  );
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url, options = {}) {
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

export async function retry(label, fn, attempts = 5, delayMs = 2000) {
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

export async function getMailDomain() {
  // Catchmail.io uses a single public inbox domain; no domain discovery needed.
  return "catchmail.io";
}

export async function createMailbox(domain) {
  const local = `verify${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const address = `${local}@${domain}`;
  const password = generatePassword();
  // Catchmail.io mailboxes are created implicitly on first received message;
  // no account registration call is required before polling.
  return { address, password };
}

export async function getMailToken(address, password) {
  // Catchmail.io does not require authentication tokens for public mailboxes.
  // Return the address so the rest of the polling pipeline can use it directly.
  return address;
}

export async function listMessages(token) {
  // token is the mailbox address for Catchmail.io.
  const data = await fetchJson(
    `${MAIL_BASE}/mailbox?address=${encodeURIComponent(token)}`,
  );
  return Array.isArray(data?.messages) ? data.messages : [];
}

export async function getMessageSource(token, messageId) {
  const data = await fetchJson(
    `${MAIL_BASE}/message/${messageId}?mailbox=${encodeURIComponent(token)}`,
  );
  return data?.body?.text || data?.body?.html || "";
}

export async function pollForMessage(token, predicate, timeoutMs = 120000, intervalMs = 3000) {
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

export function extractVerificationToken(source) {
  const match = source.match(/verify-email\?token=([a-f0-9]+)/i) || source.match(/token=([a-f0-9]+)/i);
  if (!match) {
    throw new Error("Could not extract verification token from email");
  }
  return match[1];
}

export function generatePassword() {
  if (process.env.VERIFY_PASSWORD) return process.env.VERIFY_PASSWORD;
  return `Verify-${Date.now()}-${Math.random().toString(36).slice(2)}!`;
}

export async function registerAccount(email, username, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, username, password }),
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    if (
      res.status === 503 &&
      body?.code === "MAIL_PROVIDER_QUOTA_EXCEEDED"
    ) {
      throw new Error("mail provider quota exhausted");
    }

    const summary = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(
      `HTTP ${res.status} ${res.statusText} for ${API_BASE}/auth/register: ${summary}`,
    );
  }

  return body;
}

export async function verifyEmail(token) {
  return fetchJson(`${API_BASE}/auth/verify-email`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function login(email, password) {
  return fetchJson(`${API_BASE}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function api(token, method, endpoint, body) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return fetchJson(`${API_BASE}${endpoint}`, opts);
}

export async function createVerifiedAccount(prefix) {
  const domain = await retry("get mail domain", getMailDomain);
  const mailbox = await createMailbox(domain);
  console.log(`[auth] ${prefix} account: ${mailbox.address}`);

  // Usernames may only contain letters, numbers, and underscores.
  const username = `${prefix}${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "");
  await registerAccount(mailbox.address, username, mailbox.password);
  const mailToken = await retry("get mail token", () => getMailToken(mailbox.address, mailbox.password));
  const source = await pollForMessage(mailToken, (m) => m.subject?.toLowerCase().includes("verify"));
  const verifyToken = extractVerificationToken(source);
  await verifyEmail(verifyToken);
  const session = await retry("login", () => login(mailbox.address, mailbox.password));
  console.log(`[auth] ${prefix} logged in as ${session.user.username}`);
  return { ...session, email: mailbox.address, password: mailbox.password };
}

export function printResult(r) {
  const icon = r.ok ? "✅" : "❌";
  const detail = r.detail ? ` (${r.detail})` : "";
  console.log(`${icon} ${r.check}${detail}`);
}

export function finalize(results) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\nPassed: ${results.length - failed.length}/${results.length}`);
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) {
      console.log(`  ❌ ${f.check}: ${f.detail || "no detail"}`);
    }
    process.exit(1);
  }
  console.log("\n✅ All verification checks passed.");
}
