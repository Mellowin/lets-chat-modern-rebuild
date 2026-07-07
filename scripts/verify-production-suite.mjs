#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Production verification suite runner.
 *
 * Runs production verifier scripts in groups, prints per-step timing,
 * supports timeouts, and stops on first failure by default.
 *
 * Usage:
 *   node scripts/verify-production-suite.mjs --group core
 *   node scripts/verify-production-suite.mjs --group all
 *   node scripts/verify-production-suite.mjs --group messaging --continue-on-error
 *
 * Env:
 *   VERIFY_TIMEOUT_MS       - total suite timeout in ms (0 = disabled, default 0)
 *   VERIFY_STEP_TIMEOUT_MS  - per-verifier timeout in ms (default 300000 = 5m)
 *   VERIFY_API_BASE / VERIFY_WEB_BASE - override endpoints
 */

import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import {
  API_BASE,
  WEB_BASE,
  fetchJson,
} from "./lib/verify-helpers.mjs";

const GROUPS = {
  core: ["public", "auth", "permissions", "browser", "pwa"],
  messaging: [
    "attachments",
    "attachments-parity",
    "pagination",
    "mentions",
    "message-search",
    "message-jump",
    "realtime",
    "presence",
  ],
  social: [
    "contacts",
    "contacts-privacy",
    "groups",
    "channel-sidebar",
    "safety",
  ],
  "admin-suite": ["admin-reports", "diagnostics", "audit"],
  "browser-suite": ["browser", "attachments", "channel-sidebar", "push-browser", "mobile-shell"],
  all: [], // computed below
};

GROUPS.all = [
  ...GROUPS.core,
  ...GROUPS.messaging,
  ...GROUPS.social,
  ...GROUPS["admin-suite"],
];

const SPECIAL_SCRIPTS = {
  "push-browser": "scripts/verify-production-push-browser.mjs",
  "mobile-shell": "scripts/verify-mobile-shell.mjs",
};

function scriptPath(name) {
  return SPECIAL_SCRIPTS[name] ?? `scripts/verify-production-${name}.mjs`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const groupIndex = args.indexOf("--group");
  const group = groupIndex !== -1 ? args[groupIndex + 1] : "all";
  const continueOnError = args.includes("--continue-on-error");
  if (!GROUPS[group]) {
    console.error(`Unknown group: ${group}`);
    console.error(`Available groups: ${Object.keys(GROUPS).join(", ")}`);
    process.exit(1);
  }
  return { group, continueOnError };
}

async function precheck() {
  console.log("=== Production Verification Suite ===\n");
  console.log(`API_BASE:  ${API_BASE}`);
  console.log(`WEB_BASE:  ${WEB_BASE}\n`);

  try {
    const version = await fetchJson(`${API_BASE}/version`);
    console.log(`Commit:    ${version.commit ?? "unknown"}`);
    console.log(`Branch:    ${version.branch ?? "unknown"}`);
  } catch (err) {
    console.warn(`⚠️  Could not fetch /version: ${err.message}`);
  }

  try {
    const health = await fetchJson(`${API_BASE}/health`);
    console.log(`Health:    ${health.status ?? "unknown"}`);
  } catch (err) {
    console.warn(`⚠️  Could not fetch /health: ${err.message}`);
  }

  console.log("");
}

function runVerifier(name, timeoutMs) {
  return new Promise((resolve) => {
    const start = performance.now();
    const path = scriptPath(name);
    const child = spawn(process.execPath, [path], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    child.stdout.on("data", (data) => {
      const text = data.toString("utf8");
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString("utf8");
      stderr += text;
      process.stderr.write(text);
    });

    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      // Force kill after a short grace period.
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timeoutId);
      const durationMs = Math.round(performance.now() - start);
      const passedMatch = stdout.match(/Passed:\s*(\d+)\/(\d+)/);
      const passed = passedMatch ? Number(passedMatch[1]) : null;
      const total = passedMatch ? Number(passedMatch[2]) : null;

      resolve({
        name,
        path,
        exitCode: code,
        durationMs,
        timedOut: killed,
        passed,
        total,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timeoutId);
      resolve({
        name,
        path,
        exitCode: 1,
        durationMs: Math.round(performance.now() - start),
        timedOut: false,
        passed: null,
        total: null,
        error: err.message,
      });
    });
  });
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main() {
  const { group, continueOnError } = parseArgs();
  const verifiers = GROUPS[group];

  await precheck();

  const stepTimeoutMs = Number(process.env.VERIFY_STEP_TIMEOUT_MS) || 300000;
  const totalTimeoutMs = Number(process.env.VERIFY_TIMEOUT_MS) || 0;
  const suiteStart = performance.now();
  let abortedByTotalTimeout = false;
  let totalTimeoutId = null;

  if (totalTimeoutMs > 0) {
    totalTimeoutId = setTimeout(() => {
      abortedByTotalTimeout = true;
    }, totalTimeoutMs);
  }

  const results = [];

  for (const name of verifiers) {
    if (abortedByTotalTimeout) {
      results.push({
        name,
        exitCode: 1,
        durationMs: 0,
        timedOut: true,
        passed: null,
        total: null,
        skipped: true,
        error: "suite total timeout reached",
      });
      continue;
    }

    console.log(`\n▶ Running verify:prod:${name} (timeout ${formatDuration(stepTimeoutMs)})\n`);
    const result = await runVerifier(name, stepTimeoutMs);
    results.push(result);

    const summary = result.timedOut
      ? `❌ verify:prod:${result.name} — TIMEOUT after ${formatDuration(result.durationMs)}`
      : result.exitCode === 0
        ? `✅ verify:prod:${result.name} — ${result.passed ?? "ok"}${result.total !== null ? "/" + result.total : ""} — ${formatDuration(result.durationMs)}`
        : `❌ verify:prod:${result.name} — FAILED (exit ${result.exitCode}) — ${formatDuration(result.durationMs)}`;

    console.log(`\n${summary}\n`);

    if (!continueOnError && (result.exitCode !== 0 || result.timedOut)) {
      if (totalTimeoutId) clearTimeout(totalTimeoutId);
      break;
    }
  }

  if (totalTimeoutId) clearTimeout(totalTimeoutId);

  console.log("\n=== Suite Summary ===\n");
  for (const r of results) {
    if (r.skipped) {
      console.log(`⏭️  verify:prod:${r.name} — skipped (${r.error})`);
    } else {
      const line = r.timedOut
        ? `❌ verify:prod:${r.name} — timeout — ${formatDuration(r.durationMs)}`
        : r.exitCode === 0
          ? `✅ verify:prod:${r.name} — ${r.passed ?? "ok"}${r.total !== null ? "/" + r.total : ""} — ${formatDuration(r.durationMs)}`
          : `❌ verify:prod:${r.name} — failed (exit ${r.exitCode}) — ${formatDuration(r.durationMs)}`;
      console.log(line);
    }
  }

  const suiteDuration = Math.round(performance.now() - suiteStart);
  const failed = results.filter((r) => r.exitCode !== 0 || r.timedOut || r.skipped);
  const okCount = results.length - failed.length;

  console.log(`\nTotal: ${okCount}/${results.length} verifiers passed in ${formatDuration(suiteDuration)}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Suite runner failed:", err);
  process.exit(1);
});
