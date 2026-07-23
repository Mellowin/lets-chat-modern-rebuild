#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Local-only account provisioning / password reset utility.
 *
 * This script is intentionally NOT an API endpoint. It only works against the
 * local Docker Postgres database and must be run from this computer.
 *
 * Env:
 *   DATABASE_URL                — must point to localhost letschat_local
 *   SETUP_ACCOUNT_EMAIL         — required
 *   SETUP_ACCOUNT_USERNAME      — required
 *   SETUP_ACCOUNT_DISPLAY_NAME  — optional
 *   SETUP_ACCOUNT_PASSWORD      — required
 *   BCRYPT_SALT_ROUNDS          — optional, defaults to 12
 *
 * The password is read from the environment so the PowerShell wrapper can
 * collect it with masked input. It is never logged.
 */

import { randomUUID } from "crypto";
import { hash } from "bcryptjs";
import { prisma, UserRole } from "@lets-chat/database";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_\u0430-\u044f\u0410-\u042f\u0451\u0401\u0456\u0406\u0457\u0407\u0454\u0404\u0491\u0490]{3,32}$/;
const LOCAL_DATABASE_URL_REGEX =
  /^postgresql:\/\/letschat:letschat@(?:localhost|127\.0\.0\.1):5432\/letschat_local(?:\?.*)?$/;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || local.length <= 4) return `***@${domain ?? "***"}`;
  return `${local.slice(0, 2)}***${local.slice(-2)}@${domain}`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value.trim();
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

function validateLocalDatabaseUrl(): void {
  const url = process.env.DATABASE_URL || "";
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!LOCAL_DATABASE_URL_REGEX.test(url)) {
    throw new Error(
      `This utility only works with the local Docker database (${LOCAL_DATABASE_URL_REGEX}). Got: ${url}`,
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("This utility refuses to run in production NODE_ENV");
  }
}

async function main() {
  validateLocalDatabaseUrl();

  const email = requireEnv("SETUP_ACCOUNT_EMAIL").toLowerCase();
  const username = requireEnv("SETUP_ACCOUNT_USERNAME");
  const displayName = process.env.SETUP_ACCOUNT_DISPLAY_NAME?.trim() || null;
  const password = requireEnv("SETUP_ACCOUNT_PASSWORD");

  if (!EMAIL_REGEX.test(email)) {
    throw new Error("Invalid email address");
  }
  if (!USERNAME_REGEX.test(username)) {
    throw new Error(
      "Username must be 3-32 characters and contain only letters, numbers, underscores or Cyrillic characters",
    );
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error("Password must be between 8 and 128 characters");
  }

  const saltRounds = await getSaltRounds();
  const passwordHash = await hash(password, saltRounds);
  const now = new Date();

  const existing = await prisma.user.findFirst({ where: { email } });

  let mode: "created" | "reset";
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        emailVerifiedAt: now,
        deletedAt: null,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationSentAt: null,
        ...(displayName !== null ? { displayName } : {}),
      },
    });
    mode = "reset";
  } else {
    const usernameTaken = await prisma.user.findFirst({ where: { username } });
    if (usernameTaken) {
      throw new Error(`Username ${username} is already taken by another user`);
    }

    await prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        username,
        displayName,
        passwordHash,
        role: UserRole.USER,
        emailVerifiedAt: now,
      },
    });
    mode = "created";
  }

  console.log(`Account ${mode}: ${maskEmail(email)} (${username})`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Setup failed:", err.message);
  await prisma.$disconnect();
  process.exit(1);
});
