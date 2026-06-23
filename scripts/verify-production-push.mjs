#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production push notification API verification (B211).
 *
 * Verifies endpoint behavior without relying on real OS/browser notification
 * delivery. Creates a disposable Mail.tm account, authenticates, and exercises
 * the push subscription lifecycle.
 *
 * No tokens, passwords, or VAPID keys are printed.
 */

import {
  API_BASE,
  createVerifiedAccount,
  api,
  finalize,
  printResult,
} from "./lib/verify-helpers.mjs";

function randomBase64Url(length) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function makeFakeSubscription() {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${randomBase64Url(152)}`,
    keys: {
      p256dh: randomBase64Url(87),
      auth: randomBase64Url(22),
    },
  };
}

function statusFromError(err) {
  const match = err.message.match(/HTTP (\d{3})/);
  return match ? Number(match[1]) : null;
}

function hasSecret(value) {
  if (typeof value === "string") {
    return value.includes("p256dh") || value.includes("auth");
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasSecret(item));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([key, val]) =>
        ["p256dh", "auth"].includes(key) || hasSecret(val),
    );
  }
  return false;
}

async function main() {
  const results = [];
  let account;

  try {
    account = await createVerifiedAccount("push");
    results.push({ ok: true, check: "create and verify disposable account" });
  } catch (err) {
    results.push({
      ok: false,
      check: "create and verify disposable account",
      detail: err.message,
    });
    finalize(results);
    return;
  }

  const subscription = makeFakeSubscription();

  // 1. Unauthenticated subscribe must be rejected.
  try {
    await api(null, "POST", "/push/subscribe", subscription);
    results.push({
      ok: false,
      check: "unauthenticated subscribe rejected",
      detail: "request succeeded without token",
    });
  } catch (err) {
    const status = statusFromError(err);
    results.push({
      ok: status === 401,
      check: "unauthenticated subscribe rejected",
      detail: status === 401 ? undefined : `expected 401, got ${status || err.message}`,
    });
  }

  // 2. Invalid input must be rejected.
  try {
    await api(account.accessToken, "POST", "/push/subscribe", {
      endpoint: subscription.endpoint,
    });
    results.push({
      ok: false,
      check: "invalid subscribe input rejected",
      detail: "request succeeded without keys",
    });
  } catch (err) {
    const status = statusFromError(err);
    results.push({
      ok: status === 400,
      check: "invalid subscribe input rejected",
      detail: status === 400 ? undefined : `expected 400, got ${status || err.message}`,
    });
  }

  // 3. Authenticated subscribe works.
  try {
    await api(account.accessToken, "POST", "/push/subscribe", subscription);
    results.push({ ok: true, check: "authenticated subscribe succeeds" });
  } catch (err) {
    results.push({
      ok: false,
      check: "authenticated subscribe succeeds",
      detail: err.message,
    });
  }

  // 4. GET /push/subscriptions works and does not leak secrets.
  let list = [];
  try {
    list = await api(account.accessToken, "GET", "/push/subscriptions");
    const ok =
      Array.isArray(list) &&
      list.length === 1 &&
      !hasSecret(list) &&
      list[0]?.endpointPreview !== undefined;
    results.push({
      ok,
      check: "GET /push/subscriptions returns safe subscription list",
      detail: ok
        ? undefined
        : `unexpected list shape or secret leak: ${JSON.stringify(list).slice(0, 200)}`,
    });
  } catch (err) {
    results.push({
      ok: false,
      check: "GET /push/subscriptions returns safe subscription list",
      detail: err.message,
    });
  }

  // 5. Duplicate subscribe updates instead of creating duplicates.
  try {
    await api(account.accessToken, "POST", "/push/subscribe", subscription);
    const secondList = await api(account.accessToken, "GET", "/push/subscriptions");
    results.push({
      ok: Array.isArray(secondList) && secondList.length === 1,
      check: "duplicate subscribe does not create duplicate row",
      detail: Array.isArray(secondList)
        ? `expected 1, got ${secondList.length}`
        : "response is not an array",
    });
  } catch (err) {
    results.push({
      ok: false,
      check: "duplicate subscribe does not create duplicate row",
      detail: err.message,
    });
  }

  // 6. POST /push/unsubscribe works.
  try {
    await api(account.accessToken, "POST", "/push/unsubscribe", {
      endpoint: subscription.endpoint,
    });
    const afterUnsubscribe = await api(
      account.accessToken,
      "GET",
      "/push/subscriptions",
    );
    results.push({
      ok: Array.isArray(afterUnsubscribe) && afterUnsubscribe.length === 0,
      check: "POST /push/unsubscribe removes subscription",
      detail: Array.isArray(afterUnsubscribe)
        ? `expected 0, got ${afterUnsubscribe.length}`
        : "response is not an array",
    });
  } catch (err) {
    results.push({
      ok: false,
      check: "POST /push/unsubscribe removes subscription",
      detail: err.message,
    });
  }

  // 7. API base is reachable (sanity).
  try {
    await fetch(`${API_BASE}/health`);
    results.push({ ok: true, check: "API health endpoint reachable" });
  } catch (err) {
    results.push({
      ok: false,
      check: "API health endpoint reachable",
      detail: err.message,
    });
  }

  finalize(results);
}

main().catch((err) => {
  console.error("Unexpected verification error:", err.message);
  process.exit(1);
});
