#!/usr/bin/env node
/**
 * B238A test artifacts audit for permanent letschat_local.
 *
 * Generates a markdown report identifying rows likely created by B238A
 * verification runs. Does NOT delete anything.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.dirname(__filename);

function loadEnv() {
  const envFiles = [
    path.join(REPO_ROOT, "..", ".env.example"),
    path.join(REPO_ROOT, "..", ".env"),
    path.join(REPO_ROOT, "..", ".env.local"),
  ];
  for (const file of envFiles) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      if (process.env[key] !== undefined) continue;
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function parseDatabaseUrl(url) {
  const match = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!match) throw new Error(`Cannot parse DATABASE_URL: ${url}`);
  return { user: match[1], password: match[2], host: match[3], port: match[4], db: match[5] };
}

function psql(sql, database) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const { user, password, host } = parseDatabaseUrl(url);
  return execSync(
    `docker exec -e PGPASSWORD=${password} letschat-postgres psql -U ${user} -h ${host} -d ${database} -t -A -c "${sql.replace(/"/g, '\\"')}"`,
    { encoding: "utf8", stdio: "pipe" }
  );
}

function count(sql, database = "letschat_local") {
  return Number(psql(sql, database).trim());
}

function section(title, query, database = "letschat_local") {
  return `### ${title}\n\n\`\`\`\n${psql(query, database).trim()}\n\`\`\`\n\n`;
}

function main() {
  loadEnv();

  const totalUsers = count('SELECT COUNT(*) FROM "User";');
  const b238aUsers = count(
    'SELECT COUNT(*) FROM "User" WHERE email LIKE \'b238a-%@example.com\' OR username LIKE \'b238a%\';'
  );
  const anonymizedUsers = count('SELECT COUNT(*) FROM "User" WHERE status = \'ANONYMIZED\';');
  const totalWorkspaces = count('SELECT COUNT(*) FROM "Workspace";');
  const b238aWorkspaces = count(
    'SELECT COUNT(*) FROM "Workspace" WHERE name LIKE \'B238A%\' OR slug LIKE \'b238a-ws%\';'
  );
  const dmConversations = count(
    'SELECT COUNT(DISTINCT dc.id) FROM "DirectConversation" dc JOIN "DirectConversationParticipant" dcp ON dcp."conversationId" = dc.id JOIN "User" u ON u.id = dcp."userId" WHERE u.email LIKE \'b238a-%@example.com\' OR u.username LIKE \'b238a%\';'
  );
  const dmMessages = count(
    'SELECT COUNT(*) FROM "DirectMessage" WHERE "authorId" IN (SELECT id FROM "User" WHERE email LIKE \'b238a-%@example.com\' OR username LIKE \'b238a%\');'
  );
  const auditEvents = count(
    'SELECT COUNT(*) FROM "AuditLog" WHERE "actorId" IN (SELECT id FROM "User" WHERE email LIKE \'b238a-%@example.com\' OR username LIKE \'b238a%\') OR "targetUserId" IN (SELECT id FROM "User" WHERE email LIKE \'b238a-%@example.com\' OR username LIKE \'b238a%\');'
  );
  const attachments = count(
    'SELECT COUNT(*) FROM "Attachment" WHERE "createdById" IN (SELECT id FROM "User" WHERE email LIKE \'b238a-%@example.com\' OR username LIKE \'b238a%\');'
  );

  let report = `# B238A Test Artifacts Audit — letschat_local\n\n`;
  report += `Generated: ${new Date().toISOString()}\n\n`;
  report += `This report identifies rows likely created by B238A browser verification / manual runs. `;
  report += `No destructive cleanup was performed.\n\n`;

  report += `## Summary counts\n\n`;
  report += `| Metric | Current value | Baseline | Delta |\n`;
  report += `| --- | --- | --- | --- |\n`;
  report += `| Total users | ${totalUsers} | 13 | +${totalUsers - 13} |\n`;
  report += `| B238A-pattern users | ${b238aUsers} | 0 | +${b238aUsers} |\n`;
  report += `| Anonymized users | ${anonymizedUsers} | 0 | +${anonymizedUsers} |\n`;
  report += `| Total workspaces | ${totalWorkspaces} | 13 | +${totalWorkspaces - 13} |\n`;
  report += `| B238A-pattern workspaces | ${b238aWorkspaces} | 0 | +${b238aWorkspaces} |\n`;
  report += `| DM conversations involving B238A users | ${dmConversations} | 0 | +${dmConversations} |\n`;
  report += `| Direct messages authored by B238A users | ${dmMessages} | 0 | +${dmMessages} |\n`;
  report += `| Audit events for B238A users | ${auditEvents} | 0 | +${auditEvents} |\n`;
  report += `| Attachments owned by B238A users | ${attachments} | 0 | +${attachments} |\n\n`;

  report += section(
    "B238A-pattern users (id | email | username | status | createdAt | deletedAt | anonymizedAt | deletionScheduledFor)",
    'SELECT id, email, username, status, "createdAt", "deletedAt", "anonymizedAt", "deletionScheduledFor" FROM "User" WHERE email LIKE \'b238a-%@example.com\' OR username LIKE \'b238a%\' ORDER BY "createdAt";'
  );

  report += section(
    "Anonymized / deleted users (id | email | username | status | createdAt | deletedAt | anonymizedAt)",
    'SELECT id, email, username, status, "createdAt", "deletedAt", "anonymizedAt" FROM "User" WHERE status = \'ANONYMIZED\' OR "deletedAt" IS NOT NULL OR "anonymizedAt" IS NOT NULL ORDER BY "createdAt";'
  );

  report += section(
    "B238A-pattern workspaces (id | name | slug | createdAt | permanentlyDeletedAt)",
    'SELECT id, name, slug, "createdAt", "permanentlyDeletedAt" FROM "Workspace" WHERE name LIKE \'B238A%\' OR slug LIKE \'b238a-ws%\' ORDER BY "createdAt";'
  );

  report += section(
    "All other workspaces (id | name | slug | createdAt)",
    'SELECT id, name, slug, "createdAt" FROM "Workspace" WHERE name NOT LIKE \'B238A%\' AND slug NOT LIKE \'b238a-ws%\' ORDER BY "createdAt";'
  );

  report += section(
    "DM conversations involving B238A users (id | createdAt)",
    'SELECT DISTINCT dc.id, dc."createdAt" FROM "DirectConversation" dc JOIN "DirectConversationParticipant" dcp ON dcp."conversationId" = dc.id JOIN "User" u ON u.id = dcp."userId" WHERE u.email LIKE \'b238a-%@example.com\' OR u.username LIKE \'b238a%\' ORDER BY dc."createdAt";'
  );

  report += section(
    "Audit event actions for B238A users (action | count)",
    'SELECT action, COUNT(*) FROM "AuditLog" WHERE "actorId" IN (SELECT id FROM "User" WHERE email LIKE \'b238a-%@example.com\' OR username LIKE \'b238a%\') OR "targetUserId" IN (SELECT id FROM "User" WHERE email LIKE \'b238a-%@example.com\' OR username LIKE \'b238a%\') GROUP BY action ORDER BY action;'
  );

  report += section(
    "Attachments owned by B238A users (id | storageKey | fileName | deletedAt)",
    'SELECT id, "storageKey", "originalName" AS "fileName", "deletedAt" FROM "Attachment" WHERE "createdById" IN (SELECT id FROM "User" WHERE email LIKE \'b238a-%@example.com\' OR username LIKE \'b238a%\') ORDER BY "createdAt";'
  );

  report += `## Cleanup recommendation\n\n`;
  report += `All rows in the "B238A-pattern" sections above can be safely removed because they are `;
  report += `isolated test accounts created by B238A verification. The 5 anonymized users and their `;
  report += `messages remain as historical data; removing them is optional and requires confirming `;
  report += `that no unrelated user references them. This report intentionally does not perform deletion.\n`;

  const outPath = path.join(REPO_ROOT, "b238a-test-artifacts-audit.md");
  fs.writeFileSync(outPath, report);
  console.log(`Report written to ${outPath}`);
}

main();
