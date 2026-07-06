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
  return fetchJson(`${API_BASE}/auth/register`, {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });
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
