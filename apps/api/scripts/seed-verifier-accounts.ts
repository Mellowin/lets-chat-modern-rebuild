#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Safely seed/update reusable production verifier accounts directly in the database.
 *
 * This is a server-side CLI script only. It is not exposed through any API or web route.
 *
 * Env:
 *   DATABASE_URL                — required, production database URL
 *   VERIFY_ACCOUNT_POOL_JSON    — JSON array of { email, username, password }
 *   VERIFY_ACCOUNT_N_EMAIL / VERIFY_ACCOUNT_N_USERNAME / VERIFY_ACCOUNT_N_PASSWORD — alternative
 *   BCRYPT_SALT_ROUNDS          — optional, defaults to 12
 *
 * Example:
 *   DATABASE_URL=... VERIFY_ACCOUNT_POOL_JSON='[...]' npx tsx apps/api/scripts/seed-verifier-accounts.ts
 *
 * Passwords and hashes are never logged.
 */

import { randomUUID } from "crypto";
import { hash } from "bcryptjs";
import { prisma, UserRole } from "@lets-chat/database";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_\u0430-\u044f\u0410-\u042f\u0451\u0401\u0456\u0406\u0457\u0407\u0454\u0404\u0491\u0490]{3,32}$/;

interface SeedAccount {
  email: string;
  username: string;
  password: string;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || local.length <= 4) return `***@${domain ?? "***"}`;
  return `${local.slice(0, 2)}***${local.slice(-2)}@${domain}`;
}

function parsePool(): SeedAccount[] {
  const json = process.env.VERIFY_ACCOUNT_POOL_JSON;
  if (json && json.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      throw new Error(`VERIFY_ACCOUNT_POOL_JSON is not valid JSON: ${(err as Error).message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error("VERIFY_ACCOUNT_POOL_JSON must be a JSON array");
    }
    return parsed.map((entry, idx) => parseEntry(entry, idx));
  }

  const accounts: SeedAccount[] = [];
  for (let i = 1; ; i++) {
    const email = process.env[`VERIFY_ACCOUNT_${i}_EMAIL`];
    const username = process.env[`VERIFY_ACCOUNT_${i}_USERNAME`];
    const password = process.env[`VERIFY_ACCOUNT_${i}_PASSWORD`];
    if (email === undefined && username === undefined && password === undefined) break;
    accounts.push(
      parseEntry({ email, username, password }, i - 1),
    );
  }
  return accounts;
}

function parseEntry(entry: unknown, idx: number): SeedAccount {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Account entry ${idx} is not an object`);
  }
  const { email, username, password } = entry as Record<string, unknown>;

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new Error(`Account entry ${idx} has invalid email`);
  }

  const normalizedUsername = typeof username === "string" ? username.trim() : "";
  if (!USERNAME_REGEX.test(normalizedUsername)) {
    throw new Error(`Account entry ${idx} has invalid username`);
  }

  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new Error(`Account entry ${idx} has invalid password`);
  }

  return { email: normalizedEmail, username: normalizedUsername, password };
}

async function getSaltRounds(): Promise<number> {
  const env = process.env.BCRYPT_SALT_ROUNDS;
  if (!env) return 12;
  const parsed = Number(env);
  if (!Number.isInteger(parsed) || parsed < 4 || parsed > 31) {
    throw new Error(`BCRYPT_SALT_ROUNDS must be an integer between 4 and 31, got ${env}`);
  }
  return parsed;
}

async function seedAccount(account: SeedAccount, saltRounds: number): Promise<void> {
  const passwordHash = await hash(account.password, saltRounds);

  const existing = await prisma.user.findFirst({
    where: { email: account.email },
  });

  const now = new Date();

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        emailVerifiedAt: now,
        deletedAt: null,
        role: UserRole.USER,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationSentAt: null,
      },
    });
  } else {
    const usernameTaken = await prisma.user.findFirst({
      where: { username: account.username },
    });
    if (usernameTaken) {
      throw new Error(
        `Username ${account.username} is already taken by another user`,
      );
    }

    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: account.email,
        username: account.username,
        passwordHash,
        role: UserRole.USER,
        emailVerifiedAt: now,
      },
    });
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const accounts = parsePool();
  if (accounts.length === 0) {
    throw new Error(
      "No verifier accounts provided. Set VERIFY_ACCOUNT_POOL_JSON or VERIFY_ACCOUNT_N_EMAIL/USERNAME/PASSWORD.",
    );
  }

  const saltRounds = await getSaltRounds();
  let succeeded = 0;

  for (const account of accounts) {
    try {
      await seedAccount(account, saltRounds);
      console.log(`Seeded verifier account: ${maskEmail(account.email)}`);
      succeeded++;
    } catch (err) {
      console.error(
        `Failed to seed ${maskEmail(account.email)}: ${(err as Error).message}`,
      );
    }
  }

  console.log(`\nDone: ${succeeded}/${accounts.length}`);

  await prisma.$disconnect();

  if (succeeded !== accounts.length) {
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error("Seed failed:", err.message);
  await prisma.$disconnect();
  process.exit(1);
});
