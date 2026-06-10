#!/usr/bin/env node
/**
 * Cleanup orphaned attachment uploads from storage.
 *
 * An orphaned upload is a storage object under the "attachments/" prefix
 * that has no corresponding active row in the Attachment table.
 *
 * Usage (dry-run by default):
 *   node apps/api/scripts/cleanup-orphaned-attachments.mjs
 *
 * Actually delete:
 *   node apps/api/scripts/cleanup-orphaned-attachments.mjs --delete
 *
 * Environment variables:
 *   DATABASE_URL                — PostgreSQL connection string
 *   S3_ENDPOINT                 — S3/MinIO endpoint
 *   S3_REGION                   — S3 region
 *   S3_ACCESS_KEY               — S3 access key
 *   S3_SECRET_KEY               — S3 secret key
 *   S3_BUCKET                   — Bucket name
 *   S3_FORCE_PATH_STYLE         — "true" or "false" (default: true)
 *   CLEANUP_AGE_HOURS           — Minimum age in hours to consider an object
 *                                 orphaned (default: 24)
 */

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@lets-chat/database";

const args = process.argv.slice(2);
const isDelete = args.includes("--delete");
const ageHours = parseInt(process.env.CLEANUP_AGE_HOURS || "24", 10);
const prefix = "attachments/";

if (Number.isNaN(ageHours) || ageHours < 1) {
  console.error("Error: CLEANUP_AGE_HOURS must be a positive integer");
  process.exit(1);
}

if (!isDelete) {
  console.log("🔒 Dry-run mode — no objects will be deleted.\n   Use --delete to actually remove orphaned objects.\n");
}

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const s3 = new S3Client({
  endpoint: getEnv("S3_ENDPOINT"),
  region: getEnv("S3_REGION"),
  credentials: {
    accessKeyId: getEnv("S3_ACCESS_KEY"),
    secretAccessKey: getEnv("S3_SECRET_KEY"),
  },
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || "true") === "true",
});

const bucket = getEnv("S3_BUCKET");

async function listAllObjects() {
  const objects = [];
  let continuationToken;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const item of response.Contents || []) {
      if (item.Key && item.LastModified) {
        objects.push({
          key: item.Key,
          lastModified: item.LastModified,
          size: item.Size || 0,
        });
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

async function main() {
  await prisma.$connect();

  const threshold = new Date(Date.now() - ageHours * 60 * 60 * 1000);
  console.log(`Threshold: objects older than ${ageHours} hours (${threshold.toISOString()})`);

  console.log("\n📦 Listing storage objects...");
  const storageObjects = await listAllObjects();
  console.log(`   Found ${storageObjects.length} object(s) under "${prefix}"`);

  console.log("\n🗄️  Fetching attachment storageKeys from DB...");
  const dbAttachments = await prisma.attachment.findMany({
    where: { deletedAt: null },
    select: { storageKey: true },
  });
  const dbKeys = new Set(dbAttachments.map((a) => a.storageKey));
  console.log(`   Found ${dbKeys.size} active attachment row(s)`);

  let scanned = 0;
  let matched = 0;
  let orphaned = 0;
  let skippedRecent = 0;
  let deleted = 0;
  let deleteErrors = 0;

  for (const obj of storageObjects) {
    scanned++;

    if (dbKeys.has(obj.key)) {
      matched++;
      continue;
    }

    if (obj.lastModified > threshold) {
      skippedRecent++;
      continue;
    }

    orphaned++;

    if (isDelete) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.key }));
        deleted++;
        console.log(`   🗑️  Deleted: ${obj.key} (${obj.size} bytes, ${obj.lastModified.toISOString()})`);
      } catch (err) {
        deleteErrors++;
        console.error(`   ❌ Failed to delete ${obj.key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      console.log(`   📝 Would delete: ${obj.key} (${obj.size} bytes, ${obj.lastModified.toISOString()})`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Scanned:            ${scanned}`);
  console.log(`Matched DB:         ${matched}`);
  console.log(`Orphan candidates:  ${orphaned}`);
  console.log(`Skipped (recent):   ${skippedRecent}`);
  if (isDelete) {
    console.log(`Deleted:            ${deleted}`);
    if (deleteErrors > 0) {
      console.log(`Delete errors:      ${deleteErrors}`);
    }
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  prisma.$disconnect().finally(() => process.exit(1));
});
