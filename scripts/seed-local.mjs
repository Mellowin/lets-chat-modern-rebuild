#!/usr/bin/env node
/**
 * Seed a default local verifier account for manual testing.
 *
 * This is intended for local development only. The credentials below are
 * intentionally public and must never be used in production.
 *
 * Env:
 *   DATABASE_URL — required, local database URL
 *
 * Usage:
 *   pnpm db:seed:local
 */

import { spawnSync } from "node:child_process";

const LOCAL_ACCOUNT = {
  email: "local-verifier@example.com",
  username: "localverifier",
  password: "LocalDevPass123!",
};

process.env.VERIFY_ACCOUNT_POOL_JSON = JSON.stringify([LOCAL_ACCOUNT]);

const result = spawnSync("pnpm", ["--filter", "api", "seed:verifier-accounts"], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 0);
