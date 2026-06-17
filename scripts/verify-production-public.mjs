#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Public production verification.
 *
 * Wraps `scripts/smoke-deploy.mjs` so the portfolio verification pack has a
 * single, predictable entry point for public-only checks.
 *
 * Required env vars:
 *   WEB_URL  (defaults to https://lets-chat-web.vercel.app)
 *   API_URL  (defaults to https://lets-chat-api-v2.onrender.com/api/v1)
 *
 * No secrets required. Safe to run in CI or on every push.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WEB_URL = process.env.WEB_URL || "https://lets-chat-web.vercel.app";
const API_URL = process.env.API_URL || "https://lets-chat-api-v2.onrender.com/api/v1";

const smokePath = path.join(__dirname, "smoke-deploy.mjs");

const child = spawn(process.execPath, [smokePath], {
  stdio: "inherit",
  env: {
    ...process.env,
    WEB_URL,
    API_URL,
  },
});

child.on("close", (code) => {
  process.exit(code ?? 1);
});
